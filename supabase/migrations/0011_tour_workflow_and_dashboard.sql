-- =====================================================================
-- 0011_tour_workflow_and_dashboard.sql
--
-- Listing workflow and the supplier CRM's read models.
--
-- The important part is the first section: until now a company member could
-- update their own tour to status = 'published' directly, which made the
-- whole approval model decorative. Publishing is now a privileged action.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PUBLISHING IS NOT A SUPPLIER ACTION
-- ---------------------------------------------------------------------
alter table tours
  add column submitted_at        timestamptz,
  add column submitted_by        uuid references profiles(id) on delete set null,
  add column reviewed_at         timestamptz,
  add column reviewed_by         uuid references profiles(id) on delete set null,
  add column review_notes        text,
  add column completeness_score  smallint not null default 0,
  add column last_edited_by      uuid references profiles(id) on delete set null;

/**
 * Guards the status column. A supplier may move a tour between draft,
 * in_review and paused. Only staff may move it to published or rejected.
 *
 * A trigger rather than an RLS policy because RLS's WITH CHECK cannot see the
 * OLD row, so it cannot express "you may change this column to these values
 * but only from those values".
 */
create or replace function internal.guard_tour_status()
returns trigger
language plpgsql
security definer set search_path = public, internal
as $$
begin
  if new.status is distinct from old.status and not is_staff() then
    -- The only transition a supplier may not make is the one that puts a
    -- listing in front of travellers. Everything else — pulling it back to
    -- draft, pausing it, archiving it — is theirs to do at any time, and
    -- blocking that would mean they cannot stop selling a tour they can no
    -- longer run.
    if new.status not in ('draft', 'in_review', 'paused', 'archived') then
      raise exception 'Only the TravelHub team can publish a listing. Submit it for review instead.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  -- These are set by the workflow functions, never by a client update.
  if not is_staff() then
    new.reviewed_at := old.reviewed_at;
    new.reviewed_by := old.reviewed_by;
    new.review_notes := old.review_notes;
    new.published_at := old.published_at;
  end if;

  new.last_edited_by := coalesce(auth.uid(), old.last_edited_by);
  return new;
end;
$$;

create trigger guard_tour_status before update on tours
  for each row execute function internal.guard_tour_status();

-- ---------------------------------------------------------------------
-- 2. COMPLETENESS — what the dashboard nags about
-- ---------------------------------------------------------------------
create or replace function tour_completeness(p_tour_id uuid)
returns table (score smallint, missing text[])
language plpgsql
stable
as $$
declare
  v_missing text[] := '{}';
  v_total   int := 10;
  v_done    int := 0;
  r record;
begin
  select t.*,
    (select count(*) from tour_media m where m.tour_id = t.id)      as media_count,
    (select count(*) from tour_options o where o.tour_id = t.id)    as option_count,
    (select count(*) from tour_faqs f where f.tour_id = t.id)       as faq_count,
    (select count(*) from tour_itinerary i where i.tour_id = t.id)  as stop_count,
    (select count(*) from tour_departures d where d.tour_id = t.id
       and d.starts_at > now())                                     as future_departures,
    (select count(*) from tour_prices p
       join tour_options o2 on o2.id = p.option_id
       where o2.tour_id = t.id)                                     as price_count
  into r
  from tours t where t.id = p_tour_id;

  if r is null then
    return query select 0::smallint, array['Tour not found']::text[];
    return;
  end if;

  if exists (select 1 from tour_translations tt where tt.tour_id = p_tour_id
             and coalesce(length(tt.title), 0) >= 20)
    then v_done := v_done + 1; else v_missing := v_missing || 'A descriptive title of at least 20 characters'::text; end if;

  if exists (select 1 from tour_translations tt where tt.tour_id = p_tour_id
             and coalesce(length(tt.description), 0) >= 300)
    then v_done := v_done + 1; else v_missing := v_missing || 'A description of at least 300 characters'::text; end if;

  if exists (select 1 from tour_translations tt where tt.tour_id = p_tour_id
             and array_length(tt.highlights, 1) >= 3)
    then v_done := v_done + 1; else v_missing := v_missing || 'At least three highlights'::text; end if;

  if exists (select 1 from tour_translations tt where tt.tour_id = p_tour_id
             and array_length(tt.inclusions, 1) >= 1)
    then v_done := v_done + 1; else v_missing := v_missing || 'What is included in the price'::text; end if;

  -- Three photos is the point where a listing stops looking abandoned.
  if r.media_count >= 3 then v_done := v_done + 1;
    else v_missing := v_missing || 'At least three photos'::text; end if;

  if r.option_count >= 1 then v_done := v_done + 1;
    else v_missing := v_missing || 'At least one bookable option'::text; end if;

  if r.price_count >= 1 then v_done := v_done + 1;
    else v_missing := v_missing || 'A price for at least one traveller type'::text; end if;

  if r.future_departures >= 1 then v_done := v_done + 1;
    else v_missing := v_missing || 'Availability on at least one future date'::text; end if;

  if r.faq_count >= 2 then v_done := v_done + 1;
    else v_missing := v_missing || 'At least two FAQs (these win Google rich results)'::text; end if;

  if exists (select 1 from tour_translations tt where tt.tour_id = p_tour_id
             and coalesce(length(tt.meta_description), 0) between 70 and 165)
    then v_done := v_done + 1; else v_missing := v_missing || 'A meta description of 70–165 characters'::text; end if;

  return query select round((v_done::numeric / v_total) * 100)::smallint, v_missing;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. WORKFLOW FUNCTIONS
-- ---------------------------------------------------------------------
create or replace function submit_tour_for_review(p_tour_id uuid)
returns tours
language plpgsql
security definer set search_path = public
as $$
declare
  v_tour tours;
  v_score smallint;
  v_missing text[];
begin
  select * into v_tour from tours where id = p_tour_id for update;
  if not found then
    raise exception 'Listing not found' using errcode = 'no_data_found';
  end if;
  if not (is_company_member(v_tour.company_id) or is_staff()) then
    raise exception 'You do not have access to that listing' using errcode = 'insufficient_privilege';
  end if;
  if v_tour.status not in ('draft', 'rejected', 'paused') then
    raise exception 'This listing is already % ', v_tour.status using errcode = 'invalid_parameter_value';
  end if;

  select score, missing into v_score, v_missing from tour_completeness(p_tour_id);

  -- Reject incomplete submissions here rather than wasting a reviewer's time
  -- and the supplier's turnaround on something obviously unfinished.
  if v_score < 80 then
    raise exception 'This listing is % complete. Still needed: %',
      v_score || '%', array_to_string(v_missing, '; ')
      using errcode = 'invalid_parameter_value';
  end if;

  update tours
     set status = 'in_review', submitted_at = now(), submitted_by = auth.uid(),
         completeness_score = v_score
   where id = p_tour_id
  returning * into v_tour;

  return v_tour;
end;
$$;

create or replace function approve_tour(p_tour_id uuid, p_note text default null)
returns tours
language plpgsql
security definer set search_path = public
as $$
declare v_tour tours;
begin
  if not is_staff() then
    raise exception 'Only the TravelHub team can publish a listing'
      using errcode = 'insufficient_privilege';
  end if;

  update tours
     set status = 'published', published_at = coalesce(published_at, now()),
         reviewed_at = now(), reviewed_by = auth.uid(), review_notes = p_note,
         rejected_reason = null
   where id = p_tour_id and status in ('in_review', 'paused', 'rejected')
  returning * into v_tour;

  if not found then
    raise exception 'Listing not found or not awaiting review' using errcode = 'no_data_found';
  end if;

  insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, after)
  values (auth.uid(), auth_role(), 'tour.approve', 'tour', p_tour_id,
          jsonb_build_object('note', p_note));

  return v_tour;
end;
$$;

create or replace function reject_tour(p_tour_id uuid, p_reason text)
returns tours
language plpgsql
security definer set search_path = public
as $$
declare v_tour tours;
begin
  if not is_staff() then
    raise exception 'Only the TravelHub team can reject a listing'
      using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Tell the operator what needs fixing' using errcode = 'invalid_parameter_value';
  end if;

  update tours
     set status = 'rejected', rejected_reason = p_reason,
         reviewed_at = now(), reviewed_by = auth.uid()
   where id = p_tour_id and status = 'in_review'
  returning * into v_tour;

  if not found then
    raise exception 'Listing not found or not awaiting review' using errcode = 'no_data_found';
  end if;

  insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, after)
  values (auth.uid(), auth_role(), 'tour.reject', 'tour', p_tour_id,
          jsonb_build_object('reason', p_reason));

  return v_tour;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. AVAILABILITY — bulk generation, the single most tedious supplier task
-- ---------------------------------------------------------------------
create or replace function generate_departures(
  p_option_id uuid,
  p_from      date,
  p_to        date,
  p_time      time,
  p_capacity  integer,
  p_weekdays  smallint[] default '{0,1,2,3,4,5,6}',
  p_timezone  text default 'Asia/Dubai'
)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  v_tour_id uuid;
  v_company uuid;
  v_count   integer := 0;
begin
  select o.tour_id, t.company_id into v_tour_id, v_company
  from tour_options o join tours t on t.id = o.tour_id
  where o.id = p_option_id;

  if v_tour_id is null then
    raise exception 'Option not found' using errcode = 'no_data_found';
  end if;
  if not (is_company_member(v_company) or is_staff()) then
    raise exception 'You do not have access to that listing' using errcode = 'insufficient_privilege';
  end if;
  if p_to < p_from then
    raise exception 'End date must be after the start date' using errcode = 'invalid_parameter_value';
  end if;
  if p_to - p_from > 400 then
    raise exception 'Generate at most 400 days at a time' using errcode = 'invalid_parameter_value';
  end if;

  -- ON CONFLICT DO NOTHING means re-running over an existing range never
  -- resets seats_booked on dates that already have bookings.
  insert into tour_departures (tour_id, option_id, starts_at, local_date, capacity)
  select v_tour_id, p_option_id,
         (d::date + p_time) at time zone p_timezone,
         d::date, p_capacity
  from generate_series(p_from, p_to, interval '1 day') d
  where extract(dow from d)::smallint = any (p_weekdays)
  on conflict (option_id, starts_at) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. DASHBOARD READ MODELS
-- ---------------------------------------------------------------------
-- security_invoker is not optional here. A Postgres view runs with its
-- OWNER's privileges by default, so a view over an RLS-protected table hands
-- every row to every caller — a cross-tenant leak that the base table's
-- policies do nothing to stop. This was caught by 05_operations.sql, where a
-- rival operator could read another company's manifest.
create or replace view supplier_tour_rows
with (security_invoker = true) as
select
  t.id, t.company_id, t.status, t.city_id, t.updated_at, t.submitted_at,
  t.rejected_reason, t.review_notes, t.completeness_score,
  t.from_price, t.base_currency, t.rating_avg, t.rating_count, t.booking_count,
  tt.locale, tt.title, tt.slug, tt.meta_title, tt.meta_description,
  (select count(*) from tour_media m where m.tour_id = t.id)                     as media_count,
  (select count(*) from tour_departures d
     where d.tour_id = t.id and d.starts_at > now() and not d.is_closed)         as future_departures,
  (select coalesce(sum(d.capacity - d.seats_booked - d.seats_held), 0)
     from tour_departures d where d.tour_id = t.id and d.starts_at > now())      as seats_available
from tours t
join tour_translations tt on tt.tour_id = t.id;

-- Revenue and volume per company per day. A view rather than a materialized
-- one: suppliers need today's numbers, not last night's.
create or replace view supplier_daily_stats
with (security_invoker = true) as
select
  b.company_id,
  date_trunc('day', b.created_at)::date as day,
  b.currency,
  count(*)                                                          as bookings,
  sum(b.grand_total)                                                as gross,
  sum(b.commission_total)                                           as commission,
  sum(b.supplier_net)                                               as net,
  count(*) filter (where b.status in ('cancelled_by_user','cancelled_by_supplier')) as cancellations
from bookings b
where b.status in ('confirmed', 'completed', 'cancelled_by_user', 'cancelled_by_supplier')
group by b.company_id, date_trunc('day', b.created_at), b.currency;

grant select on supplier_tour_rows, supplier_daily_stats to anon, authenticated;

create index tours_review_queue_idx on tours (submitted_at)
  where status = 'in_review';

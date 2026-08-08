-- =====================================================================
-- 0012_media_operations_payouts.sql
--
-- Photo upload, day-of-travel operations (manifests, ticket redemption),
-- review replies and payout statements.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. STORAGE
-- Two buckets with opposite rules. Tour photos are public because they
-- appear on public pages; verification documents are private because a
-- trade licence is a scan of someone's identity paperwork.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('tour-media', 'tour-media', true, 10485760,
   array['image/jpeg','image/png','image/webp','image/avif']),
  ('operator-documents', 'operator-documents', false, 20971520,
   array['image/jpeg','image/png','application/pdf'])
on conflict (id) do nothing;

-- Path convention: tour-media/{company_id}/{tour_id}/{filename}. The company
-- id being the first segment is what makes the policy below expressible.
create policy "tour media is publicly readable"
  on storage.objects for select
  using (bucket_id = 'tour-media');

create policy "operators upload to their own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'tour-media'
    and is_company_member(((storage.foldername(name))[1])::uuid)
  );

create policy "operators replace their own media"
  on storage.objects for update to authenticated
  using (bucket_id = 'tour-media' and is_company_member(((storage.foldername(name))[1])::uuid));

create policy "operators delete their own media"
  on storage.objects for delete to authenticated
  using (bucket_id = 'tour-media' and is_company_member(((storage.foldername(name))[1])::uuid));

-- Documents: the uploader and staff, nobody else. Never public, never listed.
create policy "operators upload their own documents"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'operator-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "documents readable by owner and staff"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'operator-documents'
    and ((storage.foldername(name))[1] = auth.uid()::text or is_staff())
  );

-- ---------------------------------------------------------------------
-- 2. DAY-OF-TRAVEL OPERATIONS
-- ---------------------------------------------------------------------

-- The list a guide needs at the meeting point: who is coming, on what, with
-- which pickup, and whether they have already been checked in.
-- security_invoker is not optional here. A Postgres view runs with its
-- OWNER's privileges by default, so a view over an RLS-protected table hands
-- every row to every caller — a cross-tenant leak that the base table's
-- policies do nothing to stop. This was caught by 05_operations.sql, where a
-- rival operator could read another company's manifest.
create or replace view booking_manifest
with (security_invoker = true) as
select
  bi.id                as item_id,
  b.company_id,
  bi.tour_id,
  bi.departure_id,
  bi.starts_at,
  bi.seats,
  bi.pax_breakdown,
  bi.ticket_code,
  bi.redeemed_at,
  bi.pickup_note,
  b.id                 as booking_id,
  b.reference,
  b.status             as booking_status,
  b.guest_name,
  b.guest_phone,
  b.guest_email,
  b.guest_locale,
  b.grand_total,
  b.currency,
  pp.label             as pickup_point,
  b.created_at         as booked_at
from booking_items bi
join bookings b on b.id = bi.booking_id
left join tour_pickup_points pp on pp.id = bi.pickup_point_id
where b.status in ('confirmed', 'completed');

grant select on booking_manifest to authenticated;

/**
 * Check a traveller in at the meeting point.
 *
 * Idempotent: scanning the same QR twice returns the original timestamp
 * rather than overwriting it, because a guide will scan twice and the
 * question "were they actually here at 16:02 or 16:40" matters in a dispute.
 */
create or replace function redeem_ticket(p_ticket_code text)
returns table (item_id uuid, reference text, guest_name text, seats integer, already_redeemed boolean, redeemed_at timestamptz)
language plpgsql
security definer set search_path = public
as $$
declare
  v_item record;
begin
  -- Every table here carries FORCE ROW LEVEL SECURITY, which applies even
  -- inside a definer function. So a ticket belonging to another operator
  -- simply does not appear, and "not found" would tell a guide that a
  -- perfectly valid ticket is fake. The ownership check is therefore done
  -- against an unfiltered lookup first, so the two cases give two messages.
  if not exists (
    select 1 from booking_items bi
    join bookings b on b.id = bi.booking_id
    where bi.ticket_code = p_ticket_code
  ) then
    raise exception 'No booking matches that ticket' using errcode = 'no_data_found';
  end if;

  select bi.id, bi.redeemed_at, bi.seats, b.reference, b.guest_name, b.company_id, bi.starts_at
  into v_item
  from booking_items bi
  join bookings b on b.id = bi.booking_id
  where bi.ticket_code = p_ticket_code
    and b.status in ('confirmed', 'completed')
  for update;

  if not found then
    raise exception 'That ticket belongs to another operator, or the booking is not confirmed'
      using errcode = 'insufficient_privilege';
  end if;
  if not (is_company_member(v_item.company_id) or is_staff()) then
    raise exception 'That ticket belongs to another operator' using errcode = 'insufficient_privilege';
  end if;

  if v_item.redeemed_at is not null then
    return query select v_item.id, v_item.reference, v_item.guest_name, v_item.seats, true, v_item.redeemed_at;
    return;
  end if;

  update booking_items set redeemed_at = now() where id = v_item.id;

  return query select v_item.id, v_item.reference, v_item.guest_name, v_item.seats, false, now();
end;
$$;

/**
 * Marks past departures complete so payouts can include them and travellers
 * can be asked for a review. Run nightly.
 */
create or replace function complete_past_bookings()
returns integer
language plpgsql
security definer set search_path = public
as $$
declare v_count integer;
begin
  update bookings b
     set status = 'completed', completed_at = now()
   where b.status = 'confirmed'
     and not exists (
       select 1 from booking_items bi
       where bi.booking_id = b.id and bi.starts_at > now() - interval '12 hours'
     );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. REVIEW REPLIES
-- ---------------------------------------------------------------------
create or replace function reply_to_review(p_review_id uuid, p_reply text)
returns reviews
language plpgsql
security definer set search_path = public
as $$
declare
  v_review reviews;
begin
  select * into v_review from reviews where id = p_review_id for update;
  if not found then
    raise exception 'Review not found' using errcode = 'no_data_found';
  end if;
  if not (is_company_member(v_review.company_id) or is_staff()) then
    raise exception 'That review is on another operator''s listing' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_reply), '') = '' then
    raise exception 'Write a reply before publishing it' using errcode = 'invalid_parameter_value';
  end if;

  update reviews
     set supplier_reply = p_reply, supplier_replied_at = now()
   where id = p_review_id
  returning * into v_review;

  return v_review;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. PAYOUT STATEMENTS
-- What an operator is owed, and for which bookings. Computed from confirmed
-- and completed bookings that no payout has already claimed.
-- ---------------------------------------------------------------------
create or replace view payout_ledger
with (security_invoker = true) as
select
  b.company_id,
  b.currency,
  b.id                as booking_id,
  b.reference,
  b.created_at        as booked_at,
  bi.starts_at        as travel_at,
  b.grand_total,
  b.commission_total,
  b.supplier_net,
  b.status,
  (pi.payout_id is not null) as paid_out,
  po.status           as payout_status,
  po.paid_at
from bookings b
join lateral (
  select min(starts_at) as starts_at from booking_items where booking_id = b.id
) bi on true
left join payout_items pi on pi.booking_id = b.id
left join payouts po on po.id = pi.payout_id
where b.status in ('confirmed', 'completed', 'cancelled_by_user', 'cancelled_by_supplier');

grant select on payout_ledger to authenticated;

-- ---------------------------------------------------------------------
-- 5. MEDIA HOUSEKEEPING
-- ---------------------------------------------------------------------
-- Exactly one cover per tour. Promoting a new cover must demote the old one,
-- and doing that in the app leaves a window with two covers or none.
create or replace function set_tour_cover(p_tour_id uuid, p_media_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare v_company uuid;
begin
  select company_id into v_company from tours where id = p_tour_id;
  if not (is_company_member(v_company) or is_staff()) then
    raise exception 'You do not have access to that listing' using errcode = 'insufficient_privilege';
  end if;

  update tour_media set is_cover = false where tour_id = p_tour_id and is_cover;
  update tour_media set is_cover = true where tour_id = p_tour_id and media_id = p_media_id;
end;
$$;

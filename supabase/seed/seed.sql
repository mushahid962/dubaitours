-- =====================================================================
-- seed.sql — minimal but complete data to boot every surface locally:
-- 6 GCC countries, launch cities, a category tree, one live supplier,
-- one fully priced tour with 60 days of departures, and CMS defaults.
-- Idempotent: safe to re-run.
-- =====================================================================

-- ---------------------------------------------------------- countries
insert into countries (iso2, iso3, dial_code, currency, timezone, centroid, flag_emoji, is_active, is_launched, priority) values
  ('AE','ARE','+971','AED','Asia/Dubai',      st_point(54.3773, 24.4539)::geography, '🇦🇪', true, true, 100),
  ('SA','SAU','+966','SAR','Asia/Riyadh',     st_point(46.6753, 24.7136)::geography, '🇸🇦', true, true, 90),
  ('QA','QAT','+974','QAR','Asia/Qatar',      st_point(51.5310, 25.2854)::geography, '🇶🇦', true, true, 80),
  ('OM','OMN','+968','OMR','Asia/Muscat',     st_point(58.4059, 23.5880)::geography, '🇴🇲', true, true, 70),
  ('BH','BHR','+973','BHD','Asia/Bahrain',    st_point(50.5577, 26.0667)::geography, '🇧🇭', true, true, 60),
  ('KW','KWT','+965','KWD','Asia/Kuwait',     st_point(47.9774, 29.3759)::geography, '🇰🇼', true, true, 50)
on conflict (iso2) do nothing;

insert into country_translations (country_id, locale, name, slug, tagline, intro, meta_title, meta_description)
select c.id, v.locale::locale_code, v.name, v.slug, v.tagline, v.intro, v.meta_title, v.meta_desc
from countries c
join (values
  ('AE','en','United Arab Emirates','united-arab-emirates','Desert dunes, record-breaking skylines',
   'From dune bashing in the Empty Quarter to sunset from the 148th floor, the UAE packs a startling range of experiences into a two-hour drive.',
   'Things to Do in UAE 2026 | Tours, Tickets & Desert Safaris','Book UAE tours, desert safaris, theme parks and attraction tickets. Instant confirmation, free cancellation and local support.'),
  ('AE','ar','الإمارات العربية المتحدة','الامارات-العربية-المتحدة','كثبان صحراوية وأفق يحطم الأرقام القياسية',
   'من رحلات السفاري في الربع الخالي إلى غروب الشمس من الطابق 148، تجمع الإمارات بين تجارب متنوعة على مسافة ساعتين بالسيارة.',
   'أفضل الأنشطة في الإمارات 2026 | جولات وتذاكر','احجز جولات الإمارات ورحلات السفاري وتذاكر المعالم. تأكيد فوري وإلغاء مجاني ودعم محلي.'),
  ('SA','en','Saudi Arabia','saudi-arabia','Ancient Nabataean cities, brand-new coastlines',
   'AlUla''s carved tombs, Riyadh''s edge-of-the-world escarpment and the Red Sea reefs sit inside one of the fastest-opening travel markets on earth.',
   'Things to Do in Saudi Arabia 2026 | Tours & Tickets','Discover AlUla tours, Riyadh experiences and Red Sea diving. Verified operators, instant confirmation.'),
  ('QA','en','Qatar','qatar','Museum-grade culture on a desert peninsula',
   'Doha compresses souqs, sand dunes and world-class museums into a city you can cross in twenty minutes.',
   'Things to Do in Qatar 2026 | Doha Tours & Desert Safaris','Book Doha city tours, inland sea safaris and dhow cruises with free cancellation.'),
  ('OM','en','Oman','oman','Wadis, forts and the empty coast',
   'Oman trades skylines for canyon pools, turtle beaches and 500-year-old forts — the GCC''s outdoors capital.',
   'Things to Do in Oman 2026 | Wadi Tours & Desert Camps','Explore Oman wadi tours, Wahiba Sands camps and Musandam dhow cruises.'),
  ('BH','en','Bahrain','bahrain','Pearl-diving history, Formula 1 speed',
   'A compact island where Dilmun burial mounds sit twenty minutes from a Grand Prix circuit.',
   'Things to Do in Bahrain 2026 | Tours & Attraction Tickets','Book Bahrain island tours, F1 circuit experiences and pearl-diving trips.'),
  ('KW','en','Kuwait','kuwait','Gulf modernism and quiet islands',
   'Kuwait City''s water towers, the Scientific Center and Failaka Island make an easy long-weekend circuit.',
   'Things to Do in Kuwait 2026 | Tours & Day Trips','Discover Kuwait City tours, Failaka Island trips and desert experiences.')
) as v(iso2, locale, name, slug, tagline, intro, meta_title, meta_desc) on v.iso2 = c.iso2
on conflict do nothing;

-- ------------------------------------------------------------- cities
insert into cities (country_id, centroid, timezone, population, is_featured, priority, hero_image_url)
select c.id, st_point(v.lng, v.lat)::geography, v.tz, v.pop, v.feat, v.prio, v.hero
from countries c
join (values
  ('AE', 55.2708, 25.2048, 'Asia/Dubai',   3600000, true,  100, 'https://res.cloudinary.com/travelhub/image/upload/f_auto,q_auto/cities/dubai.jpg'),
  ('AE', 54.3773, 24.4539, 'Asia/Dubai',   1500000, true,  90,  'https://res.cloudinary.com/travelhub/image/upload/f_auto,q_auto/cities/abu-dhabi.jpg'),
  ('AE', 55.9432, 25.7895, 'Asia/Dubai',    345000, false, 60,  null),
  ('AE', 55.4033, 25.3463, 'Asia/Dubai',   1400000, true,  72,  null),
  ('AE', 55.5136, 25.4052, 'Asia/Dubai',    540000, true,  68,  null),
  ('AE', 55.9769, 25.7889, 'Asia/Dubai',    345000, false, 58,  null),
  ('AE', 56.3265, 25.1288, 'Asia/Dubai',    230000, false, 55,  null),
  ('AE', 55.5550, 25.5647, 'Asia/Dubai',     80000, false, 45,  null),
  ('SA', 46.6753, 24.7136, 'Asia/Riyadh',  7600000, true,  85,  null),
  ('SA', 39.1925, 21.4858, 'Asia/Riyadh',  4600000, true,  80,  null),
  ('SA', 37.9200, 26.6100, 'Asia/Riyadh',     5000, true,  78,  null),
  ('QA', 51.5310, 25.2854, 'Asia/Qatar',   2400000, true,  75,  null),
  ('OM', 58.4059, 23.5880, 'Asia/Muscat',  1500000, true,  70,  null),
  ('BH', 50.5860, 26.2285, 'Asia/Bahrain',  650000, true,  65,  null),
  ('KW', 47.9774, 29.3759, 'Asia/Kuwait',  3100000, true,  60,  null)
) as v(iso2, lng, lat, tz, pop, feat, prio, hero) on v.iso2 = c.iso2
where not exists (
  select 1 from cities x
  where st_x(x.centroid::geometry) = v.lng and st_y(x.centroid::geometry) = v.lat
);

insert into city_translations (city_id, locale, name, slug, tagline, intro, best_time_to_visit, meta_title, meta_description)
select ci.id, v.locale::locale_code, v.name, v.slug, v.tagline, v.intro, v.best_time, v.meta_title, v.meta_desc
from cities ci
join (values
  (55.2708,'en','Dubai','dubai','Superlatives, served daily',
   'Dubai is the GCC''s experience capital: desert safaris at dusk, the world''s tallest observation deck and a marina full of yachts, all bookable same-day.',
   'November to March, when highs sit near 26°C.',
   'Things to Do in Dubai 2026 | 800+ Tours, Tickets & Desert Safaris',
   'Book Dubai desert safaris, Burj Khalifa tickets, yacht cruises and theme parks. Free cancellation, instant confirmation, best price guaranteed.'),
  (55.2708,'ar','دبي','دبي','المدينة التي لا تتوقف',
   'دبي هي عاصمة التجارب في الخليج: رحلات السفاري الصحراوية عند الغروب، وأعلى منصة مراقبة في العالم، ومرسى مليء باليخوت.',
   'من نوفمبر إلى مارس حيث تصل الحرارة إلى 26 درجة.',
   'أفضل الأنشطة في دبي 2026 | جولات وتذاكر','احجز رحلات سفاري دبي وتذاكر برج خليفة والرحلات البحرية. إلغاء مجاني وتأكيد فوري.'),
  (54.3773,'en','Abu Dhabi','abu-dhabi','Culture, coastline and Ferrari-fast thrills',
   'The capital pairs the Louvre Abu Dhabi and Sheikh Zayed Grand Mosque with Yas Island''s theme parks.',
   'October to April.',
   'Things to Do in Abu Dhabi 2026 | Tours & Attraction Tickets',
   'Book Abu Dhabi city tours, Louvre tickets, Ferrari World passes and desert safaris with free cancellation.'),
  (46.6753,'en','Riyadh','riyadh','A capital rewriting itself',
   'Edge of the World hikes, Diriyah''s mud-brick heritage district and a restaurant scene that changes monthly.',
   'November to February.',
   'Things to Do in Riyadh 2026 | Tours, Edge of the World & Diriyah',
   'Book Riyadh tours, Edge of the World trips and Diriyah heritage walks. Verified local operators.'),
  (39.1925,'en','Jeddah','jeddah','The Red Sea''s front door',
   'Al-Balad''s coral-stone houses, a corniche built for sunsets and reefs twenty minutes offshore.',
   'November to March.',
   'Things to Do in Jeddah 2026 | Tours, Diving & Old Town Walks',
   'Book Jeddah city tours, Red Sea diving and Al-Balad heritage walks.'),
  (37.9200,'en','AlUla','alula','Nabataean tombs in an open-air desert gallery',
   'Hegra''s carved facades, Elephant Rock and stargazing camps in a valley that was closed to visitors until recently.',
   'October to April.',
   'Things to Do in AlUla 2026 | Hegra Tours & Desert Experiences',
   'Book AlUla tours, Hegra guided visits, hot air balloons and stargazing camps.'),
  (51.5310,'en','Doha','doha','Souqs, sand and serious museums',
   'The Museum of Islamic Art, Souq Waqif at night and inland sea dune tours within an hour of the city.',
   'November to March.',
   'Things to Do in Doha 2026 | Desert Safaris & City Tours',
   'Book Doha desert safaris, dhow cruises and city tours with instant confirmation.'),
  (58.4059,'en','Muscat','muscat','Forts above, wadis behind',
   'Mutrah Souq, Sultan Qaboos Grand Mosque and the wadi pools of Bani Khalid on a day trip.',
   'October to April.',
   'Things to Do in Muscat 2026 | Wadi Tours & Dhow Cruises',
   'Book Muscat city tours, wadi day trips and dolphin-watching cruises.'),
  (50.5860,'en','Manama','manama','Small island, dense history',
   'Bahrain Fort at sunset, the Tree of Life and the F1 circuit''s open track days.',
   'November to March.',
   'Things to Do in Manama 2026 | Bahrain Tours & Tickets',
   'Book Bahrain island tours, F1 experiences and pearl-diving trips.'),
  (55.4033,'en','Sharjah','sharjah','The cultural capital of the Emirates',
   'UNESCO-listed heritage districts, the Blue Souq and museums that Dubai does not have — twenty minutes from Dubai Marina.',
   'November to March.',
   'Things to Do in Sharjah 2026 | Museums, Souqs & Heritage',
   'Book Sharjah museum tickets, heritage walks and desert trips. Free cancellation.'),
  (55.5136,'en','Ajman','ajman','The quiet beach emirate',
   'The smallest emirate: an uncrowded corniche, a 18th-century fort museum and seafood on the creek.',
   'October to April.',
   'Things to Do in Ajman 2026 | Beaches & Day Trips',
   'Discover Ajman beaches, the fort museum and dhow yards. Easy day trip from Dubai.'),
  (55.9769,'en','Ras Al Khaimah','ras-al-khaimah','Mountains, not just dunes',
   'Jebel Jais is the UAE''s highest peak and home to the world''s longest zipline — a different landscape entirely.',
   'November to March.',
   'Things to Do in Ras Al Khaimah 2026 | Jebel Jais & Zipline',
   'Book Jebel Jais zipline, mountain hikes and desert camps in Ras Al Khaimah.'),
  (56.3265,'en','Fujairah','fujairah','The Gulf of Oman coast',
   'The only emirate on the east coast: diving at Snoopy Island, the oldest mosque in the UAE, and mountains behind the beach.',
   'October to April.',
   'Things to Do in Fujairah 2026 | Diving & Beaches',
   'Book Fujairah diving trips, snorkelling and mountain tours on the Gulf of Oman.'),
  (55.5550,'en','Umm Al Quwain','umm-al-quwain','Lagoons and mangroves',
   'Kayaking through mangroves, a bird-filled lagoon and the UAE''s oldest waterpark, with almost nobody there.',
   'October to April.',
   'Things to Do in Umm Al Quwain 2026 | Mangroves & Kayaking',
   'Kayak the Umm Al Quwain mangroves and visit Dreamland waterpark.'),
  (47.9774,'en','Kuwait City','kuwait-city','Towers, dhows and desert edges',
   'Kuwait Towers, the Grand Mosque and Failaka Island ferries make a compact itinerary.',
   'November to March.',
   'Things to Do in Kuwait City 2026 | Tours & Day Trips',
   'Book Kuwait City tours, Failaka Island trips and desert safaris.')
) as v(lng, locale, name, slug, tagline, intro, best_time, meta_title, meta_desc)
  on st_x(ci.centroid::geometry) = v.lng
on conflict do nothing;


-- --------------------------------------------------------------- regions
-- country -> region -> city. The UAE gets its seven emirates; every other
-- country gets one region until its own subdivisions are added.
insert into regions (country_id, code, kind, priority)
select c.id, x.code, 'emirate', x.priority
from countries c
join (values
  ('AE-DU','AE',100), ('AE-AZ','AE',95), ('AE-SH','AE',80),
  ('AE-AJ','AE',60),  ('AE-RK','AE',70), ('AE-FU','AE',55), ('AE-UQ','AE',40)
) as x(code, iso2, priority) on x.iso2 = c.iso2
on conflict (country_id, code) do nothing;

insert into regions (country_id, code, kind, priority)
select c.id, c.iso2 || '-00', 'region', 50
from countries c where c.iso2 <> 'AE'
on conflict (country_id, code) do nothing;

insert into region_translations (region_id, locale, name, slug, tagline)
select r.id, x.locale::locale_code, x.name, x.slug, x.tagline
from regions r
join (values
  ('AE-DU','en','Dubai','dubai-emirate','The emirate, beyond the city'),
  ('AE-DU','ar','دبي','امارة-دبي','الإمارة خارج حدود المدينة'),
  ('AE-AZ','en','Abu Dhabi','abu-dhabi-emirate','Capital emirate, from Yas to the Empty Quarter'),
  ('AE-SH','en','Sharjah','sharjah-emirate','Heritage, museums and the east coast'),
  ('AE-AJ','en','Ajman','ajman-emirate','The smallest emirate'),
  ('AE-RK','en','Ras Al Khaimah','ras-al-khaimah-emirate','Mountains and the Gulf'),
  ('AE-FU','en','Fujairah','fujairah-emirate','The Gulf of Oman coast'),
  ('AE-UQ','en','Umm Al Quwain','umm-al-quwain-emirate','Lagoons and mangroves')
) as x(code, locale, name, slug, tagline) on x.code = r.code
on conflict do nothing;

insert into region_translations (region_id, locale, name, slug)
select r.id, ct.locale, ct.name, ct.slug || '-region'
from regions r
join countries c on c.id = r.country_id
join country_translations ct on ct.country_id = c.id
where r.code = c.iso2 || '-00'
on conflict do nothing;

-- Match each city to its emirate by slug, then fall back to the country-level
-- region so no city is left outside the hierarchy.
update cities ci
   set region_id = r.id
  from regions r
  join region_translations rt on rt.region_id = r.id and rt.locale = 'en'
 where ci.region_id is null
   and r.country_id = ci.country_id
   and rt.slug = (
     select ct.slug || '-emirate' from city_translations ct
     where ct.city_id = ci.id and ct.locale = 'en'
   );

update cities ci set region_id = r.id
  from regions r
 where ci.region_id is null and r.country_id = ci.country_id and r.code like '%-00';

update cities ci
   set region_id = (select r.id from regions r
                    where r.country_id = ci.country_id order by r.priority desc limit 1)
 where ci.region_id is null;

-- --------------------------------------------------------- categories
with roots as (
  insert into categories (parent_id, depth, path, icon, is_featured, priority)
  select null, 0, v.path::ltree, v.icon, v.feat, v.prio
  from (values
    ('adventure','mountain',true,100), ('water','waves',true,95),
    ('attractions','ticket',true,90),  ('culture','landmark',true,80),
    ('luxury','gem',true,75),          ('transfers','car',false,40)
  ) as v(path, icon, feat, prio)
  where not exists (select 1 from categories c where c.path = v.path::ltree)
  returning id, path
)
insert into category_translations (category_id, locale, name, slug, intro, meta_title, meta_description)
select r.id, v.locale::locale_code, v.name, v.slug, v.intro, v.meta_title, v.meta_desc
from roots r
join (values
  ('adventure','en','Adventure','adventure','Dune bashing, canyoning, skydiving and everything that raises a pulse.','Adventure Tours in the GCC 2026 | Book Online','Book desert safaris, dune buggies, skydiving and canyoning across the Gulf.'),
  ('adventure','ar','مغامرات','مغامرات','رحلات السفاري والتخييم والقفز بالمظلات.','جولات المغامرة في الخليج 2026','احجز رحلات السفاري والدباب والقفز بالمظلات.'),
  ('water','en','Water & Cruises','water-cruises','Yachts, dhows, diving and water parks.','Water Activities & Cruises 2026 | Book Online','Book yacht charters, dhow cruises, diving trips and water park tickets.'),
  ('attractions','en','Attractions & Tickets','attractions-tickets','Skip-the-line entry to towers, parks and museums.','Attraction Tickets 2026 | Skip the Line','Book skip-the-line tickets to the Gulf''s top towers, parks and museums.'),
  ('culture','en','Culture & Heritage','culture-heritage','Old towns, mosques, museums and guided walks.','Culture & Heritage Tours 2026','Book heritage walks, museum entries and guided cultural tours.'),
  ('luxury','en','Luxury','luxury','Private guides, helicopters and yacht days.','Luxury Experiences 2026 | Private Tours','Book private guides, helicopter tours and luxury yacht charters.'),
  ('transfers','en','Transfers','airport-transfers','Airport pickups and intercity rides.','Airport Transfers 2026 | Book Online','Book private airport transfers and intercity rides across the GCC.')
) as v(path, locale, name, slug, intro, meta_title, meta_desc) on v.path = r.path::text
on conflict do nothing;

-- Child categories under Adventure.
with parent as (select id from categories where path = 'adventure' limit 1),
child as (
  insert into categories (parent_id, depth, path, icon, is_featured, priority)
  select p.id, 1, v.path::ltree, v.icon, v.feat, v.prio
  from parent p
  cross join (values
    ('adventure.desert-safari','sun',true,99),
    ('adventure.dune-buggy','car-front',true,96),
    ('adventure.skydiving','parachute',false,88)
  ) as v(path, icon, feat, prio)
  where not exists (select 1 from categories c where c.path = v.path::ltree)
  returning id, path
)
insert into category_translations (category_id, locale, name, slug, intro, meta_title, meta_description)
select c.id, v.locale::locale_code, v.name, v.slug, v.intro, v.meta_title, v.meta_desc
from child c
join (values
  ('adventure.desert-safari','en','Desert Safari','desert-safari','Dune bashing, camel rides and camp dinners under the stars.','Desert Safari Tours 2026 | Book from AED 99','Book desert safaris with dune bashing, BBQ dinner and live shows. Free cancellation.'),
  ('adventure.desert-safari','ar','رحلات السفاري','رحلات-السفاري','تطعيس الكثبان وركوب الجمال وعشاء المخيم.','رحلات سفاري صحراوية 2026','احجز رحلات السفاري مع العشاء والعروض الحية. إلغاء مجاني.'),
  ('adventure.dune-buggy','en','Dune Buggy & Quad','dune-buggy-quad','Self-drive buggies and quad bikes across open desert.','Dune Buggy & Quad Bike Tours 2026','Book self-drive dune buggy and quad bike tours with guides and safety gear.'),
  ('adventure.skydiving','en','Skydiving','skydiving','Tandem jumps over palm-shaped coastlines.','Skydiving Experiences 2026 | Book Online','Book tandem skydiving jumps with video packages.')
) as v(path, locale, name, slug, intro, meta_title, meta_desc) on v.path = c.path::text
on conflict do nothing;

-- ----------------------------------------------------- supplier + tour
insert into companies (slug, legal_name, display_name, status, verification, country_id, city_id,
                       contact_email, contact_phone, about, commission_rate, payout_currency, onboarded_at)
select 'gulf-dunes-tourism', 'Gulf Dunes Tourism LLC', 'Gulf Dunes',
       'active', 'premium',
       (select id from countries where iso2 = 'AE'),
       (select ci.id from cities ci join city_translations ct on ct.city_id = ci.id
        where ct.locale = 'en' and ct.slug = 'dubai'),
       'ops@gulfdunes.example', '+971500000000',
       'Dubai-based desert operator running licensed safaris since 2011, with a fleet of 40 vehicles and Arabic, English, Hindi and Russian guides.',
       18.00, 'AED', now()
on conflict (slug) do nothing;

with t as (
  insert into tours (company_id, city_id, primary_category_id, status, tour_type, confirmation,
                     cancellation, duration_minutes, min_pax, max_pax, min_age, day_parts,
                     meeting_point, meeting_address, pickup_included, pickup_radius_m,
                     family_friendly, guide_locales, base_currency, from_price, compare_at_price,
                     published_at)
  select (select id from companies where slug = 'gulf-dunes-tourism'),
         (select ci.id from cities ci join city_translations ct on ct.city_id = ci.id
          where ct.locale = 'en' and ct.slug = 'dubai'),
         (select ct.category_id from category_translations ct where ct.locale='en' and ct.slug='desert-safari'),
         'published', 'group', 'instant', 'moderate_48h',
         360, 1, 6, 3, '{afternoon,evening}',
         st_point(55.4209, 24.9130)::geography,
         'Pickup from your Dubai hotel or residence',
         true, 25000, true, '{en,ar,hi,ur}', 'AED', 149.00, 249.00, now()
  where not exists (select 1 from tour_translations where locale='en' and slug='dubai-evening-desert-safari-bbq')
  returning id
),
tr as (
  insert into tour_translations (tour_id, locale, title, slug, summary, description, highlights,
                                 inclusions, exclusions, what_to_bring, know_before_you_go,
                                 meta_title, meta_description)
  select t.id, 'en',
    'Dubai Evening Desert Safari with BBQ Dinner & Live Shows',
    'dubai-evening-desert-safari-bbq',
    'Six hours in the Lahbab red dunes: dune bashing in a 4x4, camel ride, sandboarding, then a buffet dinner with tanoura and fire shows.',
    'A driver collects you from your hotel in the early afternoon and heads inland to the Lahbab dunes, where tyres are deflated for forty minutes of dune bashing. The camp stop adds camel rides, sandboarding and henna before the sun drops behind the ridge — the best photography window of the trip. Dinner is a buffet with grilled meats and vegetarian mezze, served on low tables while tanoura and fire dancers perform. You are back at your hotel by around 21:30.',
    array['40 minutes of dune bashing in a licensed 4x4','Sunset photo stop on the ridge','Camel ride, sandboarding and henna included','Buffet dinner with vegetarian and halal options','Hotel pickup and drop-off across Dubai'],
    array['Hotel pickup and drop-off','Dune bashing','Camel ride','Sandboarding','BBQ buffet dinner','Live tanoura and fire show','Unlimited soft drinks, tea and coffee'],
    array['Alcoholic drinks','Quad bike rides','Gratuities'],
    array['Sunglasses','Light jacket for the evening','Camera'],
    'Not recommended for pregnant travellers or anyone with back or neck conditions. Vegetarian meals need 24 hours notice.',
    'Dubai Evening Desert Safari with BBQ Dinner 2026 | From AED 149',
    'Book the Dubai evening desert safari: 40 min dune bashing, camel ride, sandboarding and BBQ dinner with live shows. Hotel pickup included, free cancellation up to 48h.'
  from t
  returning tour_id
),
opt as (
  insert into tour_options (tour_id, code, position, duration_minutes, max_pax, is_private)
  select tour_id, 'standard', 0, 360, 6, false from tr
  union all
  select tour_id, 'private-vip', 1, 360, 6, true from tr
  returning id, code, tour_id
),
optt as (
  insert into tour_option_translations (option_id, locale, name, description)
  select id, 'en',
         case when code = 'standard' then 'Shared 4x4 Safari' else 'Private 4x4 with VIP Table' end,
         case when code = 'standard' then 'Shared vehicle with up to 6 guests, standard camp seating.'
              else 'Your own vehicle and driver, reserved front-row table and private majlis.' end
  from opt
)
insert into tour_prices (option_id, pax, currency, net_price, list_price, min_qty)
select id, 'adult'::pax_type, 'AED'::currency_code, case when code='standard' then 122 else 349 end,
       case when code='standard' then 149 else 425 end, 1 from opt
union all
select id, 'child'::pax_type, 'AED'::currency_code, case when code='standard' then 82 else 0 end,
       case when code='standard' then 99 else 0 end, 0 from opt;

-- 60 days of 16:00 departures for every option on the seeded tour.
insert into tour_departures (tour_id, option_id, starts_at, local_date, capacity)
select o.tour_id, o.id,
       (d::date + time '16:00') at time zone 'Asia/Dubai',
       d::date,
       case when o.code = 'standard' then 48 else 6 end
from tour_options o
join tours t on t.id = o.tour_id
join tour_translations tt on tt.tour_id = t.id and tt.locale = 'en' and tt.slug = 'dubai-evening-desert-safari-bbq'
cross join generate_series(current_date, current_date + 59, interval '1 day') d
on conflict (option_id, starts_at) do nothing;

-- ---------------------------------------------------------- FAQ + CMS
with f as (
  insert into tour_faqs (tour_id, position, source)
  select tt.tour_id, g.i, 'supplier'
  from tour_translations tt, generate_series(0,2) g(i)
  where tt.locale='en' and tt.slug='dubai-evening-desert-safari-bbq'
    and not exists (select 1 from tour_faqs f where f.tour_id = tt.tour_id and f.position = g.i)
  returning id, position
)
insert into tour_faq_translations (faq_id, locale, question, answer)
select f.id, 'en', v.q, v.a
from f join (values
  (0,'What time is hotel pickup?','Pickup runs between 14:30 and 15:30 depending on your area. You receive the exact window by WhatsApp the evening before.'),
  (1,'Is the dune bashing safe for children?','Children aged 3 and above can join. Drivers moderate the route for families, and you can ask for a gentler drive when you board.'),
  (2,'Can I cancel?','Yes — free cancellation up to 48 hours before pickup. Inside 48 hours the booking is non-refundable.')
) as v(pos, q, a) on v.pos = f.position;

-- ------------------------------------------------------------ cover media
-- Listing cards need an image. These point at Unsplash, which next.config.ts
-- allows; swap for Cloudinary once you upload your own.
with asset as (
  insert into media_assets (kind, provider, public_id, url, width, height, blurhash)
  values ('image', 'unsplash', 'dubai-desert-safari-cover',
          'https://images.unsplash.com/photo-1451337516015-6b6e9a44a8a3?w=1200&q=80',
          1200, 800, null)
  on conflict (provider, public_id) do update set url = excluded.url
  returning id
)
insert into tour_media (tour_id, media_id, position, is_cover, alt_text)
select tt.tour_id, asset.id, 0, true,
       jsonb_build_object(
         'en', 'A 4x4 cresting a red dune at sunset near Lahbab, Dubai',
         'ar', 'سيارة دفع رباعي تتسلق كثيبًا رمليًا أحمر عند الغروب قرب لهباب في دبي')
from tour_translations tt, asset
where tt.locale = 'en' and tt.slug = 'dubai-evening-desert-safari-bbq'
on conflict (tour_id, media_id) do nothing;

-- ------------------------------------------------------- popular searches
insert into popular_searches (locale, label, href, position) values
  ('en', 'Desert safari Dubai', '/united-arab-emirates/dubai/desert-safari', 0),
  ('en', 'Burj Khalifa tickets', '/search?q=Burj%20Khalifa', 1),
  ('en', 'AlUla tours',          '/saudi-arabia/alula/things-to-do', 2),
  ('en', 'Doha dhow cruise',     '/search?q=dhow%20cruise', 3),
  ('en', 'Wadi day trips Oman',  '/oman/muscat/things-to-do', 4),
  ('ar', 'رحلات سفاري دبي',       '/ar/الامارات-العربية-المتحدة/دبي/رحلات-السفاري', 0),
  ('ar', 'تذاكر برج خليفة',       '/ar/search?q=برج%20خليفة', 1)
on conflict (locale, label) do nothing;

-- Counters are a materialized view, so they must be refreshed after seeding
-- or the homepage reports zero tours on a freshly seeded database.
select refresh_homepage_stats();

-- ---------------------------------------------------- directory listings
with dubai as (
  select ci.id from cities ci
  join city_translations ct on ct.city_id = ci.id
  where ct.locale = 'en' and ct.slug = 'dubai' limit 1
),
inserted as (
  insert into points_of_interest
    (city_id, kind, vertical_id, location, address, rating, rating_count,
     price_level, price_from, currency, amenities, attributes, image_url, website)
  select d.id, x.kind,
         (select id from verticals where code = x.vertical),
         st_point(x.lng, x.lat)::geography, x.address, x.rating, x.rating_count,
         x.price_level, x.price_from, 'AED'::currency_code, x.amenities, x.attributes::jsonb, x.image, x.website
  from dubai d
  cross join (values
    ('hotel','hotels', 55.1855, 25.1412, 'Jumeirah Beach Road, Umm Suqeim 3', 4.7, 8420, 4, 2400,
     array['pool','spa','beach access','airport shuttle','free wifi','fine dining'],
     '{"stars":5,"area":"Jumeirah","check_in":"15:00"}',
     'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=1200&q=80', 'https://example.com'),
    ('hotel','hotels', 55.2708, 25.1972, 'Downtown Dubai, Mohammed Bin Rashid Blvd', 4.6, 5310, 4, 1100,
     array['pool','spa','free wifi','gym','city view'],
     '{"stars":5,"area":"Downtown","check_in":"15:00"}',
     'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1200&q=80', 'https://example.com'),
    ('hotel','hotels', 55.1300, 25.0800, 'Dubai Marina Walk', 4.3, 2740, 3, 480,
     array['pool','free wifi','gym','marina view'],
     '{"stars":4,"area":"Marina","check_in":"14:00"}',
     'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=1200&q=80', null),
    ('mall','malls', 55.2796, 25.1972, 'Financial Center Road, Downtown Dubai', 4.6, 41200, null, null,
     array['cinema','food court','aquarium','ice rink','valet parking','prayer room'],
     '{"stores":1200,"opens":"10:00","closes":"00:00"}',
     'https://images.unsplash.com/photo-1519567241046-7f570eee3ce6?w=1200&q=80', null),
    ('mall','malls', 55.1180, 25.0330, 'Sheikh Zayed Road, Al Barsha', 4.5, 28900, null, null,
     array['ski slope','cinema','food court','valet parking','prayer room'],
     '{"stores":600,"opens":"10:00","closes":"23:00"}',
     'https://images.unsplash.com/photo-1555529669-e69e7aa0ba9a?w=1200&q=80', null),
    ('attraction','attractions', 55.2744, 25.1972, '1 Sheikh Mohammed bin Rashid Blvd', 4.7, 63400, 3, 179,
     array['skip the line','observation deck','wheelchair accessible','audio guide'],
     '{"height_m":828,"floors":163}',
     'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=1200&q=80', null),
    ('attraction','attractions', 55.1856, 25.1341, 'Jumeirah Street, Umm Suqeim', 4.4, 18700, 2, 65,
     array['family friendly','wheelchair accessible','parking'],
     '{"outdoor":true}',
     'https://images.unsplash.com/photo-1518684079-3c830dcef090?w=1200&q=80', null)
  ) as x(kind, vertical, lng, lat, address, rating, rating_count, price_level, price_from,
         amenities, attributes, image, website)
  where not exists (
    select 1 from points_of_interest p where p.city_id = d.id and p.address = x.address
  )
  returning id, address
)
insert into poi_translations (poi_id, locale, name, slug, summary, description)
select i.id, 'en', x.name, x.slug, x.summary, x.description
from inserted i
join (values
  ('Jumeirah Beach Road, Umm Suqeim 3','Burj Al Arab Jumeirah','burj-al-arab-jumeirah',
   'The sail-shaped icon, with a private beach and suites over the Gulf.',
   'Every room is a duplex suite, and the arrival is by Rolls-Royce or helipad. Even if you are not staying, the afternoon tea in the Skyview Bar is the way most people see the inside.'),
  ('Downtown Dubai, Mohammed Bin Rashid Blvd','Address Downtown','address-downtown',
   'Fountain-facing rooms a lift ride from the Burj Khalifa.',
   'The location is the product: the Dubai Fountain performs directly below, and the Burj Khalifa entrance is through the connected mall.'),
  ('Dubai Marina Walk','Marina Byblos Hotel','marina-byblos-hotel',
   'Straightforward four-star on the Marina Walk.',
   'No frills and no pretence — a rooftop pool, a short walk to the tram, and Marina restaurants downstairs.'),
  ('Financial Center Road, Downtown Dubai','The Dubai Mall','the-dubai-mall',
   'Twelve hundred stores, an aquarium and the Burj Khalifa entrance.',
   'More a district than a mall. Allow a full day, and use the Dubai Mall metro link rather than driving at the weekend.'),
  ('Sheikh Zayed Road, Al Barsha','Mall of the Emirates','mall-of-the-emirates',
   'Shopping with an indoor ski slope attached.',
   'Ski Dubai is the reason most visitors come. Quieter than The Dubai Mall and easier to park at.'),
  ('1 Sheikh Mohammed bin Rashid Blvd','Burj Khalifa','burj-khalifa',
   'The world''s tallest building, with observation decks on 124, 125 and 148.',
   'Book the sunset slot weeks ahead — it sells out first and is the only time you see the city in both daylight and lights. Level 148 costs roughly triple and adds an outdoor terrace.'),
  ('Jumeirah Street, Umm Suqeim','Kite Beach','kite-beach',
   'Free public beach with a skyline view and food trucks.',
   'The running track and the view of the Burj Al Arab make this the beach locals actually use. Showers and changing rooms are free.')
) as x(address, name, slug, summary, description) on x.address = i.address
on conflict do nothing;

-- Populate the listing spine from everything seeded above.
select backfill_listings();

insert into site_settings (key, value, description) values
  ('brand', '{"name":"TravelHub Gulf","supportEmail":"help@travelhubgulf.com","whatsapp":"+971500000000"}', 'Global brand identity'),
  ('currencies', '{"default":"AED","enabled":["AED","SAR","QAR","OMR","BHD","KWD","USD","EUR","GBP","INR"]}', 'Currency switcher'),
  ('locales', '{"default":"en","enabled":["en","ar","hi","ur"],"rtl":["ar","ur"]}', 'Locale switcher'),
  ('booking', '{"holdMinutes":15,"guestCheckout":true,"maxSeatsPerOrder":30}', 'Checkout rules'),
  ('seo', '{"siteUrl":"https://travelhubgulf.com","twitter":"@travelhubgulf","defaultOgImage":"/og/default.jpg"}', 'SEO defaults')
on conflict (key) do update set value = excluded.value;

insert into navigation_menus (key) values ('header_main'), ('footer_explore'), ('footer_company')
on conflict (key) do nothing;

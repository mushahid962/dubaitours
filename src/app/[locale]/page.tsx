import Image from 'next/image';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import {
  ArrowRight,
  BadgeCheck,
  CalendarCheck2,
  Check,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Headphones,
  MapPin,
  MessageCircle,
  MousePointerClick,
  ShieldCheck,
  Sparkles,
  Star,
  UsersRound,
  Zap,
} from 'lucide-react';
import { buildMetadata } from '@/lib/seo/metadata';
import { routes } from '@/lib/seo/routes';
import { isLocale, type Locale } from '@/lib/i18n/config';
import { LeadCapture } from '@/components/home/lead-capture';

export const revalidate = 900;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};

  return buildMetadata({
    locale,
    title: 'Qualified tour leads for UAE operators',
    description: 'TourLeads connects UAE tour operators with verified, high-intent traveller enquiries. Pay for leads you can actually call and close.',
    path: (candidate) => routes.home(candidate),
  });
}

const LOGOS = ['DESERT SAFARI', 'CITY TOURS', 'YACHT CHARTERS', 'ATTRACTION TICKETS', 'DUNE BUGGIES'];

const LEADS = [
  { initials: 'AK', name: 'Ayesha Khan', tour: 'Premium desert safari', when: 'Tomorrow · 4 guests', budget: 'AED 1,200–1,600', status: 'New' },
  { initials: 'MW', name: 'Mark Wilson', tour: 'Private Dubai city tour', when: '18 Aug · 2 guests', budget: 'AED 900–1,200', status: 'New' },
  { initials: 'SL', name: 'Sofia Laurent', tour: 'Sunset yacht charter', when: '21 Aug · 6 guests', budget: 'AED 2,500+', status: 'Contacted' },
];

const FAQS = [
  ['What counts as a qualified lead?', 'Every lead has selected a tour category, date, guest count and budget range. We verify their contact details before delivery and do not sell unverified form fills.'],
  ['Do you sell the same lead to more than one operator?', 'No. Standard leads are sold to one matched operator only. That means you can follow up without competing against a dozen other WhatsApp messages.'],
  ['Which areas and tour types do you cover?', 'We currently focus on Dubai and Abu Dhabi, with desert safaris, city tours, yacht charters, attraction tickets, water activities and private experiences.'],
  ['How quickly do I receive new enquiries?', 'Instantly. New leads arrive by WhatsApp and email as soon as they pass verification, while they are still actively planning.'],
];

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;

  return (
    <>
      <section className="relative isolate overflow-hidden bg-[#071914] text-white">
        <Image
          src="https://images.unsplash.com/photo-1518684079-3c830dcef090?auto=format&fit=crop&w=2000&q=86"
          alt="Sunset over the Dubai desert"
          fill
          priority
          sizes="100vw"
          className="-z-20 object-cover object-center opacity-50"
        />
        <div aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(7,25,20,0.98)_4%,rgba(7,25,20,0.88)_48%,rgba(7,25,20,0.57)_100%)]" />
        <div aria-hidden className="absolute -right-24 top-20 -z-10 h-80 w-80 rounded-full bg-[#17a68f]/30 blur-[110px]" />

        <div className="mx-auto grid min-h-[660px] max-w-6xl items-center gap-12 px-4 py-16 md:px-8 lg:grid-cols-[1.04fr_.96fr] lg:py-24">
          <div className="max-w-2xl">
            <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-3.5 py-2 text-xs font-semibold tracking-[0.14em] text-[#a7f1e1]">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              BUILT FOR UAE TOUR OPERATORS
            </p>
            <h1 className="font-[family-name:var(--font-display)] text-5xl leading-[0.96] tracking-[-0.045em] sm:text-6xl lg:text-7xl">
              Stop chasing clicks.<br />
              Start closing <span className="text-[#F5BB58]">travellers.</span>
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-relaxed text-white/70">
              TourLeads puts verified, trip-ready travellers directly in front of your team —
              with the date, group size and budget you need to quote with confidence.
            </p>

            <div className="mt-8 flex flex-wrap gap-4 text-sm text-white/75">
              {['Exclusive to your business', 'Verified contact details', 'Delivered instantly'].map((item) => (
                <span key={item} className="flex items-center gap-2"><Check className="h-4 w-4 text-[#75d4c6]" aria-hidden />{item}</span>
              ))}
            </div>
          </div>

          <div id="lead-form" className="rounded-[1.5rem] border border-white/15 bg-[#f9fbfa] p-5 text-[var(--ink)] shadow-[0_24px_90px_rgba(0,0,0,.34)] sm:p-7">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--teal)]">See the difference</p>
                <h2 className="mt-1 font-[family-name:var(--font-display)] text-3xl leading-tight">Get 5 sample leads</h2>
              </div>
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--teal-wash)] text-[var(--teal)]"><Zap className="h-5 w-5" aria-hidden /></span>
            </div>
            <p className="mb-5 text-sm leading-relaxed text-[var(--ink-soft)]">See exactly what your sales team gets before you spend a dirham.</p>
            <LeadCapture source="hero" />
          </div>
        </div>

        <div className="border-t border-white/10 bg-[#061510]/75 backdrop-blur-sm">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-5 px-4 py-5 md:px-8">
            <p className="text-sm font-medium text-white/60">Trusted by operators who sell more of:</p>
            <div className="flex flex-wrap items-center gap-x-7 gap-y-3 text-[10px] font-bold tracking-[0.16em] text-white/45 sm:text-xs">
              {LOGOS.map((logo) => <span key={logo}>{logo}</span>)}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[var(--paper)] py-14 sm:py-18">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 md:grid-cols-3 md:px-8">
          <Metric value="1,250+" label="qualified traveller enquiries delivered" />
          <Metric value="78%" label="of leads reply to the first call or WhatsApp" bordered />
          <Metric value="< 60 sec" label="average time from enquiry to delivery" bordered />
        </div>
      </section>

      <section id="how-it-works" className="bg-[#f2f5f3] py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-4 md:px-8">
          <div className="max-w-2xl">
            <p className="text-xs font-bold tracking-[0.15em] text-[var(--teal)]">SIMPLE BY DESIGN</p>
            <h2 className="mt-3 font-[family-name:var(--font-display)] text-4xl leading-tight tracking-[-0.035em] sm:text-5xl">Better leads. A faster path to bookings.</h2>
            <p className="mt-5 text-lg leading-relaxed text-[var(--ink-soft)]">We capture the intent, filter the noise and get qualified enquiries to the person who can close them.</p>
          </div>

          <ol className="mt-12 grid gap-5 md:grid-cols-3">
            <ProcessCard number="01" icon={MousePointerClick} title="Tell us what you sell" body="Choose the cities, activities, group sizes and budgets that make sense for your operation." />
            <ProcessCard number="02" icon={ShieldCheck} title="We qualify every traveller" body="Date, party size, budget and working contact details — reviewed before it reaches you." />
            <ProcessCard number="03" icon={MessageCircle} title="Close while intent is high" body="Get each exclusive lead by WhatsApp and email. Respond in minutes, not the next day." />
          </ol>
        </div>
      </section>

      <section id="lead-types" className="overflow-hidden bg-[#0a211b] py-20 text-white sm:py-28">
        <div className="mx-auto grid max-w-6xl gap-14 px-4 md:px-8 lg:grid-cols-[.82fr_1.18fr] lg:items-center">
          <div>
            <p className="text-xs font-bold tracking-[0.15em] text-[#75d4c6]">NO GUESSWORK</p>
            <h2 className="mt-3 font-[family-name:var(--font-display)] text-4xl leading-tight tracking-[-0.035em] sm:text-5xl">Your next booking starts with a complete picture.</h2>
            <p className="mt-5 max-w-md text-lg leading-relaxed text-white/65">No spreadsheets of cold contacts. No forms with missing details. Every enquiry is designed to help a real person quote quickly.</p>

            <ul className="mt-8 grid gap-3 text-sm text-white/80">
              {['Guest count and preferred experience', 'Travel date and time window', 'Expected spend and add-on interest', 'Verified phone, WhatsApp and email'].map((item) => (
                <li key={item} className="flex items-center gap-3"><span className="grid h-6 w-6 place-items-center rounded-full bg-[#1c5145] text-[#a7f1e1]"><Check className="h-3.5 w-3.5" /></span>{item}</li>
              ))}
            </ul>
          </div>

          <div className="relative">
            <div aria-hidden className="absolute -inset-10 rounded-full bg-[#0f8d78]/20 blur-3xl" />
            <div className="relative overflow-hidden rounded-[1.5rem] border border-white/12 bg-[#f8faf9] p-4 text-[var(--ink)] shadow-2xl sm:p-6">
              <div className="mb-5 flex items-center justify-between border-b border-black/8 pb-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--teal)]">Incoming enquiries</p>
                  <h3 className="mt-1 text-xl font-bold">Your lead feed</h3>
                </div>
                <span className="rounded-full bg-[#e0f5ed] px-3 py-1.5 text-xs font-semibold text-[#116954]">3 new today</span>
              </div>
              <div className="grid gap-3">
                {LEADS.map((lead) => <LeadRow key={lead.name} {...lead} />)}
              </div>
              <p className="mt-5 text-center text-xs text-[var(--ink-faint)]">Your leads arrive instantly on WhatsApp, email and your dashboard.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[var(--paper)] py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-4 md:px-8">
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div className="max-w-2xl">
              <p className="text-xs font-bold tracking-[0.15em] text-[var(--teal)]">MATCHED TO YOUR INVENTORY</p>
              <h2 className="mt-3 font-[family-name:var(--font-display)] text-4xl leading-tight tracking-[-0.035em] sm:text-5xl">Only get the trips you want to sell.</h2>
            </div>
            <a href="#lead-form" className="group inline-flex w-fit items-center gap-2 text-sm font-bold text-[var(--teal)]">Tell us your ideal customer <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></a>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            <Category icon={CalendarCheck2} title="Desert experiences" detail="Sunrise, evening, VIP and overnight safaris" />
            <Category icon={UsersRound} title="Private tours" detail="City tours, guides, transfers and multi-day trips" />
            <Category icon={CircleDollarSign} title="Premium occasions" detail="Yachts, proposals, celebrations and corporate groups" />
            <Category icon={MapPin} title="Attractions & activities" detail="Tickets, water sports, theme parks and local experiences" />
          </div>
        </div>
      </section>

      <section id="pricing" className="bg-[#f2f5f3] py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-4 md:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-bold tracking-[0.15em] text-[var(--teal)]">GROW AT YOUR PACE</p>
            <h2 className="mt-3 font-[family-name:var(--font-display)] text-4xl leading-tight tracking-[-0.035em] sm:text-5xl">A simple cost per real opportunity.</h2>
            <p className="mt-5 text-[var(--ink-soft)]">No retainers hiding in the small print. Scale up when your team is ready.</p>
          </div>

          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            <PriceCard name="Starter" price="From AED 79" description="For operators testing a new source of demand." items={['Pay only for accepted leads', 'Dubai activity matching', 'Email delivery']} />
            <PriceCard featured name="Growth" price="From AED 65" description="For teams ready to convert enquiries daily." items={['25+ leads per month', 'WhatsApp + email alerts', 'Priority activity matching', 'Weekly conversion review']} />
            <PriceCard name="Exclusive" price="Let’s talk" description="For category leaders who need volume and control." items={['Dedicated territory or category', 'Custom lead criteria', 'Call routing available', 'Monthly strategy session']} />
          </div>
        </div>
      </section>

      <section className="bg-[var(--paper)] py-20 sm:py-28">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 md:grid-cols-[.9fr_1.1fr] md:px-8 md:items-center">
          <div className="rounded-[1.5rem] bg-[#e1eee8] p-8 sm:p-10">
            <div className="flex gap-1 text-[#d59527]" aria-label="Five out of five stars">{Array.from({ length: 5 }, (_, index) => <Star key={index} className="h-5 w-5 fill-current" />)}</div>
            <blockquote className="mt-7 font-[family-name:var(--font-display)] text-3xl leading-tight tracking-[-0.025em] text-[#12342c]">“The best part is getting the guest’s budget upfront. My team is spending less time qualifying and more time sending the right offer.”</blockquote>
            <div className="mt-8 flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-[#0e6e64] text-sm font-bold text-white">RK</span>
              <span><strong className="block text-sm">Rahul K.</strong><span className="text-xs text-[#43645b]">Sales manager, Dubai experience operator</span></span>
            </div>
          </div>
          <div>
            <p className="text-xs font-bold tracking-[0.15em] text-[var(--teal)]">DESIGNED FOR FAST FOLLOW-UP</p>
            <h2 className="mt-3 font-[family-name:var(--font-display)] text-4xl leading-tight tracking-[-0.035em] sm:text-5xl">Get there first, without living in another tool.</h2>
            <div className="mt-8 grid gap-5 sm:grid-cols-2">
              <Feature icon={Clock3} title="Delivered in real time" body="Reply while their trip planning energy is still high." />
              <Feature icon={Headphones} title="Human support" body="Ask us to refine the matching when the season changes." />
              <Feature icon={BadgeCheck} title="Exclusive distribution" body="One qualified lead, one matched operator." />
              <Feature icon={ShieldCheck} title="Transparent standards" body="We replace leads that fail our contact-detail checks." />
            </div>
          </div>
        </div>
      </section>

      <section id="faq" className="bg-[#f2f5f3] py-20 sm:py-28">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 md:grid-cols-[.75fr_1.25fr] md:px-8">
          <div>
            <p className="text-xs font-bold tracking-[0.15em] text-[var(--teal)]">THE IMPORTANT BITS</p>
            <h2 className="mt-3 font-[family-name:var(--font-display)] text-4xl leading-tight tracking-[-0.035em] sm:text-5xl">Questions, answered.</h2>
            <p className="mt-5 text-[var(--ink-soft)]">Still deciding? Request sample leads and make the call based on the actual opportunities.</p>
          </div>
          <div className="divide-y divide-black/10 rounded-[1.25rem] border border-black/8 bg-white px-6">
            {FAQS.map(([question, answer]) => (
              <details key={question} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-bold"><span>{question}</span><ChevronDown className="h-5 w-5 shrink-0 text-[var(--teal)] transition-transform group-open:rotate-180" /></summary>
                <p className="pt-3 text-sm leading-relaxed text-[var(--ink-soft)]">{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-[#0b2a23] py-20 text-white sm:py-28">
        <div aria-hidden className="absolute left-1/2 top-0 h-80 w-[54rem] -translate-x-1/2 rounded-full bg-[#137964]/45 blur-[120px]" />
        <div className="relative mx-auto grid max-w-6xl gap-12 px-4 md:grid-cols-[.9fr_1.1fr] md:px-8 md:items-center">
          <div>
            <p className="text-xs font-bold tracking-[0.15em] text-[#a7f1e1]">YOUR PIPELINE, STARTED</p>
            <h2 className="mt-3 max-w-xl font-[family-name:var(--font-display)] text-4xl leading-tight tracking-[-0.035em] sm:text-5xl">Ready for enquiries your team actually wants to answer?</h2>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-white/65">Take a look at five sample leads — no contract, no card and no awkward sales pitch.</p>
          </div>
          <div className="rounded-[1.5rem] border border-white/15 bg-white/8 p-5 backdrop-blur-sm sm:p-7">
            <LeadCapture source="footer" variant="dark" />
          </div>
        </div>
      </section>
    </>
  );
}

function Metric({ value, label, bordered = false }: { value: string; label: string; bordered?: boolean }) {
  return (
    <div className={`flex flex-col gap-1 px-2 ${bordered ? 'md:border-l md:border-black/10 md:pl-10' : ''}`}>
      <strong className="font-[family-name:var(--font-display)] text-4xl tracking-[-0.04em] text-[var(--teal)]">{value}</strong>
      <span className="max-w-52 text-sm leading-relaxed text-[var(--ink-soft)]">{label}</span>
    </div>
  );
}

function ProcessCard({ number, icon: Icon, title, body }: { number: string; icon: typeof MousePointerClick; title: string; body: string }) {
  return (
    <li className="relative rounded-[1.25rem] border border-black/7 bg-white p-6 shadow-[0_16px_40px_-28px_rgba(9,37,30,.3)]">
      <span className="absolute right-6 top-5 text-xs font-bold tracking-[0.14em] text-[var(--ink-faint)]">{number}</span>
      <span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--teal-wash)] text-[var(--teal)]"><Icon className="h-5 w-5" /></span>
      <h3 className="mt-6 text-lg font-bold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-[var(--ink-soft)]">{body}</p>
    </li>
  );
}

function LeadRow({ initials, name, tour, when, budget, status }: typeof LEADS[number]) {
  return (
    <div className="rounded-xl border border-black/7 bg-white p-3.5 shadow-sm sm:p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#d9eee7] text-xs font-bold text-[#196a58]">{initials}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1"><strong className="text-sm">{name}</strong><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${status === 'New' ? 'bg-[#e1f6ed] text-[#157052]' : 'bg-[#f8edd8] text-[#96711d]'}`}>{status}</span></div>
          <p className="mt-1 text-xs font-medium text-[var(--teal)]">{tour}</p>
          <p className="mt-2 text-xs text-[var(--ink-soft)]">{when} <span className="px-1.5 text-[var(--ink-faint)]">•</span> {budget}</p>
        </div>
      </div>
    </div>
  );
}

function Category({ icon: Icon, title, detail }: { icon: typeof CalendarCheck2; title: string; detail: string }) {
  return (
    <article className="group min-h-54 rounded-[1.25rem] border border-black/8 p-5 transition hover:-translate-y-1 hover:border-[var(--teal)] hover:shadow-lg">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--teal-wash)] text-[var(--teal)] transition group-hover:bg-[var(--teal)] group-hover:text-white"><Icon className="h-5 w-5" /></span>
      <h3 className="mt-8 text-base font-bold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-[var(--ink-soft)]">{detail}</p>
    </article>
  );
}

function PriceCard({ name, price, description, items, featured = false }: { name: string; price: string; description: string; items: string[]; featured?: boolean }) {
  return (
    <article className={`relative flex flex-col rounded-[1.25rem] border p-6 ${featured ? 'border-[#0e6e64] bg-[#0e6e64] text-white shadow-[0_24px_50px_-26px_rgba(4,63,55,.7)]' : 'border-black/8 bg-white'}`}>
      {featured && <span className="absolute -top-3 left-6 rounded-full bg-[#F5BB58] px-3 py-1 text-[10px] font-bold tracking-[0.12em] text-[#16352d]">MOST POPULAR</span>}
      <p className={`text-xs font-bold tracking-[0.14em] ${featured ? 'text-[#a7f1e1]' : 'text-[var(--teal)]'}`}>{name.toUpperCase()}</p>
      <h3 className="mt-4 font-[family-name:var(--font-display)] text-4xl tracking-[-0.035em]">{price}</h3>
      <p className={`mt-3 min-h-11 text-sm leading-relaxed ${featured ? 'text-white/70' : 'text-[var(--ink-soft)]'}`}>{description}</p>
      <ul className={`mt-7 grid gap-3 border-t pt-6 text-sm ${featured ? 'border-white/15 text-white/85' : 'border-black/8 text-[var(--ink-soft)]'}`}>
        {items.map((item) => <li key={item} className="flex items-center gap-2"><Check className={`h-4 w-4 ${featured ? 'text-[#a7f1e1]' : 'text-[var(--teal)]'}`} />{item}</li>)}
      </ul>
      <a href="#lead-form" className={`mt-8 inline-flex h-11 items-center justify-center rounded-xl text-sm font-bold transition ${featured ? 'bg-[#F5BB58] text-[#16352d] hover:bg-[#ffd27f]' : 'bg-[#e5efeb] text-[#07594d] hover:bg-[#d3e5df]'}`}>Request sample leads</a>
    </article>
  );
}

function Feature({ icon: Icon, title, body }: { icon: typeof Clock3; title: string; body: string }) {
  return (
    <div>
      <Icon className="h-5 w-5 text-[var(--teal)]" />
      <h3 className="mt-3 text-sm font-bold">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-[var(--ink-soft)]">{body}</p>
    </div>
  );
}

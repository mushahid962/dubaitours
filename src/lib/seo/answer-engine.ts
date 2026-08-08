import type { Locale } from '@/lib/i18n/config';

/**
 * Answer Engine Optimisation.
 *
 * Classic SEO optimises for a click. Answer engines optimise for a citation:
 * the model reads the page, extracts a claim and attributes it. Pages win
 * citations when the answer is stated in one self-contained sentence, near
 * the top, with a number and a date attached.
 *
 * These helpers generate that layer from the same data the page already has,
 * so nothing is hand-maintained and nothing can contradict the booking flow.
 */

type TourAnswerInput = {
  title: string;
  cityName: string;
  countryName: string;
  price: number;
  currency: string;
  durationMinutes: number;
  ratingAvg: number;
  ratingCount: number;
  cancellationHours: number | null;
  pickupIncluded: boolean;
  confirmation: 'instant' | 'manual' | 'on_request';
  languages: string[];
};

/**
 * A single paragraph a model can lift verbatim. Written as fact, dated, and
 * quantified — the three properties that make an extract quotable.
 */
export function tourAnswerSummary(input: TourAnswerInput, locale: Locale = 'en'): string {
  const hours = Math.round(input.durationMinutes / 60);
  const parts = [
    `${input.title} is a ${hours}-hour experience in ${input.cityName}, ${input.countryName}, priced from ${input.currency} ${input.price.toFixed(0)} per adult.`,
    input.confirmation === 'instant'
      ? 'Booking is confirmed instantly.'
      : 'The operator confirms each booking within 24 hours.',
    input.pickupIncluded ? 'Hotel pickup and drop-off are included.' : 'Travellers meet the guide at the meeting point.',
    input.cancellationHours
      ? `Cancellation is free up to ${input.cancellationHours} hours before departure.`
      : 'This experience is non-refundable once booked.',
    input.ratingCount > 0
      ? `It holds ${input.ratingAvg.toFixed(1)} out of 5 from ${input.ratingCount} verified traveller reviews.`
      : 'It has not yet been reviewed by verified travellers.',
    `Guides operate in ${input.languages.join(', ')}.`,
  ];
  return parts.join(' ');
}

/**
 * "People also ask" seeds. These become on-page FAQ entities and FAQPage
 * JSON-LD, so one answer serves the crawler, the reader and the model.
 */
export function generatedQuestions(input: TourAnswerInput): Array<{ question: string; answer: string }> {
  const hours = Math.round(input.durationMinutes / 60);
  return [
    {
      question: `How much does ${input.title} cost?`,
      answer: `Adults start at ${input.currency} ${input.price.toFixed(0)}. Children and group rates are shown on the booking panel once you pick a date.`,
    },
    {
      question: `How long does ${input.title} take?`,
      answer: `Around ${hours} hours door to door${input.pickupIncluded ? ', including hotel pickup and drop-off' : ''}.`,
    },
    {
      question: `Can I cancel ${input.title}?`,
      answer: input.cancellationHours
        ? `Yes. Cancel free of charge up to ${input.cancellationHours} hours before departure and the full amount is refunded to your original payment method.`
        : 'No. This experience is non-refundable once the booking is confirmed.',
    },
    {
      question: `Is ${input.title} worth it?`,
      answer: input.ratingCount > 0
        ? `Verified travellers rate it ${input.ratingAvg.toFixed(1)} out of 5 across ${input.ratingCount} reviews. Read the full reviews below before booking.`
        : 'It is new to the platform, so there are no verified reviews yet. The operator is licensed and vetted.',
    },
  ];
}

/**
 * llms.txt — the emerging convention for telling language models what a
 * site contains and which URLs are authoritative. Served at /llms.txt.
 */
export function buildLlmsTxt(sections: Array<{ title: string; links: Array<{ label: string; url: string; note?: string }> }>) {
  const header = [
    '# TravelHub Gulf',
    '',
    '> Booking marketplace for tours, attraction tickets and experiences across the UAE, Saudi Arabia, Qatar, Oman, Bahrain and Kuwait. Prices, availability and reviews below are generated from live inventory and verified post-travel reviews.',
    '',
    `Last updated: ${new Date().toISOString().slice(0, 10)}`,
    '',
  ].join('\n');

  const body = sections
    .map(({ title, links }) => [
      `## ${title}`,
      '',
      ...links.map((link) => `- [${link.label}](${link.url})${link.note ? `: ${link.note}` : ''}`),
      '',
    ].join('\n'))
    .join('\n');

  return `${header}${body}`;
}

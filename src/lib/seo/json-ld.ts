import type { Locale } from '@/lib/i18n/config';
import { SITE_URL, absolute } from './routes';

type Thing = Record<string, unknown>;

const ORG_ID = `${SITE_URL}/#organization`;
const SITE_ID = `${SITE_URL}/#website`;

/**
 * Structured data is the contract with both classic rich results and the
 * answer engines (AI Overviews, Perplexity, ChatGPT search). Everything a
 * model needs to quote us correctly — price, rating, availability, author,
 * date — is emitted here rather than left implicit in the markup.
 */

export function organizationSchema(): Thing {
  return {
    '@type': 'Organization',
    '@id': ORG_ID,
    name: 'TravelHub Gulf',
    url: SITE_URL,
    logo: { '@type': 'ImageObject', url: absolute('/brand/logo-512.png'), width: 512, height: 512 },
    sameAs: [
      'https://www.instagram.com/travelhubgulf',
      'https://x.com/travelhubgulf',
      'https://www.linkedin.com/company/travelhubgulf',
    ],
    contactPoint: [{
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: 'help@travelhubgulf.com',
      availableLanguage: ['English', 'Arabic', 'Hindi', 'Urdu'],
      areaServed: ['AE', 'SA', 'QA', 'OM', 'BH', 'KW'],
    }],
  };
}

export function websiteSchema(locale: Locale): Thing {
  return {
    '@type': 'WebSite',
    '@id': SITE_ID,
    url: SITE_URL,
    name: 'TravelHub Gulf',
    inLanguage: locale,
    publisher: { '@id': ORG_ID },
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${SITE_URL}/search?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function breadcrumbSchema(trail: Array<{ name: string; path: string }>): Thing {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: absolute(crumb.path),
    })),
  };
}

export function faqSchema(faqs: Array<{ question: string; answer: string }>): Thing | null {
  if (!faqs.length) return null;
  return {
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer },
    })),
  };
}

type TourSchemaInput = {
  id: string;
  url: string;
  name: string;
  description: string;
  images: string[];
  cityName: string;
  countryCode: string;
  latitude?: number | null;
  longitude?: number | null;
  durationMinutes: number;
  currency: string;
  price: number;
  availabilityFrom?: string | null;
  ratingAvg: number;
  ratingCount: number;
  operatorName: string;
  operatorUrl: string;
  locale: Locale;
  languages: string[];
  minAge?: number | null;
};

/**
 * TouristTrip + Offer is the pairing Google reads for tour rich results.
 * Ratings are only emitted when real reviews exist — fabricated aggregate
 * ratings are a manual-action risk and get the whole domain demoted.
 */
export function tourSchema(input: TourSchemaInput): Thing {
  const hasRatings = input.ratingCount > 0 && input.ratingAvg > 0;

  return {
    '@type': 'TouristTrip',
    '@id': `${input.url}#trip`,
    name: input.name,
    description: input.description,
    url: input.url,
    image: input.images,
    inLanguage: input.locale,
    touristType: ['Leisure', 'Family', 'Adventure'],
    provider: { '@type': 'Organization', name: input.operatorName, url: input.operatorUrl },
    itinerary: {
      '@type': 'ItemList',
      itemListElement: [{
        '@type': 'ListItem',
        position: 1,
        item: {
          '@type': 'TouristAttraction',
          name: input.cityName,
          address: { '@type': 'PostalAddress', addressLocality: input.cityName, addressCountry: input.countryCode },
          ...(input.latitude && input.longitude
            ? { geo: { '@type': 'GeoCoordinates', latitude: input.latitude, longitude: input.longitude } }
            : {}),
        },
      }],
    },
    offers: {
      '@type': 'Offer',
      url: input.url,
      price: input.price.toFixed(2),
      priceCurrency: input.currency,
      availability: 'https://schema.org/InStock',
      validFrom: input.availabilityFrom ?? undefined,
      category: 'Tour',
    },
    ...(hasRatings && {
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: input.ratingAvg.toFixed(1),
        reviewCount: input.ratingCount,
        bestRating: 5,
        worstRating: 1,
      },
    }),
    ...(input.minAge ? { typicalAgeRange: `${input.minAge}-` } : {}),
    additionalProperty: [
      { '@type': 'PropertyValue', name: 'Duration', value: `${Math.round(input.durationMinutes / 60)} hours` },
      { '@type': 'PropertyValue', name: 'Guide languages', value: input.languages.join(', ') },
    ],
  };
}

export function reviewSchema(reviews: Array<{
  author: string; rating: number; body: string; datePublished: string;
}>): Thing[] {
  return reviews.map((review) => ({
    '@type': 'Review',
    author: { '@type': 'Person', name: review.author },
    reviewRating: { '@type': 'Rating', ratingValue: review.rating, bestRating: 5, worstRating: 1 },
    reviewBody: review.body,
    datePublished: review.datePublished,
  }));
}

export function articleSchema(input: {
  url: string; headline: string; description: string; image: string;
  publishedTime: string; modifiedTime: string; locale: Locale;
  author: { name: string; url: string; jobTitle?: string };
  reviewer?: { name: string; url: string } | null;
  wordCount?: number;
}): Thing {
  return {
    '@type': 'Article',
    '@id': `${input.url}#article`,
    headline: input.headline,
    description: input.description,
    image: [input.image],
    inLanguage: input.locale,
    datePublished: input.publishedTime,
    dateModified: input.modifiedTime,
    wordCount: input.wordCount,
    author: {
      '@type': 'Person',
      name: input.author.name,
      url: input.author.url,
      jobTitle: input.author.jobTitle,
    },
    ...(input.reviewer && {
      reviewedBy: { '@type': 'Person', name: input.reviewer.name, url: input.reviewer.url },
    }),
    publisher: { '@id': ORG_ID },
    mainEntityOfPage: { '@type': 'WebPage', '@id': input.url },
  };
}

export function videoSchema(input: {
  name: string; description: string; thumbnailUrl: string;
  uploadDate: string; contentUrl: string; durationSeconds?: number;
}): Thing {
  return {
    '@type': 'VideoObject',
    name: input.name,
    description: input.description,
    thumbnailUrl: [input.thumbnailUrl],
    uploadDate: input.uploadDate,
    contentUrl: input.contentUrl,
    ...(input.durationSeconds ? { duration: `PT${input.durationSeconds}S` } : {}),
  };
}

export function itemListSchema(items: Array<{ name: string; url: string; image?: string }>): Thing {
  return {
    '@type': 'ItemList',
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      url: absolute(item.url),
      image: item.image,
    })),
  };
}

/** Wraps every node for a page into one @graph, which is cheaper to parse. */
export function graph(...nodes: Array<Thing | null | undefined>) {
  return { '@context': 'https://schema.org', '@graph': nodes.filter(Boolean) };
}

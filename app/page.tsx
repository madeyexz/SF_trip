import LandingContent from './landing/LandingContent';

export const metadata = {
  title: 'SF Trip Planner — Turn 50 Open Tabs Into One Trip Plan',
  description:
    "See where events are, when they conflict, where it's safe, and plan your SF trip with friends. Live crime heatmaps, curated spots, and Google Calendar export.",
  alternates: {
    canonical: 'https://sf.ianhsiao.me',
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: 'SF Trip Planner',
      url: 'https://sf.ianhsiao.me',
      description:
        'SF Trip Planner consolidates San Francisco events from Luma and Beehiiv, curated restaurant and cafe spots, and live SFPD crime heatmaps onto one interactive Google Map. Plan day-by-day itineraries, share plans with travel companions, and export to Google Calendar. Free, open source, built with Next.js 15.',
      applicationCategory: 'TravelApplication',
      operatingSystem: 'Web',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      },
      author: {
        '@type': 'Person',
        name: 'Ian Hsiao',
        url: 'https://twitter.com/ianhsiao',
      },
      featureList: [
        'Interactive Google Map with color-coded event and spot pins',
        'Live crime heatmap overlay from SFPD incident data',
        'Day-by-day drag-and-drop trip planner',
        'Shared pair planner for travel companions',
        'Google Calendar and iCal export',
        'Event aggregation from Luma calendars and Beehiiv newsletters',
        'Curated restaurant, cafe, bar, and shop recommendations',
        'Route lines between planned stops with time estimates',
      ],
      screenshot: 'https://sf.ianhsiao.me/screenshots/planning.png',
    },
    {
      '@type': 'WebSite',
      name: 'SF Trip Planner',
      url: 'https://sf.ianhsiao.me',
    },
    {
      '@type': 'WebPage',
      name: 'SF Trip Planner — Turn 50 Open Tabs Into One Trip Plan',
      url: 'https://sf.ianhsiao.me',
      description:
        "Plan your San Francisco trip with events, curated spots, and live crime heatmaps on one interactive map.",
      speakable: {
        '@type': 'SpeakableSpecification',
        cssSelector: ['h1', '.hero-description', '.faq-answer'],
      },
    },
    {
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'What is SF Trip Planner?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'SF Trip Planner is a free, open-source web app that puts San Francisco events, curated spots, and live crime heatmaps on one interactive Google Map. It aggregates events from Luma calendars and Beehiiv newsletters, lets you import restaurant and cafe recommendations, and overlays SFPD crime data so you can see what is happening, where it is safe, and plan your days accordingly.',
          },
        },
        {
          '@type': 'Question',
          name: 'How does the SF crime heatmap work?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'The crime heatmap pulls publicly available incident data from SFPD Crime Maps, the SFPD Crime Dashboard, Safemap, and CivicHub. It overlays this data directly on the trip map so you can see which San Francisco blocks had recent incidents before choosing restaurants or planning evening walks.',
          },
        },
        {
          '@type': 'Question',
          name: 'Can I plan a San Francisco trip with friends?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes. SF Trip Planner includes a shared pair planner mode. Create a planner room, invite your travel companion, and both of you see each other\'s schedules side by side. Each person edits only their own itinerary, preventing conflicts while keeping plans synchronized.',
          },
        },
        {
          '@type': 'Question',
          name: 'How do I export my SF trip itinerary to Google Calendar?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Once you finish planning your days, export the full itinerary as an ICS file or sync directly to Google Calendar. Every event, time, and location transfers to your phone so your schedule is ready before you land in San Francisco.',
          },
        },
        {
          '@type': 'Question',
          name: 'Is SF Trip Planner free to use?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes, SF Trip Planner is completely free to use. There are no paid tiers, no sign-up fees, and no feature gates. The project is open source under the GPL-3.0 license, and the full source code is available on GitHub. You can also fork the repository, add your own API keys, and deploy your own instance to Vercel.',
          },
        },
        {
          '@type': 'Question',
          name: 'Can I sponsor or support SF Trip Planner?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes. If you find SF Trip Planner useful, you can support the project through Buy Me a Coffee. The widget is available on the site. You can also contribute code or report issues on the GitHub repository.',
          },
        },
        {
          '@type': 'Question',
          name: 'Which San Francisco neighborhoods should I avoid?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'SF Trip Planner helps you make informed decisions by showing a live crime heatmap sourced from SFPD data. Areas like the Tenderloin typically show higher incident density, especially at night. Toggle the heatmap overlay on the map to check safety around any event or restaurant before committing to your plans.',
          },
        },
      ],
    },
  ],
};

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <LandingContent />
    </>
  );
}

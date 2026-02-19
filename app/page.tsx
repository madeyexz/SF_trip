import LandingContent from './landing/LandingContent';

export const metadata = {
  title: 'SF Trip Planner — Turn 50 Open Tabs Into One Trip Plan',
  description:
    'See where events are, when they conflict, where it\'s safe, and plan your SF trip with friends. Live crime heatmaps, curated spots, and Google Calendar export.',
};

export default function HomePage() {
  return <LandingContent />;
}

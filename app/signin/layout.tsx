import type { ReactNode } from 'react';

export const metadata = {
  title: 'Sign In',
  description:
    'Sign in to SF Trip Planner to start planning your San Francisco trip with events, spots, and live crime heatmaps.',
  robots: {
    index: false,
    follow: true,
  },
};

export default function SignInLayout({ children }: { children: ReactNode }) {
  return children;
}

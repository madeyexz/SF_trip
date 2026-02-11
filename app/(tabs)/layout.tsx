import TripProvider from '@/components/providers/TripProvider';
import AppShell from '@/components/AppShell';

export default function TabsLayout({ children }) {
  return (
    <TripProvider>
      <AppShell>{children}</AppShell>
    </TripProvider>
  );
}

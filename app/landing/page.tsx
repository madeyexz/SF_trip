import Image from 'next/image';
import Link from 'next/link';
import {
  MapPin,
  Calendar,
  Route,
  AlertTriangle,
  Clock,
  Home,
  BarChart3,
  Rss,
  Users,
  ArrowRight,
  Terminal,
  Layers,
  Zap,
} from 'lucide-react';

export const metadata = {
  title: 'SF Trip Planner — Mission Control for Your San Francisco Trip',
  description:
    'Aggregate events, curate spots, plan routes, and sync to Google Calendar. One dark terminal to rule your SF adventure.',
};

/* ------------------------------------------------------------------ */
/*  Tiny helpers                                                       */
/* ------------------------------------------------------------------ */

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block border border-accent/25 bg-accent/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.5px] text-accent">
      {children}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-[11px] font-bold uppercase tracking-[1px] text-muted">
      // {children}
    </p>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="border border-border bg-card p-5">
      <div className="mb-3 flex items-center gap-3">
        <Icon size={16} className="text-accent" />
        <h3 className="text-[13px] font-semibold uppercase tracking-[0.5px] text-foreground">
          {title}
        </h3>
      </div>
      <p className="text-[12px] leading-relaxed text-foreground-secondary">{description}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-bg text-foreground">
      {/* ── NAV ── */}
      <nav className="fixed inset-x-0 top-0 z-50 border-b border-border bg-bg/90 backdrop-blur-sm">
        <div className="mx-auto flex h-12 max-w-[1200px] items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <MapPin size={14} className="text-accent" />
            <span className="text-[13px] font-semibold uppercase tracking-[1px]">
              SF Trip Planner
            </span>
          </div>
          <Link
            href="/signin"
            className="bg-accent px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.5px] text-[#0C0C0C] transition-colors hover:bg-accent-hover"
          >
            Launch Planner
          </Link>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="relative flex min-h-[80vh] items-center justify-center overflow-hidden border-b border-border pt-12">
        {/* grid bg */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
        {/* glow */}
        <div className="pointer-events-none absolute left-1/2 top-1/3 h-[400px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/[0.04] blur-[100px]" />

        <div className="relative z-10 mx-auto max-w-[1200px] px-6 text-center">
          <Badge>Open Source</Badge>

          <h1
            className="mt-6 text-[42px] font-bold leading-tight tracking-[-1px] text-foreground"
            style={{ fontFamily: 'var(--font-space-grotesk)' }}
          >
            One Terminal to Plan
            <br />
            Your SF Adventure
          </h1>

          <p className="mx-auto mt-5 max-w-[600px] text-[14px] leading-relaxed text-foreground-secondary">
            Too many recommendation lists. Too many bookmarked tabs. Zero integration.
            <br />
            <span className="text-foreground">
              SF Trip Planner aggregates events, curates spots, plans routes, and syncs to your
              calendar
            </span>
            &mdash;all from one dark, developer-friendly mission control.
          </p>

          <div className="mt-8 flex items-center justify-center gap-4">
            <Link
              href="/signin"
              className="inline-flex items-center gap-2 bg-accent px-6 py-3 text-[11px] font-bold uppercase tracking-[0.5px] text-[#0C0C0C] transition-colors hover:bg-accent-hover"
            >
              <Terminal size={14} />
              Launch Planner
            </Link>
            <a
              href="https://github.com/madeyexz/SF_trip"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 border border-border bg-card px-6 py-3 text-[11px] font-bold uppercase tracking-[0.5px] text-foreground transition-colors hover:border-accent"
            >
              View Source
              <ArrowRight size={12} />
            </a>
          </div>

          {/* hero screenshot */}
          <div className="relative mx-auto mt-12 max-w-[960px] border border-border">
            <div className="flex h-8 items-center gap-2 border-b border-border bg-card px-4">
              <span className="text-[10px] font-semibold uppercase tracking-[0.5px] text-muted">
                // PLANNING_VIEW
              </span>
            </div>
            <Image
              src="/screenshots/planning.png"
              alt="SF Trip Planner — Planning View with map, events list, and day planner"
              width={1920}
              height={1080}
              className="block w-full"
              priority
            />
          </div>
        </div>
      </section>

      {/* ── PROBLEM ── */}
      <section className="border-b border-border py-20">
        <div className="mx-auto max-w-[1200px] px-6">
          <SectionLabel>The Problem</SectionLabel>
          <h2
            className="text-[32px] font-bold tracking-[-1px]"
            style={{ fontFamily: 'var(--font-space-grotesk)' }}
          >
            Information Overload, Zero Structure
          </h2>
          <p className="mt-4 max-w-[640px] text-[13px] leading-relaxed text-foreground-secondary">
            Planning a trip to San Francisco means juggling dozens of event recommendation lists,
            curated spot roundups, scattered across newsletters, calendars, and bookmarks. By the
            time you cross-reference dates, check locations, and figure out logistics, the trip is
            half over.
          </p>

          <div className="mt-10 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="border border-warning/30 bg-warning/[0.05] p-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.5px] text-warning">
                [Problem_01]
              </p>
              <p className="mt-2 text-[13px] text-foreground-secondary">
                Too many event recommendation lists from newsletters, Luma, Eventbrite, and friends.
              </p>
            </div>
            <div className="border border-warning/30 bg-warning/[0.05] p-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.5px] text-warning">
                [Problem_02]
              </p>
              <p className="mt-2 text-[13px] text-foreground-secondary">
                Too many spot recommendation lists&mdash;restaurants, cafes, bars, shops&mdash;spread
                across Google Maps lists and notes.
              </p>
            </div>
            <div className="border border-warning/30 bg-warning/[0.05] p-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.5px] text-warning">
                [Problem_03]
              </p>
              <p className="mt-2 text-[13px] text-foreground-secondary">
                No single view to compare times, locations, and priorities. Too many open tabs, zero
                integration.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURES GRID ── */}
      <section className="border-b border-border py-20">
        <div className="mx-auto max-w-[1200px] px-6">
          <SectionLabel>Capabilities</SectionLabel>
          <h2
            className="text-[32px] font-bold tracking-[-1px]"
            style={{ fontFamily: 'var(--font-space-grotesk)' }}
          >
            Everything in One Place
          </h2>
          <p className="mt-4 max-w-[640px] text-[13px] leading-relaxed text-foreground-secondary">
            Inspired by information software design principles&mdash;show the user what they need to
            know, not what they can click. Three parallel interfaces working together: map overview,
            day filtering, and activity planning.
          </p>

          <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              icon={Rss}
              title="Aggregate Sources"
              description="Pull events from RSS feeds, iCal calendars, and newsletters (Beehiiv via Firecrawl). One sync, all your events."
            />
            <FeatureCard
              icon={AlertTriangle}
              title="Time Conflict Warnings"
              description="Visual warnings when events overlap. See conflicts at a glance so you never double-book a time slot."
            />
            <FeatureCard
              icon={Clock}
              title="Days Remaining"
              description="Map markers show how many days until each event. Prioritize what's coming up and skip what's passed."
            />
            <FeatureCard
              icon={Home}
              title="Choose Your Stay"
              description="See the spatial distribution of events to pick accommodation that minimizes transit time and cost."
            />
            <FeatureCard
              icon={BarChart3}
              title="Time Distribution"
              description="Bar charts reveal when events cluster. Find free windows for coffee chats and spontaneous exploration."
            />
            <FeatureCard
              icon={Route}
              title="Auto Route Planning"
              description="Automatic route generation between planned activities. See polylines on the map with walking/transit times."
            />
            <FeatureCard
              icon={Calendar}
              title="Google Calendar Sync"
              description="Export your planned itinerary to Google Calendar or download as ICS. Keep your schedule in sync everywhere."
            />
            <FeatureCard
              icon={Users}
              title="Pair Planner"
              description="Traveling with someone? Create a shared room and plan together in real-time with separate ownership of items."
            />
            <FeatureCard
              icon={Layers}
              title="Category Filters"
              description="Filter spots by type: eat, bar, cafes, go out, shops. Toggle layers on the map. See only what matters."
            />
          </div>
        </div>
      </section>

      {/* ── SCREENSHOT: MAP ── */}
      <section className="border-b border-border py-20">
        <div className="mx-auto max-w-[1200px] px-6">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
            <div>
              <SectionLabel>Map Overview</SectionLabel>
              <h2
                className="text-[28px] font-bold tracking-[-1px]"
                style={{ fontFamily: 'var(--font-space-grotesk)' }}
              >
                See Everything on the Map
              </h2>
              <p className="mt-4 text-[13px] leading-relaxed text-foreground-secondary">
                Every event and curated spot plotted on an interactive Google Map. Color-coded
                markers by category&mdash;orange for events, green for safe zones, red for areas to
                avoid. Toggle crime heatmaps, filter by category, and tap any marker for details.
              </p>
              <ul className="mt-6 space-y-2">
                {[
                  'Color-coded pins by category',
                  'Live crime heatmap overlay',
                  'Route polylines between planned stops',
                  'Days-remaining countdown on markers',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-[12px] text-foreground-secondary">
                    <Zap size={10} className="text-accent" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="border border-border">
              <div className="flex h-8 items-center gap-2 border-b border-border bg-card px-4">
                <span className="text-[10px] font-semibold uppercase tracking-[0.5px] text-muted">
                  // MAP_VIEW
                </span>
              </div>
              <Image
                src="/screenshots/map.png"
                alt="Interactive map with color-coded event and spot markers"
                width={1280}
                height={720}
                className="block w-full"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── SCREENSHOT: CALENDAR ── */}
      <section className="border-b border-border py-20">
        <div className="mx-auto max-w-[1200px] px-6">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
            <div className="order-2 border border-border lg:order-1">
              <div className="flex h-8 items-center gap-2 border-b border-border bg-card px-4">
                <span className="text-[10px] font-semibold uppercase tracking-[0.5px] text-muted">
                  // CALENDAR_VIEW
                </span>
              </div>
              <Image
                src="/screenshots/calendar.png"
                alt="Month calendar view showing event and plan counts per day"
                width={1280}
                height={720}
                className="block w-full"
              />
            </div>
            <div className="order-1 lg:order-2">
              <SectionLabel>Calendar</SectionLabel>
              <h2
                className="text-[28px] font-bold tracking-[-1px]"
                style={{ fontFamily: 'var(--font-space-grotesk)' }}
              >
                Month View at a Glance
              </h2>
              <p className="mt-4 text-[13px] leading-relaxed text-foreground-secondary">
                A classic month grid showing event counts and planned item counts for every day.
                Quickly spot busy days, find open slots, and jump to any date for detailed planning.
                Events are synced from all your configured sources automatically.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── SCREENSHOT: SPOTS ── */}
      <section className="border-b border-border py-20">
        <div className="mx-auto max-w-[1200px] px-6">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
            <div>
              <SectionLabel>Curated Spots</SectionLabel>
              <h2
                className="text-[28px] font-bold tracking-[-1px]"
                style={{ fontFamily: 'var(--font-space-grotesk)' }}
              >
                Your Shortlist, Organized
              </h2>
              <p className="mt-4 text-[13px] leading-relaxed text-foreground-secondary">
                Import spots from Google Maps lists, curated guides, and personal notes. Categorize
                them as restaurants, cafes, bars, shops, or places to visit. See them on the map,
                filter by type, and drag them into your daily planner.
              </p>
            </div>
            <div className="border border-border">
              <div className="flex h-8 items-center gap-2 border-b border-border bg-card px-4">
                <span className="text-[10px] font-semibold uppercase tracking-[0.5px] text-muted">
                  // SPOTS_VIEW
                </span>
              </div>
              <Image
                src="/screenshots/spots.png"
                alt="Spots view with curated places organized by category"
                width={1280}
                height={720}
                className="block w-full"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── TECH STACK ── */}
      <section className="border-b border-border py-20">
        <div className="mx-auto max-w-[1200px] px-6">
          <SectionLabel>System Info</SectionLabel>
          <h2
            className="text-[32px] font-bold tracking-[-1px]"
            style={{ fontFamily: 'var(--font-space-grotesk)' }}
          >
            Built With
          </h2>
          <div className="mt-8 flex flex-wrap gap-3">
            {[
              'Next.js 15',
              'React 19',
              'TypeScript',
              'Convex',
              'Google Maps API',
              'Tailwind CSS v4',
              'Lucide Icons',
              'Firecrawl',
              'Vercel',
            ].map((tech) => (
              <span
                key={tech}
                className="border border-border bg-card px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.5px] text-foreground-secondary"
              >
                {tech}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-24">
        <div className="mx-auto max-w-[1200px] px-6 text-center">
          <p className="text-[11px] font-bold uppercase tracking-[1px] text-accent">
            // READY_TO_LAUNCH
          </p>
          <h2
            className="mt-4 text-[32px] font-bold tracking-[-1px]"
            style={{ fontFamily: 'var(--font-space-grotesk)' }}
          >
            Stop Tab-Hopping. Start Planning.
          </h2>
          <p className="mx-auto mt-4 max-w-[480px] text-[13px] leading-relaxed text-foreground-secondary">
            Centralize your SF trip research into one mission control. Free and open source.
          </p>
          <div className="mt-8">
            <Link
              href="/signin"
              className="inline-flex items-center gap-2 bg-accent px-8 py-3 text-[11px] font-bold uppercase tracking-[0.5px] text-[#0C0C0C] transition-colors hover:bg-accent-hover"
            >
              <Terminal size={14} />
              Launch Planner
            </Link>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-border py-8">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <MapPin size={12} className="text-accent" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.5px] text-muted">
              SF Trip Planner
            </span>
          </div>
          <p className="text-[11px] text-muted">
            Built for a trip to San Francisco. Open source.
          </p>
        </div>
      </footer>
    </div>
  );
}

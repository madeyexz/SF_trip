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
  title: 'SF Trip Planner — Turn 50 Open Tabs Into One Trip Plan',
  description:
    'Stop juggling newsletters, Google Maps lists, and bookmarked tabs. SF Trip Planner pulls every event and spot into one planner with map, calendar, and route planning.',
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
            Plan Your Trip Free
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
          <Badge>Free &amp; Open Source</Badge>

          <h1
            className="mt-6 text-[42px] font-bold leading-tight tracking-[-1px] text-foreground"
            style={{ fontFamily: 'var(--font-space-grotesk)' }}
          >
            Turn 50 Open Tabs
            <br />
            Into One Trip Plan
          </h1>

          <p className="mx-auto mt-5 max-w-[600px] text-[14px] leading-relaxed text-foreground-secondary">
            You have 12 newsletters recommending SF events, a Google Maps list of restaurants, and
            a friend&apos;s recs buried in chat.{' '}
            <span className="text-foreground">
              SF Trip Planner pulls every source into one screen
            </span>
            &mdash;map, calendar, and day planner side by side&mdash;so you stop cross-referencing
            and start deciding.
          </p>

          <div className="mt-8 flex items-center justify-center gap-4">
            <Link
              href="/signin"
              className="inline-flex items-center gap-2 bg-accent px-6 py-3 text-[11px] font-bold uppercase tracking-[0.5px] text-[#0C0C0C] transition-colors hover:bg-accent-hover"
            >
              <Terminal size={14} />
              Plan Your Trip Free
            </Link>
            <a
              href="https://github.com/madeyexz/SF_trip"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 border border-border bg-card px-6 py-3 text-[11px] font-bold uppercase tracking-[0.5px] text-foreground transition-colors hover:border-accent"
            >
              View on GitHub
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
            Sound Familiar?
          </h2>
          <p className="mt-4 max-w-[640px] text-[13px] leading-relaxed text-foreground-secondary">
            You&apos;re visiting SF. You&apos;ve done the research. Now your browser has 47 tabs open and
            you still don&apos;t know what to do on Tuesday.
          </p>

          <div className="mt-10 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="border border-warning/30 bg-warning/[0.05] p-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.5px] text-warning">
                [Scattered_Events]
              </p>
              <p className="mt-2 text-[13px] text-foreground-secondary">
                Newsletters from Beehiiv, events on Luma, meetups on Eventbrite, and a friend&apos;s
                list in iMessage. Each one links to a different site. Good luck cross-referencing dates.
              </p>
            </div>
            <div className="border border-warning/30 bg-warning/[0.05] p-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.5px] text-warning">
                [Buried_Spots]
              </p>
              <p className="mt-2 text-[13px] text-foreground-secondary">
                Your restaurant list lives in Google Maps. That blog roundup of coffee shops?
                Bookmarked and forgotten. The ramen spot someone mentioned? Lost in a group chat.
              </p>
            </div>
            <div className="border border-warning/30 bg-warning/[0.05] p-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.5px] text-warning">
                [No_Big_Picture]
              </p>
              <p className="mt-2 text-[13px] text-foreground-secondary">
                You know what you want to do. You don&apos;t know when things overlap, which events are
                walkable from each other, or where you should even stay to save on transit.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURES GRID ── */}
      <section className="border-b border-border py-20">
        <div className="mx-auto max-w-[1200px] px-6">
          <SectionLabel>What You Get</SectionLabel>
          <h2
            className="text-[32px] font-bold tracking-[-1px]"
            style={{ fontFamily: 'var(--font-space-grotesk)' }}
          >
            Three Panes. Zero Tab-Switching.
          </h2>
          <p className="mt-4 max-w-[640px] text-[13px] leading-relaxed text-foreground-secondary">
            Map, events, and day planner live side by side. Click an event on the left, see it on
            the map, drag it into your schedule on the right. No context-switching. No copy-pasting
            between apps.
          </p>

          <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              icon={Rss}
              title="Never Miss an Event"
              description="Sync RSS feeds, iCal calendars, and newsletters in one click. Events from Luma, Eventbrite, and Beehiiv show up automatically — no manual entry."
            />
            <FeatureCard
              icon={AlertTriangle}
              title="Spot Conflicts Instantly"
              description="Two events at 7 PM on Thursday? You'll see the overlap highlighted before you commit. No more double-booking."
            />
            <FeatureCard
              icon={Clock}
              title="Know What's Coming"
              description="Every map marker shows days remaining until the event. Focus on what's soon, skip what's passed."
            />
            <FeatureCard
              icon={Home}
              title="Pick the Right Neighborhood"
              description="See where your events cluster on the map. Choose an Airbnb in the middle and cut your transit time in half."
            />
            <FeatureCard
              icon={BarChart3}
              title="Find Gaps for Coffee Chats"
              description="A bar chart shows when events cluster by hour. Spot the 2-hour gap on Wednesday afternoon — perfect for that coffee chat."
            />
            <FeatureCard
              icon={Route}
              title="See the Route, Not Just the Pins"
              description="Drag activities into your day planner. The map draws walking and transit routes between stops with estimated times."
            />
            <FeatureCard
              icon={Calendar}
              title="Keep Your Calendar in Sync"
              description="Export your finalized itinerary to Google Calendar or download the ICS file. Your phone stays up to date."
            />
            <FeatureCard
              icon={Users}
              title="Plan Together, Decide Separately"
              description="Traveling with a friend? Share a planner room. You each see both schedules, but only edit your own."
            />
            <FeatureCard
              icon={Layers}
              title="Show Only What Matters"
              description="Toggle map layers by category — eat, bar, cafes, shops, events. Hunting for dinner? Hide everything else."
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
                One Map. Every Option.
              </h2>
              <p className="mt-4 text-[13px] leading-relaxed text-foreground-secondary">
                Every event and curated spot on a single interactive map. Orange pins for events,
                teal for cafes, pink for nightlife. Tap a marker to see details, toggle the crime
                heatmap to check neighborhoods, and watch route lines draw between your planned stops.
              </p>
              <ul className="mt-6 space-y-2">
                {[
                  'Color-coded pins so you spot categories at a glance',
                  'Live crime heatmap to vet neighborhoods before booking',
                  'Route lines drawn between your planned stops',
                  'Countdown badges so you never miss a deadline',
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
                Spot Busy Days Before They Happen
              </h2>
              <p className="mt-4 text-[13px] leading-relaxed text-foreground-secondary">
                Each day shows how many events are available and how many you&apos;ve planned. See at a
                glance that Saturday is packed while Wednesday is wide open. Click any date to jump
                straight into day-level planning.
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
                Every Recommendation in One List
              </h2>
              <p className="mt-4 text-[13px] leading-relaxed text-foreground-secondary">
                That ramen place from the blog. The rooftop bar your coworker mentioned. The coffee
                shop with the 4.9 rating. Import them all, tag by category, and see them on the
                map alongside your events. When it&apos;s time to plan dinner, filter to &ldquo;eat&rdquo; and
                pick the one closest to your next event.
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
          <SectionLabel>Under the Hood</SectionLabel>
          <h2
            className="text-[32px] font-bold tracking-[-1px]"
            style={{ fontFamily: 'var(--font-space-grotesk)' }}
          >
            Open Source. Ship It Yourself.
          </h2>
          <p className="mt-4 max-w-[640px] text-[13px] leading-relaxed text-foreground-secondary">
            Fork the repo, swap in your own API keys, and deploy to Vercel. Every piece of the
            stack is open and documented.
          </p>
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
            Close the 47 Tabs. Open One Planner.
          </h2>
          <p className="mx-auto mt-4 max-w-[480px] text-[13px] leading-relaxed text-foreground-secondary">
            Sign in with your email. Import your sources. Start dragging events into your
            schedule. Takes about two minutes.
          </p>
          <div className="mt-8">
            <Link
              href="/signin"
              className="inline-flex items-center gap-2 bg-accent px-8 py-3 text-[11px] font-bold uppercase tracking-[0.5px] text-[#0C0C0C] transition-colors hover:bg-accent-hover"
            >
              <Terminal size={14} />
              Plan Your Trip Free
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

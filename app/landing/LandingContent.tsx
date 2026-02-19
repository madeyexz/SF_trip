import type { ComponentType, ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  MapPin,
  AlertTriangle,
  Users,
  ArrowRight,
  Terminal,
  Layers,
  Zap,
  ShieldAlert,
  CalendarSync,
  GripVertical,
  ExternalLink,
} from 'lucide-react';
import {
  ArrowNudge,
  FadeItem,
  HeroParallax,
  HoverLift,
  InViewStagger,
  MotionProvider,
  NavEnter,
  ScrollProgressBar,
} from './LandingMotion';

const MAP_FEATURE_BULLETS = [
  'Color-coded pins: events, eat, bar, cafes, shops, avoid',
  'Live crime heatmap overlay from SFPD incident data',
  'Route lines between planned stops with time estimates',
  'Days-remaining countdown so you prioritize what\'s soon',
];

const SAFETY_SOURCES = [
  {
    name: 'SFPD Crime Maps',
    url: 'https://sfgov.org/services/sf-crime-maps',
    desc: 'Official SF government crime mapping',
  },
  {
    name: 'Safemap Interactive Heatmap',
    url: 'https://safemap.io/sf/map',
    desc: 'Visual crime density by block',
  },
  {
    name: 'SFPD Crime Dashboard',
    url: 'https://sanfranciscopolice.org',
    desc: 'Police department incident data',
  },
  {
    name: 'CivicHub Live Reports',
    url: 'https://civichub.us/ca/san-francisco',
    desc: 'Community-reported real-time incidents',
  },
];

const TECH_STACK = [
  'Next.js 15',
  'React 19',
  'TypeScript',
  'Convex',
  'Google Maps API',
  'Tailwind CSS v4',
  'Lucide Icons',
  'Firecrawl',
  'Vercel',
];

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block border border-accent/25 bg-accent/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.5px] text-accent">
      {children}
    </span>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-3 text-[11px] font-bold uppercase tracking-[1px] text-muted">
      {'// '}{children}
    </p>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description,
  accent,
}: {
  icon: ComponentType<{ size?: number; className?: string }>;
  title: string;
  description: string;
  accent?: 'green' | 'warning' | 'danger';
}) {
  const colors = {
    green: { icon: 'text-accent', border: 'border-accent/20' },
    warning: { icon: 'text-warning', border: 'border-warning/20' },
    danger: { icon: 'text-danger', border: 'border-danger/20' },
  };
  const c = colors[accent || 'green'];

  return (
    <div className={`border ${c.border} bg-card p-5`}>
      <div className="mb-3 flex items-center gap-3">
        <Icon size={16} className={c.icon} />
        <h3 className="text-[13px] font-semibold uppercase tracking-[0.5px] text-foreground">
          {title}
        </h3>
      </div>
      <p className="text-[12px] leading-relaxed text-foreground-secondary">{description}</p>
    </div>
  );
}

function AnimatedFeatureCard(props: {
  icon: ComponentType<{ size?: number; className?: string }>;
  title: string;
  description: string;
  accent?: 'green' | 'warning' | 'danger';
}) {
  return (
    <FadeItem>
      <HoverLift y={-4} tapScale={0.995}>
        <FeatureCard {...props} />
      </HoverLift>
    </FadeItem>
  );
}

export default function LandingContent() {
  return (
    <MotionProvider>
      <div className="min-h-screen bg-bg text-foreground">
        <ScrollProgressBar />

        {/* ── NAV ── */}
        <NavEnter className="fixed inset-x-0 top-0 z-50 border-b border-border bg-bg/90 backdrop-blur-sm">
          <div className="mx-auto flex h-12 max-w-[1200px] items-center justify-between px-6">
            <div className="flex items-center gap-2">
              <MapPin size={14} className="text-accent" />
              <span className="text-[13px] font-semibold uppercase tracking-[1px]">
                SF Trip Planner
              </span>
            </div>
            <HoverLift y={-1} tapScale={0.985} className="inline-flex">
              <Link
                href="/signin"
                className="bg-accent px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.5px] text-[#0C0C0C] transition-colors hover:bg-accent-hover"
              >
                Plan Your Trip Free
              </Link>
            </HoverLift>
          </div>
        </NavEnter>

        {/* ── HERO ── */}
        <section className="relative flex min-h-[80vh] items-center justify-center overflow-hidden border-b border-border pt-12">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage:
                'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            }}
          />
          <div className="pointer-events-none absolute left-1/2 top-1/3 h-[400px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/[0.04] blur-[100px]" />

          <InViewStagger className="relative z-10 mx-auto max-w-[1200px] px-6 text-center" amount={0.25}>
            <FadeItem>
              <Badge>Free &amp; Open Source</Badge>
            </FadeItem>

            <FadeItem>
              <h1
                className="mt-6 text-[42px] font-bold leading-tight tracking-[-1px] text-foreground"
                style={{ fontFamily: 'var(--font-space-grotesk)' }}
              >
                Turn 50 Open Tabs
                <br />
                Into One Trip Plan
              </h1>
            </FadeItem>

            <FadeItem>
              <p className="mx-auto mt-5 max-w-[620px] text-[14px] leading-relaxed text-foreground-secondary">
                See where every event is. See when they conflict. See where it&apos;s safe to walk.{' '}
                <span className="text-foreground">
                  One screen that shows you everything you need to decide
                </span>
                &mdash;then plan your days, plan with friends, and export to Google Calendar.
              </p>
            </FadeItem>

            <FadeItem className="mt-8 flex items-center justify-center gap-4">
              <HoverLift y={-2} tapScale={0.985} className="inline-flex">
                <Link
                  href="/signin"
                  className="inline-flex items-center gap-2 bg-accent px-6 py-3 text-[11px] font-bold uppercase tracking-[0.5px] text-[#0C0C0C] transition-colors hover:bg-accent-hover"
                >
                  <Terminal size={14} />
                  Plan Your Trip Free
                </Link>
              </HoverLift>

              <HoverLift y={-2} tapScale={0.985} className="inline-flex">
                <a
                  href="https://github.com/madeyexz/SF_trip"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 border border-border bg-card px-6 py-3 text-[11px] font-bold uppercase tracking-[0.5px] text-foreground transition-colors hover:border-accent"
                >
                  View on GitHub
                  <ArrowNudge>
                    <ArrowRight size={12} />
                  </ArrowNudge>
                </a>
              </HoverLift>
            </FadeItem>

            <FadeItem>
              <HeroParallax className="relative mx-auto mt-12 max-w-[960px] border border-border">
                <div className="flex h-8 items-center gap-2 border-b border-border bg-card px-4">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.5px] text-muted">
                    {'// PLANNING_VIEW'}
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
              </HeroParallax>
            </FadeItem>
          </InViewStagger>
        </section>

        {/* ── PROBLEM ── */}
        <section className="border-b border-border py-20">
          <InViewStagger className="mx-auto max-w-[1200px] px-6">
            <FadeItem>
              <SectionLabel>The Problem</SectionLabel>
            </FadeItem>
            <FadeItem>
              <h2
                className="text-[32px] font-bold tracking-[-1px]"
                style={{ fontFamily: 'var(--font-space-grotesk)' }}
              >
                Sound Familiar?
              </h2>
            </FadeItem>
            <FadeItem>
              <p className="mt-4 max-w-[640px] text-[13px] leading-relaxed text-foreground-secondary">
                You&apos;re visiting SF. You&apos;ve done the research. Now your browser has 47 tabs open,
                you don&apos;t know what to do on Tuesday, and you&apos;re not sure which neighborhoods
                are safe to walk at night.
              </p>
            </FadeItem>

            <div className="mt-10 grid grid-cols-1 gap-3 md:grid-cols-3">
              <FadeItem>
                <div className="border border-warning/30 bg-warning/[0.05] p-5">
                  <p className="text-[11px] font-bold uppercase tracking-[0.5px] text-warning">
                    [Scattered_Events]
                  </p>
                  <p className="mt-2 text-[13px] text-foreground-secondary">
                    Newsletters from Beehiiv, events on Luma, meetups on Eventbrite, a friend&apos;s
                    list in iMessage. Each links to a different site. Good luck cross-referencing dates.
                  </p>
                </div>
              </FadeItem>
              <FadeItem>
                <div className="border border-warning/30 bg-warning/[0.05] p-5">
                  <p className="text-[11px] font-bold uppercase tracking-[0.5px] text-warning">
                    [Buried_Spots]
                  </p>
                  <p className="mt-2 text-[13px] text-foreground-secondary">
                    Your restaurant list lives in Google Maps. The coffee shop from that blog? Bookmarked
                    and forgotten. The ramen spot someone mentioned? Lost in a group chat.
                  </p>
                </div>
              </FadeItem>
              <FadeItem>
                <div className="border border-danger/30 bg-danger/[0.05] p-5">
                  <p className="text-[11px] font-bold uppercase tracking-[0.5px] text-danger">
                    [Safety_Blind_Spot]
                  </p>
                  <p className="mt-2 text-[13px] text-foreground-secondary">
                    Let&apos;s be honest&mdash;SF has neighborhoods where you don&apos;t want to wander at
                    10 PM. But crime maps and event pins live on completely different websites. Until now.
                  </p>
                </div>
              </FadeItem>
            </div>
          </InViewStagger>
        </section>

        {/* ── CORE VALUE: SEE ── */}
        <section className="border-b border-border py-20">
          <InViewStagger className="mx-auto max-w-[1200px] px-6">
            <FadeItem>
              <SectionLabel>See Everything</SectionLabel>
            </FadeItem>
            <FadeItem>
              <h2
                className="text-[32px] font-bold tracking-[-1px]"
                style={{ fontFamily: 'var(--font-space-grotesk)' }}
              >
                See Before You Plan
              </h2>
            </FadeItem>
            <FadeItem>
              <p className="mt-4 max-w-[640px] text-[13px] leading-relaxed text-foreground-secondary">
                Good decisions start with good information. Before you commit to anything, see where
                events are, when they happen, what spots are nearby, and which streets to avoid.
              </p>
            </FadeItem>

            <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <AnimatedFeatureCard
                icon={MapPin}
                title="See Where Events Are"
                description="Every event plotted on one map. Color-coded pins by category — orange for events, teal for cafes, pink for nightlife. Tap any pin for details. No more switching between Luma, Eventbrite, and Google Maps."
              />
              <AnimatedFeatureCard
                icon={AlertTriangle}
                title="See When They Conflict"
                description="Two events at 7 PM on Thursday? You'll see the overlap highlighted before you commit. The calendar shows event counts per day so you spot packed days and empty ones at a glance."
                accent="warning"
              />
              <AnimatedFeatureCard
                icon={Layers}
                title="See Your Curated Spots"
                description="That ramen place from the blog, the rooftop bar from a coworker, the coffee shop with the 4.9 rating. All imported, tagged by category, and visible on the same map alongside your events."
              />
              <AnimatedFeatureCard
                icon={ShieldAlert}
                title="See Where It's Safe"
                description="SF isn't all sunshine. Toggle the live crime heatmap to see which blocks had recent incidents. Pick restaurants in safe zones. Avoid walking through hot spots at night. Data sourced from SFPD and CivicHub."
                accent="danger"
              />
            </div>
          </InViewStagger>
        </section>

        {/* ── SCREENSHOT: MAP ── */}
        <section className="border-b border-border py-20">
          <InViewStagger className="mx-auto max-w-[1200px] px-6">
            <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
              <FadeItem>
                <div>
                  <SectionLabel>Map</SectionLabel>
                  <h2
                    className="text-[28px] font-bold tracking-[-1px]"
                    style={{ fontFamily: 'var(--font-space-grotesk)' }}
                  >
                    Events, Spots, and Crime&mdash;One Map
                  </h2>
                  <p className="mt-4 text-[13px] leading-relaxed text-foreground-secondary">
                    Every data source on a single interactive map. Events from your synced feeds. Spots
                    from your curated lists. Crime incidents from public safety data. Toggle layers on
                    and off. Zoom into a neighborhood and see exactly what&apos;s there.
                  </p>
                  <ul className="mt-6 space-y-2">
                    {MAP_FEATURE_BULLETS.map((item) => (
                      <li key={item} className="flex items-center gap-2 text-[12px] text-foreground-secondary">
                        <Zap size={10} className="text-accent" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </FadeItem>

              <FadeItem>
                <HoverLift y={-4}>
                  <div className="border border-border">
                    <div className="flex h-8 items-center gap-2 border-b border-border bg-card px-4">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.5px] text-muted">
                        {'// MAP_VIEW'}
                      </span>
                    </div>
                    <Image
                      src="/screenshots/map.png"
                      alt="Interactive map with color-coded event markers, spot pins, and crime heatmap"
                      width={1280}
                      height={720}
                      className="block w-full"
                    />
                  </div>
                </HoverLift>
              </FadeItem>
            </div>
          </InViewStagger>
        </section>

        {/* ── SAFETY ── */}
        <section className="border-b border-border py-20">
          <InViewStagger className="mx-auto max-w-[1200px] px-6">
            <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
              <FadeItem>
                <div className="order-2 lg:order-1">
                  <div className="border border-danger/20 bg-danger/[0.03] p-6">
                    <p className="text-[11px] font-bold uppercase tracking-[1px] text-danger">
                      {'// CRIME_DATA_SOURCES'}
                    </p>
                    <p className="mt-3 text-[13px] leading-relaxed text-foreground-secondary">
                      The crime heatmap pulls from publicly available San Francisco safety data,
                      so you can overlay real incident reports directly on top of your trip plan.
                    </p>
                    <div className="mt-5 space-y-3">
                      {SAFETY_SOURCES.map((source) => (
                        <HoverLift key={source.name} x={3} y={0} className="block">
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-start gap-3 border border-border bg-card p-3 transition-colors hover:border-danger/40"
                          >
                            <ExternalLink size={12} className="mt-0.5 shrink-0 text-danger" />
                            <div>
                              <p className="text-[12px] font-semibold uppercase tracking-[0.5px] text-foreground">
                                {source.name}
                              </p>
                              <p className="mt-0.5 text-[11px] text-foreground-secondary">{source.desc}</p>
                            </div>
                          </a>
                        </HoverLift>
                      ))}
                    </div>
                  </div>
                </div>
              </FadeItem>

              <FadeItem>
                <div className="order-1 lg:order-2">
                  <SectionLabel>Safety</SectionLabel>
                  <h2
                    className="text-[28px] font-bold tracking-[-1px]"
                    style={{ fontFamily: 'var(--font-space-grotesk)' }}
                  >
                    Know Where to Walk&mdash;and Where Not To
                  </h2>
                  <p className="mt-4 text-[13px] leading-relaxed text-foreground-secondary">
                    San Francisco is an incredible city, but certain areas see more street crime than
                    others. The Tenderloin at midnight is a different experience than the Marina at noon.
                  </p>
                  <p className="mt-3 text-[13px] leading-relaxed text-foreground-secondary">
                    SF Trip Planner overlays a live crime heatmap directly on top of your events
                    and spots. See if that 9 PM meetup is in a safe zone. Check the walk from
                    dinner to your Airbnb. Make informed decisions about where to go and when.
                  </p>
                  <p className="mt-3 text-[13px] leading-relaxed text-foreground-secondary">
                    <span className="text-foreground">This isn&apos;t fear-mongering&mdash;it&apos;s situational awareness.</span>{' '}
                    The same data SFPD publishes, layered onto your trip plan so you don&apos;t
                    have to check a separate website.
                  </p>
                </div>
              </FadeItem>
            </div>
          </InViewStagger>
        </section>

        {/* ── SCREENSHOT: SPOTS ── */}
        <section className="border-b border-border py-20">
          <InViewStagger className="mx-auto max-w-[1200px] px-6">
            <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
              <FadeItem>
                <div>
                  <SectionLabel>Spots</SectionLabel>
                  <h2
                    className="text-[28px] font-bold tracking-[-1px]"
                    style={{ fontFamily: 'var(--font-space-grotesk)' }}
                  >
                    Every Recommendation in One List
                  </h2>
                  <p className="mt-4 text-[13px] leading-relaxed text-foreground-secondary">
                    That ramen place from the blog. The rooftop bar your coworker mentioned. The
                    coffee shop with the 4.9 rating. Import them all, tag by category, and see them
                    on the map alongside your events. When it&apos;s time to plan dinner,
                    filter to &ldquo;eat&rdquo; and pick the one closest to your next event.
                  </p>
                </div>
              </FadeItem>

              <FadeItem>
                <HoverLift y={-4}>
                  <div className="border border-border">
                    <div className="flex h-8 items-center gap-2 border-b border-border bg-card px-4">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.5px] text-muted">
                        {'// SPOTS_VIEW'}
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
                </HoverLift>
              </FadeItem>
            </div>
          </InViewStagger>
        </section>

        {/* ── CORE VALUE: PLAN ── */}
        <section className="border-b border-border py-20">
          <InViewStagger className="mx-auto max-w-[1200px] px-6">
            <FadeItem>
              <SectionLabel>Plan It</SectionLabel>
            </FadeItem>
            <FadeItem>
              <h2
                className="text-[32px] font-bold tracking-[-1px]"
                style={{ fontFamily: 'var(--font-space-grotesk)' }}
              >
                Now Make It Happen
              </h2>
            </FadeItem>
            <FadeItem>
              <p className="mt-4 max-w-[640px] text-[13px] leading-relaxed text-foreground-secondary">
                You&apos;ve seen everything. Now drag events into your day planner, share the plan
                with your travel partner, and export the whole thing to your calendar.
              </p>
            </FadeItem>

            <div className="mt-10 grid grid-cols-1 gap-3 md:grid-cols-3">
              <AnimatedFeatureCard
                icon={GripVertical}
                title="Plan with Ease"
                description="Drag events and spots into a time-grid day planner. Rearrange by dragging. Routes update automatically on the map. See your full day at a glance."
              />
              <AnimatedFeatureCard
                icon={Users}
                title="Plan with Friends"
                description="Traveling with someone? Create a shared planner room. You each see both schedules side by side, but only edit your own. No stepping on each other's plans."
              />
              <AnimatedFeatureCard
                icon={CalendarSync}
                title="Export to iCal &amp; Google Calendar"
                description="Done planning? Export your itinerary as an ICS file or sync directly to Google Calendar. Every event, time, and location — on your phone before you land."
              />
            </div>
          </InViewStagger>
        </section>

        {/* ── SCREENSHOT: CALENDAR ── */}
        <section className="border-b border-border py-20">
          <InViewStagger className="mx-auto max-w-[1200px] px-6">
            <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
              <FadeItem>
                <HoverLift y={-4}>
                  <div className="border border-border">
                    <div className="flex h-8 items-center gap-2 border-b border-border bg-card px-4">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.5px] text-muted">
                        {'// CALENDAR_VIEW'}
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
                </HoverLift>
              </FadeItem>

              <FadeItem>
                <div>
                  <SectionLabel>Calendar</SectionLabel>
                  <h2
                    className="text-[28px] font-bold tracking-[-1px]"
                    style={{ fontFamily: 'var(--font-space-grotesk)' }}
                  >
                    Spot Packed Days and Empty Ones
                  </h2>
                  <p className="mt-4 text-[13px] leading-relaxed text-foreground-secondary">
                    Each day shows how many events are available and how many you&apos;ve planned. See at a
                    glance that Saturday has 5 events while Wednesday is wide open. Click any date to
                    jump straight into day-level planning, then export the whole month to Google Calendar.
                  </p>
                </div>
              </FadeItem>
            </div>
          </InViewStagger>
        </section>

        {/* ── TECH STACK ── */}
        <section className="border-b border-border py-20">
          <InViewStagger className="mx-auto max-w-[1200px] px-6">
            <FadeItem>
              <SectionLabel>Under the Hood</SectionLabel>
            </FadeItem>
            <FadeItem>
              <h2
                className="text-[32px] font-bold tracking-[-1px]"
                style={{ fontFamily: 'var(--font-space-grotesk)' }}
              >
                Open Source. Ship It Yourself.
              </h2>
            </FadeItem>
            <FadeItem>
              <p className="mt-4 max-w-[640px] text-[13px] leading-relaxed text-foreground-secondary">
                Fork the repo, swap in your own API keys, and deploy to Vercel. Every piece of the
                stack is open and documented.
              </p>
            </FadeItem>
            <div className="mt-8 flex flex-wrap gap-3">
              {TECH_STACK.map((tech) => (
                <FadeItem key={tech}>
                  <HoverLift y={-2} className="inline-flex">
                    <span className="border border-border bg-card px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.5px] text-foreground-secondary">
                      {tech}
                    </span>
                  </HoverLift>
                </FadeItem>
              ))}
            </div>
          </InViewStagger>
        </section>

        {/* ── CTA ── */}
        <section className="py-24">
          <InViewStagger className="mx-auto max-w-[1200px] px-6 text-center">
            <FadeItem>
              <p className="text-[11px] font-bold uppercase tracking-[1px] text-accent">
                {'// READY_TO_LAUNCH'}
              </p>
            </FadeItem>
            <FadeItem>
              <h2
                className="mt-4 text-[32px] font-bold tracking-[-1px]"
                style={{ fontFamily: 'var(--font-space-grotesk)' }}
              >
                Close the 47 Tabs. Open One Planner.
              </h2>
            </FadeItem>
            <FadeItem>
              <p className="mx-auto mt-4 max-w-[480px] text-[13px] leading-relaxed text-foreground-secondary">
                Sign in with your email. Import your sources. Start dragging events into your
                schedule. Takes about two minutes.
              </p>
            </FadeItem>
            <FadeItem className="mt-8">
              <HoverLift y={-2} tapScale={0.985} className="inline-flex">
                <Link
                  href="/signin"
                  className="inline-flex items-center gap-2 bg-accent px-8 py-3 text-[11px] font-bold uppercase tracking-[0.5px] text-[#0C0C0C] transition-colors hover:bg-accent-hover"
                >
                  <Terminal size={14} />
                  Plan Your Trip Free
                </Link>
              </HoverLift>
            </FadeItem>
          </InViewStagger>
        </section>

        {/* ── FOOTER ── */}
        <footer className="border-t border-border py-8">
          <InViewStagger className="mx-auto flex max-w-[1200px] items-center justify-between px-6" amount={0.1}>
            <FadeItem>
              <div className="flex items-center gap-2">
                <MapPin size={12} className="text-accent" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.5px] text-muted">
                  SF Trip Planner
                </span>
              </div>
            </FadeItem>
            <FadeItem>
              <p className="text-[11px] text-muted">
                Built for a trip to San Francisco. Open source.
              </p>
            </FadeItem>
          </InViewStagger>
        </footer>
      </div>
    </MotionProvider>
  );
}

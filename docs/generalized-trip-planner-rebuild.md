# Generalized Trip Planner Rebuild

## Purpose

This document describes how to rebuild the current SF Trip Planner into a general trip-planning product that works for any destination, not just San Francisco.

The goal is not to lightly rebrand the existing app. The goal is to preserve the strong planning mechanics that already exist, while replacing SF-specific assumptions with a destination-agnostic platform.

## Product Goal

Build a trip-planning system where any user can:

- create multiple trips
- define a destination and date range
- ingest events, places, and recommendations from multiple sources
- evaluate options on a map and calendar
- build day-by-day itineraries
- route planned stops
- export plans to calendar tools

## Current App: What Is Reusable

The current app already has a strong reusable core:

- map + sidebar planning interface
- personal planner timeline
- route drawing and route caching
- geocoding and geocode caching
- source management UI
- custom place saving from map search
- planner export to ICS and Google Calendar
- auth and per-user planner state

These are good foundations for a generalized planner.

## Current App: What Is SF-Specific

The current app is not just branded for SF. It is structurally SF-specific in several places:

- destination is implicit rather than modeled
- trip config lives on the user instead of on a trip
- map bounds are hardcoded for San Francisco
- safety uses an SF-specific crime dataset
- static places are SF-only fallback content
- default sources are fixed SF-oriented feeds
- `events` and `spots` are still shared global snapshot tables

Because of those assumptions, the app behaves like "Ian's SF planning console" rather than a general travel product.

## Rebuild Principle

The app should be rebuilt around this model:

`destination-aware content -> candidate options -> trip-level planning -> itinerary output`

That requires moving from a single personal planning context to a multi-trip system with destination-aware data and pluggable local intelligence.

## Required Truths For Generalization

For the generalized version to work, all of the following must be true:

1. A user can own multiple trips.
2. Each trip has its own destination, dates, base location, timezone, and preferences.
3. All reads and writes are scoped to a trip, not implicitly to the current user session.
4. Destinations are explicit domain objects, not inferred from hardcoded map settings.
5. Event and place ingestion is connector-driven, not hardcoded to SF sources.
6. Safety and local context are optional provider layers, not mandatory SF crime logic.
7. The product has a credible empty-state strategy for destinations with little or no curated seed data.

## Target Domain Model

The rebuild should introduce these first-class entities.

| Entity | Purpose | Notes |
|---|---|---|
| `User` | Account owner | Can own many trips |
| `Trip` | Core planning workspace | The primary scope for UI, writes, and exports |
| `Destination` | Geography + travel context | City/region/country, timezone, map viewport, locale, optional metadata |
| `TripMember` | Optional future collaboration layer | Start single-user, but leave room for sharing |
| `TripSource` | Source instance attached to a trip | Replaces current user-global source usage |
| `SourceConnector` | Source type definition | iCal, RSS, blog parser, maps import, manual import, etc. |
| `Event` | Canonical or normalized event record | Can be trip-linked or destination-linked |
| `Place` | Canonical place record | Can be reused across trips or destination catalogs |
| `PlaceAnnotation` | Recommendation, warning, friend note, editorial layer | Keeps place facts separate from subjective overlays |
| `PlanItem` | Final scheduled itinerary block | Owned by a trip and a date |
| `GeoSignal` | Safety, weather, transit, neighborhood signal | Generic layer for local context |
| `RouteCache` | Derived route result cache | Infra concern, not user-facing content |
| `GeocodeCache` | Derived coordinate cache | Infra concern, not destination-specific content |

## Minimum Schema Direction

At minimum, the rebuild should move toward these relationships:

- `User` 1 -> many `Trip`
- `Trip` 1 -> 1 `Destination`
- `Trip` 1 -> many `TripSource`
- `Trip` 1 -> many `PlanItem`
- `Trip` 1 -> many `CustomPlace`
- `Destination` 1 -> many `Event`
- `Destination` 1 -> many `Place`
- `Place` 1 -> many `PlaceAnnotation`

### Critical Change

The current `tripStart`, `tripEnd`, `baseLocation`, and recommendation visibility settings must move off `users` and onto `trips`.

Without that change, the app can never properly support more than one active trip per user.

## Data Scoping Strategy

The rebuild must decide which data is canonical and shared versus trip-specific.

### Shared / Canonical

- destinations
- place catalogs
- normalized event catalogs
- geocode cache
- route cache
- connector definitions
- editorial/shared annotations

### Trip-Scoped

- trip config
- trip members
- chosen sources for that trip
- saved custom places for that trip
- selected and scheduled plan items
- per-trip UI preferences

### Guideline

Raw input and canonical facts can be shared.

Planning state must be trip-scoped.

## Content Ingestion Architecture

The current source model should become connector-based.

### Current Problem

Sources are user-owned URLs with special-case logic in the ingestion layer.

That is enough for a personal tool, but not enough for a generalized platform.

### Rebuild Direction

Split source ingestion into:

1. `SourceConnector`
2. `TripSource`
3. `IngestionRun`

### Connector Examples

- iCal / ICS
- RSS + extraction
- Luma connector
- Eventbrite connector
- newsletter parser
- Google Maps saved places import
- CSV / JSON import
- manual place list import
- editorial seed pack

### Required Capability

Every connector should define:

- what it ingests: events, places, or both
- required config
- validation rules
- normalization rules
- dedupe rules
- sync cadence
- failure behavior

## Destination Intelligence Layer

One of the strongest ideas in the current app is that trip planning is not only about events and places. It is also about local context.

That should remain, but the implementation must become generic.

### Current SF-Specific Layer

- crime heatmap from SF Open Data

### Generalized Layer

Replace "crime heatmap" with `GeoSignal`.

Possible signal types:

- safety
- weather risk
- transit disruption
- neighborhood popularity
- opening-hour density
- seasonal constraints
- tourist intensity

Each destination may support a different subset.

### Product Rule

Local intelligence should be additive, not required.

If a destination has no safety provider, the planner must still work.

## Trip Creation Flow

The app currently assumes the destination is already known and effectively fixed.

The generalized app must start with trip creation.

### Required Trip Setup Flow

1. Create trip
2. Enter destination
3. Set date range
4. Set base stay location
5. Choose starter content sources
6. Optional: import recommendations or saved places

### Trip Setup Output

After setup, the system should produce:

- destination context
- initial map viewport
- initial source set
- empty planner state
- destination-specific suggestions if available

## UI Rebuild Requirements

The current tabs are a good base, but the app needs a higher-level information architecture.

### Recommended Top-Level Structure

- Trips
- Discover
- Map
- Calendar
- Plan
- Sources
- Settings

### Notes

- `Trips` becomes the workspace switcher and trip creation surface.
- `Discover` can absorb current event/spot browsing concerns.
- `Plan` remains the timeline/editor.
- `Sources` becomes a proper ingestion control plane.

## Empty State Strategy

This is the most important product risk in generalization.

SF works because there is already data, defaults, and context. Other destinations may have none.

The generalized version must still be useful when there is no curated seed content.

### Required Empty State Capabilities

- manual trip creation with no source dependency
- Google Maps place search and save
- manual event entry
- optional import from calendar or CSV
- destination suggestions for common source types

If the app is empty outside SF, users will perceive it as broken rather than flexible.

## Planner Model

The current planner model is good and should mostly survive.

### Keep

- timeline-based plan items
- event/place unified scheduling abstraction
- drag/resize interaction
- route summary
- ICS export
- Google Calendar draft export

### Improve

- scope planner rows to `tripId`
- allow multiple day plans per trip
- support notes, reservations, and confirmations
- support travel buffers and hard constraints

## Safety and Reliability Requirements

The rebuild should preserve and formalize existing guardrails.

### Must Keep

- auth-gated personal APIs
- source URL validation
- SSRF protections
- rate limiting on external proxy endpoints
- write-through caches for expensive geocode/route calls

### Must Improve

- explicit ingestion run history
- operator visibility into sync failures
- replay/retry support for failed sources
- destination-specific provider health reporting

## Storage and Infra Requirements

The current mixed approach of Convex plus local JSON fallback is useful during development, but the generalized product should be more explicit about storage roles.

### Recommended Roles

- Convex: primary application data store
- local files: development fallback only
- external APIs: provider inputs and route/geocode services
- optional object store: raw ingestion artifacts if needed later

### Important Rule

Local file fallback should not be the core production behavior for multi-destination planning.

It is a resilience mechanism, not the primary architecture.

## API Rebuild Direction

All major APIs should become trip-scoped.

### Example Direction

- `GET /api/trips`
- `POST /api/trips`
- `GET /api/trips/:tripId`
- `PATCH /api/trips/:tripId`
- `GET /api/trips/:tripId/events`
- `GET /api/trips/:tripId/places`
- `GET /api/trips/:tripId/plan`
- `POST /api/trips/:tripId/plan`
- `GET /api/trips/:tripId/sources`
- `POST /api/trips/:tripId/sources`
- `POST /api/trips/:tripId/sync`

Current APIs can be treated as prototypes of these future trip-scoped endpoints.

## Recommended Internal Module Boundaries

The current `TripProvider` and `lib/events.ts` each own too much.

The rebuild should split responsibilities into clearer modules.

### Frontend

- trip workspace state
- map runtime state
- planner state
- source management state
- destination signals state

### Backend

- trip service
- destination service
- event service
- place service
- annotation service
- connector service
- sync orchestration service
- routing/geocoding infra service

## Phased Rebuild Plan

### Phase 1: Introduce Trips

- add `trips` table
- move trip config off user
- scope planner rows to trip
- scope custom spots to trip
- make UI load a selected trip

### Phase 2: Introduce Destinations

- add `destinations` table
- connect each trip to a destination
- move map bounds/timezone defaults into destination metadata
- remove SF hardcoding from map initialization

### Phase 3: Rebuild Sources as Trip Sources

- introduce connector definitions
- attach sources to trip instead of user
- add ingestion runs and sync logs
- normalize connector contract

### Phase 4: Separate Canonical Places/Events From Annotations

- formalize `places`
- formalize `placeAnnotations`
- keep shared recommendations out of canonical place rows
- make custom trip-local place saves an overlay

### Phase 5: Generalize Local Signals

- replace SF-only crime overlay with generic `GeoSignal`
- support zero or many providers per destination
- hide unsupported signal modules cleanly

### Phase 6: Improve Empty-State Utility

- manual event/place creation
- imports from file and calendar
- destination onboarding suggestions
- starter templates

### Phase 7: Multi-Destination Operations

- destination seeding tools
- connector management tools
- ingestion health monitoring
- coordinate backfill at scale

## Non-Goals For First Generalized Version

Do not block the rebuild on:

- real-time collaboration
- group itinerary editing
- marketplace of connectors
- hotel/flight booking
- full travel CRM features

The first generalized version should focus on a robust single-user, multi-trip planner.

## Success Criteria

The rebuild is successful when:

1. A user can create two trips in different cities without data leakage.
2. The app is useful in a city with no handcrafted SF seed data.
3. Destination-specific overlays are optional and pluggable.
4. Sources can be attached and synced per trip.
5. Planner export still works with the same level of quality as the current app.
6. The map, planner, and source management experience remain fast and understandable.

## Recommended Immediate Refactor Order In This Codebase

If rebuilding incrementally from the current codebase, do this first:

1. Create a `Trip` model in Convex.
2. Move trip config fields from `users` to `trips`.
3. Add `tripId` to planner entries and custom spots.
4. Make all planner/config/source APIs require `tripId`.
5. Move SF-specific defaults out of `lib/events.ts` into destination configuration.
6. Split `TripProvider` into smaller domain hooks or providers.
7. Replace the current global `events` and `spots` assumptions with destination-aware or trip-aware loading.

## Final Summary

To generalize this app, the planner itself does not need to be reinvented.

What must be rebuilt is the context around the planner:

- explicit trips
- explicit destinations
- connector-based ingestion
- generic local intelligence
- trip-scoped persistence
- destination-independent empty states

The correct mental model is:

"a reusable trip-planning platform with destination plugins"

not

"the SF planner with a city selector."

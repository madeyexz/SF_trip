# Repository Guidelines

## Project Structure & Module Organization
This project is a Next.js 15 app for SF event mapping.
- `app/`: UI and API routes (`app/page.jsx`, `app/EventMapClient.jsx`, `app/api/*/route.js`).
- `lib/`: shared server logic for loading/syncing events (`lib/events.js`).
- `convex/`: Convex schema, queries, and mutations (`convex/schema.ts`, `convex/events.ts`).
- `data/`: local JSON data and cache (`sample-events.json`, `static-places.json`, generated cache).
- `docs/`: local operational docs such as base location input (`docs/my_location.md`).

## Build, Test, and Development Commands
- `bun install`: install dependencies.
- `bun dev`: run Next.js locally at `http://localhost:3000`.
- `bun build`: create production build.
- `bun start`: run the production build locally.
- `bun lint`: run ESLint (use as primary pre-PR validation).
- `bun lint:fix`: auto-fix ESLint issues.
- `bun format`: format all files with Prettier.
- `bun format:check`: check formatting without writing.
- `bun convex:dev`: initialize/dev-connect Convex.
- `bun convex:deploy`: deploy Convex schema/functions.

## Design System
Follow the design guide at `docs/design-guide.md` when implementing any UI component. Key rules:
- **Dark mode only** — near-black backgrounds (`#0C0C0C`, `#0A0A0A`, `#141414`), never light.
- **Neon green accent** `#00FF88` for CTAs, active states, success. Orange `#FF8800` for warnings only.
- **JetBrains Mono** (`--font-jetbrains`) for all UI text. **Space Grotesk** (`--font-space-grotesk`) for headlines/metrics only.
- **0px border-radius** everywhere. No rounded corners.
- **No shadows, no gradients.** Use 1px `#2f2f2f` borders for structure.
- **UPPERCASE** for labels, nav items, buttons, badges. Use code-style patterns: `// SECTION`, `[STATUS]`, `FIELD_NAME`.
- Read the full guide before building new pages or components.

## Coding Style & Naming Conventions
- Use modern ES modules and React function components.
- Follow existing formatting: 2-space indentation, semicolons, single quotes in JS/TS.
- Use `@/*` imports (configured in `jsconfig.json`) for app-level modules.
- Naming patterns:
  - Components: `PascalCase` (e.g., `EventMapClient.jsx`)
  - Functions/variables: `camelCase`
  - Route handlers: `GET`, `POST` in `route.js`
  - Constants: `UPPER_SNAKE_CASE` when truly constant

## Testing Guidelines
No automated test suite is currently configured (no Jest/Vitest/Playwright scripts yet).
- Minimum check before opening a PR: `bun lint` must pass.
- For feature changes, manually verify:
  - map rendering and controls in `app/EventMapClient.jsx`
  - `/api/events` and `/api/sync` behavior
  - Convex fallback behavior when `CONVEX_URL` is missing
- If adding tests, prefer colocated `*.test.js` files near the module under test.

## Commit & Pull Request Guidelines
`main` currently has no commit history, so no inherited convention exists yet.
- Use clear, imperative commit messages (recommended: Conventional Commits, e.g., `feat: add travel mode filter`).
- Keep commits focused and logically scoped.
- PRs should include:
  - concise summary of behavior changes
  - environment/config updates (if any)
  - manual verification steps and outcomes
  - screenshots/GIFs for UI changes

## Security & Configuration Tips
- Copy `.env.example` to `.env` and keep secrets local.
- Never commit API keys (`FIRECRAWL_API_KEY`, `GOOGLE_MAPS_BROWSER_KEY`, `CONVEX_URL`).

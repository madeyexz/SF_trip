# Repository Guidelines

## Project Structure & Module Organization
This project is a Next.js 15 app for SF event mapping.
- `app/`: UI and API routes (`app/page.jsx`, `app/EventMapClient.jsx`, `app/api/*/route.js`).
- `lib/`: shared server logic for loading/syncing events (`lib/events.js`).
- `convex/`: Convex schema, queries, and mutations (`convex/schema.ts`, `convex/events.ts`).
- `data/`: local JSON data and cache (`sample-events.json`, `static-places.json`, generated cache).
- `docs/`: local operational docs such as base location input (`docs/my_location.md`).

## Build, Test, and Development Commands
- `pnpm install`: install dependencies.
- `pnpm dev`: run Next.js locally at `http://localhost:3000`.
- `pnpm build`: create production build.
- `pnpm start`: run the production build locally.
- `pnpm lint`: run ESLint (use as primary pre-PR validation).
- `pnpm lint:fix`: auto-fix ESLint issues.
- `pnpm format`: format all files with Prettier.
- `pnpm format:check`: check formatting without writing.
- `pnpm convex:dev`: initialize/dev-connect Convex.
- `pnpm convex:deploy`: deploy Convex schema/functions.

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
- Minimum check before opening a PR: `pnpm lint` must pass.
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

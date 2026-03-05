#!/usr/bin/env node

import { backfillConvexCoordinates } from '../lib/events.ts';

const dryRun = process.argv.includes('--dry-run');

try {
  const summary = await backfillConvexCoordinates({ dryRun });
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

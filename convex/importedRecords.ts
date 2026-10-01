// Ownership is assigned by authenticated handlers, never by client arguments.
// Ownerless legacy rows are quarantined, not inferred to belong to the caller.
export async function listImportedRecordsForUser(ctx: any, table: 'events' | 'spots', userId: string): Promise<any[]> {
  const rows = await ctx.db.query(table)
    .withIndex('by_user', (q: any) => q.eq('userId', userId))
    .collect();
  return rows.filter((row: any) => row.userId === userId);
}

export async function getImportSyncMetaForUser(ctx: any, key: string, userId: string) {
  const row = await ctx.db.query('syncMeta')
    .withIndex('by_user_key', (q: any) => q.eq('userId', userId).eq('key', key))
    .first();
  if (!row || row.userId !== userId) return null;
  return {
    key: row.key,
    syncedAt: row.syncedAt,
    calendars: row.calendars,
    eventCount: row.eventCount
  };
}

export async function reconcileImportedRecordsForUser(
  ctx: any,
  table: 'events' | 'spots',
  userId: string,
  records: any[],
  syncedAt: string,
  reconcileSourceUrls: string[] = [],
  missedSyncThreshold = 2
) {
  const identity = (record: any) => table === 'events'
    ? record.eventUrl || `${record.sourceUrl || record.sourceId || ''}:${record.id}`
    : record.id;
  const rows = await listImportedRecordsForUser(ctx, table, userId);
  const byIdentity = new Map<string, any>(rows.map((row: any) => [identity(row), row]));
  const keep = new Set(records.map(identity));
  const reconciledSources = new Set(reconcileSourceUrls);
  for (const row of rows) {
    // Never retire rows from failed/unfetched sources or legacy unknown provenance.
    if (keep.has(identity(row)) || !row.sourceUrl || !reconciledSources.has(row.sourceUrl)) continue;
    const missedSyncCount = (Number(row.missedSyncCount) || 0) + 1;
    await ctx.db.patch(row._id, {
      missedSyncCount,
      isDeleted: missedSyncCount >= Math.max(1, missedSyncThreshold),
      updatedAt: syncedAt
    });
  }
  for (const record of records) {
    const next = {
      ...record,
      userId,
      missedSyncCount: 0,
      isDeleted: false,
      lastSeenAt: syncedAt,
      updatedAt: syncedAt
    };
    const existing = byIdentity.get(identity(record));
    if (existing) await ctx.db.replace(existing._id, next);
    else await ctx.db.insert(table, next);
  }
}

export async function saveImportSyncMetaForUser(
  ctx: any, key: string, userId: string, syncedAt: string, calendars: string[], eventCount: number
) {
  const existing = await ctx.db.query('syncMeta')
    .withIndex('by_user_key', (q: any) => q.eq('userId', userId).eq('key', key))
    .first();
  const next = { key, userId, syncedAt, calendars, eventCount };
  if (existing && existing.userId === userId) await ctx.db.patch(existing._id, next);
  else await ctx.db.insert('syncMeta', next);
}

export function dedupeAddressKeys(addressKeys: unknown[]) {
  return Array.from(
    new Set(
      (Array.isArray(addressKeys) ? addressKeys : [])
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )
  );
}

export async function listGeocodeCacheRowsByAddressKeys(ctx: any, addressKeys: unknown[]) {
  const uniqueKeys = dedupeAddressKeys(addressKeys);
  if (uniqueKeys.length === 0) {
    return [];
  }

  const rows = await ctx.db.query('geocodeCache').collect();
  const wanted = new Set(uniqueKeys);

  return rows
    .filter((row: any) => wanted.has(row.addressKey))
    .map((row: any) => ({
      addressKey: row.addressKey,
      addressText: row.addressText,
      lat: row.lat,
      lng: row.lng,
      updatedAt: row.updatedAt
    }))
    .sort((left: any, right: any) => left.addressKey.localeCompare(right.addressKey));
}

export async function upsertGeocodeCacheRows(ctx: any, entriesInput: unknown[]) {
  const entries = Array.isArray(entriesInput) ? entriesInput : [];
  const summary = {
    inserted: 0,
    updated: 0,
    unchanged: 0
  };

  const nextByKey = new Map<string, {
    addressKey: string;
    addressText: string;
    lat: number;
    lng: number;
    updatedAt: string;
  }>();

  for (const entry of entries) {
    const addressKey = String((entry as any)?.addressKey || '').trim();
    const addressText = String((entry as any)?.addressText || '').trim();
    const lat = Number((entry as any)?.lat);
    const lng = Number((entry as any)?.lng);
    const updatedAt = String((entry as any)?.updatedAt || '').trim();

    if (!addressKey || !addressText || !Number.isFinite(lat) || !Number.isFinite(lng) || !updatedAt) {
      continue;
    }

    nextByKey.set(addressKey, {
      addressKey,
      addressText,
      lat,
      lng,
      updatedAt
    });
  }

  if (nextByKey.size === 0) {
    return summary;
  }

  const existingRows = await ctx.db.query('geocodeCache').collect();
  const existingByKey = new Map<string, any>(existingRows.map((row: any) => [row.addressKey, row]));

  for (const [addressKey, nextRow] of nextByKey.entries()) {
    const existing = existingByKey.get(addressKey);
    if (!existing) {
      await ctx.db.insert('geocodeCache', nextRow);
      summary.inserted += 1;
      continue;
    }

    const changed = existing.addressText !== nextRow.addressText ||
      existing.lat !== nextRow.lat ||
      existing.lng !== nextRow.lng;

    if (!changed) {
      summary.unchanged += 1;
      continue;
    }

    await ctx.db.patch(existing._id, nextRow);
    summary.updated += 1;
  }

  return summary;
}

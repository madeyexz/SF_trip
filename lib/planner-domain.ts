export const MINUTES_IN_DAY = 24 * 60;
export const MIN_PLAN_BLOCK_MINUTES = 30;

export type PlannerItemRecord = {
  id: string;
  kind: 'event' | 'place';
  sourceKey: string;
  title: string;
  locationText: string;
  link: string;
  tag: string;
  startMinutes: number;
  endMinutes: number;
};

export type PlannerByDate = Record<string, PlannerItemRecord[]>;

function normalizePlannerTag(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

export function createPlannerItemId() {
  return `plan-${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizePlannerDateISO(value: unknown): string {
  // Keep planner normalization dependency-free for Convex's strict runtime.
  // Preserve the existing date-key contract, including literal ISO date prefixes.
  const text = String(value || '').trim();
  if (!text) return '';

  const dateMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateMatch) return `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;

  const parsedDate = new Date(text);
  if (Number.isNaN(parsedDate.getTime())) return '';

  return [
    parsedDate.getFullYear(),
    String(parsedDate.getMonth() + 1).padStart(2, '0'),
    String(parsedDate.getDate()).padStart(2, '0')
  ].join('-');
}

export function clampPlannerMinutes(value: unknown, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

export function sortPlanItems<T extends { startMinutes: number; endMinutes?: number }>(items: T[]) {
  return [...items].sort((left, right) => (
    left.startMinutes - right.startMinutes ||
    Number(left.endMinutes || 0) - Number(right.endMinutes || 0)
  ));
}

export function sanitizePlannerByDate(value: unknown): PlannerByDate {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const rows = value as Record<string, unknown>;
  const result: PlannerByDate = {};

  for (const [dateISOInput, itemsInput] of Object.entries(rows)) {
    const dateISO = normalizePlannerDateISO(dateISOInput);
    if (!dateISO || !Array.isArray(itemsInput)) {
      continue;
    }

    const cleanedItems = itemsInput
      .filter((item) => item && typeof item === 'object')
      .map((item) => {
        const row = item as Record<string, unknown>;
        const startMinutes = clampPlannerMinutes(
          row.startMinutes,
          0,
          MINUTES_IN_DAY - MIN_PLAN_BLOCK_MINUTES
        );
        const endMinutes = clampPlannerMinutes(
          row.endMinutes,
          startMinutes + MIN_PLAN_BLOCK_MINUTES,
          MINUTES_IN_DAY
        );

        return {
          id: String(row.id || '').trim() || createPlannerItemId(),
          kind: row.kind === 'event' ? 'event' : 'place',
          sourceKey: String(row.sourceKey || '').trim(),
          title: String(row.title || 'Untitled stop').trim(),
          locationText: String(row.locationText || '').trim(),
          link: String(row.link || '').trim(),
          tag: normalizePlannerTag(row.tag),
          startMinutes,
          endMinutes
        } as PlannerItemRecord;
      })
      .filter((item) => item.sourceKey);

    result[dateISO] = sortPlanItems(cleanedItems);
  }

  return result;
}

export function parsePlannerPayload(body: unknown) {
  const bodyObject = body && typeof body === 'object'
    ? body as Record<string, unknown>
    : null;
  const plannerByDate = bodyObject?.plannerByDate;

  if (!bodyObject || !plannerByDate || typeof plannerByDate !== 'object' || Array.isArray(plannerByDate)) {
    return {
      ok: false as const,
      plannerByDate: null,
      error: 'plannerByDate object is required.'
    };
  }

  return {
    ok: true as const,
    plannerByDate: sanitizePlannerByDate(plannerByDate),
    error: ''
  };
}

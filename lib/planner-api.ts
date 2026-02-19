export function normalizePlannerRoomCode(value: unknown) {
  const nextValue = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  if (nextValue.length < 2 || nextValue.length > 64) {
    return '';
  }
  return nextValue;
}

const MINUTES_IN_DAY = 24 * 60;
const MIN_PLAN_BLOCK_MINUTES = 30;

type PlannerItemInput = {
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

function normalizePlannerDateISO(value: unknown) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return '';
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function clampPlannerMinutes(value: unknown, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function sanitizePlannerByDateInput(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const rows = value as Record<string, unknown>;
  const result: Record<string, PlannerItemInput[]> = {};

  for (const [dateISOInput, itemsInput] of Object.entries(rows)) {
    const dateISO = normalizePlannerDateISO(dateISOInput);
    if (!dateISO || !Array.isArray(itemsInput)) {
      continue;
    }

    const cleanedItems = itemsInput
      .filter((item) => item && typeof item === 'object')
      .map((item) => {
        const row = item as Record<string, unknown>;
        const startMinutes = clampPlannerMinutes(row.startMinutes, 0, MINUTES_IN_DAY - MIN_PLAN_BLOCK_MINUTES);
        const endMinutes = clampPlannerMinutes(
          row.endMinutes,
          startMinutes + MIN_PLAN_BLOCK_MINUTES,
          MINUTES_IN_DAY
        );

        return {
          id: String(row.id || '').trim() || `plan-${Math.random().toString(36).slice(2, 10)}`,
          kind: row.kind === 'event' ? 'event' : 'place',
          sourceKey: String(row.sourceKey || '').trim(),
          title: String(row.title || 'Untitled stop').trim(),
          locationText: String(row.locationText || '').trim(),
          link: String(row.link || '').trim(),
          tag: String(row.tag || '').trim().toLowerCase(),
          startMinutes,
          endMinutes
        } as PlannerItemInput;
      })
      .filter((item) => item.sourceKey);

    result[dateISO] = cleanedItems;
  }

  return result;
}

export function getPlannerRoomCodeFromUrl(url: string) {
  const parsed = new URL(url);
  return normalizePlannerRoomCode(parsed.searchParams.get('roomId') || parsed.searchParams.get('roomCode'));
}

export function parsePlannerPostPayload(body: unknown, queryRoomCode: string) {
  const bodyObject = body && typeof body === 'object' ? body as Record<string, unknown> : null;
  const plannerByDate = bodyObject?.plannerByDate;
  if (!bodyObject || !plannerByDate || typeof plannerByDate !== 'object' || Array.isArray(plannerByDate)) {
    return {
      ok: false,
      roomCode: '',
      plannerByDate: null,
      error: 'plannerByDate object is required.'
    };
  }

  const roomCode = normalizePlannerRoomCode(bodyObject.roomId || bodyObject.roomCode || queryRoomCode);
  const sanitizedPlannerByDate = sanitizePlannerByDateInput(plannerByDate);
  return {
    ok: true,
    roomCode,
    plannerByDate: sanitizedPlannerByDate,
    error: ''
  };
}

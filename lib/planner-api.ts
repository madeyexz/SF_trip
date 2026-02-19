export function normalizePlannerRoomCode(value: unknown) {
  const nextValue = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  if (nextValue.length < 2 || nextValue.length > 64) {
    return '';
  }
  return nextValue;
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
  return {
    ok: true,
    roomCode,
    plannerByDate,
    error: ''
  };
}

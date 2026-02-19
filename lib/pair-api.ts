export function normalizePairRoomCode(value: unknown) {
  const nextValue = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  if (nextValue.length < 2 || nextValue.length > 64) {
    return '';
  }
  return nextValue;
}

export function parsePairActionBody(body: unknown) {
  const action = String((body as any)?.action || '').trim().toLowerCase();
  if (action === 'create') {
    return {
      ok: true,
      action: 'create' as const,
      roomCode: '',
      error: ''
    };
  }

  if (action === 'join') {
    const roomCode = normalizePairRoomCode((body as any)?.roomCode);
    if (!roomCode) {
      return {
        ok: false,
        action: 'join' as const,
        roomCode: '',
        error: 'Room code is required (2-64 chars: a-z, 0-9, _ or -).'
      };
    }
    return {
      ok: true,
      action: 'join' as const,
      roomCode,
      error: ''
    };
  }

  if (action === 'leave') {
    return {
      ok: true,
      action: 'leave' as const,
      roomCode: '',
      error: ''
    };
  }

  return {
    ok: false,
    action: '' as const,
    roomCode: '',
    error: 'Unsupported action. Use "create", "join", or "leave".'
  };
}

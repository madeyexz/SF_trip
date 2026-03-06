type TravelMatrixDestination = {
  id: string;
  position?: {
    lat: number;
    lng: number;
  } | null;
};

function parseDurationSeconds(durationValue: string) {
  const match = String(durationValue || '').match(/^([\d.]+)s$/);
  if (!match) {
    return 0;
  }

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

export function formatTravelDurationLabel(durationValue: string) {
  const totalSeconds = parseDurationSeconds(durationValue);
  if (totalSeconds <= 0) {
    return 'Unavailable';
  }

  const totalMinutes = Math.max(1, Math.round(totalSeconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0 && minutes > 0) {
    return `${hours} hr ${minutes} min`;
  }
  if (hours > 0) {
    return `${hours} hr`;
  }
  return `${totalMinutes} min`;
}

export function normalizeTravelTimeMatrixEntries({
  destinations,
  entries
}: {
  destinations: TravelMatrixDestination[];
  entries: Array<{ destinationIndex?: number; condition?: string; duration?: string }>;
}) {
  const labelsById: Record<string, string> = {};

  for (const destination of Array.isArray(destinations) ? destinations : []) {
    const id = String(destination?.id || '');
    if (!id) {
      continue;
    }
    labelsById[id] = 'Unavailable';
  }

  for (const entry of Array.isArray(entries) ? entries : []) {
    const destinationIndex = Number(entry?.destinationIndex);
    if (!Number.isInteger(destinationIndex) || destinationIndex < 0 || destinationIndex >= destinations.length) {
      continue;
    }

    const destination = destinations[destinationIndex];
    const id = String(destination?.id || '');
    if (!id) {
      continue;
    }

    if (String(entry?.condition || '') !== 'ROUTE_EXISTS') {
      labelsById[id] = 'Unavailable';
      continue;
    }

    labelsById[id] = formatTravelDurationLabel(String(entry?.duration || ''));
  }

  return labelsById;
}

export async function requestTravelTimeMatrix({
  origin,
  destinations,
  travelMode
}: {
  origin: { lat: number; lng: number } | null;
  destinations: TravelMatrixDestination[];
  travelMode: string;
}) {
  if (!origin || !Number.isFinite(origin.lat) || !Number.isFinite(origin.lng) || !Array.isArray(destinations) || destinations.length === 0) {
    return {};
  }

  const sanitizedDestinations = destinations.filter((destination) => {
    const lat = Number(destination?.position?.lat);
    const lng = Number(destination?.position?.lng);
    return destination?.id && Number.isFinite(lat) && Number.isFinite(lng);
  });

  if (sanitizedDestinations.length === 0) {
    return {};
  }

  const response = await fetch('/api/travel-times', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      origin,
      destinations: sanitizedDestinations,
      travelMode
    })
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || `Travel time request failed: ${response.status}`);
  }

  return payload?.durationsById && typeof payload.durationsById === 'object'
    ? payload.durationsById
    : {};
}

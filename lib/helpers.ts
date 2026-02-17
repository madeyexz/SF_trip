const MINUTES_IN_DAY = 24 * 60;
const MIN_PLAN_BLOCK_MINUTES = 30;

export { MINUTES_IN_DAY, MIN_PLAN_BLOCK_MINUTES };

export function normalizePlaceTag(tag) {
  const value = String(tag || '').toLowerCase().trim();
  if (value === 'bars' || value === 'bar') return 'bar';
  if (value === 'cafe' || value === 'cafes') return 'cafes';
  if (value === 'eat' || value === 'food' || value === 'restaurant' || value === 'restaurants') return 'eat';
  if (value === 'go out' || value === 'nightlife') return 'go out';
  if (value === 'shop' || value === 'shops') return 'shops';
  if (value === 'avoid') return 'avoid';
  if (value === 'safe') return 'safe';
  return 'cafes';
}

export function normalizeAddressKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\w\s,.-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function formatTag(tag) {
  if (tag === 'all') return 'All';
  return String(tag)
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function getPlaceSourceKey(place) {
  return place.id || `${place.name}|${place.location}`;
}

export function normalizeDateKey(value) {
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

export function daysFromNow(isoDate) {
  const key = normalizeDateKey(isoDate);
  if (!key) return 0;
  const target = new Date(`${key}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function formatSourceLabel(sourceUrl) {
  if (!sourceUrl) return '';
  const url = String(sourceUrl);
  if (url.includes('luma.com')) return 'Luma';
  if (url.includes('beehiiv.com')) return 'Beehiiv';
  if (url.includes('eventbrite.com')) return 'Eventbrite';
  try { return new URL(url).hostname; } catch { return url; }
}

export function toISODate(dateInput) {
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return '';
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

export function toMonthISO(isoDate) {
  if (typeof isoDate !== 'string' || isoDate.length < 7) return '';
  return `${isoDate.slice(0, 7)}-01`;
}

export function addMonthsToMonthISO(monthISO, offset) {
  const parsed = new Date(`${monthISO}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return toMonthISO(toISODate(new Date()));
  parsed.setMonth(parsed.getMonth() + offset);
  parsed.setDate(1);
  return toISODate(parsed);
}

export function buildCalendarGridDates(anchorISO) {
  const anchor = new Date(`${toMonthISO(anchorISO)}T00:00:00`);
  if (Number.isNaN(anchor.getTime())) return [];
  const start = new Date(anchor);
  start.setDate(1 - start.getDay());
  const dates = [];
  for (let index = 0; index < 42; index += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    dates.push(toISODate(date));
  }
  return dates;
}

export function formatDate(isoDate) {
  const normalizedDateISO = normalizeDateKey(isoDate);
  if (!normalizedDateISO) return isoDate;
  const parsedDate = new Date(`${normalizedDateISO}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) return isoDate;
  return parsedDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' });
}

export function formatDateWeekday(isoDate) {
  const normalizedDateISO = normalizeDateKey(isoDate);
  if (!normalizedDateISO) return isoDate;
  const parsedDate = new Date(`${normalizedDateISO}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) return isoDate;
  return parsedDate.toLocaleDateString(undefined, { weekday: 'short', timeZone: 'America/Los_Angeles' });
}

export function formatDateDayMonth(isoDate) {
  const normalizedDateISO = normalizeDateKey(isoDate);
  if (!normalizedDateISO) return isoDate;
  const parsedDate = new Date(`${normalizedDateISO}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) return isoDate;
  return parsedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' });
}

export function formatMonthYear(isoDate) {
  const normalizedDateISO = normalizeDateKey(isoDate);
  if (!normalizedDateISO) return isoDate;
  const parsedDate = new Date(`${normalizedDateISO}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) return isoDate;
  return parsedDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'America/Los_Angeles' });
}

export function formatDayOfMonth(isoDate) {
  const normalizedDateISO = normalizeDateKey(isoDate);
  if (!normalizedDateISO) return isoDate;
  const parsedDate = new Date(`${normalizedDateISO}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) return isoDate;
  return new Intl.DateTimeFormat('en-US', { day: 'numeric', timeZone: 'America/Los_Angeles' }).format(parsedDate);
}

export function formatDistance(totalMeters) {
  if (!Number.isFinite(totalMeters) || totalMeters <= 0) return 'n/a';
  const miles = totalMeters / 1609.344;
  return miles >= 10 ? `${miles.toFixed(0)} mi` : `${miles.toFixed(1)} mi`;
}

export function formatDurationFromSeconds(totalSeconds) {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return 'n/a';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.round((totalSeconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export function truncate(value, maxLength) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function clampMinutes(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function snapMinutes(value) {
  const PLAN_SNAP_MINUTES = 15;
  if (!Number.isFinite(value)) return 0;
  return Math.round(value / PLAN_SNAP_MINUTES) * PLAN_SNAP_MINUTES;
}

export function formatMinuteLabel(minutesValue) {
  const minutes = clampMinutes(minutesValue, 0, MINUTES_IN_DAY);
  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const period = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${minute.toString().padStart(2, '0')} ${period}`;
}

export function formatHour(hourValue) {
  const hour = Number(hourValue);
  const period = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12} ${period}`;
}

export function safeHostname(url) {
  try { return new URL(url).hostname; } catch { return url; }
}

export async function fetchJson(url, options = undefined) {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `Request failed: ${response.status}`);
  return payload;
}

export function toDateOnlyISO(value) {
  return normalizeDateKey(value) || toISODate(new Date());
}

export function buildISODateRange(startISO, endISO) {
  const MAX_DAYS = 90;
  if (typeof startISO !== 'string' || typeof endISO !== 'string') return [];
  const start = new Date(`${startISO}T00:00:00Z`);
  const end = new Date(`${endISO}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
  if (start > end) return [];
  const dates = [];
  const cursor = new Date(start);
  while (cursor <= end && dates.length < MAX_DAYS) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

import { escapeHtml } from './helpers';

export function toKebabCase(value) {
  return String(value).replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

export function renderLucideIconNode(iconNode) {
  if (!Array.isArray(iconNode)) return '';
  return iconNode
    .map(([tag, attrs]) => {
      const attributes = Object.entries(attrs || {})
        .filter(([key]) => key !== 'key')
        .map(([key, value]) => `${toKebabCase(key)}="${escapeHtml(String(value))}"`)
        .join(' ');
      return `<${tag} ${attributes} />`;
    })
    .join('');
}

export function createLucidePinIcon(iconNode, color) {
  const iconSvg = renderLucideIconNode(iconNode);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="38" height="48" viewBox="0 0 38 48">
      <path d="M19 1C9.6 1 2 8.6 2 18c0 11.7 14.1 26.9 16.2 29.1a1.2 1.2 0 0 0 1.6 0C21.9 44.9 36 29.7 36 18 36 8.6 28.4 1 19 1z" fill="${color}" stroke="#ffffff" stroke-width="2" />
      <circle cx="19" cy="18" r="10" fill="rgba(255,255,255,0.16)" />
      <g transform="translate(7 6)" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        ${iconSvg}
      </g>
    </svg>
  `;

  const wrapper = document.createElement('div');
  wrapper.style.width = '38px';
  wrapper.style.height = '48px';
  wrapper.innerHTML = svg.trim();
  return wrapper;
}

export function createLucidePinIconWithLabel(iconNode, color, label) {
  const iconSvg = renderLucideIconNode(iconNode);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="38" height="48" viewBox="0 0 38 48">
      <path d="M19 1C9.6 1 2 8.6 2 18c0 11.7 14.1 26.9 16.2 29.1a1.2 1.2 0 0 0 1.6 0C21.9 44.9 36 29.7 36 18 36 8.6 28.4 1 19 1z" fill="${color}" stroke="#ffffff" stroke-width="2" />
      <circle cx="19" cy="18" r="10" fill="rgba(255,255,255,0.16)" />
      <g transform="translate(7 6)" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        ${iconSvg}
      </g>
    </svg>
  `;

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'display:flex;flex-direction:column;align-items:center;';
  const pinDiv = document.createElement('div');
  pinDiv.style.cssText = 'width:38px;height:48px;';
  pinDiv.innerHTML = svg.trim();
  wrapper.appendChild(pinDiv);

  if (label) {
    const badge = document.createElement('span');
    badge.textContent = label;
    badge.style.cssText = `margin-top:-6px;padding:1px 5px;font-size:10px;font-weight:700;line-height:14px;color:#fff;background:${color};border-radius:6px;white-space:nowrap;border:1.5px solid #fff;`;
    wrapper.appendChild(badge);
  }

  return wrapper;
}

export function toLatLngLiteral(position) {
  if (!position) return null;
  const latValue = typeof position.lat === 'function' ? position.lat() : position.lat;
  const lngValue = typeof position.lng === 'function' ? position.lng() : position.lng;
  const lat = Number(latValue);
  const lng = Number(lngValue);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export function toCoordinateKey(position) {
  const point = toLatLngLiteral(position);
  if (!point) return '';
  return `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`;
}

export function createTravelTimeCacheKey({ travelMode, baseKey, destinationKey }) {
  return `${String(travelMode || '')};${baseKey};${destinationKey}`;
}

export function createRouteRequestCacheKey({ origin, destination, waypoints, travelMode }) {
  const originPoint = toLatLngLiteral(origin);
  const destinationPoint = toLatLngLiteral(destination);
  const waypointPoints = Array.isArray(waypoints)
    ? waypoints.map(toLatLngLiteral).filter(Boolean)
    : [];
  if (!originPoint || !destinationPoint) return '';
  const normalizePoint = (point) => `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`;
  return [
    String(travelMode || ''),
    normalizePoint(originPoint),
    normalizePoint(destinationPoint),
    waypointPoints.map(normalizePoint).join('|')
  ].join(';');
}

export function decodeEncodedPolyline(encoded) {
  if (!encoded || typeof encoded !== 'string') return [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;
  const coordinates = [];

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte = 0;
    do {
      byte = encoded.charCodeAt(index) - 63;
      index += 1;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    const latitudeDelta = result & 1 ? ~(result >> 1) : result >> 1;
    latitude += latitudeDelta;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index) - 63;
      index += 1;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    const longitudeDelta = result & 1 ? ~(result >> 1) : result >> 1;
    longitude += longitudeDelta;

    coordinates.push({ lat: latitude / 1e5, lng: longitude / 1e5 });
  }

  return coordinates;
}

export async function requestPlannedRoute({ origin, destination, waypoints, travelMode }) {
  const originPoint = toLatLngLiteral(origin);
  const destinationPoint = toLatLngLiteral(destination);
  if (!originPoint || !destinationPoint) {
    throw new Error('Set your home location before drawing a route.');
  }
  const waypointPoints = Array.isArray(waypoints)
    ? waypoints.map(toLatLngLiteral).filter(Boolean)
    : [];

  const response = await fetch('/api/route', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ origin: originPoint, destination: destinationPoint, waypoints: waypointPoints, travelMode })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `Route request failed: ${response.status}`);

  const path = decodeEncodedPolyline(payload.encodedPolyline || '');
  if (!path.length) throw new Error('No route geometry returned for this plan.');

  return {
    path,
    totalDistanceMeters: Number(payload.totalDistanceMeters) || 0,
    totalDurationSeconds: Number(payload.totalDurationSeconds) || 0
  };
}

export function loadGoogleMapsScript(apiKey) {
  if (window.google?.maps) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const callbackName = `initGoogleMaps_${Math.random().toString(36).slice(2)}`;
    window[callbackName] = () => { delete window[callbackName]; resolve(); };
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&loading=async&callback=${callbackName}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => { delete window[callbackName]; reject(new Error('Failed to load Google Maps script.')); };
    document.head.appendChild(script);
  });
}

export function buildInfoWindowAddButton(plannerAction) {
  if (!plannerAction) return '';
  if (!plannerAction.enabled || !plannerAction.id) {
    return `<p style="margin:6px 0;color:#64748b;font-size:12px;">Pick a planner date first to add this stop.</p>`;
  }
  return `
    <button id="${escapeHtml(plannerAction.id)}" type="button"
      style="margin:6px 0 8px;padding:6px 10px;border:1px solid #93c5fd;background:#eff6ff;color:#1d4ed8;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">
      ${escapeHtml(plannerAction.label || 'Add to selected date')}
    </button>
  `;
}

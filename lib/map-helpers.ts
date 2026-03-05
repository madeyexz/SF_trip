import { escapeHtml } from './helpers.ts';

type LatLngLike = {
  lat: number | (() => number);
  lng: number | (() => number);
};

type PlacePhotoLike = {
  authorAttributions?: Array<{ displayName?: string }>;
  getURI?: (options: { maxWidth: number; maxHeight: number }) => string;
};

export type PlacePhotoGalleryEntry = {
  uri: string;
  authorNames: string[];
};

type BuildPlacePhotoGalleryHtmlArgs = {
  placeName: string;
  photoGallery: PlacePhotoGalleryEntry[];
  activeIndex?: number;
  controlIds?: {
    previous: string;
    next: string;
  };
};

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
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="42" viewBox="0 0 36 42">
      <path d="M 1,1 L 35,1 L 35,33 L 22,33 L 18,39 L 14,33 L 1,33 Z" fill="#0C0C0C" stroke="${color}" stroke-width="2" stroke-linejoin="miter" />
      <g transform="translate(6 5)" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter">
        ${iconSvg}
      </g>
    </svg>
  `;

  const wrapper = document.createElement('div');
  wrapper.style.width = '36px';
  wrapper.style.height = '42px';
  wrapper.innerHTML = svg.trim();
  return wrapper;
}

export function createLucidePinIconWithLabel(iconNode, color, label) {
  const iconSvg = renderLucideIconNode(iconNode);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="42" viewBox="0 0 36 42">
      <path d="M 1,1 L 35,1 L 35,33 L 22,33 L 18,39 L 14,33 L 1,33 Z" fill="#0C0C0C" stroke="${color}" stroke-width="2" stroke-linejoin="miter" />
      <g transform="translate(6 5)" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter">
        ${iconSvg}
      </g>
    </svg>
  `;

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'display:flex;flex-direction:column;align-items:center;';
  const pinDiv = document.createElement('div');
  pinDiv.style.cssText = 'width:36px;height:42px;';
  pinDiv.innerHTML = svg.trim();
  wrapper.appendChild(pinDiv);

  if (label) {
    const badge = document.createElement('span');
    badge.textContent = label;
    badge.style.cssText = `margin-top:-6px;padding:2px 6px;font-size:10px;font-weight:700;line-height:1;color:#0C0C0C;background:${color};border-radius:0px;white-space:nowrap;font-family:'JetBrains Mono',monospace;text-transform:uppercase;letter-spacing:0.05em;`;
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
  return new Promise<void>((resolve, reject) => {
    const callbackName = `initGoogleMaps_${Math.random().toString(36).slice(2)}`;
    window[callbackName] = () => { delete window[callbackName]; resolve(); };
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places,visualization&loading=async&callback=${callbackName}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => { delete window[callbackName]; reject(new Error('Failed to load Google Maps script.')); };
    document.head.appendChild(script);
  });
}

export function buildInfoWindowAddButton(plannerAction) {
  if (!plannerAction) return '';
  if (!plannerAction.enabled || !plannerAction.id) {
    return `<p style="margin:6px 0;color:#6a6a6a;font-size:12px;font-family:'JetBrains Mono',monospace;">Pick a planner date first to add this stop.</p>`;
  }
  return `
    <button id="${escapeHtml(plannerAction.id)}" type="button"
      style="margin:6px 0 8px;padding:6px 10px;border:1px solid rgba(0,255,136,0.25);background:rgba(0,255,136,0.06);color:#00FF88;border-radius:0;font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:600;cursor:pointer;text-transform:uppercase;letter-spacing:0.05em;">
      ${escapeHtml(plannerAction.label || 'Add to selected date')}
    </button>
  `;
}

export function createPlacePhotoCacheKey(place) {
  const id = String(place?.id || '').trim();
  if (id) {
    return id;
  }

  const name = String(place?.name || '').trim();
  const location = String(place?.location || '').trim();
  return `${name}|${location}`;
}

export function getNextPlacePhotoIndex(currentIndex: number, direction: number, totalPhotos: number) {
  if (!Number.isFinite(totalPhotos) || totalPhotos <= 0) {
    return 0;
  }

  const normalizedCurrent = Number.isFinite(currentIndex) ? Math.trunc(currentIndex) : 0;
  const normalizedDirection = Number.isFinite(direction) ? Math.trunc(direction) : 0;
  return ((normalizedCurrent + normalizedDirection) % totalPhotos + totalPhotos) % totalPhotos;
}

function normalizePlacePhotoGallery(photos: PlacePhotoLike[], limit = 4): PlacePhotoGalleryEntry[] {
  if (!Array.isArray(photos) || photos.length === 0) {
    return [];
  }

  const gallery = [];

  for (const photo of photos) {
    if (gallery.length >= limit) {
      break;
    }

    const uri = typeof photo?.getURI === 'function'
      ? photo.getURI({ maxWidth: 400, maxHeight: 200 })
      : '';

    if (!uri) {
      continue;
    }

    gallery.push({
      uri,
      authorNames: Array.isArray(photo?.authorAttributions)
        ? photo.authorAttributions
          .map((attribution) => String(attribution?.displayName || '').trim())
          .filter(Boolean)
        : []
    });
  }

  return gallery;
}

export function buildPlacePhotoGalleryHtml({
  placeName,
  photoGallery,
  activeIndex = 0,
  controlIds
}: BuildPlacePhotoGalleryHtmlArgs) {
  const gallery = Array.isArray(photoGallery)
    ? photoGallery.filter((entry) => entry?.uri).slice(0, 4)
    : [];

  if (gallery.length === 0) {
    return '';
  }

  const selectedIndex = getNextPlacePhotoIndex(activeIndex, 0, gallery.length);
  const selectedPhoto = gallery[selectedIndex];
  const authorLine = Array.from(
    new Set(Array.isArray(selectedPhoto?.authorNames) ? selectedPhoto.authorNames : [])
  ).join(', ');
  const hasControls = gallery.length > 1 && controlIds?.previous && controlIds?.next;

  return [
    '<div style="margin:8px 0 10px;display:grid;gap:6px;">',
    '<div style="position:relative;">',
    `<img src="${escapeHtml(selectedPhoto.uri)}" alt="${escapeHtml(`${placeName} photo ${selectedIndex + 1}`)}" style="width:100%;height:168px;object-fit:cover;display:block;border:1px solid rgba(255,255,255,0.08)" />`,
    hasControls
      ? `<button id="${escapeHtml(controlIds.previous)}" type="button" aria-label="Previous photo" style="position:absolute;left:8px;top:50%;transform:translateY(-50%);width:28px;height:28px;border:1px solid #2f2f2f;background:rgba(10,10,10,0.92);color:#FFFFFF;font-family:'JetBrains Mono',monospace;font-size:14px;cursor:pointer">‹</button>`
      : '',
    hasControls
      ? `<button id="${escapeHtml(controlIds.next)}" type="button" aria-label="Next photo" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);width:28px;height:28px;border:1px solid #2f2f2f;background:rgba(10,10,10,0.92);color:#FFFFFF;font-family:'JetBrains Mono',monospace;font-size:14px;cursor:pointer">›</button>`
      : '',
    hasControls
      ? `<div style="position:absolute;right:8px;top:8px;padding:2px 6px;border:1px solid #2f2f2f;background:rgba(10,10,10,0.92);color:#FFFFFF;font-size:10px;font-family:'JetBrains Mono',monospace;letter-spacing:0.05em">${selectedIndex + 1} / ${gallery.length}</div>`
      : '',
    '</div>',
    authorLine
      ? `<p style="margin:0;color:#6a6a6a;font-size:10px;text-transform:uppercase;letter-spacing:0.05em">Photo credit: ${escapeHtml(authorLine)}</p>`
      : '',
    '</div>'
  ].join('');
}

export async function fetchPlacePhotoGallery(
  placeName: string,
  location: LatLngLike
): Promise<PlacePhotoGalleryEntry[]> {
  try {
    const { Place } = await window.google.maps.importLibrary('places') as any;
    if (!Place) return [];
    const point = toLatLngLiteral(location);
    if (!point) return [];
    const { places } = await Place.searchByText({
      textQuery: placeName,
      fields: ['photos'],
      locationBias: new window.google.maps.Circle({ center: point, radius: 500 }),
      maxResultCount: 1,
    });
    return normalizePlacePhotoGallery(places?.[0]?.photos || []);
  } catch (e) {
    console.warn('[Places photo] lookup failed for', placeName, e);
    return [];
  }
}

export async function fetchPlacePhotoUri(
  placeName: string,
  location: LatLngLike
): Promise<string | null> {
  const gallery = await fetchPlacePhotoGallery(placeName, location);
  return gallery[0]?.uri || null;
}

type MapsEnvironment = Record<string, string | undefined>;

function firstValue(env: MapsEnvironment, names: string[]): string {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value) return value;
  }
  return '';
}

export function getMapsBrowserConfig(env: MapsEnvironment = process.env) {
  return {
    mapsBrowserKey: firstValue(env, ['GOOGLE_MAPS_BROWSER_KEY']),
    mapsMapId: firstValue(env, ['GOOGLE_MAPS_MAP_ID'])
  };
}

export function getMapsRoutesKey(env: MapsEnvironment = process.env): string {
  return firstValue(env, ['GOOGLE_MAPS_ROUTES_KEY', 'GOOGLE_MAPS_SERVER_KEY', 'GOOGLE_MAPS_BROWSER_KEY']);
}

export function getMapsGeocodingKey(env: MapsEnvironment = process.env): string {
  return firstValue(env, ['GOOGLE_MAPS_GEOCODING_KEY', 'GOOGLE_MAPS_SERVER_KEY', 'GOOGLE_MAPS_BROWSER_KEY']);
}

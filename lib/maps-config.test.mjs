import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getMapsBrowserConfig, getMapsRoutesKey, getMapsGeocodingKey } from './maps-config.ts';

describe('Maps environment configuration', () => {
  it('trims browser key and map ID without returning server credentials', () => {
    assert.deepEqual(getMapsBrowserConfig({
      GOOGLE_MAPS_BROWSER_KEY: ' browser\n',
      GOOGLE_MAPS_MAP_ID: ' map ',
      GOOGLE_MAPS_SERVER_KEY: 'private'
    }), { mapsBrowserKey: 'browser', mapsMapId: 'map' });
  });

  it('preserves service-specific priority and skips whitespace-only credentials', () => {
    const env = {
      GOOGLE_MAPS_ROUTES_KEY: ' routes ',
      GOOGLE_MAPS_GEOCODING_KEY: '\t',
      GOOGLE_MAPS_SERVER_KEY: ' server ',
      GOOGLE_MAPS_BROWSER_KEY: ' browser '
    };
    assert.equal(getMapsRoutesKey(env), 'routes');
    assert.equal(getMapsGeocodingKey(env), 'server');
    assert.equal(getMapsRoutesKey({ ...env, GOOGLE_MAPS_ROUTES_KEY: '\n' }), 'server');
  });

  it('handles missing credentials and final browser fallback', () => {
    assert.equal(getMapsRoutesKey({}), '');
    assert.equal(getMapsGeocodingKey({ GOOGLE_MAPS_BROWSER_KEY: ' browser ' }), 'browser');
    assert.deepEqual(getMapsBrowserConfig({}), { mapsBrowserKey: '', mapsMapId: '' });
  });
});

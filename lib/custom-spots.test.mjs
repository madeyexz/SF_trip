import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCustomSpotSourceKey,
  normalizeCustomSpotPayload,
  normalizeCustomSpotTag
} from './custom-spots.ts';

describe('custom spot helpers', () => {
  it('normalizes allowed custom spot tags', () => {
    assert.equal(normalizeCustomSpotTag('cafes'), 'cafes');
    assert.equal(normalizeCustomSpotTag(' go out '), 'go out');
    assert.throws(() => normalizeCustomSpotTag('avoid'), /Tag must be one of/);
  });

  it('builds a stable source key preferring the Google place id', () => {
    assert.equal(
      buildCustomSpotSourceKey({ id: 'place-123', name: 'Four Barrel', location: 'SF' }),
      'google-place:place-123'
    );
    assert.match(
      buildCustomSpotSourceKey({ name: 'Four Barrel', location: '375 Valencia St', mapLink: 'https://maps.example' }),
      /four barrel\|375 valencia st\|https:\/\/maps\.example/
    );
  });

  it('normalizes and validates a custom spot payload for persistence', () => {
    const payload = normalizeCustomSpotPayload({
      id: 'place-abc',
      sourceKey: 'google-place:place-abc',
      name: 'Four Barrel Coffee',
      tag: 'cafes',
      location: '375 Valencia St, San Francisco, CA',
      mapLink: 'https://www.google.com/maps/search/?api=1&query=Four+Barrel',
      description: 'Saved from search',
      details: 'Google types: cafe, coffee_shop',
      lat: 37.767,
      lng: -122.421
    });

    assert.equal(payload.id, 'custom-place-abc');
    assert.equal(payload.sourceKey, 'google-place:place-abc');
    assert.equal(payload.tag, 'cafes');
    assert.equal(payload.name, 'Four Barrel Coffee');
    assert.equal(payload.lat, 37.767);
    assert.equal(payload.lng, -122.421);
  });
});

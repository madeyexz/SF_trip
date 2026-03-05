import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  applyDeviceLocation,
  DEVICE_LOCATION_OPTIONS,
  DEVICE_LOCATION_VISIBLE_MESSAGE
} from './device-location.ts';

describe('device location helpers', () => {
  it('uses high-accuracy settings with bounded timeout and cache age', () => {
    assert.deepEqual(DEVICE_LOCATION_OPTIONS, {
      enableHighAccuracy: true,
      timeout: 10_000,
      maximumAge: 60_000
    });
  });

  it('shows the live device location without overwriting the home marker flow', async () => {
    const calls = [];
    const events = [{ id: 'event-1' }];
    const places = [{ id: 'place-1' }];
    const latLngInstances = [];

    class FakeLatLng {
      constructor(lat, lng) {
        this.lat = lat;
        this.lng = lng;
        latLngInstances.push(this);
      }
    }

    const result = await applyDeviceLocation({
      googleMaps: { LatLng: FakeLatLng },
      coords: { latitude: 37.7801, longitude: -122.4202 },
      allEvents: events,
      filteredPlaces: places,
      effectiveDateFilter: '2026-03-05',
      travelMode: 'WALKING',
      setDeviceLocationMarker: (latLng, title) => {
        calls.push(['setDeviceLocationMarker', latLng, title]);
      },
      focusMapOnOrigin: (latLng) => {
        calls.push(['focusMapOnOrigin', latLng]);
      },
      renderCurrentSelection: async (...args) => {
        calls.push(['renderCurrentSelection', ...args]);
      },
      setStatusMessage: (message) => {
        calls.push(['setStatusMessage', message]);
      }
    });

    assert.equal(latLngInstances.length, 1);
    assert.equal(result, latLngInstances[0]);
    assert.deepEqual(calls, [
      ['setDeviceLocationMarker', latLngInstances[0], 'My current location'],
      ['focusMapOnOrigin', latLngInstances[0]],
      ['renderCurrentSelection', events, places, '2026-03-05', 'WALKING', false],
      ['setStatusMessage', DEVICE_LOCATION_VISIBLE_MESSAGE]
    ]);
  });
});

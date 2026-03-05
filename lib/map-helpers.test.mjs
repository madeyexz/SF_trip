import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createPlacePhotoCacheKey,
  fetchPlacePhotoGallery
} from './map-helpers.ts';

describe('place photo cache keys', () => {
  it('prefers the canonical place id when present', () => {
    assert.equal(
      createPlacePhotoCacheKey({ id: 'spot-123', name: 'Coit Tower', location: 'San Francisco, CA' }),
      'spot-123'
    );
  });

  it('falls back to name and location for unnamed ids', () => {
    assert.equal(
      createPlacePhotoCacheKey({ name: 'Coit Tower', location: 'San Francisco, CA' }),
      'Coit Tower|San Francisco, CA'
    );
  });
});

describe('place photo gallery lookup', () => {
  beforeEach(() => {
    globalThis.window = undefined;
  });

  it('returns up to four photo entries from the first matching place', async () => {
    const requestedSizes = [];
    const photos = Array.from({ length: 6 }, (_, index) => ({
      authorAttributions: [{ displayName: `Author ${index + 1}` }],
      getURI(options) {
        requestedSizes.push(options);
        return `https://images.example/${index + 1}.jpg`;
      }
    }));

    globalThis.window = {
      google: {
        maps: {
          Circle: class Circle {
            constructor(config) {
              this.config = config;
            }
          },
          importLibrary: async () => ({
            Place: {
              searchByText: async () => ({
                places: [{ photos }]
              })
            }
          })
        }
      }
    };

    const gallery = await fetchPlacePhotoGallery('Coit Tower', { lat: 37.8024, lng: -122.4058 });

    assert.equal(gallery.length, 4);
    assert.deepEqual(
      gallery.map((entry) => entry.uri),
      [
        'https://images.example/1.jpg',
        'https://images.example/2.jpg',
        'https://images.example/3.jpg',
        'https://images.example/4.jpg'
      ]
    );
    assert.deepEqual(
      gallery.map((entry) => entry.authorNames),
      [
        ['Author 1'],
        ['Author 2'],
        ['Author 3'],
        ['Author 4']
      ]
    );
    assert.deepEqual(requestedSizes, Array.from({ length: 4 }, () => ({ maxWidth: 400, maxHeight: 200 })));
  });

  it('returns an empty gallery when the lookup fails or photos are missing', async () => {
    globalThis.window = {
      google: {
        maps: {
          Circle: class Circle {},
          importLibrary: async () => ({
            Place: {
              searchByText: async () => ({
                places: [{ photos: [] }]
              })
            }
          })
        }
      }
    };

    const gallery = await fetchPlacePhotoGallery('Lands End', { lat: 37.7802, lng: -122.513 });

    assert.deepEqual(gallery, []);
  });
});

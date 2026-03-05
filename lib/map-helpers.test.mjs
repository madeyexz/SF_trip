import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCustomSpotPayloadFromSearchResult,
  buildSearchResultTypeChips,
  buildPlacePhotoGalleryHtml,
  createPlacePhotoCacheKey,
  estimateWalkDurationMinutes,
  fetchPlacePhotoGallery,
  guessPlaceSearchTag,
  getNextPlacePhotoIndex,
  getMapBoundsSearchRadius,
  loadGoogleMapsScript,
  normalizePlacesTextSearchResults,
  sortPlaceSearchResults,
  resetGoogleMapsScriptLoaderForTesting
} from './map-helpers.ts';

describe('google maps script loader', () => {
  beforeEach(() => {
    resetGoogleMapsScriptLoaderForTesting();
    globalThis.window = {};
    const appended = [];
    globalThis.document = {
      _nodes: new Map(),
      head: {
        appendChild(node) {
          appended.push(node);
          this.ownerDocument._nodes.set(node.id, node);
        },
        ownerDocument: null
      },
      createElement(tagName) {
        return {
          tagName,
          id: '',
          async: false,
          defer: false,
          src: '',
          onerror: null
        };
      },
      getElementById(id) {
        return this._nodes.get(id) || null;
      }
    };
    globalThis.document.head.ownerDocument = globalThis.document;
    globalThis.__appendedMapsScripts = appended;
  });

  it('reuses a single pending script load across concurrent callers', async () => {
    const first = loadGoogleMapsScript('test-key');
    const second = loadGoogleMapsScript('test-key');

    assert.equal(first, second);
    assert.equal(globalThis.__appendedMapsScripts.length, 1);

    const callbackName = Object.keys(globalThis.window).find((key) => key.startsWith('initGoogleMaps_'));
    assert.equal(typeof callbackName, 'string');
    globalThis.window[callbackName]();

    await Promise.all([first, second]);
    assert.equal(globalThis.__appendedMapsScripts.length, 1);
  });
});

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

describe('place photo gallery rendering helpers', () => {
  it('wraps gallery navigation indexes in both directions', () => {
    assert.equal(getNextPlacePhotoIndex(0, -1, 4), 3);
    assert.equal(getNextPlacePhotoIndex(3, 1, 4), 0);
    assert.equal(getNextPlacePhotoIndex(1, 1, 4), 2);
  });

  it('renders a switchable gallery with prev/next controls and active slide', () => {
    const html = buildPlacePhotoGalleryHtml({
      placeName: 'Coit Tower',
      photoGallery: [
        { uri: 'https://images.example/1.jpg', authorNames: ['Author 1'] },
        { uri: 'https://images.example/2.jpg', authorNames: ['Author 2'] },
        { uri: 'https://images.example/3.jpg', authorNames: ['Author 3'] }
      ],
      activeIndex: 1,
      controlIds: {
        previous: 'gallery-prev',
        next: 'gallery-next'
      }
    });

    assert.match(html, /id="gallery-prev"/);
    assert.match(html, /id="gallery-next"/);
    assert.match(html, /2 \/ 3/);
    assert.match(html, /https:\/\/images\.example\/2\.jpg/);
    assert.match(html, /Photo credit: Author 2/);
  });

  it('renders a static single-image block without navigation controls', () => {
    const html = buildPlacePhotoGalleryHtml({
      placeName: 'Lands End',
      photoGallery: [
        { uri: 'https://images.example/1.jpg', authorNames: [] }
      ],
      activeIndex: 0,
      controlIds: {
        previous: 'gallery-prev',
        next: 'gallery-next'
      }
    });

    assert.doesNotMatch(html, /gallery-prev/);
    assert.doesNotMatch(html, /gallery-next/);
    assert.match(html, /https:\/\/images\.example\/1\.jpg/);
  });
});

describe('places text search helpers', () => {
  it('guesses spot tags from place types and fallback text', () => {
    assert.equal(guessPlaceSearchTag(['cafe', 'coffee_shop'], ''), 'cafes');
    assert.equal(guessPlaceSearchTag(['book_store'], ''), 'shops');
    assert.equal(guessPlaceSearchTag(['museum'], ''), 'sightseeing');
    assert.equal(guessPlaceSearchTag([], 'late night cocktail bar'), 'bar');
  });

  it('normalizes Google Places search results into plain map result objects', () => {
    const results = normalizePlacesTextSearchResults([
      {
        id: 'place-1',
        displayName: { text: 'Sightglass Coffee' },
        formattedAddress: '270 7th St, San Francisco, CA',
        location: {
          lat: () => 37.7761,
          lng: () => -122.4085
        },
        types: ['cafe', 'coffee_shop']
      }
    ]);

    assert.equal(results.length, 1);
    assert.equal(results[0].id, 'place-1');
    assert.equal(results[0].name, 'Sightglass Coffee');
    assert.equal(results[0].location, '270 7th St, San Francisco, CA');
    assert.equal(results[0].suggestedTag, 'cafes');
    assert.equal(results[0].searchRank, 0);
    assert.match(results[0].mapLink, /google\.com\/maps\/search/);
  });

  it('builds a custom-spot payload from a search result and selected tag', () => {
    const payload = buildCustomSpotPayloadFromSearchResult(
      {
        id: 'place-2',
        placeId: 'place-2',
        name: 'Tartine Manufactory',
        location: '595 Alabama St, San Francisco, CA',
        mapLink: 'https://www.google.com/maps/search/?api=1&query=Tartine',
        lat: 37.7614,
        lng: -122.4111,
        types: ['bakery', 'brunch_restaurant']
      },
      'eat'
    );

    assert.equal(payload.sourceKey, 'google-place:place-2');
    assert.equal(payload.tag, 'eat');
    assert.equal(payload.name, 'Tartine Manufactory');
    assert.equal(payload.location, '595 Alabama St, San Francisco, CA');
    assert.equal(payload.lat, 37.7614);
    assert.equal(payload.lng, -122.4111);
    assert.match(payload.description, /Saved from map search/);
  });

  it('derives compact type chips and walk-time estimates for result cards', () => {
    assert.deepEqual(
      buildSearchResultTypeChips(['coffee_shop', 'bakery', 'tourist_attraction']),
      ['Coffee shop', 'Bakery', 'Tourist attraction']
    );
    assert.equal(estimateWalkDurationMinutes(800), 13);
  });

  it('sorts search results by best match, distance, or walk time', () => {
    const results = [
      { id: 'b', searchRank: 1, distanceMeters: 300, walkDurationMinutes: 6 },
      { id: 'a', searchRank: 0, distanceMeters: 500, walkDurationMinutes: 10 },
      { id: 'c', searchRank: 2, distanceMeters: 200, walkDurationMinutes: 4 }
    ];

    assert.deepEqual(sortPlaceSearchResults(results, 'best_match').map((result) => result.id), ['a', 'b', 'c']);
    assert.deepEqual(sortPlaceSearchResults(results, 'distance').map((result) => result.id), ['c', 'b', 'a']);
    assert.deepEqual(sortPlaceSearchResults(results, 'walk_time').map((result) => result.id), ['c', 'b', 'a']);
  });

  it('derives a visible-area search radius from map bounds', () => {
    const radius = getMapBoundsSearchRadius({
      north: 37.79,
      south: 37.76,
      east: -122.39,
      west: -122.44
    });

    assert.equal(Number.isFinite(radius), true);
    assert.equal(radius > 2000, true);
  });
});

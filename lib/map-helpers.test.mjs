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
  requestPlacesTextSearch,
  PLACE_SEARCH_FIELDS,
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
          onerror: null,
          remove() {
            globalThis.document._nodes.delete(this.id);
          }
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
    assert.equal(globalThis.__appendedMapsScripts[0].src.includes('visualization'), false);

    const callbackName = Object.keys(globalThis.window).find((key) => key.startsWith('initGoogleMaps_'));
    assert.equal(typeof callbackName, 'string');
    globalThis.window[callbackName]();

    await Promise.all([first, second]);
    assert.equal(globalThis.__appendedMapsScripts.length, 1);
  });

  it('removes a failed node and creates a working script for the next attempt', async () => {
    const first = loadGoogleMapsScript('test-key');
    const failure = assert.rejects(first, /Failed to load Google Maps script/);
    globalThis.__appendedMapsScripts[0].onerror();
    await failure;
    assert.equal(document.getElementById('google-maps-js'), null);
    assert.equal(Object.keys(window).some((key) => key.startsWith('initGoogleMaps_')), false);
    const second = loadGoogleMapsScript('test-key');
    assert.equal(globalThis.__appendedMapsScripts.length, 2);
    const callbackName = Object.keys(window).find((key) => key.startsWith('initGoogleMaps_'));
    window[callbackName]();
    await second;
  });

  it('returns immediately when maps already loaded without adding another script', async () => {
    window.google = { maps: {} };
    await loadGoogleMapsScript('test-key');
    assert.equal(globalThis.__appendedMapsScripts.length, 0);
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
                places: [{ fetchFields: async () => ({ place: { photos } }) }]
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
                places: [{ fetchFields: async () => ({ place: { photos: [] } }) }]
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

describe('Places (New) API request contracts', () => {
  beforeEach(() => { globalThis.window = {}; });

  it('searches via Place.searchByText with only UI fields and preserves canonical Place properties', async () => {
    const calls = [];
    const requests = [];
    const place = {
      id: 'ChIJ-exact',
      displayName: 'Coffee Shop',
      formattedAddress: '1 Market St, San Francisco',
      location: { lat: () => 37.79, lng: () => -122.4 },
      types: ['cafe'],
      googleMapsURI: 'https://maps.google.com/?cid=1234'
    };
    window.google = { maps: { importLibrary: async (library) => {
      calls.push(library);
      return { Place: { searchByText: async request => { requests.push(request); return { places: [place] }; } } };
    } } };
    const places = await requestPlacesTextSearch({
      textQuery: ' coffee ', location: { lat: 37.79, lng: -122.4 }, radius: 4500
    });
    assert.deepEqual(calls, ['places']);
    assert.deepEqual(requests, [{
      textQuery: 'coffee',
      fields: [...PLACE_SEARCH_FIELDS],
      locationBias: { center: { lat: 37.79, lng: -122.4 }, radius: 4500 },
      maxResultCount: 8
    }]);
    assert.equal(requests[0].fields.includes('photos'), false);
    assert.equal(requests[0].fields.includes('rating'), false);
    const [result] = normalizePlacesTextSearchResults(places);
    assert.equal(result.placeId, 'ChIJ-exact');
    assert.equal(result.name, 'Coffee Shop');
    assert.equal(result.mapLink, place.googleMapsURI);
    assert.equal(result.suggestedTag, 'cafes');
    assert.deepEqual({ lat: result.lat, lng: result.lng }, { lat: 37.79, lng: -122.4 });
  });

  it('rejects permission failures and absent Places APIs rather than pretending search was empty', async () => {
    window.google = { maps: { importLibrary: async () => ({
      Place: { searchByText: async () => { throw new Error('Places API permission denied'); } }
    }) } };
    await assert.rejects(requestPlacesTextSearch({
      textQuery: 'coffee', location: { lat: 37.79, lng: -122.4 }
    }), /permission denied/);
    window.google.maps.importLibrary = async () => ({});
    await assert.rejects(requestPlacesTextSearch({
      textQuery: 'coffee', location: { lat: 37.79, lng: -122.4 }
    }), /Places \(New\) is not available/);
  });

  it('accepts empty responses and bounds documented request limits', async () => {
    let request;
    window.google = { maps: { importLibrary: async () => ({
      Place: { searchByText: async value => { request = value; return { places: [] }; } }
    }) } };
    assert.deepEqual(await requestPlacesTextSearch({
      textQuery: 'museum', location: { lat: 37.79, lng: -122.4 }, radius: 999999, maxResultCount: 99
    }), []);
    assert.equal(request.maxResultCount, 20);
    assert.equal(request.locationBias.radius, 50000);
    await assert.rejects(requestPlacesTextSearch({
      textQuery: '', location: { lat: 37.79, lng: -122.4 }
    }), /Enter a search query/);
  });

  it('loads photos using exact-ID Place.fetchFields without making another text search', async () => {
    const constructors = [];
    const fields = [];
    const sizes = [];
    class Place {
      constructor(options) { constructors.push(options); }
      static searchByText() { assert.fail('Known IDs must not trigger text search'); }
      async fetchFields(request) {
        fields.push(request);
        this.photos = [{
          authorAttributions: [{ displayName: 'Photo Author' }],
          getURI(options) { sizes.push(options); return 'https://images.example/exact.jpg'; }
        }];
        return { place: this };
      }
    }
    window.google = { maps: { importLibrary: async () => ({ Place }) } };
    const gallery = await fetchPlacePhotoGallery('Wrong duplicate name', { lat: 37.79, lng: -122.4 }, { placeId: 'ChIJ-exact' });
    assert.deepEqual(constructors, [{ id: 'ChIJ-exact' }]);
    assert.deepEqual(fields, [{ fields: ['photos'] }]);
    assert.deepEqual(sizes, [{ maxWidth: 400, maxHeight: 200 }]);
    assert.deepEqual(gallery, [{ uri: 'https://images.example/exact.jpg', authorNames: ['Photo Author'] }]);
  });

  it('looks up only the ID for generic places, then requests photo details on the returned Place', async () => {
    const requests = [];
    const fields = [];
    const found = {
      id: 'ChIJ-found',
      async fetchFields(request) {
        fields.push(request);
        return { place: { photos: [{ getURI: () => 'https://images.example/found.jpg' }] } };
      }
    };
    window.google = { maps: { importLibrary: async () => ({
      Place: { searchByText: async request => { requests.push(request); return { places: [found] }; } }
    }) } };
    assert.deepEqual(await fetchPlacePhotoGallery('Lands End', { lat: 37.78, lng: -122.51 }), [
      { uri: 'https://images.example/found.jpg', authorNames: [] }
    ]);
    assert.deepEqual(requests[0].fields, ['id']);
    assert.deepEqual(requests[0].locationBias, { center: { lat: 37.78, lng: -122.51 }, radius: 500 });
    assert.deepEqual(fields, [{ fields: ['photos'] }]);
  });

  it('propagates photo failures for retry without interpreting them as no photos', async () => {
    class Place {
      async fetchFields() { throw new Error('Photo details permission denied'); }
    }
    window.google = { maps: { importLibrary: async () => ({ Place }) } };
    await assert.rejects(fetchPlacePhotoGallery('Cafe', { lat: 37.79, lng: -122.4 }, { placeId: 'ChIJ' }), /permission denied/);
    window.google.maps.importLibrary = async () => ({
      Place: { searchByText: async () => ({ places: [] }) }
    });
    assert.deepEqual(await fetchPlacePhotoGallery('Not found', { lat: 37.79, lng: -122.4 }), []);
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

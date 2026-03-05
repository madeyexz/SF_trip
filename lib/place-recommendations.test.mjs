import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildComparablePlaceKey,
  mergePlaceRecommendationsIntoPlaces
} from './events.ts';

describe('place recommendation merge helpers', () => {
  it('annotates an existing canonical place without duplicating it', () => {
    const places = [
      {
        id: 'spot-1',
        name: 'SFMOMA',
        tag: 'sightseeing',
        location: 'San Francisco, CA',
        mapLink: 'https://www.google.com/maps/search/?api=1&query=SFMOMA+San+Francisco',
        cornerLink: '',
        curatorComment: '',
        description: 'Modern art museum',
        details: ''
      }
    ];

    const recommendations = [
      {
        placeKey: buildComparablePlaceKey({ name: 'SFMOMA', location: 'San Francisco, CA' }),
        placeName: 'SFMOMA',
        friendName: 'Winston',
        tag: 'sightseeing',
        location: 'San Francisco, CA',
        mapLink: 'https://www.google.com/maps/search/?api=1&query=SFMOMA+San+Francisco',
        note: 'Winston said this is worth hitting in the city.'
      }
    ];

    const merged = mergePlaceRecommendationsIntoPlaces(places, recommendations);

    assert.equal(merged.length, 1);
    assert.equal(merged[0].name, 'SFMOMA');
    assert.equal(merged[0].isRecommended, true);
    assert.deepEqual(merged[0].recommendedBy, ['Winston']);
    assert.equal(Array.isArray(merged[0].recommendations), true);
    assert.equal(merged[0].recommendations[0].friendName, 'Winston');
  });

  it('adds a synthetic place row when there is no canonical spot match', () => {
    const merged = mergePlaceRecommendationsIntoPlaces([], [
      {
        placeKey: buildComparablePlaceKey({ name: 'True Laurel', location: 'Mission, San Francisco, CA' }),
        placeName: 'True Laurel',
        friendName: 'Winston',
        tag: 'bar',
        location: 'Mission, San Francisco, CA',
        mapLink: 'https://www.google.com/maps/search/?api=1&query=True+Laurel+San+Francisco',
        note: 'Top 50 bar in 2025.'
      }
    ]);

    assert.equal(merged.length, 1);
    assert.equal(merged[0].name, 'True Laurel');
    assert.equal(merged[0].tag, 'bar');
    assert.equal(merged[0].isRecommended, true);
    assert.deepEqual(merged[0].recommendedBy, ['Winston']);
    assert.equal(merged[0].sourceType, 'friend_recommendation');
  });

  it('skips recommendation merging entirely when shared recommendations are disabled', () => {
    const places = [
      {
        id: 'spot-1',
        name: 'SFMOMA',
        tag: 'sightseeing',
        location: 'San Francisco, CA',
        mapLink: 'https://www.google.com/maps/search/?api=1&query=SFMOMA+San+Francisco',
        cornerLink: '',
        curatorComment: '',
        description: 'Modern art museum',
        details: '',
        isRecommended: true,
        recommendedBy: ['Winston'],
        recommendations: [{ friendName: 'Winston', note: 'Worth the stop.' }]
      },
      {
        id: 'friend-winston-true-laurel',
        name: 'True Laurel',
        tag: 'bar',
        location: 'Mission, San Francisco, CA',
        mapLink: 'https://www.google.com/maps/search/?api=1&query=True+Laurel+San+Francisco',
        cornerLink: '',
        curatorComment: '',
        description: 'Recommended by Winston',
        details: '',
        sourceType: 'friend_recommendation',
        isRecommended: true,
        recommendedBy: ['Winston'],
        recommendations: [{ friendName: 'Winston', note: 'Top 50 bar in 2025.' }]
      }
    ];

    const recommendations = [
      {
        placeKey: buildComparablePlaceKey({ name: 'SFMOMA', location: 'San Francisco, CA' }),
        placeName: 'SFMOMA',
        friendName: 'Winston',
        tag: 'sightseeing',
        location: 'San Francisco, CA',
        mapLink: 'https://www.google.com/maps/search/?api=1&query=SFMOMA+San+Francisco',
        note: 'Worth the stop.'
      },
      {
        placeKey: buildComparablePlaceKey({ name: 'True Laurel', location: 'Mission, San Francisco, CA' }),
        placeName: 'True Laurel',
        friendName: 'Winston',
        tag: 'bar',
        location: 'Mission, San Francisco, CA',
        mapLink: 'https://www.google.com/maps/search/?api=1&query=True+Laurel+San+Francisco',
        note: 'Top 50 bar in 2025.'
      }
    ];

    const merged = mergePlaceRecommendationsIntoPlaces(places, recommendations, { enabled: false });

    assert.equal(merged.length, 1);
    assert.equal(merged[0].name, 'SFMOMA');
    assert.equal(merged[0].isRecommended, undefined);
    assert.equal(merged[0].recommendedBy, undefined);
    assert.equal(merged[0].recommendations, undefined);
  });
});

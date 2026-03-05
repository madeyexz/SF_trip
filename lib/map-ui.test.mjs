import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  getActiveNavId,
  shouldShowMapForNavId,
  shouldShowMapSidebarForNavId
} from './map-ui.ts';

describe('map UI route helpers', () => {
  it('derives the active nav id from the pathname', () => {
    assert.equal(getActiveNavId('/map'), 'map');
    assert.equal(getActiveNavId('/planning'), 'planning');
    assert.equal(getActiveNavId('/planning/day-1'), 'planning');
    assert.equal(getActiveNavId('/spots'), 'spots');
    assert.equal(getActiveNavId('/calendar'), 'calendar');
    assert.equal(getActiveNavId('/config/sources'), 'config');
  });

  it('falls back to planning for unknown paths', () => {
    assert.equal(getActiveNavId('/'), 'planning');
    assert.equal(getActiveNavId('/signin'), 'planning');
    assert.equal(getActiveNavId('/unknown/path'), 'planning');
  });

  it('shows the map only on map-bearing tabs', () => {
    assert.equal(shouldShowMapForNavId('map'), true);
    assert.equal(shouldShowMapForNavId('planning'), true);
    assert.equal(shouldShowMapForNavId('spots'), true);
    assert.equal(shouldShowMapForNavId('calendar'), false);
    assert.equal(shouldShowMapForNavId('config'), false);
  });

  it('only shows a sidebar when the map is not the sole panel', () => {
    assert.equal(shouldShowMapSidebarForNavId('map'), false);
    assert.equal(shouldShowMapSidebarForNavId('planning'), true);
    assert.equal(shouldShowMapSidebarForNavId('spots'), true);
    assert.equal(shouldShowMapSidebarForNavId('calendar'), false);
  });
});

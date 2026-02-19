import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { normalizePairRoomCode, parsePairActionBody } from './pair-api.ts';

describe('pair-api', () => {
  it('normalizes valid room codes', () => {
    assert.equal(normalizePairRoomCode('  AbC_12-  '), 'abc_12-');
  });

  it('rejects too-short and too-long room codes', () => {
    assert.equal(normalizePairRoomCode('a'), '');
    assert.equal(normalizePairRoomCode('x'.repeat(65)), '');
  });

  it('validates create action', () => {
    const payload = parsePairActionBody({ action: 'create' });
    assert.equal(payload.ok, true);
    assert.equal(payload.action, 'create');
  });

  it('validates join action with normalized room code', () => {
    const payload = parsePairActionBody({ action: 'join', roomCode: ' Room-ABC_9 ' });
    assert.equal(payload.ok, true);
    assert.equal(payload.action, 'join');
    assert.equal(payload.roomCode, 'room-abc_9');
  });

  it('rejects join action without valid room code', () => {
    const payload = parsePairActionBody({ action: 'join', roomCode: '!' });
    assert.equal(payload.ok, false);
    assert.equal(payload.error, 'Room code is required (2-64 chars: a-z, 0-9, _ or -).');
  });

  it('rejects unsupported actions', () => {
    const payload = parsePairActionBody({ action: 'destroy' });
    assert.equal(payload.ok, false);
    assert.equal(payload.error, 'Unsupported action. Use "create" or "join".');
  });
});

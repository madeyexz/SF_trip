import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function readConvexFile(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), 'utf8');
}

describe('schema migration guards', () => {
  it('keeps legacy tables removed from schema', async () => {
    const schemaSource = await readConvexFile('./schema.ts');
    assert.equal(schemaSource.includes('pairMembers: defineTable'), false);
    assert.equal(schemaSource.includes('userProfiles: defineTable'), false);
    assert.equal(schemaSource.includes('tripConfig: defineTable'), false);
  });

  it('keeps deprecated users fields removed from schema', async () => {
    const schemaSource = await readConvexFile('./schema.ts');
    assert.equal(schemaSource.includes('profileCreatedAt'), false);
    assert.equal(schemaSource.includes('profileUpdatedAt'), false);
    assert.equal(schemaSource.includes('tripUpdatedAt'), false);
    assert.equal(schemaSource.includes('role: v.optional(v.union(v.literal(\'owner\'), v.literal(\'member\')))'), false);
    assert.equal(schemaSource.includes('name: v.optional(v.string())'), false);
    assert.equal(schemaSource.includes('image: v.optional(v.string())'), false);
    assert.equal(schemaSource.includes('phone: v.optional(v.string())'), false);
    assert.equal(schemaSource.includes('phoneVerificationTime: v.optional(v.number())'), false);
    assert.equal(schemaSource.includes('isAnonymous: v.optional(v.boolean())'), false);
    assert.equal(schemaSource.includes(".index('phone', ['phone'])"), false);
  });

  it('removes pair room storage from schema', async () => {
    const schemaSource = await readConvexFile('./schema.ts');
    assert.equal(schemaSource.includes('pairRooms: defineTable({'), false);
    assert.equal(schemaSource.includes('members: v.optional(v.array(v.object({'), false);
  });

  it('stores sources by user id instead of room code', async () => {
    const schemaSource = await readConvexFile('./schema.ts');
    assert.equal(schemaSource.includes('roomCode: v.string()'), false);
    assert.equal(schemaSource.includes('userId: v.string()'), true);
    assert.equal(schemaSource.includes(".index('by_user_type_status', ['userId', 'sourceType', 'status'])"), true);
    assert.equal(schemaSource.includes(".index('by_user_url', ['userId', 'url'])"), true);
    assert.equal(schemaSource.includes(".index('by_user_updated_at', ['userId', 'updatedAt'])"), true);
  });

  it('stores Winston recommendations globally and keeps the user visibility toggle on users', async () => {
    const schemaSource = await readConvexFile('./schema.ts');
    const placeRecommendationsBlock = schemaSource.match(/placeRecommendations: defineTable\(\{[\s\S]*?\)\s*\.index\('by_friend', \['friendName'\]\),/);
    assert.notEqual(placeRecommendationsBlock, null);
    const placeRecommendationsSource = placeRecommendationsBlock?.[0] || '';
    assert.equal(schemaSource.includes('showSharedPlaceRecommendations: v.optional(v.boolean())'), true);
    assert.equal(placeRecommendationsSource.includes('placeRecommendations: defineTable({'), true);
    assert.equal(placeRecommendationsSource.includes('userId: v.string()'), false);
    assert.equal(placeRecommendationsSource.includes(".index('by_user_updated_at', ['userId', 'updatedAt'])"), false);
    assert.equal(placeRecommendationsSource.includes(".index('by_place_friend', ['placeKey', 'friendName'])"), true);
    assert.equal(placeRecommendationsSource.includes("friendUrl: v.optional(v.string())"), true);
  });
});

describe('trip config api guards', () => {
  it('does not reintroduce updatedAt in tripConfig mutation args', async () => {
    const source = await readConvexFile('./tripConfig.ts');
    assert.equal(source.includes('updatedAt: v.string()'), false);
    assert.equal(source.includes('tripUpdatedAt'), false);
  });

  it('keeps shared recommendations visibility in trip config', async () => {
    const source = await readConvexFile('./tripConfig.ts');
    assert.equal(source.includes('showSharedPlaceRecommendations: v.boolean()'), true);
    assert.equal(source.includes('showSharedPlaceRecommendations: v.optional(v.boolean())'), true);
  });
});

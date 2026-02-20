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

  it('keeps room-scoped sources table in schema', async () => {
    const schemaSource = await readConvexFile('./schema.ts');
    assert.equal(schemaSource.includes('sources: defineTable({'), true);
    assert.equal(schemaSource.includes('roomCode: v.string()'), true);
    assert.equal(schemaSource.includes(".index('by_room_type_status', ['roomCode', 'sourceType', 'status'])"), true);
    assert.equal(schemaSource.includes(".index('by_room_url', ['roomCode', 'url'])"), true);
  });

  it('keeps deprecated users fields removed from schema', async () => {
    const schemaSource = await readConvexFile('./schema.ts');
    assert.equal(schemaSource.includes('profileCreatedAt'), false);
    assert.equal(schemaSource.includes('profileUpdatedAt'), false);
    assert.equal(schemaSource.includes('tripUpdatedAt'), false);
    assert.equal(schemaSource.includes('name: v.optional(v.string())'), false);
    assert.equal(schemaSource.includes('image: v.optional(v.string())'), false);
    assert.equal(schemaSource.includes('phone: v.optional(v.string())'), false);
    assert.equal(schemaSource.includes('phoneVerificationTime: v.optional(v.number())'), false);
    assert.equal(schemaSource.includes('isAnonymous: v.optional(v.boolean())'), false);
    assert.equal(schemaSource.includes(".index('phone', ['phone'])"), false);
  });

  it('keeps pair room membership embedded on pairRooms', async () => {
    const schemaSource = await readConvexFile('./schema.ts');
    assert.equal(schemaSource.includes('members: v.optional(v.array(v.object({'), true);
  });
});

describe('trip config api guards', () => {
  it('does not reintroduce updatedAt in tripConfig mutation args', async () => {
    const source = await readConvexFile('./tripConfig.ts');
    assert.equal(source.includes('updatedAt: v.string()'), false);
    assert.equal(source.includes('tripUpdatedAt'), false);
  });
});

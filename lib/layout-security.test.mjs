import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

describe('layout script hardening', () => {
  it('does not embed buymeacoffee remote widget script', async () => {
    const layoutPath = path.join(process.cwd(), 'app', 'layout.tsx');
    const source = await readFile(layoutPath, 'utf-8');

    assert.equal(source.includes('cdnjs.buymeacoffee.com'), false);
    assert.equal(source.includes('BMC-Widget'), false);
  });
});

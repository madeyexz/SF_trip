import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

describe('layout script hardening', () => {
  it('loads Buy Me a Coffee widget only through env-gated next/script', async () => {
    const layoutPath = path.join(process.cwd(), 'app', 'layout.tsx');
    const source = await readFile(layoutPath, 'utf-8');

    assert.equal(source.includes("import Script from 'next/script'"), true);
    assert.equal(source.includes('https://cdnjs.buymeacoffee.com/1.0.0/widget.prod.min.js'), true);
    assert.equal(source.includes('NEXT_PUBLIC_BUYMEACOFFEE_ID'), true);
    assert.equal(source.includes('data-name="BMC-Widget"'), true);
  });
});

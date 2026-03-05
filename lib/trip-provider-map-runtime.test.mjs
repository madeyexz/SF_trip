import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

describe('trip provider map runtime guardrails', () => {
  it('does not tear down the Google Map inside the initialization effect cleanup', async () => {
    const providerPath = path.join(process.cwd(), 'components', 'providers', 'TripProvider.tsx');
    const source = await readFile(providerPath, 'utf-8');

    const initEffectStart = source.indexOf("  useEffect(() => {\n    if (!mapRuntimeActive || mapsReady || mapRef.current || !mapElementRef.current || isInitializing) {");
    const nextEffectStart = source.indexOf("  useEffect(() => {\n    if (!mapsReady || !window.google?.maps || !mapRef.current) return;");
    assert.notEqual(initEffectStart, -1);
    assert.notEqual(nextEffectStart, -1);
    const initEffectSource = source.slice(initEffectStart, nextEffectStart);

    assert.match(initEffectSource, /return \(\) => \{\s*cancelled = true;\s*\};/);
    assert.equal(initEffectSource.includes('cleanupMapRuntime();'), false);
  });

  it('keeps cleanupMapRuntime in dedicated disable or unmount effects instead', async () => {
    const providerPath = path.join(process.cwd(), 'components', 'providers', 'TripProvider.tsx');
    const source = await readFile(providerPath, 'utf-8');

    assert.match(source, /if \(mapRuntimeActive\) return;\s*cleanupMapRuntime\(\);/);
    assert.match(source, /useEffect\(\(\) => \{\s*return \(\) => \{\s*cleanupMapRuntime\(\);\s*\};\s*\}, \[cleanupMapRuntime\]\);/);
  });
});

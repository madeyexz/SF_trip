import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createCrimeMapOverlay, createCrimeRequestGate, startCrimeMapRuntime } from './crime-map-overlay.ts';

let frames;
let canvases;
let overlays;
let observers;
let map;
let context;
let maps;

beforeEach(() => {
  frames = new Map();
  canvases = [];
  overlays = [];
  observers = [];
  let frameId = 0;
  context = {
    kernels: [],
    transforms: [],
    setTransform(...args) { this.transforms.push(args); },
    clearRect() { this.kernels = []; },
    createRadialGradient(...args) {
      const kernel = { args, stops: [] };
      this.kernels.push(kernel);
      return { addColorStop: (...stop) => kernel.stops.push(stop) };
    },
    fillRect() {}
  };
  globalThis.window = {
    devicePixelRatio: 2,
    requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame(id) { frames.delete(id); }
  };
  globalThis.document = {
    createElement() {
      const canvas = {
        style: {},
        setAttribute(name, value) { this[name] = value; },
        remove() { this.removed = true; },
        getContext() { return context; }
      };
      canvases.push(canvas);
      return canvas;
    }
  };
  globalThis.ResizeObserver = class {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe(target) { this.target = target; }
    disconnect() { this.disconnected = true; }
  };
  map = {
    size: { clientWidth: 400, clientHeight: 300 },
    center: { x: 200, y: 150 },
    getDiv() { return this.size; },
    getCenter() { return this.center; }
  };
  maps = {
    OverlayView: class {
      constructor() { overlays.push(this); }
      getMap() { return this.map; }
      getProjection() { return { fromLatLngToDivPixel: (point) => point }; }
      getPanes() { return { overlayLayer: { appendChild(canvas) { canvas.attached = true; } } }; }
      setMap(next) {
        if (this.map === next) return;
        if (this.map) this.onRemove();
        this.map = next;
        if (next) { this.onAdd(); this.draw(); }
      }
    }
  };
});

function flushFrames() {
  for (const [id, callback] of [...frames]) {
    frames.delete(id);
    callback();
  }
}

function createLayer(overrides = {}) {
  return createCrimeMapOverlay(maps, {
    data: [{ location: { x: 100, y: 80 }, weight: 1 }],
    radius: 20, opacity: 0.72, maxIntensity: 4, ...overrides
  });
}

describe('supported crime canvas overlay', () => {
  it('renders weighted red radial kernels without intercepting map clicks', () => {
    const layer = createLayer({
      data: [
        { location: { x: 100, y: 80 }, weight: 1 },
        { location: { x: 120, y: 80 }, weight: 2 },
        { location: { x: 5000, y: 80 }, weight: 2 },
        { location: { x: 10, y: 10 }, weight: NaN }
      ]
    });
    layer.setMap(map);
    flushFrames();
    assert.equal(canvases[0].style.cssText, 'position:absolute;pointer-events:none;');
    assert.equal(canvases[0]['aria-hidden'], 'true');
    assert.equal(canvases[0].width, 800);
    assert.equal(canvases[0].height, 600);
    assert.equal(canvases[0].style.opacity, '0.72');
    assert.equal(context.kernels.length, 2);
    assert.deepEqual(context.kernels[0].args, [100, 80, 0, 100, 80, 20]);
    assert.equal(context.kernels[0].stops[0][1], 'rgba(127,29,29,0.25)');
    assert.equal(context.kernels[1].stops[0][1], 'rgba(127,29,29,0.5)');
  });

  it('reprojects on pan/zoom, resizes and updates intensity/data without creating another layer', () => {
    const layer = createLayer();
    layer.setMap(map);
    flushFrames();
    map.center = { x: 300, y: 250 };
    overlays[0].draw();
    overlays[0].draw();
    assert.equal(frames.size, 1);
    flushFrames();
    assert.equal(canvases[0].style.left, '100px');
    assert.equal(canvases[0].style.top, '100px');
    map.size.clientWidth = 600;
    observers[0].callback();
    layer.setData([{ location: { x: 300, y: 250 }, weight: 3 }]);
    layer.setOptions({ radius: 30, opacity: 0.9, maxIntensity: 3 });
    flushFrames();
    assert.equal(canvases[0].width, 1200);
    assert.equal(canvases[0].style.opacity, '0.9');
    assert.deepEqual(context.kernels[0].args, [300, 150, 0, 300, 150, 30]);
    assert.equal(context.kernels[0].stops[0][1], 'rgba(127,29,29,0.96)');
    assert.equal(overlays.length, 1);
  });

  it('cleans up scheduled frames, canvas and resize observer when detached or hidden', () => {
    const layer = createLayer();
    layer.setMap(map);
    assert.equal(frames.size, 1);
    layer.setMap(null);
    assert.equal(frames.size, 0);
    assert.equal(canvases[0].removed, true);
    assert.equal(observers[0].disconnected, true);
    layer.setData([]);
    assert.equal(frames.size, 0);
    layer.setMap(map);
    flushFrames();
    assert.equal(canvases.length, 2);
    assert.equal(context.kernels.length, 0);
  });

  it('reports canvas/projection exceptions without throwing into the base map lifecycle', () => {
    const errors = [];
    const layer = createLayer({ onError: (error) => errors.push(error.message) });
    layer.setMap(map);
    overlays[0].getProjection = () => { throw new Error('projection failed'); };
    assert.doesNotThrow(flushFrames);
    assert.equal(layer.hasFailed(), true);
    assert.deepEqual(errors, ['projection failed']);
    assert.equal(canvases[0].removed, true);
    assert.equal(observers[0].disconnected, true);
    assert.doesNotThrow(() => { overlays[0].draw(); layer.setMap(null); });
    assert.equal(errors.length, 1);
  });

  it('contains attachment exceptions as optional layer errors', () => {
    const errors = [];
    const layer = createLayer({ onError: (error) => errors.push(error.message) });
    overlays[0].getPanes = () => { throw new Error('pane unavailable'); };
    assert.doesNotThrow(() => layer.setMap(map));
    assert.deepEqual(errors, ['pane unavailable']);
    assert.equal(canvases[0].removed, true);
    assert.equal(frames.size, 0);
  });

  it('contains Maps setMap exceptions and a missing 2d canvas context', () => {
    const errors = [];
    const brokenMapLayer = createLayer({ onError: error => errors.push(error.message) });
    overlays[0].setMap = () => { throw new Error('setMap failed'); };
    assert.doesNotThrow(() => brokenMapLayer.setMap(map));
    assert.equal(brokenMapLayer.hasFailed(), true);
    assert.deepEqual(errors, ['setMap failed']);
    const noCanvasLayer = createLayer({ onError: error => errors.push(error.message) });
    noCanvasLayer.setMap(map);
    canvases[0].getContext = () => null;
    assert.doesNotThrow(flushFrames);
    assert.equal(noCanvasLayer.hasFailed(), true);
    assert.equal(overlays[1].getMap(), null);
    assert.deepEqual(errors, ['setMap failed', 'Crime overlay canvas is unavailable.']);
  });
});

describe('crime request generation gate', () => {
  it('aborts superseded requests and prevents identical-URL stale responses from applying', () => {
    const gate = createCrimeRequestGate();
    const first = gate.begin();
    const second = gate.begin();
    assert.equal(first.signal.aborted, true);
    assert.equal(first.isCurrent(), false);
    assert.equal(second.isCurrent(), true);
    gate.invalidate();
    assert.equal(second.signal.aborted, true);
    assert.equal(second.isCurrent(), false);
    const afterRemount = gate.begin();
    assert.equal(afterRemount.isCurrent(), true);
    assert.equal(second.isCurrent(), false);
  });
});

describe('crime runtime visibility and disposal', () => {
  function setup(enabled) {
    const pending = new Map();
    const calls = [];
    let id = 0;
    const timers = {
      setTimeout(callback) { pending.set(++id, callback); return id; },
      clearTimeout(key) { pending.delete(key); },
      setInterval(callback) { pending.set(++id, callback); return id; },
      clearInterval(key) { pending.delete(key); }
    };
    let idle;
    let removed = 0;
    let invalidated = 0;
    let stopped = 0;
    const stop = startCrimeMapRuntime({
      enabled,
      map: { addListener(_name, callback) { idle = callback; return { remove() { removed++; } }; } },
      refresh: (options) => calls.push(options),
      invalidate() { invalidated++; },
      onStop() { stopped++; },
      timers
    });
    return { pending, calls, idle, stop, counts: () => ({ removed, invalidated, stopped }) };
  }

  it('does no fetching, listener registration or timer work while crime is OFF', () => {
    const runtime = setup(false);
    assert.equal(runtime.calls.length, 0);
    assert.equal(runtime.idle, undefined);
    assert.equal(runtime.pending.size, 0);
    assert.equal(overlays.length, 0);
    assert.equal(canvases.length, 0);
    runtime.stop();
    assert.deepEqual(runtime.counts(), { removed: 0, invalidated: 0, stopped: 0 });
  });

  it('refreshes once on activation, debounces idle and cancels all work when hidden', () => {
    const runtime = setup(true);
    assert.deepEqual(runtime.calls, [{ force: true }]);
    runtime.idle();
    runtime.idle();
    assert.equal(runtime.pending.size, 2);
    const staleCallbacks = [...runtime.pending.values()];
    runtime.stop();
    runtime.stop();
    runtime.idle();
    for (const callback of staleCallbacks) callback();
    assert.equal(runtime.calls.length, 1);
    assert.equal(runtime.pending.size, 0);
    assert.deepEqual(runtime.counts(), { removed: 1, invalidated: 1, stopped: 1 });
    const revealed = setup(true);
    assert.deepEqual(revealed.calls, [{ force: true }]);
    revealed.stop();
  });
});

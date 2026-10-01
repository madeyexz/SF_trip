type WeightedPoint = { location: any; weight: number };
type OverlayOptions = {
  data: WeightedPoint[];
  radius: number;
  opacity: number;
  maxIntensity: number;
  onError?: (error: unknown) => void;
};

/**
 * Crime is an optional layer. Use the supported OverlayView API, not the
 * visualization HeatmapLayer removed from current Google Maps releases.
 */
export function createCrimeMapOverlay(maps: any, initialOptions: OverlayOptions) {
  const overlay = new maps.OverlayView();
  let options = { ...initialOptions };
  let canvas: HTMLCanvasElement | null = null;
  let observer: ResizeObserver | null = null;
  let frame: number | null = null;
  let failed = false;

  function cancelDraw() {
    if (frame !== null) window.cancelAnimationFrame(frame);
    frame = null;
  }

  function remove() {
    cancelDraw();
    observer?.disconnect();
    observer = null;
    canvas?.remove();
    canvas = null;
  }

  function reportFailure(error: unknown) {
    if (failed) return;
    failed = true;
    remove();
    // Release Maps' own listeners too if failure happened after attachment.
    try { overlay.setMap(null); } catch { /* The optional layer is already inert. */ }
    options.onError?.(error);
  }

  function draw() {
    if (failed || !canvas) return;
    try {
      const map = overlay.getMap();
      const projection = overlay.getProjection();
      if (!map || !projection) return;
      const mapDiv = map.getDiv();
      const width = mapDiv.clientWidth;
      const height = mapDiv.clientHeight;
      if (!width || !height) return;
      const center = projection.fromLatLngToDivPixel(map.getCenter());
      if (!center) return;
      const left = center.x - width / 2;
      const top = center.y - height / 2;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.style.left = `${left}px`;
      canvas.style.top = `${top}px`;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      canvas.style.opacity = String(options.opacity);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Crime overlay canvas is unavailable.');
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      const radius = Math.max(1, options.radius);
      for (const point of options.data) {
        const pixel = projection.fromLatLngToDivPixel(point.location);
        if (!pixel || !Number.isFinite(pixel.x) || !Number.isFinite(pixel.y)) continue;
        const x = pixel.x - left;
        const y = pixel.y - top;
        if (x < -radius || y < -radius || x > width + radius || y > height + radius) continue;
        const weight = Number(point.weight);
        if (!Number.isFinite(weight) || weight <= 0) continue;
        // Overlapping weighted radial kernels naturally darken crowded areas.
        const intensity = Math.min(0.96, weight / Math.max(0.1, options.maxIntensity));
        const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, `rgba(127,29,29,${intensity})`);
        gradient.addColorStop(0.35, `rgba(225,29,72,${intensity * 0.7})`);
        gradient.addColorStop(0.7, `rgba(248,113,113,${intensity * 0.25})`);
        gradient.addColorStop(1, 'rgba(254,202,202,0)');
        context.fillStyle = gradient;
        context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      }
    } catch (error) {
      reportFailure(error);
    }
  }

  function scheduleDraw() {
    if (failed || frame !== null || !canvas) return;
    frame = window.requestAnimationFrame(() => {
      frame = null;
      draw();
    });
  }

  overlay.onAdd = () => {
    try {
      canvas = document.createElement('canvas');
      canvas.style.cssText = 'position:absolute;pointer-events:none;';
      canvas.setAttribute('aria-hidden', 'true');
      overlay.getPanes().overlayLayer.appendChild(canvas);
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(scheduleDraw);
        observer.observe(overlay.getMap().getDiv());
      }
      scheduleDraw();
    } catch (error) {
      reportFailure(error);
    }
  };
  overlay.draw = scheduleDraw;
  overlay.onRemove = remove;

  return {
    hasFailed: () => failed,
    setMap(map: any) {
      try {
        overlay.setMap(map);
      } catch (error) {
        reportFailure(error);
      }
      // Also clean up if an API throws before calling onRemove.
      if (!map) remove();
    },
    setData(data: WeightedPoint[]) {
      options = { ...options, data };
      scheduleDraw();
    },
    setOptions(next: Partial<OverlayOptions>) {
      options = { ...options, ...next };
      scheduleDraw();
    }
  };
}

/** Aborts superseded requests and rejects stale results even for identical URLs. */
export function createCrimeRequestGate() {
  let generation = 0;
  let controller: AbortController | null = null;
  return {
    invalidate() {
      generation += 1;
      controller?.abort();
      controller = null;
    },
    begin() {
      controller?.abort();
      controller = new AbortController();
      const requestGeneration = ++generation;
      const requestController = controller;
      return {
        signal: requestController.signal,
        isCurrent: () => generation === requestGeneration && !requestController.signal.aborted
      };
    }
  };
}

/** Own all background work in one disposable, visibility-scoped runtime. */
export function startCrimeMapRuntime({
  enabled, map, refresh, invalidate, onStop, timers = window,
  idleDelay = 450, refreshInterval = 120000
}: {
  enabled: boolean;
  map: any;
  refresh: (options?: { force?: boolean }) => void | Promise<void>;
  invalidate: () => void;
  onStop: () => void;
  timers?: Pick<Window, 'setTimeout' | 'clearTimeout' | 'setInterval' | 'clearInterval'>;
  idleDelay?: number;
  refreshInterval?: number;
}) {
  if (!enabled || !map) return () => {};
  let stopped = false;
  let debounce: number | null = null;
  void refresh({ force: true });
  const listener = map.addListener('idle', () => {
    if (stopped) return;
    if (debounce !== null) timers.clearTimeout(debounce);
    debounce = timers.setTimeout(() => {
      debounce = null;
      if (!stopped) void refresh();
    }, idleDelay);
  });
  const interval = timers.setInterval(() => {
    if (!stopped) void refresh({ force: true });
  }, refreshInterval);
  return () => {
    if (stopped) return;
    stopped = true;
    invalidate();
    if (debounce !== null) timers.clearTimeout(debounce);
    timers.clearInterval(interval);
    listener.remove();
    onStop();
  };
}

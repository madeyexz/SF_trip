export function getOrCreateCoalescedPromise<K, V>(
  inFlightMap: Map<K, Promise<V>>,
  key: K,
  createPromise: () => Promise<V>
) {
  const existing = inFlightMap.get(key);
  if (existing) {
    return existing;
  }

  const promise = Promise.resolve()
    .then(() => createPromise())
    .finally(() => {
      if (inFlightMap.get(key) === promise) {
        inFlightMap.delete(key);
      }
    });

  inFlightMap.set(key, promise);
  return promise;
}

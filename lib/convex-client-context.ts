import { AsyncLocalStorage } from 'node:async_hooks';

const convexClientStorage = new AsyncLocalStorage<any>();

export function runWithConvexClient<T>(client: any, fn: () => Promise<T> | T) {
  return convexClientStorage.run(client, fn);
}

export function getScopedConvexClient() {
  return convexClientStorage.getStore() || null;
}


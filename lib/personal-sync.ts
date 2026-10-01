import { getOrCreateCoalescedPromise } from './async-coalesce.ts';

export function runPersonalSync<T>(
  inFlight: Map<string, Promise<T>>,
  profile: { userId?: unknown } | null,
  sync: () => Promise<T>
) {
  const userId = profile?.userId;
  if (typeof userId !== 'string' || !userId.trim()) {
    throw new Error('Authenticated user identity is missing.');
  }
  return getOrCreateCoalescedPromise(inFlight, userId, sync);
}

type JsonFetcher = (url: string, options?: { signal?: AbortSignal }) => Promise<any>;

// Authentication changes must never reuse another account's resolved payload.
export async function loadTripBootstrapPayload(fetcher: JsonFetcher, signal?: AbortSignal) {
  const [config, eventsPayload, sourcesPayload, mePayload] = await Promise.all([
    fetcher('/api/config', { signal }),
    fetcher('/api/events', { signal }),
    fetcher('/api/sources', { signal }),
    fetcher('/api/me', { signal })
  ]);
  if (!mePayload?.authenticated || !mePayload?.profile?.userId) {
    throw new Error('Your account could not be verified. Please sign in again.');
  }
  return { config, eventsPayload, sourcesPayload, mePayload };
}

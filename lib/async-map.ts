export async function mapAsyncInParallel<TInput, TOutput>(
  items: TInput[],
  mapper: (item: TInput, index: number) => Promise<TOutput>
): Promise<TOutput[]> {
  return Promise.all(items.map((item, index) => mapper(item, index)));
}

export async function mapAsyncWithConcurrency<TInput, TOutput>(
  items: TInput[],
  concurrency: number,
  mapper: (item: TInput, index: number) => Promise<TOutput>
): Promise<TOutput[]> {
  const limit = Math.max(1, Number(concurrency) || 1);
  const results = new Array<TOutput>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker())
  );

  return results;
}

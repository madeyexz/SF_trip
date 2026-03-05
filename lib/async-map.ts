export async function mapAsyncInParallel<TInput, TOutput>(
  items: TInput[],
  mapper: (item: TInput, index: number) => Promise<TOutput>
): Promise<TOutput[]> {
  return Promise.all(items.map((item, index) => mapper(item, index)));
}

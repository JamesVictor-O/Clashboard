export function getEventScanStartBlock(latestBlock: bigint, fallbackRange = 12000n): bigint {
  const configured =
    process.env.NEXT_PUBLIC_EVENT_START_BLOCK ??
    process.env.NEXT_PUBLIC_CONTRACTS_DEPLOY_BLOCK;

  if (configured && /^\d+$/.test(configured)) {
    const block = BigInt(configured);
    return block < latestBlock ? block : 0n;
  }

  return latestBlock > fallbackRange ? latestBlock - fallbackRange : 0n;
}

export function blockRanges(startBlock: bigint, latestBlock: bigint, chunkSize = 2000n) {
  const ranges: Array<{ fromBlock: bigint; toBlock: bigint }> = [];
  for (let fromBlock = startBlock; fromBlock <= latestBlock; fromBlock += chunkSize) {
    const toBlock =
      fromBlock + chunkSize - 1n < latestBlock
        ? fromBlock + chunkSize - 1n
        : latestBlock;
    ranges.push({ fromBlock, toBlock });
  }
  return ranges;
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  task: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  let cursor = 0;

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        results[index] = await task(items[index], index);
      }
    })
  );

  return results;
}

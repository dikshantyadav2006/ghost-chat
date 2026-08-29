/** Inclusive [start, end] chunk range. */
export type ChunkRange = [start: number, end: number];

export function rangeCount(ranges: ChunkRange[]): number {
  let count = 0;
  for (const [start, end] of ranges) count += end - start + 1;
  return count;
}

export function mergeRanges(ranges: ChunkRange[]): ChunkRange[] {
  const sorted = ranges
    .filter(([start, end]) => start <= end)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: ChunkRange[] = [];
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1] + 1) {
      if (end > last[1]) last[1] = end;
    } else {
      merged.push([start, end]);
    }
  }
  return merged;
}

export function rangesFromSeqs(seqs: number[]): ChunkRange[] {
  const sorted = [...seqs].sort((a, b) => a - b);
  const ranges: ChunkRange[] = [];
  for (const seq of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && seq === last[1] + 1) {
      last[1] = seq;
    } else {
      ranges.push([seq, seq]);
    }
  }
  return ranges;
}

export function missingRanges(total: number, received: ChunkRange[]): ChunkRange[] {
  const have = mergeRanges(received);
  const missing: ChunkRange[] = [];
  let cursor = 0;
  for (const [start, end] of have) {
    if (cursor < start) missing.push([cursor, start - 1]);
    if (end + 1 > cursor) cursor = end + 1;
  }
  if (cursor < total) missing.push([cursor, total - 1]);
  return missing;
}

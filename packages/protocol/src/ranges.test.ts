import { describe, expect, it } from "vitest";
import {
  type ChunkRange,
  mergeRanges,
  missingRanges,
  rangeCount,
  rangesFromSeqs,
} from "./ranges";

describe("rangeCount", () => {
  it("counts inclusive chunk ranges", () => {
    expect(rangeCount([[0, 8234]])).toBe(8235);
    expect(rangeCount([[0, 8234], [9100, 11999]])).toBe(8235 + 2900);
  });
});

describe("mergeRanges", () => {
  it("merges overlapping and adjacent ranges in sorted order", () => {
    expect(mergeRanges([[5, 10], [0, 2], [3, 4], [8, 12], [20, 21]])).toEqual([
      [0, 12],
      [20, 21],
    ]);
  });

  it("merges adjacent ranges into one", () => {
    expect(mergeRanges([[1, 8234], [8235, 9100]])).toEqual([[1, 9100]]);
  });

  it("drops invalid inverted ranges", () => {
    expect(mergeRanges([[9, 1], [2, 3]])).toEqual([[2, 3]]);
  });
});

describe("rangesFromSeqs", () => {
  it("builds contiguous ranges from a seq list", () => {
    expect(rangesFromSeqs([0, 1, 2, 5, 6, 9])).toEqual([
      [0, 2],
      [5, 6],
      [9, 9],
    ]);
  });

  it("handles empty input", () => {
    expect(rangesFromSeqs([])).toEqual([]);
  });
});

describe("missingRanges", () => {
  it("computes gaps for a 20000-chunk transfer", () => {
    const received: ChunkRange[] = [[0, 8234], [9100, 11999]];
    expect(missingRanges(20000, received)).toEqual([
      [8235, 9099],
      [12000, 19999],
    ]);
  });

  it("returns empty when everything is received", () => {
    expect(missingRanges(3, [[0, 2]])).toEqual([]);
  });

  it("returns the full file when nothing is received", () => {
    expect(missingRanges(5, [])).toEqual([[0, 4]]);
  });
});

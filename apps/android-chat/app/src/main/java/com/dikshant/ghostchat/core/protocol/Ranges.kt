package com.dikshant.ghostchat.core.protocol

/**
 * Chunk range helpers for resumable file transfer. Ranges are inclusive
 * [start, end] chunk indices, matching @ghost/protocol ranges.ts.
 */
typealias Range = Pair<Int, Int>

/** Merges overlapping/adjacent ranges. */
fun mergeRanges(ranges: List<Range>): List<Range> {
    if (ranges.isEmpty()) return emptyList()
    val sorted = ranges.sortedBy { it.first }
    val merged = mutableListOf<Range>()
    for ((s, e) in sorted) {
        val last = merged.lastOrNull()
        if (last != null && s <= last.second + 1) {
            merged[merged.size - 1] = last.first to maxOf(last.second, e)
        } else {
            merged.add(s to e)
        }
    }
    return merged
}

/** Turns individual chunk indices into merged ranges. */
fun rangesFromChunks(chunks: List<Int>): List<Range> {
    val unique = chunks.distinct().sorted()
    val ranges = mutableListOf<Range>()
    for (c in unique) {
        val last = ranges.lastOrNull()
        if (last != null && c == last.second + 1) {
            ranges[ranges.size - 1] = last.first to c
        } else {
            ranges.add(c to c)
        }
    }
    return ranges
}

/** Count of chunks covered by the given ranges. */
fun rangeCount(ranges: List<Range>): Int = ranges.sumOf { it.second - it.first + 1 }

/** Complementary ranges: all chunk indices [0, total) not covered by `received`. */
fun missingRanges(total: Int, received: List<Range>): List<Range> {
    val receivedClean = mergeRanges(received.filter { it.first in 0 until total && it.second in 0 until total })
    val missing = mutableListOf<Range>()
    var cursor = 0
    for ((s, e) in receivedClean.sortedBy { it.first }) {
        if (s > cursor) missing.add(cursor to (s - 1))
        cursor = e + 1
        if (cursor >= total) return missing
    }
    if (cursor < total) missing.add(cursor to (total - 1))
    return missing
}

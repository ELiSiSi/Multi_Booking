import type { InstantWindow } from './types.js';

export function overlaps(
  a: InstantWindow,
  b: InstantWindow,
): boolean {
  return a.start.getTime() < b.end.getTime() && a.end.getTime() > b.start.getTime();
}

export function mergeIntervals(
  intervals: InstantWindow[],
): InstantWindow[] {
  if (intervals.length === 0) return [];

  const sorted = [...intervals].sort(
    (a, b) => a.start.getTime() - b.start.getTime(),
  );

  const merged: InstantWindow[] = [];
  let current = sorted[0]!;

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i]!;
    if (next.start.getTime() <= current.end.getTime()) {
      if (next.end.getTime() > current.end.getTime()) {
        current = { start: current.start, end: next.end };
      }
    } else {
      merged.push(current);
      current = next;
    }
  }

  merged.push(current);
  return merged;
}

export function subtractIntervals(
  base: InstantWindow[],
  remove: InstantWindow[],
): InstantWindow[] {
  if (base.length === 0) return [];
  if (remove.length === 0) return [...base];

  const mergedRemove = mergeIntervals(remove);
  const result: InstantWindow[] = [];

  for (const window of base) {
    let pieces: InstantWindow[] = [window];

    for (const cut of mergedRemove) {
      const nextPieces: InstantWindow[] = [];

      for (const piece of pieces) {
        if (!overlaps(piece, cut)) {
          nextPieces.push(piece);
          continue;
        }

        if (cut.start.getTime() > piece.start.getTime()) {
          nextPieces.push({ start: piece.start, end: cut.start });
        }

        if (cut.end.getTime() < piece.end.getTime()) {
          nextPieces.push({ start: cut.end, end: piece.end });
        }
      }

      pieces = nextPieces;
    }

    for (const piece of pieces) {
      if (piece.start.getTime() < piece.end.getTime()) {
        result.push(piece);
      }
    }
  }

  return result;
}
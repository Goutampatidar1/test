/** Build visible page numbers from a fixed window start. */
export function getPaginationRangeFromWindow(windowStart, totalPages, windowSize = 3) {
  const total = Number(totalPages) || 0;
  const size = Math.max(1, windowSize);
  const start = Math.max(1, Number(windowStart) || 1);

  if (total <= 0) return [];
  if (total <= size) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }

  const maxStart = Math.max(1, total - size + 1);
  const clampedStart = Math.min(start, maxStart);
  const end = Math.min(clampedStart + size - 1, total);

  return Array.from({ length: end - clampedStart + 1 }, (_, index) => clampedStart + index);
}

/** Window start when jumping directly to a page number. */
export function getPaginationWindowStartForPage(targetPage, totalPages, windowSize = 3) {
  const page = Math.max(1, Number(targetPage) || 1);
  const total = Number(totalPages) || 0;
  const size = Math.max(1, windowSize);

  if (total <= size) return 1;

  const maxStart = Math.max(1, total - size + 1);
  return Math.min(Math.max(1, page - size + 1), maxStart);
}

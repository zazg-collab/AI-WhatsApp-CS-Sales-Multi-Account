/** Hard ceiling for any CSV/bulk export query — prevents one admin request
 * from pulling an unbounded result set (and its relations) into memory. */
export const MAX_EXPORT_ROWS = 5000;

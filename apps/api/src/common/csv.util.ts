/**
 * CSV-safe field encoding (H7 — formula/CSV injection).
 *
 * Spreadsheet apps execute cell values that begin with =, +, -, @, or a
 * leading control char (tab/CR). An attacker-controlled name/note could
 * therefore run a formula when an exported CSV is opened. We neutralize the
 * leading character by prefixing a single quote, then quote the value and
 * escape embedded quotes.
 */
const FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  let str = String(value);
  if (str.length > 0 && FORMULA_PREFIXES.includes(str[0])) {
    str = `'${str}`;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

/** Join a row of already-raw values into a CSV-safe line. */
export function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(',');
}

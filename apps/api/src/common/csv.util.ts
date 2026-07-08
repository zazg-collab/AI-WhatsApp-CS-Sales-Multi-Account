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

/** Parse one RFC-4180 CSV line into raw string fields. */
export function parseCsvRow(line: string): string[] {
  const fields: string[] = [];
  let i = 0;
  while (i <= line.length) {
    if (line[i] === '"') {
      let val = '';
      i++; // skip opening quote
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') { val += '"'; i += 2; }
        else if (line[i] === '"') { i++; break; }
        else { val += line[i++]; }
      }
      fields.push(val);
      if (line[i] === ',') i++;
    } else {
      const end = line.indexOf(',', i);
      if (end === -1) { fields.push(line.slice(i)); break; }
      fields.push(line.slice(i, end));
      i = end + 1;
    }
  }
  return fields;
}

export const CATALOGUE_CSV_HEADERS = [
  "name", "sku", "description", "category", "kind", "unit_price_minor",
  "tax_rate_bps", "tax_mode", "track_inventory", "service_duration_minutes",
] as const;

export type CsvRecord = { row: number; values: Record<string, string> };

/** Parses RFC 4180-style comma-separated rows, including quoted commas and newlines. */
export function parseCsv(source: string): { headers: string[]; records: CsvRecord[]; error?: string } {
  const input = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false, closedQuote = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') { quoted = false; closedQuote = true; }
      else cell += char;
    } else if (closedQuote && char !== "," && char !== "\r" && char !== "\n") {
      return { headers: [], records: [], error: "Unexpected text after a closing CSV quote." };
    } else if (char === '"') {
      if (cell.length) return { headers: [], records: [], error: "A quote must begin an empty CSV field." };
      quoted = true;
    } else if (char === ",") { row.push(cell); cell = ""; closedQuote = false; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = ""; closedQuote = false;
    } else cell += char;
  }
  if (quoted) return { headers: [], records: [], error: "The CSV ends inside a quoted field." };
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  while (rows.length && rows[rows.length - 1].every((value) => value.trim() === "")) rows.pop();
  if (!rows.length) return { headers: [], records: [], error: "The CSV file is empty." };
  const headers = rows.shift()!.map((value) => value.trim().toLowerCase());
  if (new Set(headers).size !== headers.length || headers.some((header) => !header)) return { headers, records: [], error: "CSV column names must be present and unique." };
  const records: CsvRecord[] = [];
  for (let index = 0; index < rows.length; index++) {
    if (rows[index].length !== headers.length) return { headers, records: [], error: `Row ${index + 2} has ${rows[index].length} fields; expected ${headers.length}.` };
    records.push({ row: index + 2, values: Object.fromEntries(headers.map((header, column) => [header, rows[index][column]])) });
  }
  return { headers, records };
}

export function makeCsv(headers: readonly string[], records: readonly (readonly unknown[])[]): string {
  const cell = (value: unknown) => {
    let text = String(value ?? "");
    if (/^[\s\u0000-\u001f]*[=+@]/.test(text) || /^[\s\u0000-\u001f]*-/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return [headers, ...records].map((record) => record.map(cell).join(",")).join("\r\n") + "\r\n";
}

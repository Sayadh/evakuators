/**
 * Minimal RFC 4180 CSV serialisation — no dependency for something this small.
 *
 * Only handles what a Postgres-sourced admin export can actually contain:
 * strings with commas, quotes or newlines in them (a company name, in
 * practice). Nothing here needs to parse CSV, only ever write it.
 */

/** Quotes a field only when it needs it, doubling any embedded quotes */
function csvField(value: string): string {
  if (!/[",\n\r]/.test(value)) return value
  return `"${value.replace(/"/g, '""')}"`
}

/**
 * Rows to a CSV string, `\r\n` line endings (the format's own spec, and what
 * Excel expects rather than merely tolerates).
 *
 * A leading UTF-8 BOM is NOT added here — see `toExcelCsv` for why Armenian
 * text needs it and why that decision belongs to the caller, not to every row
 * this function will ever be asked to serialise.
 */
export function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(csvField).join(',')).join('\r\n')
}

/**
 * Same as `toCsv`, prefixed with a UTF-8 BOM.
 *
 * Excel does not sniff CSV encoding — without the BOM it opens a UTF-8 file
 * as Windows-1252 and every Armenian character in it renders as garbage. A
 * BOM is invisible to every other spreadsheet tool and to `cat`/`less`, so
 * this is safe to use for any CSV a person might double-click open, and is
 * the only reason a "for Excel" variant exists separately from `toCsv`.
 *
 * `String.fromCharCode(0xfeff)`, not a raw BOM byte pasted into the source —
 * a literal BOM character sitting in a file reads as invisible/irregular
 * whitespace to a linter (and to the next person editing this file), so the
 * numeric form is what stays grep-able and lint-clean.
 */
export function toExcelCsv(rows: string[][]): string {
  return String.fromCharCode(0xfeff) + toCsv(rows)
}

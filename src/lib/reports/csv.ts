import "server-only";

/**
 * Generate a CSV string from an array of objects. Cells with commas, quotes,
 * or newlines are double-quoted; double-quotes inside such cells are doubled.
 * Conforms to RFC 4180.
 *
 * Pass the column order explicitly so the output is deterministic.
 */
export function toCSV<T extends Record<string, unknown>>(
  rows: T[],
  columns: Array<{ key: keyof T; header: string }>
): string {
  const lines: string[] = [];
  lines.push(columns.map((c) => escapeCell(c.header)).join(","));

  for (const row of rows) {
    lines.push(
      columns
        .map((c) => {
          const value = row[c.key];
          if (value === null || value === undefined) return "";
          if (typeof value === "object") return escapeCell(JSON.stringify(value));
          return escapeCell(String(value));
        })
        .join(",")
    );
  }
  // CRLF as per RFC 4180; Excel and Sheets handle this best.
  return lines.join("\r\n") + "\r\n";
}

function escapeCell(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Build the Response object for a CSV download. Adds a BOM so Excel opens
 * the file with correct UTF-8 encoding by default.
 */
export function csvResponse(csv: string, filename: string): Response {
  // UTF-8 BOM — makes Excel open Sinhala/Tamil characters correctly
  const body = "\uFEFF" + csv;
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${sanitizeFilename(filename)}"`,
      // Prevent caching of sensitive exports
      "Cache-Control": "private, no-store",
    },
  });
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

/* ==========================================================================
   OpsFlow - CSV / Excel export helpers.
   Exports whatever the CALLER already fetched from the API (respecting
   whatever role-scoped queryset the server returned) - never a separate,
   unauthenticated data pull.
   ========================================================================== */

function exportToCSV(filename, rows, columns) {
  if (!rows || !rows.length) { toast("Nothing to export.", "warning"); return; }
  const header = columns.map((c) => csvEscape(c.label)).join(",");
  const lines = rows.map((row) => columns.map((c) => csvEscape(c.value(row))).join(","));
  const csv = [header, ...lines].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, `${filename}.csv`);
}

function csvEscape(value) {
  const str = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function exportToExcel(filename, rows, columns) {
  if (!rows || !rows.length) { toast("Nothing to export.", "warning"); return; }
  if (typeof XLSX === "undefined") { toast("Excel export library failed to load (requires internet on first use).", "error"); return; }
  const data = rows.map((row) => {
    const obj = {};
    columns.forEach((c) => { obj[c.label] = c.value(row); });
    return obj;
  });
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

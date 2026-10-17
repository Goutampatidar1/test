import Swal from "sweetalert2";

function csvEscape(value) {
  const raw = value == null ? "" : String(value);
  return `"${raw.replace(/"/g, '""')}"`;
}

/** Downloads `rows` (arrays of cell values) as `<prefix>-<timestamp>.csv`. */
export async function exportCsv(prefix, headers, rows) {
  if (!rows.length) {
    await Swal.fire({ icon: "info", title: "No data to export", text: "There are no records in the current list." });
    return;
  }
  const csv = [headers.map(csvEscape).join(","), ...rows.map((r) => r.map(csvEscape).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${prefix}-${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

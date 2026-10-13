const AUTO_CLASS = {
  sno: "list-table__sno",
  actions: "data-table__actions-col",
};

/**
 * Bordered list table. `columns` are `{ key, label, className }` (falsy entries are skipped);
 * loading and empty rows always span every column.
 */
export function ListTable({
  columns,
  rowCount,
  loading = false,
  error = "",
  emptyText = "No records found.",
  loadingText = "Loading...",
  className = "",
  children,
}) {
  const cols = columns.filter(Boolean);
  let body = children;
  if (!rowCount) {
    body = (
      <tr className="list-table__placeholder">
        <td colSpan={cols.length}>{loading ? loadingText : emptyText}</td>
      </tr>
    );
  }

  return (
    <>
      {error ? (
        <p className="user-list-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="table-scroll list-table-wrap">
        <table className={`data-table list-table${className ? ` ${className}` : ""}`} aria-busy={loading || undefined}>
          <thead>
            <tr>
              {cols.map((col) => (
                <th key={col.key} scope="col" className={[AUTO_CLASS[col.key], col.className].filter(Boolean).join(" ") || undefined}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{body}</tbody>
        </table>
      </div>
    </>
  );
}

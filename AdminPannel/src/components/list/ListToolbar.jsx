import { AdminSearchField } from "../AdminSearchField.jsx";

export function ListToolbar({ search, onSearch, placeholder = "Search...", children, canReset = false, onReset }) {
  return (
    <div className="list-toolbar">
      {onSearch ? (
        <AdminSearchField
          className="list-toolbar__search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
        />
      ) : null}
      {children}
      {canReset && onReset ? (
        <button type="button" className="btn btn--ghost list-toolbar__reset" onClick={onReset}>
          Reset
        </button>
      ) : null}
    </div>
  );
}

/** Toolbar select; `options` are `{ value, label }`. */
export function ListFilterSelect({ value, onChange, options, label, disabled = false }) {
  return (
    <select
      className="user-list-status-select"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      disabled={disabled}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

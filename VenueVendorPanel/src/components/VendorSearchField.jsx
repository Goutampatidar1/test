const SEARCH_ICON = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3-3" />
  </svg>
);

export function VendorSearchField({
  value,
  onChange,
  placeholder = "Search...",
  id,
  name,
  className = "",
  disabled = false,
  "aria-label": ariaLabel,
  inputRef,
  ...rest
}) {
  return (
    <div className={`vendor-search-field${className ? ` ${className}` : ""}`}>
      <span className="vendor-search-field__icon">{SEARCH_ICON}</span>
      <input
        ref={inputRef}
        type="search"
        id={id}
        name={name}
        className="vendor-search-field__input"
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        disabled={disabled}
        aria-label={ariaLabel || placeholder}
        {...rest}
      />
    </div>
  );
}

export function VendorToolbarSelect({
  value,
  onChange,
  children,
  className = "",
  disabled = false,
  "aria-label": ariaLabel,
  ...rest
}) {
  return (
    <div className={`vendor-toolbar-select-wrap${className ? ` ${className}` : ""}`}>
      <select
        className="vendor-toolbar-select"
        value={value}
        onChange={onChange}
        disabled={disabled}
        aria-label={ariaLabel}
        {...rest}
      >
        {children}
      </select>
    </div>
  );
}

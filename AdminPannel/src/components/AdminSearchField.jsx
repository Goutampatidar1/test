const SEARCH_ICON = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

export function AdminSearchField({
  value,
  onChange,
  placeholder = "Search...",
  id,
  name,
  className = "",
  style,
  onSubmit,
  disabled = false,
  "aria-label": ariaLabel,
  inputRef,
  ...rest
}) {
  const field = (
    <div className={`search-field${className ? ` ${className}` : ""}`} style={style}>
      <span className="search-field__icon" aria-hidden="true">
        {SEARCH_ICON}
      </span>
      <input
        ref={inputRef}
        type="search"
        id={id}
        name={name}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        disabled={disabled}
        aria-label={ariaLabel || placeholder}
        {...rest}
      />
    </div>
  );

  if (onSubmit) {
    return (
      <form className="search-field-form" onSubmit={onSubmit}>
        {field}
      </form>
    );
  }

  return field;
}

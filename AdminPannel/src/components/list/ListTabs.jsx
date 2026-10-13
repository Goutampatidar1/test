/** Underlined tabs with optional count badges; `tabs` are `{ key, label }`, "" is the usual "All" key. */
export function ListTabs({ tabs, active, counts, onChange, label = "List filter", className = "" }) {
  return (
    <div className={`settings-tabs list-tabs${className ? ` ${className}` : ""}`} role="tablist" aria-label={label}>
      {tabs.map((tab) => {
        const isActive = active === tab.key;
        const count = counts?.[tab.key];
        return (
          <button
            key={tab.key || "all"}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`settings-tabs__tab${isActive ? " settings-tabs__tab--active" : ""}`}
            onClick={() => onChange(tab.key)}
          >
            {tab.label}
            {typeof count === "number" ? <span className="list-tabs__count">{count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

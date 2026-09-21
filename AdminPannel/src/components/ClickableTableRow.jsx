import { useNavigate } from "react-router-dom";

const IGNORE_SELECTOR = "a, button, input, select, textarea, label, [data-no-row-nav]";

export function ClickableTableRow({ to, onOpen, relative, className = "", children, ...rest }) {
  const navigate = useNavigate();

  const open = () => {
    if (typeof onOpen === "function") {
      onOpen();
      return;
    }
    if (to) {
      navigate(to, relative ? { relative } : undefined);
    }
  };

  return (
    <tr
      className={`data-table__row--clickable ${className}`.trim()}
      role="link"
      tabIndex={0}
      onClick={(event) => {
        if (event.defaultPrevented) return;
        if (event.target.closest(IGNORE_SELECTOR)) return;
        open();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        open();
      }}
      {...rest}
    >
      {children}
    </tr>
  );
}

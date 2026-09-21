function Icon({ children, className = "" }) {
  return (
    <svg
      className={`vendor-nav-icon admin-nav-icon ${className}`.trim()}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function NavIcon({ name, className = "" }) {
  switch (name) {
    case "pages":
      return (
        <Icon className={className}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
        </Icon>
      );
    case "chevron":
      return (
        <Icon className={className}>
          <path d="M6 9l6 6 6-6" />
        </Icon>
      );
    case "logout":
      return (
        <Icon className={className}>
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <path d="M16 17l5-5-5-5M21 12H9" />
        </Icon>
      );
    case "bell":
      return (
        <Icon className={className}>
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </Icon>
      );
    case "menu":
      return (
        <Icon className={className}>
          <line x1="4" y1="6" x2="20" y2="6" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="18" x2="20" y2="18" />
        </Icon>
      );
    case "close":
      return (
        <Icon className={className}>
          <line x1="6" y1="6" x2="18" y2="18" />
          <line x1="6" y1="18" x2="18" y2="6" />
        </Icon>
      );
    case "venues":
      return (
        <Icon className={className}>
          <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" />
        </Icon>
      );
    case "bookings":
      return (
        <Icon className={className}>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </Icon>
      );
    case "payments":
      return (
        <Icon>
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <path d="M2 10h20" />
        </Icon>
      );
    case "plans":
      return (
        <Icon className={className}>
          <path d="M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z" />
        </Icon>
      );
    case "video":
      return (
        <Icon className={className}>
          <rect x="2" y="6" width="14" height="12" rx="2" />
          <path d="m16 10 6-3v10l-6-3z" />
        </Icon>
      );
    case "profile":
      return (
        <Icon className={className}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20c1.5-4 6-6 8-6s6.5 2 8 6" />
        </Icon>
      );
    case "dashboard":
    default:
      return (
        <Icon className={className}>
          <path d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5z" />
        </Icon>
      );
  }
}

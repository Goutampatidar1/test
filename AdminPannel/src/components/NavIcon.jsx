function Icon({ children, className = "" }) {
  return (
    <svg
      className={`admin-nav-icon ${className}`.trim()}
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

export function NavIcon({ name }) {
  switch (name) {
    case "grid":
      return (
        <Icon>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </Icon>
      );
    case "users":
      return (
        <Icon>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </Icon>
      );
    case "store":
      return (
        <Icon>
          <path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z" />
          <path d="M3 9V7a2 2 0 0 1 1-1.73l7-4a2 2 0 0 1 2 0l7 4A2 2 0 0 1 21 7v2" />
          <path d="M12 22V12" />
        </Icon>
      );
    case "map":
      return (
        <Icon>
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </Icon>
      );
    case "map-pin":
      return (
        <Icon>
          <path d="M12 21s-8-4.5-8-11a8 8 0 0 1 16 0c0 6.5-8 11-8 11z" />
          <circle cx="12" cy="10" r="3" />
        </Icon>
      );
    case "truck":
      return (
        <Icon>
          <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
          <path d="M15 18H9" />
          <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
          <circle cx="17" cy="18" r="2" />
          <circle cx="7" cy="18" r="2" />
        </Icon>
      );
    case "cart":
      return (
        <Icon>
          <circle cx="9" cy="21" r="1" />
          <circle cx="20" cy="21" r="1" />
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
        </Icon>
      );
    case "box":
      return (
        <Icon>
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <path d="M3.27 6.96 12 12.01l8.73-5.05" />
          <path d="M12 22.08V12" />
        </Icon>
      );
    case "folder":
      return (
        <Icon>
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </Icon>
      );
    case "folders":
      return (
        <Icon>
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          <path d="M2 7h20" />
        </Icon>
      );
    case "layers":
      return (
        <Icon>
          <path d="m12.83 2.18 8 3.75a1 1 0 0 1 0 1.82l-8 3.75a1 1 0 0 1-.83 0l-8-3.75a1 1 0 0 1 0-1.82l8-3.75a1 1 0 0 1 .83 0Z" />
          <path d="m2.18 12.08 8 3.75a1 1 0 0 0 .83 0l8-3.75" />
          <path d="m2.18 17.92 8 3.75a1 1 0 0 0 .83 0l8-3.75" />
        </Icon>
      );
    case "sliders":
      return (
        <Icon>
          <path d="M4 21v-7" />
          <path d="M4 10V3" />
          <path d="M12 21v-9" />
          <path d="M12 8V3" />
          <path d="M20 21v-5" />
          <path d="M20 12V3" />
          <path d="M2 14h4" />
          <path d="M10 8h4" />
          <path d="M18 16h4" />
        </Icon>
      );
    case "tag":
      return (
        <Icon>
          <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
          <circle cx="7.5" cy="7.5" r=".5" fill="currentColor" stroke="none" />
        </Icon>
      );
    case "zap":
      return (
        <Icon>
          <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
        </Icon>
      );
    case "percent":
      return (
        <Icon>
          <path d="M19 5 5 19" />
          <circle cx="6.5" cy="6.5" r="2.5" />
          <circle cx="17.5" cy="17.5" r="2.5" />
        </Icon>
      );
    case "credit":
      return (
        <Icon>
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <path d="M2 10h20" />
        </Icon>
      );
    case "image":
      return (
        <Icon>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
        </Icon>
      );
    case "video":
      return (
        <Icon>
          <rect x="2" y="6" width="14" height="12" rx="2" />
          <path d="m16 10 6-3v10l-6-3z" />
        </Icon>
      );
    case "chart":
      return (
        <Icon>
          <path d="M3 3v18h18" />
          <path d="M7 12h4" />
          <path d="M7 18h8" />
          <path d="M7 6h12" />
        </Icon>
      );
    case "bell":
      return (
        <Icon>
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </Icon>
      );
    case "list":
      return (
        <Icon>
          <line x1="8" y1="6" x2="21" y2="6" />
          <line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="21" y2="18" />
          <line x1="3" y1="6" x2="3.01" y2="6" />
          <line x1="3" y1="12" x2="3.01" y2="12" />
          <line x1="3" y1="18" x2="3.01" y2="18" />
        </Icon>
      );
    case "menu":
      return (
        <Icon>
          <path d="M4 6h16M4 12h16M4 18h16" />
        </Icon>
      );
    case "close":
      return (
        <Icon>
          <path d="M18 6 6 18M6 6l12 12" />
        </Icon>
      );
    case "logout":
      return (
        <Icon>
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" x2="9" y1="12" y2="12" />
        </Icon>
      );
    case "profile":
      return (
        <Icon>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20a8 8 0 0 1 16 0" />
        </Icon>
      );
    case "gear":
      return (
        <Icon>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </Icon>
      );
    case "file":
      return (
        <Icon>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
        </Icon>
      );

    case "help":
      return (
        <Icon>
          <circle cx="12" cy="12" r="9" />
          <path d="M9.25 9a2.75 2.75 0 1 1 5.5 0c0 1.5-1.5 2.25-2.25 3" />
          <line x1="12" y1="16.5" x2="12.01" y2="16.5" />
        </Icon>
      );
    default:
      return (
        <Icon>
          <circle cx="12" cy="12" r="10" />
        </Icon>
      );
  }
}

// Minimal stroke icons (24px grid, currentColor).
import type { JSX } from 'preact';

function Svg({ children, size = 20 }: { children: JSX.Element | JSX.Element[]; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const IconUsers = () => (
  <Svg>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
    <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.4c1.9.8 3 2.9 3 5.6" />
  </Svg>
);
export const IconGear = () => (
  <Svg>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </Svg>
);
export const IconGrid = () => (
  <Svg>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
  </Svg>
);
export const IconBack = () => (
  <Svg size={22}>
    <path d="M15 5l-7 7 7 7" />
  </Svg>
);
export const IconMore = () => (
  <Svg>
    <circle cx="5" cy="12" r="1.2" fill="currentColor" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" />
    <circle cx="19" cy="12" r="1.2" fill="currentColor" />
  </Svg>
);
/** Down to the very end: a double chevron, apart from the page up arrow above it. */
export const IconEnd = () => (
  <Svg>
    <path d="M6 6l6 6 6-6M6 13l6 6 6-6" />
  </Svg>
);
export const IconPageUp = () => (
  <Svg>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </Svg>
);
export const IconPageDown = () => (
  <Svg>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </Svg>
);
export const IconPlus = () => (
  <Svg size={18}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);
/** «Programar mensaje»: an alarm clock (face and hands, two bells on top, two feet). */
export const IconScheduled = () => (
  <Svg size={18}>
    <circle cx="12" cy="13" r="7" />
    <path d="M12 9.5V13l2.5 1.5M3.5 7.5a3.5 3.5 0 0 1 4-4M20.5 7.5a3.5 3.5 0 0 0-4-4M7.2 18.6 5.5 21M16.8 18.6l1.7 2.4" />
  </Svg>
);
/** The top bar's bell: push notifications go out. */
export const IconBell = () => (
  <Svg>
    <path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z" />
    <path d="M10 21a2 2 0 0 0 4 0" />
  </Svg>
);
/** The bell crossed out: push notifications are muted. */
export const IconBellOff = () => (
  <Svg>
    <path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z" />
    <path d="M10 21a2 2 0 0 0 4 0M3 3l18 18" />
  </Svg>
);
/** A narrow chevron: more of what the button beside it does. */
export const IconChevronDown = () => (
  <Svg size={16}>
    <path d="M6 9l6 6 6-6" />
  </Svg>
);
export const IconClose = () => (
  <Svg size={16}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);
/** A handle to drag a row by. */
export const IconGrip = () => (
  <Svg>
    <circle cx="9" cy="6" r="1" />
    <circle cx="15" cy="6" r="1" />
    <circle cx="9" cy="12" r="1" />
    <circle cx="15" cy="12" r="1" />
    <circle cx="9" cy="18" r="1" />
    <circle cx="15" cy="18" r="1" />
  </Svg>
);
/** A git branch, as in the detailed list of spaces. */
export const IconBranch = () => (
  <Svg size={13}>
    <circle cx="6" cy="18" r="2.5" />
    <circle cx="18" cy="6" r="2.5" />
    <path d="M6 3v12.5M18 8.5a9 9 0 0 1-9 9" />
  </Svg>
);
/** A git worktree: a folder with a branch in it. */
export const IconWorktree = () => (
  <Svg size={13}>
    <path d="M9 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.7.9l.8 1.2a2 2 0 0 0 1.7.9H20a2 2 0 0 1 2 2v4" />
    <circle cx="14" cy="13" r="1.8" />
    <circle cx="20" cy="18" r="1.8" />
    <path d="M14 15v6M18.2 18H17a3 3 0 0 1-3-3" />
  </Svg>
);
/** A kanban board: the Trello drawer. */
export const IconBoard = () => (
  <Svg>
    <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
    <path d="M8 7.5v8M12 7.5v4M16 7.5v6" />
  </Svg>
);
/** A pulse line: the activity. */
export const IconActivity = () => (
  <Svg>
    <path d="M3 12h4l3-8 4 16 3-8h4" />
  </Svg>
);
/** Two arrows in a circle: read or load again. */
export const IconReload = () => (
  <Svg>
    <path d="M20 11a8 8 0 0 0-14.3-4.9L4 8" />
    <path d="M4 3.5V8h4.5" />
    <path d="M4 13a8 8 0 0 0 14.3 4.9L20 16" />
    <path d="M20 20.5V16h-4.5" />
  </Svg>
);
export const IconFileDiff = () => (
  <Svg>
    <path d="M14.5 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7.5z" />
    <path d="M14 2.5v5.5h5.5" />
    <path d="M9.5 11.5h5M12 9v5M9.5 17.5h5" />
  </Svg>
);
export const IconFolder = () => (
  <Svg>
    <path d="M3 6.5a2 2 0 0 1 2-2h4.2l2 2.5H19a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </Svg>
);
export const IconSidebar = () => (
  <Svg>
    <rect x="3" y="4" width="18" height="16" rx="2.5" />
    <path d="M9 4v16" />
  </Svg>
);
/** The sidebar on the right (the scratchpads). */
export const IconSidebarRight = () => (
  <Svg>
    <rect x="3" y="4" width="18" height="16" rx="2.5" />
    <path d="M15 4v16" />
  </Svg>
);
/** Into the terminal: an arrow onto a prompt line. */
export const IconPaste = () => (
  <Svg size={18}>
    <path d="M4 12h11M11 7.5l4.5 4.5-4.5 4.5" />
    <path d="M20 5v14" />
  </Svg>
);
export const IconPin = () => (
  <Svg size={18}>
    <path d="M9 3.5h6M10 3.5v6.2l-3 3.3h10l-3-3.3V3.5M12 13v7.5" />
  </Svg>
);
export const IconTrash = () => (
  <Svg size={18}>
    <path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5" />
  </Svg>
);

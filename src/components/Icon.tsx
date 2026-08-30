/**
 * Icons.
 *
 * Hand-drawn on a 24-grid rather than pulled from a package: there are twenty
 * of them, they never change, and a dependency for twenty paths is a
 * dependency for its release cadence too.
 */

export type IconName =
  | 'today' | 'capture' | 'matrix' | 'drill' | 'weakness' | 'sources' | 'eve'
  | 'settings' | 'search' | 'close' | 'check' | 'cross' | 'plus' | 'chevron'
  | 'back' | 'print' | 'download' | 'upload' | 'link' | 'eye' | 'eye-off'
  | 'warn' | 'pin' | 'trash' | 'edit' | 'shuffle' | 'clock';

const PATHS: Record<IconName, string> = {
  today: 'M4 5h16v15H4zM4 9h16M8 3v4M16 3v4',
  capture: 'M12 5v14M5 12h14',
  matrix: 'M4 4h16v16H4zM4 9.5h16M4 15h16M10 4v16',
  drill: 'M4 10a8 8 0 0113.4-4.9L20 7M20 7V3.4M20 7h-3.6M20 14a8 8 0 01-13.4 4.9L4 17M4 17v3.6M4 17h3.6',
  weakness: 'M4 19h16M7 19V9M12 19V5M17 19v-7',
  sources: 'M5 4h10l4 4v12H5zM15 4v4h4',
  eve: 'M12 3v4M12 17v4M3 12h4M17 12h4M12 8.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7z',
  settings: 'M12 9a3 3 0 100 6 3 3 0 000-6zM4 12h2M18 12h2M12 4v2M12 18v2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M17.7 6.3l-1.4 1.4M7.7 16.3l-1.4 1.4',
  search: 'M11 4a7 7 0 100 14 7 7 0 000-14zM16.5 16.5L21 21',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M5 13l4 4L19 7',
  cross: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  chevron: 'M9 6l6 6-6 6',
  back: 'M15 6l-6 6 6 6',
  print: 'M7 9V3h10v6M7 19H5v-7h14v7h-2M7 15h10v6H7z',
  download: 'M12 4v11M7 11l5 5 5-5M5 20h14',
  upload: 'M12 20V9M7 13l5-5 5 5M5 4h14',
  link: 'M10 13a4 4 0 005.7 0l2.6-2.6a4 4 0 10-5.7-5.7L11 6.3M14 11a4 4 0 00-5.7 0l-2.6 2.6a4 4 0 105.7 5.7L13 17.7',
  eye: 'M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6zM12 9.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z',
  'eye-off': 'M4 4l16 16M9.5 9.6A2.5 2.5 0 0012 14.5c.6 0 1.2-.2 1.6-.6M6.3 6.5C3.7 8.2 2 12 2 12s3.6 6 10 6c1.8 0 3.3-.5 4.6-1.2M18.6 15c2-1.6 3.4-3 3.4-3s-3.6-6-10-6c-.7 0-1.3.1-1.9.2',
  warn: 'M12 4l9 16H3zM12 10v4M12 17.2v.1',
  pin: 'M9 4h6l-1 6 3 3v2H7v-2l3-3zM12 15v5',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14.5 5.5l4 4',
  shuffle: 'M4 6h3l10 12h3M4 18h3l3-3.6M21 6h-3l-3 3.6M18 3l3 3-3 3M18 15l3 3-3 3',
  clock: 'M12 4a8 8 0 100 16 8 8 0 000-16zM12 8v4.5l3 1.8',
};

interface Props {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
}

export function Icon({ name, size = 18, className, strokeWidth = 1.7 }: Props) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

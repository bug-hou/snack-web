const PATHS = {
  home: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5.5 9.6V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.6" />
      <path d="M9.5 21v-5.5h5V21" />
    </>
  ),
  forum: (
    <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.3 0-2.6-.3-3.7-.8L4 21l1.8-4.2A8.5 8.5 0 0 1 3.5 11.5 8.5 8.5 0 0 1 12 3a8.5 8.5 0 0 1 9 8.5z" />
  ),
  user: (
    <>
      <path d="M20 21v-1.8a4.2 4.2 0 0 0-4.2-4.2H8.2A4.2 4.2 0 0 0 4 19.2V21" />
      <circle cx="12" cy="7.5" r="3.8" />
    </>
  ),
  package: (
    <>
      <path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <path d="m3.4 7 8.6 5 8.6-5" />
      <path d="M12 22V12" />
    </>
  ),
  bag: (
    <>
      <path d="M6.5 2.5 3.5 6.5V20a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2V6.5l-3-4z" />
      <path d="M3.5 6.5h17" />
      <path d="M16 10.5a4 4 0 0 1-8 0" />
    </>
  ),
  repeat: (
    <>
      <path d="m17 2.5 3.5 3.5L17 9.5" />
      <path d="M20.5 6H7a3.5 3.5 0 0 0-3.5 3.5" />
      <path d="m7 21.5-3.5-3.5L7 14.5" />
      <path d="M3.5 18h13.5a3.5 3.5 0 0 0 3.5-3.5" />
    </>
  ),
  clipboard: (
    <>
      <rect x="8" y="2.5" width="8" height="4" rx="1.2" />
      <path d="M16 4.5h2.2a1.8 1.8 0 0 1 1.8 1.8V19a1.8 1.8 0 0 1-1.8 1.8H5.8A1.8 1.8 0 0 1 4 19V6.3a1.8 1.8 0 0 1 1.8-1.8H8" />
      <path d="M8 11h8M8 15h5" />
    </>
  ),
  pin: (
    <>
      <path d="M20 10c0 5.8-8 11.5-8 11.5S4 15.8 4 10a8 8 0 0 1 16 0z" />
      <circle cx="12" cy="10" r="2.8" />
    </>
  ),
  plus: <path d="M12 5.5v13M5.5 12h13" />,
  back: <path d="m14.5 18.5-6-6.5 6-6.5" />,
  heart: <path d="M20.4 5.2a5.2 5.2 0 0 0-7.4 0L12 6.2l-1-1a5.2 5.2 0 0 0-7.4 7.4l8.4 8.4 8.4-8.4a5.2 5.2 0 0 0 0-7.4z" />,
  trash: (
    <>
      <path d="M3.5 6.5h17" />
      <path d="M9 6.5V4h6v2.5" />
      <path d="M18.5 6.5 17.6 20a1.4 1.4 0 0 1-1.4 1.3H7.8a1.4 1.4 0 0 1-1.4-1.3L5.5 6.5" />
    </>
  ),
  camera: (
    <>
      <path d="M3.5 8.5A1.8 1.8 0 0 1 5.3 6.7h1.9l1.2-2h8.2l1.2 2h1.9a1.8 1.8 0 0 1 1.8 1.8v9.8a1.8 1.8 0 0 1-1.8 1.8H5.3a1.8 1.8 0 0 1-1.8-1.8z" />
      <circle cx="12" cy="13" r="3.4" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />
};

export default function Icon({ name, size = 20, className = '', strokeWidth = 1.8 }) {
  const path = PATHS[name];
  if (!path) return null;
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {path}
    </svg>
  );
}

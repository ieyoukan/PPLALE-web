/** One line-icon vocabulary for game screens and shared UI. */
const paths = {
  chat: 'M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-9l-6 3v-3H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM7 9h10M7 13h6',
  play: 'M8 5.5v13l10-6.5z',
  more: 'M6 12h.01M12 12h.01M18 12h.01',
  add: 'M10 18s-6-3.8-6-8.5A3.5 3.5 0 0 1 10 7a3.5 3.5 0 0 1 6 2M18 13v6M15 16h6',
  crown: 'M4 17.5h16M5 17.5 3.5 8l5 4L12 5l3.5 7 5-4-1.5 9.5',
  seat: 'M7 4.5h10v8H7zM5.5 12.5h13V16h-13zM7.5 16v3.5M16.5 16v3.5',
  plus: 'M12 5v14M5 12h14',
  cpu: 'M8 7.5h8a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3v-5a3 3 0 0 1 3-3zM12 7.5V4.5M10 12.5h.01M14 12.5h.01M10 15.5h4',
  link: 'M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1',
  door: 'M6 20.5V4.5h9v16M6 20.5h12M12 12.5h.01M17.5 6.5v5M15 9h5',
  cards: 'M8.5 6.5h9v13h-9zM6 17.5V4h9',
  rules: 'M5.5 6.5h13M5.5 12h13M5.5 17.5h13M9 4.5v4M15 10v4M11 15.5v4',
  grid: 'M5 5h4v4H5zM10 5h4v4h-4zM15 5h4v4h-4zM5 10h4v4H5zM10 10h4v4h-4zM15 10h4v4h-4zM5 15h4v4H5zM10 15h4v4h-4zM15 15h4v4h-4z',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  close: 'M6.5 6.5l11 11M17.5 6.5l-11 11',
  stand: 'M12 19V6M6.5 11.5 12 6l5.5 5.5',
  timer: 'M12 8v5l3 2M9.5 3.5h5M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16z',
  people: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14.3c1.8.9 3 2.8 3 5.2',
  social: 'M12 10a3.3 3.3 0 1 0 0-6.6 3.3 3.3 0 0 0 0 6.6zM5.5 11a2.7 2.7 0 1 0 0-5.4 2.7 2.7 0 0 0 0 5.4zM18.5 11a2.7 2.7 0 1 0 0-5.4 2.7 2.7 0 0 0 0 5.4zM6.5 21v-2a5.5 5.5 0 0 1 11 0v2zM4.5 20h-3v-2a4.5 4.5 0 0 1 5-4.5M19.5 20h3v-2a4.5 4.5 0 0 0-5-4.5',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3z',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  letter: 'M4 6.5h16v11H4zM4.5 7l7.5 6 7.5-6',
  enter: 'M13 4h7v16h-7M3 12h12M10 7l5 5-5 5',
  requestInvite: 'M3 8h12v11H3zM3 8l6 5 6-5M17 5.5a2.5 2.5 0 1 1 4 2c-1.2.8-1.5 1-1.5 2M19.5 12.5h.01',
  back: 'M14.5 5.5L8 12l6.5 6.5',
  exit: 'M14 4.5h4.5v15H14M10 8l-4 4 4 4M6 12h9',
  star: 'M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.8l-5.3 2.8 1-5.8-4.2-4.1 5.9-.9z',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0',
  puzzle: 'M9 4.5h6v3a1.5 1.5 0 0 0 3 0h1.5V13h-3a1.5 1.5 0 0 0 0 3h3v4.5H13v-3a1.5 1.5 0 0 0-3 0v3H4.5V15h3a1.5 1.5 0 0 0 0-3h-3V4.5H9z',
  // A blade with its crossguard and hilt (not to be mistaken for the pen).
  sword: 'M19.5 4.5 16 5l-7.5 7.5 3 3L19 8zM6.5 11.5l6 6M8.5 15.5l-4 4',
  pen: 'M5 19l1-4L15.5 5.5a2 2 0 0 1 3 3L9 18zM14 7l3 3',
  history: 'M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v3.5H8M12 8v4.5l3 1.5',
  gear: 'M9.5 3h5l.5 2.5 2 1.2 2.4-.8 2.5 4.2-2 1.7v.4l2 1.7-2.5 4.2-2.4-.8-2 1.2-.5 2.5h-5L9 18.5l-2-1.2-2.4.8-2.5-4.2 2-1.7v-.4l-2-1.7 2.5-4.2 2.4.8L9 5.5zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  rocket: 'M13 5c3-2 7-2 7-2s0 4-2 7l-5 5-4-4zM9 9H5l-2 5 6-1M15 15l-1 6 5-2v-6M6 16c-2 0-3 2-3 5 3 0 5-1 5-3M15.5 6.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z',
  pin: 'M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0zM12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  volume: 'M11 5 6 9H3v6h3l5 4zM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14',
  expand: 'M8 4h12v12M20 4l-9 9M4 9v11h11',
  collapse: 'M14 4v6h6M14 10l6-6M10 20v-6H4M10 14l-6 6',
  home: 'M4.5 11 12 4.5l7.5 6.5M6.5 9.5v10h11v-10',
  send: 'M4 12l16-7-6 15-3-6.5z',
  sparkle: 'M12 3.5c.6 4.2 2.3 5.9 6.5 6.5-4.2.6-5.9 2.3-6.5 6.5-.6-4.2-2.3-5.9-6.5-6.5 4.2-.6 5.9-2.3 6.5-6.5zM18.5 15.5c.3 1.6.9 2.2 2.5 2.5-1.6.3-2.2.9-2.5 2.5-.3-1.6-.9-2.2-2.5-2.5 1.6-.3 2.2-.9 2.5-2.5z',
  refresh: 'M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5V8H16',
} as const;
export type GameIconName = keyof typeof paths;

export function GameIcon({ name, className }: { name: GameIconName; className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth={name === 'more' ? 3.5 : name === 'grid' ? 1.8 : 2.1} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={paths[name]} /></svg>;
}

/** The Discord symbol (the brand's own artwork), tinted with the text colour. */
export function DiscordMark({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 127 96" width="1.2em" height="1em" fill="currentColor" aria-hidden="true" focusable="false"><path d="M81.15 0c-1.24 2.2-2.35 4.47-3.36 6.79a92.3 92.3 0 0 0-28.99 0A70 70 0 0 0 45.44 0a106 106 0 0 0-26.14 8.06C2.78 32.53-1.69 56.37.53 79.89A107 107 0 0 0 32.58 96a76 76 0 0 0 6.87-11.06 69 69 0 0 1-10.81-5.15c.91-.66 1.79-1.34 2.65-2a76.6 76.6 0 0 0 64.08 0c.86.71 1.74 1.39 2.65 2a69 69 0 0 1-10.83 5.16A76 76 0 0 0 94.06 96a106 106 0 0 0 32.07-16.11c2.63-27.28-4.49-50.92-18.8-71.83A105 105 0 0 0 81.15 0zM42.28 65.42c-6.24 0-11.42-5.66-11.42-12.63s4.97-12.66 11.4-12.66 11.52 5.71 11.42 12.66-5.03 12.63-11.4 12.63zm42.24 0c-6.27 0-11.42-5.66-11.42-12.63s4.97-12.66 11.42-12.66 11.5 5.71 11.4 12.66-5.02 12.63-11.4 12.63z" /></svg>;
}

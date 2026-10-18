/** Small line icons for the social screens (drawn, so that no emoji font decides how they look). */
const paths = {
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0',
  pen: 'M5 19l1-4L15.5 5.5a2 2 0 0 1 3 3L9 18zM14 7l3 3',
  more: 'M6 12h.01M12 12h.01M18 12h.01',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  close: 'M6.5 6.5l11 11M17.5 6.5l-11 11',
  play: 'M8 5.5v13l10-6.5z',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  mail: 'M4 6.5h16v11H4zM4.5 7l7.5 6 7.5-6',
  send: 'M4 12l16-7-6 15-3-6.5z',
  add: 'M10 18s-6-3.8-6-8.5A3.5 3.5 0 0 1 10 7a3.5 3.5 0 0 1 6 2M18 13v6M15 16h6',
} as const;
export type IconName = keyof typeof paths;

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth={name === 'more' ? 3.5 : 2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={paths[name]} /></svg>;
}

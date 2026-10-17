import Image from 'next/image';

const illustrations = {
  free: 'friends',
  watch: 'green-friend',
  enter: 'yellow-friend',
  create: 'pink-friend',
} as const;

/** Decorations from the supplied merchandise illustrations, shared by the doors and waiting area. */
export function BattleIllustration({ kind, sizes, className }: {
  kind: keyof typeof illustrations;
  sizes: string;
  className?: string;
}) {
  return <Image src={`/images/game/characters/${illustrations[kind]}.webp`} alt="" fill sizes={sizes} className={className} draggable={false} />;
}

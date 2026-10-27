import Image from 'next/image';
import type { RoomRules } from '@pplale/game-core/room';
import { roomThumbnail, thumbnailPath } from '@/lib/game/roomThumbnail';

/** The same rule-based picture on room cards, the creation sheet, loading and shared links. */
export function RoomThumbnailImage({ rules, alt = '', className, sizes = '320px', priority = false }: {
  rules: RoomRules; alt?: string; className?: string; sizes?: string; priority?: boolean;
}) {
  return <Image className={className} src={thumbnailPath(roomThumbnail(rules))} alt={alt} width={800} height={420} sizes={sizes} priority={priority} unoptimized />;
}

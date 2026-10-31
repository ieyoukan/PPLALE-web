import { Suspense } from 'react';
import { OpenInRoom } from '@/components/game/launchpad/OpenInRoom';

/** Opens in the launchpad, over the room (places.ts). `?id=` opens that deck's popup. */
export default function Page() { return <Suspense><OpenInRoom section="decks" /></Suspense>; }

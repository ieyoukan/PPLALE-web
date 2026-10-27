import { Suspense } from 'react';
import { OpenInRoom } from '@/components/game/launchpad/OpenInRoom';

/** Opens in the launchpad, over the room (places.ts). */
export default function Page() { return <Suspense><OpenInRoom section="notifications" /></Suspense>; }

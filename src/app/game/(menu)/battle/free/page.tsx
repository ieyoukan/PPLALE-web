import { redirect } from 'next/navigation';

/** The retired matchmaking address returns to the current room. */
export default function Page() { redirect('/game/'); }

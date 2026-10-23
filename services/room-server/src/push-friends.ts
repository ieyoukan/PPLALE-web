// What a friend notice needs to be true before it is sent, read from Firestore as the player who
// asks for it (their ID token goes with the request, so the security rules decide what they may
// see: only their own friendships and recruitment). No service account is used.

const ID = /^[\w-]{1,128}$/;
type Fields = Record<string, { stringValue?: string; arrayValue?: { values?: { stringValue?: string }[] } }>;

function documents() {
    const project = process.env.FIREBASE_PROJECT_ID ?? 'pplale-6cca0';
    const origin = process.env.FIRESTORE_EMULATOR_HOST ? `http://${process.env.FIRESTORE_EMULATOR_HOST}` : 'https://firestore.googleapis.com';
    return `${origin}/v1/projects/${encodeURIComponent(project)}/databases/(default)/documents`;
}
async function read(path: string, token: string): Promise<Fields | null> {
    const response = await fetch(`${documents()}/${path}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(3000) });
    if (!response.ok) return null;
    return (await response.json() as { fields?: Fields }).fields ?? null;
}

export interface Friendship { members: string[]; requestedBy: string; status: string }
const friendshipOf = (fields: Fields): Friendship => ({
    members: fields.members?.arrayValue?.values?.map(value => value.stringValue ?? '') ?? [],
    requestedBy: fields.requestedBy?.stringValue ?? '',
    status: fields.status?.stringValue ?? '',
});

/** The friendship of `uid` and `other` as `uid` sees it, or null. */
export async function friendshipBetween(token: string, uid: string, other: string): Promise<Friendship | null> {
    if (!ID.test(uid) || !ID.test(other) || uid === other) return null;
    const fields = await read(`friendships/${encodeURIComponent([uid, other].sort().join('~'))}`, token);
    return fields && friendshipOf(fields);
}

/** The room `uid` is recruiting friends to (their own recruitment), or null. */
export async function recruitmentOf(token: string, uid: string): Promise<string | null> {
    if (!ID.test(uid)) return null;
    const roomId = (await read(`recruitments/${encodeURIComponent(uid)}`, token))?.roomId?.stringValue;
    return roomId && /^\d{6}$/.test(roomId) ? roomId : null;
}

/** The accepted friends of `uid` (at most 100, as the rules allow). */
export async function friendsOf(token: string, uid: string): Promise<string[]> {
    if (!ID.test(uid)) return [];
    const response = await fetch(`${documents()}:runQuery`, {
        method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, signal: AbortSignal.timeout(3000),
        body: JSON.stringify({ structuredQuery: {
            from: [{ collectionId: 'friendships' }],
            where: { fieldFilter: { field: { fieldPath: 'members' }, op: 'ARRAY_CONTAINS', value: { stringValue: uid } } },
            limit: 100,
        } }),
    });
    if (!response.ok) return [];
    const rows = await response.json() as { document?: { fields?: Fields } }[];
    return rows.flatMap(row => {
        const friendship = row.document?.fields && friendshipOf(row.document.fields);
        const other = friendship?.status === 'accepted' ? friendship.members.find(member => member !== uid) : undefined;
        return other && ID.test(other) ? [other] : [];
    });
}

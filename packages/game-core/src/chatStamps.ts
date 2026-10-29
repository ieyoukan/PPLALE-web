/** Stable room-chat identifiers. Asset URLs and arbitrary uploads are never accepted from clients. */
export const ROOM_CHAT_STAMPS = [
    { id: 'ageru', label: 'あげる' }, { id: 'choudai', label: 'ちょうだい' },
    { id: 'garuru', label: 'がーるーる' }, { id: 'golden', label: 'ごーるでん' },
    { id: 'jangarian', label: 'じゃんがりあん' }, { id: 'nan', label: 'なーん' },
    { id: 'nma', label: 'んまぁ' }, { id: 'oyasumi', label: 'おやすみ' },
    { id: 'pekopeko', label: 'ぺこぺこ' }, { id: 'shi', label: 'しっ！' },
    { id: 'taberu', label: 'たべる？' }, { id: 'waa', label: 'わぁ' },
] as const;
export type RoomChatStampId = (typeof ROOM_CHAT_STAMPS)[number]['id'];

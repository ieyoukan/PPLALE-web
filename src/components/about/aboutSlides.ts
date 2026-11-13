// ぷぷりえーるとはの「あらすじとルールの本」のページ一覧。本（AboutPage）と拡大表示（AboutLightbox）で共用する。
export interface Slide {
  src: string;
  title: string;
  /** The title in English (the page images themselves are in Japanese). */
  en: string;
  width: number;
  height: number;
}

export interface Group {
  id: string;
  title: string;
  en: string;
  icon: string;
  slides: Slide[];
}


const landscape = (src: string, title: string, en: string): Slide => ({ src: `/images/about/${src}.webp`, title, en, width: 1191, height: 842 });

export const groups: Group[] = [
  { id: 'story', title: 'あらすじ', en: 'Story', icon: '📖', slides: [landscape('story', 'あらすじ', 'Story')] },
  {
    id: 'rules', title: 'ルール', en: 'Rules', icon: '🃏', slides: [
      landscape('rule-1', 'ルール説明① 対戦前の準備・勝利条件・カードの見方', 'Rules 1: Setup, how to win and reading a card'),
      landscape('rule-2', 'ルール説明② デッキの作り方', 'Rules 2: Building a deck'),
      landscape('rule-3', 'ルール説明③ 1ターン目の流れ', 'Rules 3: Your first turn'),
      landscape('rule-4', 'ルール説明④ 自分のターンにできること', 'Rules 4: What you can do on your turn'),
      landscape('rule-5', 'ルール説明⑤ その他のルール', 'Rules 5: Other rules'),
      landscape('rule-6', 'ルール説明⑥ 特殊効果', 'Rules 6: Special abilities'),
      landscape('rule-6-2', 'ルール説明⑥ 特殊効果 続', 'Rules 6: Special abilities (cont.)'),
      { src: '/images/about/keywords-basic.webp', title: 'キーワード早見表 基本の特殊効果', en: 'Keyword guide: basic abilities', width: 800, height: 1200 },
      { src: '/images/about/keywords.webp', title: 'キーワード早見表', en: 'Keyword guide', width: 800, height: 1200 },
    ],
  },
  {
    id: 'faq-ichigo', title: 'FAQ', en: 'FAQ', icon: '🍓',
    slides: [1, 2, 3, 4, 5, 6].map(n => landscape(`faq-ichigo-${n}`, `FAQ${n} イチゴタイプ`, `FAQ ${n}: Strawberry`)),
  },
  {
    id: 'faq-budou', title: 'FAQ', en: 'FAQ', icon: '🍇',
    slides: [1, 2, 3, 4, 5, 6].map(n => landscape(`faq-budou-${n}`, `FAQ${n} ぶどうタイプ`, `FAQ ${n}: Grape`)),
  },
];

export const allSlides = groups.flatMap(group => group.slides);
export const groupOf = (slide: Slide) => groups.find(group => group.slides.includes(slide))!;
export const clampPage = (page: number) => Math.min(allSlides.length - 1, Math.max(0, page));

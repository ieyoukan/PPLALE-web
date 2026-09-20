// React 19 + framer-motion v12 の型互換性パッチ
// React 19 では JSX namespace が削除されたため、
// framer-motion の motion コンポーネントの型が IDE 上でエラーになる。
// このファイルで motion コンポーネントの型を正しく認識させる。
// 参考: https://github.com/motiondivision/motion/issues/2831

import type { HTMLMotionProps, SVGMotionProps } from 'framer-motion';

declare module 'framer-motion' {
  // motion.div などの HTML 要素向け
  interface CustomMotionComponent {
    <T extends keyof HTMLElementTagNameMap>(
      props: HTMLMotionProps<T> & { ref?: React.Ref<HTMLElementTagNameMap[T]> }
    ): JSX.Element;
    <T extends keyof SVGElementTagNameMap>(
      props: SVGMotionProps<T> & { ref?: React.Ref<SVGElementTagNameMap[T]> }
    ): JSX.Element;
  }
}

// HTML 要素のタグ名マップ
interface HTMLElementTagNameMap {
  div: HTMLDivElement;
  span: HTMLSpanElement;
  button: HTMLButtonElement;
  a: HTMLAnchorElement;
  li: HTMLLIElement;
  ul: HTMLUListElement;
  section: HTMLElement;
  article: HTMLElement;
  nav: HTMLElement;
  header: HTMLElement;
  footer: HTMLElement;
  main: HTMLElement;
  aside: HTMLElement;
  p: HTMLParagraphElement;
  h1: HTMLHeadingElement;
  h2: HTMLHeadingElement;
  h3: HTMLHeadingElement;
  h4: HTMLHeadingElement;
  h5: HTMLHeadingElement;
  h6: HTMLHeadingElement;
  img: HTMLImageElement;
  input: HTMLInputElement;
  textarea: HTMLTextAreaElement;
  select: HTMLSelectElement;
  form: HTMLFormElement;
  label: HTMLLabelElement;
  table: HTMLTableElement;
  tr: HTMLTableRowElement;
  td: HTMLTableCellElement;
  th: HTMLTableHeaderCellElement;
  path: SVGPathElement;
  svg: SVGSVGElement;
  circle: SVGCircleElement;
  rect: SVGRectElement;
  g: SVGGElement;
  line: SVGLineElement;
}

interface SVGElementTagNameMap {
  svg: SVGSVGElement;
  path: SVGPathElement;
  circle: SVGCircleElement;
  rect: SVGRectElement;
  g: SVGGElement;
  line: SVGLineElement;
}

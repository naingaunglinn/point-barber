// Minimal JSX typing for sinks.tsx: the fixtures need no React package.
declare namespace JSX {
  type Element = object;
  interface IntrinsicElements {
    div: { dangerouslySetInnerHTML?: { __html: string } };
  }
}

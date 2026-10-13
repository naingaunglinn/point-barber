// Reads a CSS file as text: each top-level rule's selector and its custom-property declarations.
// Shared by the unit tests of tokens.css and of the catalogue's Tokens section.

export type Declarations = Map<string, string>;

/** Custom-property declarations of every top-level rule whose selector list is exactly `selector`. */
export function declarationsOf(css: string, selector: string): Declarations {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const result: Declarations = new Map();
  let depth = 0;
  let start = 0;
  let header = '';
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '{') {
      if (depth === 0) {
        header = text.slice(start, i).trim().replace(/\s+/g, ' ');
        start = i + 1;
      }
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        if (header === selector) {
          for (const match of text.slice(start, i).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
            const [, name, value] = match;
            if (name !== undefined && value !== undefined) result.set(name, value.trim());
          }
        }
        start = i + 1;
      }
    }
  }
  return result;
}

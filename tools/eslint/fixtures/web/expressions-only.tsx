// Must pass: what the placeholder pages do — only expressions and whitespace in JSX.
export function Placeholder({ tree, version }: { tree: string; version: string }) {
  return (
    <main data-testid="site-placeholder">
      {tree} {version}
    </main>
  );
}

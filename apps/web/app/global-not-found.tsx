import '@point/ui/tokens.css';

// The web app's 404 page (status 404) for every URL no route matches — the refused paths that
// proxy.ts rewrites to `/_not-routed` included. With one root layout per tree there is no layout to
// compose it from, so it renders its own `<html>` (Next.js `global-not-found`). It has no literal
// text: its copy comes from the language files (D-PLT-03 · AD-L10N-01).
export default function GlobalNotFound() {
  return (
    <html lang="my">
      <body>
        <main data-testid="not-found" />
      </body>
    </html>
  );
}

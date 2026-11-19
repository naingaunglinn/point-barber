# apps/windows — Windows shell (Tauri)

The Windows `.exe` of D-PLT-01, built with **Tauri** (WebView2): a thin shell that loads the hosted
staff app (`https://app.<domain>`), so it uses the same web build as Android and the iOS PWA
(ADR-003).

Not built yet — this folder is created by `add-repo-scaffold` (ADR-001 action item 1) and filled by
**`add-windows-shell`**, which also pins the Tauri version in `VERSIONS.md`.

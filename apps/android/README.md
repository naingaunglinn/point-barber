# apps/android — Android shell (Capacitor)

The Android `.apk` of D-PLT-01, built with **Capacitor** (ADR-003): a native Android project whose
WebView loads the hosted staff app (`https://app.<domain>`), plus the Bluetooth Classic ESC/POS
printer plugin for receipts (D-PAY-07). Updates of the web app reach the phone without a new APK.

Not built yet — this folder is created by `add-repo-scaffold` (ADR-001 action item 1) and filled by
**`add-android-shell`**, which also pins the Capacitor version in `VERSIONS.md`.

# Admin panel — image index

Add one row per image. Claude Code reads this table to find the right image for the screen it is building.
**The table is empty until the owner adds images** — an empty table means "no reference image: build from the
guideline".

| Image file | Screen / section | Device | Rule IDs (AD-…) | Notes for the builder |
|---|---|---|---|---|

**Format example** (not real files — do not look for them):

```
| `today-barber-mobile.png`     | Today (barber home)      | 360 px  | AD-TODAY-01 | list density, position of ＋ Start |
| `checkout-payment-mobile.png` | Checkout — take payment  | 360 px  | AD-POS-08   | Fresha layout as the starting point; fewer taps |
| `calendar-desktop.png`        | Calendar                 | 1280 px | AD-CAL-01   | Fresha calendar look; keep our status badge map (§6.3) |
```

Rules of use: `../README.md` (admin guideline AD-META-08: about 80 % Fresha's layout, easier to use).
Guideline: `../../../point-sdd/docs/ux/admin-panel.md`.

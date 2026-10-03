# Website — image index

Add one row per image. Claude Code reads this table to find the right image for the screen it is building.
**The table is empty until the owner adds images** — an empty table means "no reference image: build from the
guideline".

| Image file | Screen / section | Device | Rule IDs (FE-…) | Notes for the builder |
|---|---|---|---|---|

**Format example** (not real files — do not look for them):

```
| `home-hero-mobile.png`            | Home — hero and primary "Book" button | 360 px  | FE-HOME-01 · FE-VIS-01  | spacing and photo treatment; the button stays black with white text (FE-VIS-01b) |
| `home-barbers-desktop.png`        | Home — "Our barbers" cards            | 1280 px | FE-HOME-05 · FE-CMP-02a | card composition |
| `booking-modal-step-service.png`  | Booking modal — choose service        | 360 px  | FE-BK-00 · FE-BK-05     | step layout |
```

Rules of use: `../README.md`. Guideline: `../../../point-sdd/docs/ux/frontend-website.md`.

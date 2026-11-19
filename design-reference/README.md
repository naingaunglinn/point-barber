# Design reference

The owner's reference images. Two folders: `website/` (public site + booking modal) and `admin-panel/` (every
screen behind login — the admin panel follows Fresha's layout about 80 % and must be easier to use).

**How they are used**

- Each folder has a `README.md` index: image file → screen → rule IDs. Claude Code opens the image the index
  names before building that screen. An image that is not in the index is not looked at.
- An image is a **reference, never a rule**. Order of authority (the seven tiers of
  `point-sdd/openspec/config.yaml`, AD-META-01 / FE-META-01): locked decisions → database design → UX
  guidelines (`../../point-sdd/docs/ux/`) → API design → ADRs and system design → **these images** → Fresha
  research. If an image disagrees with a rule, stop and ask the owner (D-PLT-13); do not follow the image.
  The rules about these folders: admin AD-META-08 · website FE-VIS-01.
- Colours come only from `packages/ui/tokens.css` — never sampled from an image (D-UX-02).

**What may be committed here**

- PNG / JPG / WebP / PDF, each under 2 MB; file names in lower-case kebab-case that say what the screen is:
  `home-hero-mobile.png`, `today-barber-mobile.png`, `checkout-payment-mobile.png`.
- **No real personal or business data**: no customer names or phone numbers, no staff e-mails, no revenue or
  salary figures. Crop or blur screenshots of the live Fresha account before adding them (RISK-13). Keep this
  repository private.

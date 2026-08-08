---
change_id: ui-theme-cafe-romance
title: Café Romance UI theme
status: new
created: 2026-08-08
updated: 2026-08-08
archived_at: null
---

## Notes

S-07 from @context/foundation/roadmap.md — **optional**, and **implemented last**: only pick this up once S-02 through S-06 have all landed, and only if time remains. Do not apply the palette early or slice-by-slice; a half-restyled app is more work to finish than an unstyled one.

Replaces the starter's cosmic/purple-glass chrome (`bg-cosmic`, `bg-white/10 backdrop-blur`, blue→purple gradient headings) with a warm, book-forward light theme aimed at the 25-35 Bookstagram romance reader.

### Palette: Café Romance

| Role | Hex | Use |
|---|---|---|
| Background | `#F7F3EE` | Warm linen page |
| Card / surface | `#FDFBF8` | Cream cards |
| Foreground | `#3D2E2A` | Espresso body text |
| Muted foreground | `#8B7355` | Warm taupe, secondary text |
| Primary | `#7A4E57` | Dusty mauve-rose — buttons, links |
| Primary hover | `#6B4249` | Deeper rose-brown |
| Accent | `#E8C4C8` | Pale blush highlights |
| Border / input | `#E5DDD3` | Soft sand |
| Success | `#6B7F6A` | Sage, for "saved" states |

Trope pills rotate across `#F0D4D8` (blush), `#E8DFD0` (oat), `#D4C4B8` (warm stone) with `#5C4A42` text.

### Look

- Light mode only; the dark "Velvet Evening" variant is parked (see Parked in the roadmap).
- Flat cream cards with a soft shadow — no glassmorphism, no gradient text.
- Trope pills are the most colourful element on the page.
- Covers are the hero in list views; title/author secondary.
- Headings in a soft serif (Fraunces or Cormorant Garamond), body/UI in DM Sans.
- Radius bumped to `0.75rem`.

### Scope note

Swapping the shadcn tokens in `src/styles/global.css` (`--background`, `--foreground`, `--card`, `--primary`, `--secondary`, `--muted-foreground`, `--accent`, `--border`, `--radius`) is the small part. The pages and islands do not consume those tokens today - they hardcode cosmic Tailwind classes (`bg-cosmic`, `bg-white/10 backdrop-blur`, `border-white/10`, `text-blue-100/*`, `from-blue-200 to-purple-200` gradient headings). So the bulk of this slice is rewriting those classes surface by surface, dropping the `bg-cosmic` utility and the star-field / orb markup in `Welcome.astro`, wiring the fonts, and rebuilding the book list as a cover-forward grid. Estimate it as a per-page pass, not a variables edit.

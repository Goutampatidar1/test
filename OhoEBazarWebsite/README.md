# OHO E-Bazar — Public Landing Website

Hindi-first, cinematic marketing site for OHO E-Bazar. It is a standalone Vite app and only **reads** the Backend's
public API — it does not touch `Backend`, `AdminPannel`, `VenueVendorPanel`, authentication or the database.

## Setup

```bash
cd OhoEBazarWebsite
npm install
cp .env.example .env
npm run dev          # http://localhost:5180
npm run build        # tsc -b && vite build
npm run preview
```

| Variable | Default | Purpose |
|----------|---------|---------|
| `VITE_API_URL` | `http://localhost:5001/api` | Backend base URL (`/public/*` endpoints) |
| `VITE_VENDOR_PANEL_URL` | `http://localhost:5174` | Seller login / registration links (`/vendor/login`, `/vendor/register`) |

## Page structure (`src/App.tsx`) — “The Discovery Engine”

| # | Section | File | Desktop choreography |
|---|---------|------|----------------------|
| 1 | Product stage | `components/hero/*` | R3F scene; Theatre.js sequences the camera, products, light sweep and ribbon; scroll scrubs the exit |
| 2 | Category world | `sections/CategoryWorld.tsx` | Pinned; each category takes the frame with its own mask (wipe / circle / diagonal) while the previous one blurs back |
| 3 | Objects in motion | `sections/ProductGallery.tsx` | First product grows from the category frame to full-bleed, then an asymmetric masked composition; horizontal gallery from the 6th product |
| 4 | People | `sections/PeopleSection.tsx` | Main portrait expands while supporting portraits slip behind it; ends dark for the events |
| 5 | Celebrations | `sections/EventsSection.tsx` | Pinned horizontal reel: wedding stage → service frames → banquet hall |
| 6 | Promotion | `sections/PromoSection.tsx` | SVG displacement reveal of a single product; live hot deals only |
| 7 | Brand story | `sections/BrandStory.tsx` | Photo fragments and words assemble; background turns from charcoal to ivory |
| 8 | What you can do here | `sections/ValueSection.tsx` | Static list with hairline reveals |
| 9 | Final CTA + footer | `sections/FinalCta.tsx`, `layout/Footer.tsx` | Ribbon-edge bookend, flowing ribbon and glow |

`components/motion/RibbonEdge.tsx` is the shared signature: the hero ribbon lands as the wave-shaped top edge of the
categories and comes back, mirrored, at the final CTA. Every section carries `data-nav="dark|light"` so the navbar
switches its colour scheme. Each photo or cutout has exactly one home on the page (see the comment in `src/lib/media.ts`).

Mobile, touch and reduced-motion visitors get stacked layouts and native swipe strips instead of pins.

## Data rules

- All products, categories, sellers, venues, prices and contact details come from `src/lib/api.ts`
  (`/public/app-config`, `/public/categories`, `/public/products`, `/public/vendors`, `/public/venues`, `/public/hot-deals`).
- Deals are listed only when `/public/hot-deals` returns `status: true` and is enabled; otherwise the promotion
  section shows brand copy with no discounts or countdowns.
- No testimonials, ratings, customer counts or verification badges are shown, because the API has none.
- Placeholder product/category images (`src/lib/media.ts → isPlaceholder`) are replaced with curated photos and labelled
  “प्रतिनिधि चित्र / Representative image”.
- `src/data/devFixtures.ts` is used **only** in `npm run dev` when the API is unreachable, and the page then shows a
  visible “Development preview data — API unavailable” note. Production never uses fixtures.

## Language

- `src/i18n/dictionary.ts` holds every string in `hi` and `en`; Hindi is the default.
- `LanguageProvider` persists the choice in `localStorage['oho-lang']` and updates `<html lang>` and the title.
- Devanagari uses Noto Sans / Noto Serif Devanagari; Hindi-specific typography overrides live unlayered at the end of
  `src/index.css` so they win over Tailwind utilities.

## Motion and 3D

| Piece | Where |
|-------|-------|
| Lenis smooth scroll (on the GSAP ticker) | `components/layout/SmoothScroll.tsx` |
| GSAP context hook | `lib/gsap.ts → useGsap` |
| Reusable motion components | `components/motion/*` (SplitTextReveal, MagneticButton, HorizontalGallery, RibbonEdge) |
| Intro curtain | `components/layout/PageTransition.tsx` |
| R3F hero stage (lazy chunk) | `components/hero/HeroStage.tsx`, layout in `heroScene.ts` |
| Theatre.js sequences | `components/hero/choreography.ts` (intro + scroll exit, keyframes defined in code) |
| DOM fallback still life | `components/hero/HeroStill.tsx` |

The hero uses `@theatre/core` directly: `@theatre/r3f` 0.7 only supports React Three Fiber 8, while this app runs
R3F 9 / React 19. The package stays installed (an npm `overrides` entry lets it resolve) but is not imported.
Post-processing (bloom + vignette) comes from `@react-three/postprocessing`.

The WebGL stage loads only on desktop (≥1024px) with WebGL available and no `prefers-reduced-motion`. Otherwise,
or if the stage throws or loses its context, the DOM still life is shown. Under reduced motion there is no
curtain, smooth scroll, pinning or scrubbing, and all content is visible.

## Media pipeline

- Photos live in `public/media/photos/*-{640,1280}.webp`; transparent product cutouts in
  `public/media/products/*.webp` (+ `-sm.webp`).
- `scripts/media/build-media.mjs` regenerates them; credits are in `src/data/photoCredits.json` and shown in the
  footer's “Photo credits” disclosure.

## Visual QA helper

`scripts/qa/decode-shot.mjs <cdp-screenshot.json> <out.jpg>` decodes a saved `Page.captureScreenshot` response.
Output goes to `scripts/qa/shots/` (git-ignored).

# Landing Page: Asset & Video Brief

This brief lists the media the public landing page (`/`) expects. The page ships
today with **dependency-free placeholders** (a teal gradient video frame, real
component previews, and Simple Icons brand marks), so it looks finished with no
assets. Replace the placeholders when production media is ready.

All copy is bilingual (ID/EN) and driven by
`apps/web/src/features/landing/landing.i18n.ts`. Keep any on-screen text in
assets editorial-clean: **no em-dashes**, use commas or periods.

Brand reference (already in `tailwind.config.ts`):
- Primary accent `hermes` teal `#0f766e` / `#14b8a6`
- AI/info `accent` blue `#2563eb`
- WhatsApp/success `channel` green `#25d366` (reserve green for the channel only)
- Neutral: cool slate (`#0f172a` ink, `#64748b` muted, `#f8fafc` surface)
- Type: Geist Sans (UI), Geist Mono (labels/numbers)
- Corners: 8 to 12px radius. Shadows: soft, low-contrast.

---

## 1. Hero supervisor video (OPTIONAL, future)

> Status: the Supervisor section (`#supervisor`) no longer ships a video. The
> earlier fake "play" frame was removed because it implied a video that did not
> exist. It now renders a **real, in-code Hermes review-decision card**
> (`SupervisorReviewMock.tsx`: AI draft, confidence 92, risk 8 / low, approve,
> reason) plus a "See it live on WhatsApp" link. The page is complete without a
> video. Only produce the clip below if you later want a motion walkthrough; if
> so, place it in a NEW section rather than replacing the review preview.

- **Placement:** a new section (do not replace the live review preview), 16:9 figure.
- **Format:** MP4 (H.264) + WebM, 1920x1080, plus a 1280x720 poster (JPG/WebP).
- **Length:** 60 to 90 seconds. No audio dependency (add captions; many viewers
  autoplay muted).
- **Story (screen-recording of the real dashboard, lightly motion-graphic'd):**
  1. A customer WhatsApp message lands in the multi-account inbox (live status dot).
  2. The AI drafts a reply; lead score ticks from Warm to Hot.
  3. **Hermes review overlay** appears: confidence + risk scores animate in.
  4. Decision resolves to "Approved, low risk"; the message sends.
  5. A second, risky message ("refund / threat") triggers `pause_ai` and a
     "takeover required" hand-off to a human agent.
- **On-screen labels:** keep to the product's real terms (AI ON, AI SUPERVISED,
  confidence, risk, takeover). No invented metrics.
- **Tone:** calm, precise SalesOps. Teal accent, slate UI, generous whitespace.
  Avoid stocky music stings and fast zooms.

### Poster frame
- 1280x720, shows the Hermes review overlay mid-decision. Used as the video
  `poster` and as social share preview.

---

## 2. Hero product preview (optional upgrade)

The hero right column currently renders a **real, in-code chat-thread preview**
(authentic Badge + bubble components). This is intentional and preferred over a
screenshot. If you want a richer still:

- **Option A (keep code preview):** no asset needed. Recommended.
- **Option B (screenshot):** 1200x900 PNG of the real inbox with one hot-lead
  thread + the Hermes status row. Light theme. Blur/avoid real customer PII and
  phone numbers. Export at 2x for retina.

---

## 3. Integration logos

Currently pulled live from **Simple Icons CDN** (`cdn.simpleicons.org`), tinted
slate, monochrome by default and full-color on hover: WhatsApp, Telegram,
OpenAI, PostgreSQL, Redis, Docker.

- **No asset work required** unless you want to self-host the SVGs for offline /
  CSP reasons. If self-hosting, drop monochrome SVGs in
  `apps/web/public/logos/` and swap the `<img src>` in
  `features/landing/components/Landing.tsx` (`IntegrationLogo`).
- Only show logos for integrations the product genuinely supports.

---

## 4. Social / OpenGraph image

Not yet wired. Recommended for link sharing.

- **Size:** 1200x630 PNG.
- **Content:** Hermes wordmark + shield mark (teal), headline
  "Run every WhatsApp Sales & CS account from one dashboard.", on a slate
  background with a subtle teal radial glow (matches the hero).
- **Wire-up:** add `openGraph.images` / `twitter.images` to
  `metadata` in `apps/web/src/app/layout.tsx`, asset in `apps/web/public/`.

---

## 5. Favicon / app icon (if not already final)

- 512x512 master (the teal shield mark on transparent), plus 32x32 and 16x16,
  and a maskable 192/512 for PWA. Place in `apps/web/public/`.

---

## Production notes

- **Performance:** keep the hero video lazy (it is below the fold). Serve WebM
  first, MP4 fallback, and always set the `poster`. Target < 4 MB for the clip.
- **Accessibility:** captions on the video; the play control already has an
  `sr-only` label and the reveal animations honor `prefers-reduced-motion`.
- **Dark mode:** every asset needs to read on both light (`#ffffff`) and dark
  (`#020617`) backgrounds. The logo wall already ships per-theme tints; do the
  same for any custom imagery (export light + dark variants or use a neutral mid
  tone).
- **No lifestyle stock photos.** This is an operations product; screen-true UI,
  real component previews, and brand marks carry it. Avoid generic
  people-at-laptops imagery (reads as filler).

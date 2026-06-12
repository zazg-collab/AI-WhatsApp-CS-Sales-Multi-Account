# Frontend Taste Skill Pass

Design read: redesign-preserve for a WhatsApp-style operations cockpit, with a restrained dark product language, leaning toward native Tailwind primitives and WhatsApp-green semantic accents.

Dial values applied from `design-taste-frontend`:

- `DESIGN_VARIANCE: 5` because this is a dense operator app, not a marketing site.
- `MOTION_INTENSITY: 3` because state feedback matters more than cinematic motion.
- `VISUAL_DENSITY: 8` because operators need a cockpit view with compact navigation and quick scanning.

Implementation choices:

- Keep one theme family across login, sidebar, and dashboard: dark WhatsApp shell with emerald as the only accent.
- Use one radius system: soft rounded panels, pills for filter controls, and rounded chat bubbles.
- Preserve page routes, labels, and product information architecture.
- Remove obvious AI design tells from the touched shell: no em-dash copy, no emoji-driven controls, no fake version labels, no fixed viewport utility shells, and no hand-rolled SVG navigation icons.
- Add tactile active states and reduced-motion fallbacks instead of heavy animation.
- Keep the dashboard as a real product interface, not a fake marketing screenshot.

Skill source used: `https://github.com/Leonxlnx/taste-skill`, install name `design-taste-frontend`.

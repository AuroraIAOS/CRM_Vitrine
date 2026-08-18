# Alma Pura · Design System

> *"A luz da Ciência na profundidade da Alma."*

This is the visual + content design system for the **Instituto Alma Pura** — an online institute of integrative therapies founded by **Maxwell Ribeiro**. The Institute operates at the intersection of neuroscience, Eastern contemplative philosophy (Buddhism, Taoism), and clinical practice. Atendimento 100% online — Brasil, Portugal, e mundo (PT/ES/EN).

The metaphor that organizes everything visually is the **dandelion** (dente-de-leão): a flower that thrives in cracks, blooms, then releases its seeds to the wind without resistance. It maps onto the three steps of the Método Alma Pura:

| Stage | Dandelion form | Concept |
|---|---|---|
| 1 · **Observação Samsara** | *bud* | Naming the present pattern of suffering |
| 2 · **Integração Límbico-Cortical** | *mature bloom* | Feeling and integrating emotion with reason |
| 3 · **Wu-Wei e Impermanência** | *seeds in wind* | Letting go without resistance |

---

## Sources

This design system was assembled from the following materials provided by the client. Paths assume read access to the original project; you may not have that — copies of everything we needed are inside this project.

- **`System Design/`** — local mounted codebase containing the prior design system HTML, CSS tokens, three reference dandelion watercolor paintings, full font files (Cinzel + Lato TTFs), 13 therapist photos, the founder's `briefing_almapura.docx`, the previous `Landing Page Alma Pura.html`, and the master `SKILL AlmaPura.skill` (a zipped Agent Skill bundle containing the full marketing playbook).
- **uploads/** in this project — `tokens.css`, `base.css`, `components.css`, `Alma Pura Design System.html`, three dandelion JPGs, a dandelion SVG, and three logo SVGs (mark, horizontal lockup, vertical lockup).
- The original SKILL bundle's nine reference docs were extracted to `tmp/skill_extracted/almapura/references/` for inspection: `arquetipo.md`, `design-system.md`, `tecnicas.md`, `publicos.md`, `precos.md`, `anamnese.md`, `seo-keywords.md`, `ferramentas-externas.md`, `seo-keywords.md`.

No Figma file was provided. No web codebase repo was provided (the previous landing page is a single-file Elementor-compatible HTML widget bundle).

---

## Index — files in this folder

| File / folder | What's in it |
|---|---|
| `README.md` | This document. Read first. |
| `SKILL.md` | Agent skill front-matter — makes this folder usable as a Claude Code skill. |
| `colors_and_type.css` | Self-contained CSS variables for color + type, with `@font-face` declarations. Import this first in any artifact. |
| `tokens.css` | Full token set: spacing scale, radii, shadows, borders, watercolor gradients. Original brand file — do not edit casually. |
| `base.css` | Reset, base typography classes, layout grids, ornaments. |
| `components.css` | Buttons, badges, chips, cards, swatches, fields, quiz options, nav, animations. |
| `assets/` | Logos (SVG), three reference dandelion paintings (square dense, square soft, landscape), one SVG dandelion-voador mark, six therapist photos. |
| `fonts/` | Cinzel (6 weights) and Lato (5 weights) TTFs. |
| `preview/` | Static HTML cards that populate the Design System tab — one per concept (palettes, type specimens, components, etc). |
| `ui_kits/` | Per-product UI kits with `index.html`, JSX components, and `README.md`. Currently: `landing/` (marketing site / landing page per persona) and `aurora/` (in-development internal CRM dashboard for the AURORA agent). |
| `tmp/` | Working copies of the original SKILL bundle and previous landing page. Not part of the system — reference only. |

---

## Content fundamentals

### Tone of voice

Direct, deep, engaging. The brand confronts when necessary, but with care. It is humanized and sensitive to the reader's pain. CTAs are clear and empathetic. Language is accessible but never simplistic. The brand transmits **Segurança · Método · Estrutura · Integração · Autenticidade · Acolhimento firme** (Safety · Method · Structure · Integration · Authenticity · Firm welcome).

Voice shifts by context — same vocabulary, different register:

- **Google Ads / capture** — direct, names the specific pain, never sensational
- **Landing page** — sequential: pain → understanding → method → CTA
- **Blog / educational** — analytical, structured, authority built with real examples
- **Social media** — humane, reflective, intelligent provocations, short and dense
- **WhatsApp / AURORA agent** — close, no jargon, like someone who knows the person
- **Video** — narrative, with rhythm, Maxwell as protagonist
- **Quizzes** — neutral, curious, no judgment — generates reflection, not diagnosis

### Casing

- Body copy and headings: **sentence case** with Portuguese capitalization rules.
- The display word "Cinzel" is so all-caps-friendly that headlines in Cinzel sometimes read uppercase by design (small-caps style). The brand uses sentence case in the underlying text; the typeface's all-caps glyph design does the rest.
- Eyebrows, CTAs, badges, navigation links: **UPPERCASE** with generous letter-spacing (0.18–0.24em).
- The wordmark itself: `ALMA · PURA` — uppercase, with a centered dot ornament.

### Person — "you" or "I"?

The brand uses **"você"** (informal "you") in nearly all copy. The institute speaks *to* the reader. It uses **"nós"** (we) when describing how the institute works, and occasionally **"eu"** (I) in Maxwell's first-person voice — biography, manifesto, philosophy posts. The institute never patronizes; "você" is intimate, not formal.

### Emoji

**Not used** in marketing or interface copy. The only emoji-like glyphs that appear are three internal symbols in `tecnicas.md` to flag epistemic category (`🔬` scientific, `🌿` empirical/traditional, `✍️` authorial). These are admin-only — they never appear in user-facing copy. For UI ornament, use the typographic `·` (middle dot) and the brand's dandelion seed motif instead.

### Vocabulary

**Compose with these words** (signals brand voice):
reorganização emocional · autonomia · processo · padrões · consciência · integração · clareza interna · sofrimento compreendido · transformação real · método · ciência e alma · profundidade · impermanência · presença · maturidade emocional · honestidade intelectual

**Banned absolutely** (poisons the brand — destroys differentiation from "coach quântico" competitors):
cura milagrosa · energias negativas · vibração alta · despertar · iluminado · abundância (lei-da-atração sense) · coach · terapeuta quântico · quantum · DNA reconstituído · realinhamento quântico

### Example copy

A few headlines and one-liners that exemplify the voice:

> *Sofrimento não é fraqueza. É desorganização.*
>
> *Você não precisa se consertar. Precisa se compreender.*
>
> *Ciência e alma não são opostos — são o mesmo território.*
>
> *Por que você vive os mesmos conflitos com pessoas diferentes? Isso tem nome — e tem saída.*

CTAs: `Agendar avaliação` · `Quero começar` · `Conhecer o método` · `Iniciar jornada` · `Saber mais →`

---

## Visual foundations

### Color

Three families, plus warm neutrals and a graphite range. **Teal/sage is primary** — never institutional blue alone. **Gold is surgical** — reserved for CTAs, premium accents, signatures. The blue family is institutional/academic and recedes; teal carries the brand.

Backgrounds default to **warm cream paper (`#FBF9F3`)** — not white. The brand is set on paper, never on pixel-white. Deep backgrounds use the Prussian blue gradient (`grad-dusk`) sparingly — for institutional signatures and rare moments of weight.

Three reference gradients carry most of the atmosphere:
- `--grad-meadow` — radial fields of teal + ocean + sage on ivory → fog → mist; the canonical hero ground
- `--grad-breeze` — soft breeze radials on paper; the default for comfortable sections
- `--grad-dusk` — prussian → ocean linear; institutional, rare

Color rules: **never use #FFFFFF**. Never pure black — body text is graphite `#2E3733`, deepest ink only on solid color blocks. Never combine teal and gold in the same component without warm neutral mediation.

### Typography

**Cinzel** (serif display) for titles and the logotype — feels carved, classical, slightly Latin-inscriptional. **Cormorant Garamond italic** for poetic emphasis. **Lato** (sans) for body and UI — light weight (300) is preferred for leads, regular (400) for body, bold (700) for eyebrows and CTAs. **JetBrains Mono** for metadata, hex codes, captions.

**Mixed-font headlines** — when a single line mixes Cinzel and Cormorant, the *sentence* is set in **Cormorant Garamond italic** and the *emphasis word(s)* are set in **Cinzel**. The base CSS does this automatically: any `.display` or `h1–h4` element that contains an `<em>` flips to Cormorant-italic prose with Cinzel emphasis (via `:has(em)`). Headlines without `<em>` stay in Cinzel.

Default body line-height is **1.75** — generous. Headlines use **0.04–0.06em** tracking; eyebrows + CTAs use **0.18–0.24em**. Generous tracking is part of the voice — it gives the typography ar (air).

### Spacing

A 10-step scale from 4px to 128px (`--sp-1` through `--sp-10`). Sections breathe at `--sp-9` (96px) padding top/bottom. Cards inset at `--sp-5–6` (24–32px). Stacks of content use the `.stack-N` utility for vertical rhythm.

### Backgrounds & imagery

- **Three watercolor dandelion paintings** are the visual library: `dandelion-square-dense.jpeg`, `dandelion-square-soft.jpeg`, `dandelion-landscape.jpeg`. Always used as **background** (never as floating image). Always with an overlay/veil for text legibility.
- Therapist portraits are warm, lit naturally, soft contrast.
- No hand-drawn illustrations beyond the dandelion SVG motifs.
- No repeating patterns or textures.
- Bleeds: `bleed-paper`, `bleed-ivory`, `bleed-mist`, `bleed-meadow`, `bleed-deep` — switching between these is how a long page builds rhythm.

### Veils & overlays

Texto over watercolor **always** requires a veil. Four canonical veils:
- `paper` — `paper 88% → 10%` linear · dark text · for headlines and reading
- `dusk` — `blue-900 10% → 70%` linear · light text · for captions over imagery
- `seal` — `teal-900 82% → ocean 30%` 135° · institutional hero
- `mist` — `paper 55% + 1.5px blur` · for forms and cards atop imagery

### Animation

Slow, ambient, never bouncy. The signature animation is **drift** — a 6s ease-in-out sine on ±6px y and ±1.5° rotation, applied to dandelion seed motifs. Buttons translate up `-1 to -2px` on hover (≤0.25s ease). No spring physics. No staggered cascades. No scroll-jacking. The brand exhales; it doesn't perform.

### Hover & press states

- **Buttons**: hover → translateY(-1 to -2px) + a soft teal or gold-tinted shadow + minor color shift (primary → teal-900; gold → brightness 1.05). Press: no shrink — the lift simply settles. Avoid scale().
- **Links**: hover → color shifts from `--seal` to `--accent` (gold). No underline by default; some quiet buttons use a thin underline that brightens.
- **Cards**: hover → border-color from hairline gray to `rgba(45,122,110,0.22)` + `--shadow-breath` + translateY(-2px). Slow (0.3s).
- **Quiz options**: hover → border becomes seal + background gets a 6%-tint teal wash. Selected state adds an inner ring of seal.

### Borders

Always hairlines. `--bd-hairline` is `1px solid rgba(46,55,51,0.08)`. `--bd-whisper` (0.12 opacity) for slightly stronger separators. `--bd-gold` (0.35 opacity gold) for premium frames. Never use a 2px+ border except the 2px top-of-card "seal" / "gold" indicator used on `.card-seal` / `.card-gold` — and that is the only place colored borders appear.

### Shadows

Three named shadows, all teal-tinted (never black):
- `--shadow-rest` — barely visible 1px settle
- `--shadow-breath` — small ambient lift, for cards
- `--shadow-float` — for mobile mockups and floating cards

### Corner radii

Small. **The brand is never very round.**
- `--r-1` 2px — sharp edges (buttons, inputs)
- `--r-2` 4px — slightly softened (button radius)
- `--r-3` 8px — cards atop other cards
- `--r-4` 14px — main cards, device mockups
- `--r-pill` 999px — chips, badges, status dots only

### Cards

Glass cards by default: `rgba(255,255,255,0.65)` with `backdrop-filter: blur(10px)`, hairline border, `--r-4` (14px) radius. Solid variants (`.card-solid`) use paper bg + whisper border. The brand uses a "top seal" — a 2px top border in teal (`.card-seal`) or gold (`.card-gold`) — instead of left-border accents (which would feel like web tropes the brand explicitly avoids).

### Layout

Max content width `1240px`. Narrow reading column `860px`. Sections breathe with `padding: --sp-9` (96px) top/bottom. The sticky nav is a translucent paper bar with `blur(20px)`.

### Transparency & blur

Used deliberately. Cards default to `rgba(255,255,255,0.65)` over a paper or meadow bleed. Sticky nav uses `rgba(251,249,243,0.85) + blur(20px)`. The `mist` veil over imagery uses `rgba(paper,0.55) + blur(1.5px)`. **Never use blur on body text** — only on backgrounds.

### Imagery color vibe

Warm. The watercolors are teal-and-sage with cream-ivory highlights. No b&w. No heavy grain. No saturated photography — therapist portraits are soft natural light, low contrast, warm tint.

---

## Iconography

The brand's iconography is intentionally minimal and **earned, not seeded**. There is no system-wide icon font or sprite. Most icons in the system are **inline SVGs of dandelion motifs** drawn with hairline strokes (0.7–0.8px) using `currentColor` — they inherit the surrounding text color, never carrying their own.

Four canonical dandelion motif SVGs are defined inline in `Alma Pura Design System.html` (preserved here as a `<symbol>` library in `preview/icons.html`):
- `#ap-dandelion` — full bloom (stage 2 metaphor — integration)
- `#ap-bud` — closed bud (stage 1 — observation)
- `#ap-seed` — single seed in air (stage 3 — wu-wei)
- `#ap-twig` — empty stem (transition, ornament)

For UI chrome that genuinely needs functional icons (close, chevron, plus, check, hamburger, send, calendar, etc.), this system **substitutes Lucide** from CDN — its hairline stroke style matches the brand's drawn motifs. Flag this substitution where it appears:

```html
<script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>
```

Stroke weight: **1.5–1.75px** to match the dandelion motifs. Color: always `currentColor`. Size: 16–24px in UI, up to 44px when used as a section ornament. Never filled — always outline.

**No emoji** in user-facing copy. **Unicode middle dot `·`** is used as the brand's structural separator — in the wordmark (`ALMA · PURA`), in metadata strings (`90 min · Online · Zoom`), and in slug-style date/byline lines. The seed dot (`<span class="seed"></span>`) is a 4px gold-filled circle used as a typographic pause.

**Logos:** Three lockups are available in `assets/` — `logo.svg` (mark only — a single dandelion), `logo_texto_horizontal.svg` (horizontal lockup), `logo_texto_vertical.svg` (vertical lockup). Use the mark alone in small spaces (favicons, app icons, social avatars, watermark in corner of dark backgrounds). Use the horizontal lockup for nav bars and email signatures. Use the vertical lockup for hero compositions and printed materials.

**Logo behavior:**
- Minimum clear space: 1× the height of the dandelion mark on all sides
- Minimum size: 24px tall for the mark; 32px for the horizontal lockup
- Acceptable colors: graphite on paper, paper on teal/blue/dusk, gold on dusk for premium moments
- Never tilt, recolor outside palette, place on busy imagery without a veil, or apply effects (shadows, glows, outlines)

---

## UI Kits

- **`ui_kits/landing/`** — marketing site / landing page. The primary surface the brand presents to the world; one LP per persona is the strategy.
- **`ui_kits/aurora/`** — the in-development internal AURORA dashboard (the AI agent's operator view: leads, conversations, agendamentos, métricas). Marked WIP since this product is still being built — only core surfaces are mocked.

Each kit has its own `README.md` describing scope, screens, and component coverage.

---

## Slide samples

No slide template was provided in the source materials. The `slides/` folder is intentionally absent. If a deck template is added later (Apresentação institucional, pitches, treinamentos), it should follow the same paper/meadow bleed system and Cinzel + Cormorant + Lato hierarchy.

---

## Caveats & open questions

- **Personas are unvalidated** statistically — the four personas in `tmp/skill_extracted/almapura/references/publicos.md` are based on clinical observation, not field research. Treat them as hypotheses to test in real campaigns.
- **AURORA is in development.** The UI kit for it is a directional mock based on the SKILL's stated stack (n8n + Claude + Supabase + Google Agenda); no production screens or code exist yet.
- **No icon system** was provided — Lucide is the recommended substitute; we did not have time to audit the full set of icons the product will need.
- **Cormorant Garamond** is loaded from Google Fonts (not bundled as TTF). If offline-first is required, download and self-host.

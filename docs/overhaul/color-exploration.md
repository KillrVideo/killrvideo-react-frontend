# KillrVideo UI/UX Overhaul — Color Palette Exploration

This document records the color palette analysis for all five prototype directions in the KillrVideo overhaul project. Each prototype uses a distinct visual language to solve the same core problem: making developer artifacts legible without overwhelming the consumer video UI.

---

## Shared Design Language

All five prototypes now share a single Cuvia-inspired warm editorial palette. This replaces the original purple-centric brand palette across layout surfaces, CTAs, and primary accents. The shared language ensures that switching between prototypes feels like comparing layouts, not comparing entirely different products.

### Core Palette

| Role | Hex | Usage |
|---|---|---|
| Primary (orange-red) | `#E85B3A` | All CTAs, active states, primary accents, write badges |
| Dark (navy-black) | `#1A1A2E` | Dark backgrounds, headlines on light, text on light |
| Warm surface | `#252538` | Elevated dark surfaces within dark-mode layouts |
| Cream | `#FBF8F4` | Light page backgrounds, alternating consumer bands |
| Light gray | `#F5F3EF` | Subtle card surfaces, tag/pill backgrounds |
| Text — dark | `#1A1A2E` | Primary text on light backgrounds |
| Text — medium | `#4A4A5A` | Secondary text, captions, descriptions |
| Text — muted | `#8A8A9A` | Labels, timestamps, metadata |
| Light text — primary | `#E8E6E1` | Primary text on dark/navy backgrounds |
| Light text — secondary | `#B0AEA8` | Secondary text on dark backgrounds |
| Dev teal | `#0DB7C4` | Developer artifacts, READ query badges, dev borders |
| Gold | `#FFCA0B` | Star ratings, highlight accents |

### Typography

| Role | Typeface | Usage |
|---|---|---|
| Headlines | Playfair Display | Page titles, section headers, card titles, editorial headings |
| Body & UI | Inter | Body copy, labels, captions, code annotations, navigation |

### Why the Shift from Purple

The original palette was built around `#6B1C96` (brand purple) as the primary action color. On light backgrounds the purple reads slightly burgundy, and on dark backgrounds it has limited contrast headroom. As the design direction evolved toward a warm editorial aesthetic — influenced by Cuvia's approachable, content-first visual language — the primary action role moved to `#E85B3A` (warm orange-red). Orange-red carries warmth and energy without the formality of purple; it is immediately legible on both cream and white surfaces, and it forms a natural complement to the navy-black `#1A1A2E` used for dark surfaces and headlines. The Dev teal `#0DB7C4` and gold `#FFCA0B` are retained unchanged: they are established semantic signals, not decorative choices, and re-assigning them would break the visual grammar users learn across all prototypes.

### Semantic Badge Colors (all prototypes)

| Badge | Background | Usage |
|---|---|---|
| [PK] Partition Key | `#E85B3A` (orange) | Structural key — highest importance |
| [CK] Clustering Key | `#0DB7C4` (teal) | Ordering key — developer artifact family |
| READ | `#0DB7C4` (teal) | Cool, non-destructive |
| WRITE | `#E85B3A` (orange) | Warm, mutable — matches primary action color |
| DELETE | Red (`#EF4444` or equivalent) | Standard destructive convention |

---

## Prototype 1: Terminal Fusion

A dark IDE aesthetic that makes developers feel immediately at home. The warm editorial palette adapts to the dark context: the navy-black `#1A1A2E` becomes the page background, and `#252538` serves as the elevated surface. Orange keywords and warm off-white text warm up what would otherwise be a cold monochrome environment.

### Full Palette

| Role | Hex | Usage |
|---|---|---|
| Background | `#1A1A2E` | Page background (warm navy-black) |
| Surface | `#252538` | Elevated cards, panels |
| Text primary | `#E8E6E1` | Body text (warm off-white) |
| Text secondary | `#B0AEA8` | Muted labels, timestamps, captions |
| Dev teal | `#0DB7C4` | Dev panel accents, READ badges, borders |
| Primary orange | `#E85B3A` | CTAs, active states, WRITE badges |
| Accent gold | `#FFCA0B` | Highlights, star ratings |

### Syntax Highlighting

| Token | Hex | Role |
|---|---|---|
| Keywords | `#E85B3A` | Orange — language keywords (warm, assertive) |
| Strings | `#9ECE6A` | Soft green — string literals |
| Functions | `#7AA2F7` | Soft blue — function names and calls |
| Comments | `#B0AEA8` | Warm muted — matches light text secondary |

### Color Rationale

- **`#1A1A2E` background:** The shared dark value from the palette used as the IDE base. Warm navy rather than cold black — the blue-violet undertone harmonises with the editorial color family and prevents the dark UI from feeling sterile.
- **`#252538` surface:** The warm elevated surface. Provides card depth without drop shadows, keeping the aesthetic clean.
- **`#E8E6E1` text primary:** Warm off-white rather than pure white or lavender. The warm undertone coheres with the cream used in light-mode prototypes — the same typographic voice, adjusted for dark context.
- **`#B0AEA8` text secondary:** Warm muted tone that also serves as the comment color in syntax highlighting, unifying UI chrome and code panels.
- **`#E85B3A` keywords:** Orange keywords in code panels visually echo the orange CTAs in the UI chrome. The same color means "action" or "significant element" whether it appears in a button label or a `SELECT` keyword.
- **`#0DB7C4` dev teal:** High contrast against both `#1A1A2E` (approx. 5.3:1) and `#252538` (approx. 4.7:1), meeting WCAG AA for normal text.

### Dev Artifact Distinction

Developer panels use `#0DB7C4` left-border accents and background tints from `#0DB7C4` at low opacity (approximately `rgba(13, 183, 196, 0.08)`). Consumer video cards use `#252538` surfaces with no teal anywhere.

### Accessibility Notes

- Primary text `#E8E6E1` on `#1A1A2E`: approximately **10.8:1** — exceeds WCAG AAA.
- Dev teal `#0DB7C4` on `#1A1A2E`: approximately **5.3:1** — passes WCAG AA.
- Dev teal `#0DB7C4` on `#252538`: approximately **4.7:1** — passes WCAG AA.
- Orange `#E85B3A` (button) with white label text: approximately **3.9:1** — passes WCAG AA for large text and UI components. Use at 16px bold minimum for button labels; do not use as small body text.
- Gold `#FFCA0B` on `#1A1A2E`: approximately **9.5:1** — passes WCAG AAA; avoid dark text on gold at small sizes.

---

## Prototype 2: Clean Canvas

Maximum whitespace and typographic clarity. The warm editorial palette replaces the previous violet-based clean aesthetic: orange CTAs replace the violet primary, and Playfair Display headlines give the white surface an editorial warmth that plain sans-serif headlines lack.

### Full Palette

| Role | Hex | Usage |
|---|---|---|
| Background | `#FFFFFF` | Page background (pure white) |
| Surface | `#FBF8F4` | Card backgrounds (warm cream) |
| Text primary | `#1A1A2E` | Body text (navy-black) |
| Text secondary | `#4A4A5A` | Captions, metadata |
| Text muted | `#8A8A9A` | Labels, timestamps |
| Dev teal | `#0DB7C4` | Dev panel borders, badges, icons |
| Dev block background | `rgba(13, 183, 196, 0.05)` | Very light teal tint for dev block fill |
| Dev block border | `#0DB7C4` | 3px solid left-border |
| Primary orange | `#E85B3A` | Primary buttons, active states, WRITE badges |
| Accent gold | `#FFCA0B` | Star ratings, highlights |

### Color Rationale

- **`#FFFFFF` background:** Pure white maximises breathing room. The warm serif headlines and cream card surfaces provide warmth without tinting the page itself.
- **`#FBF8F4` surface (warm cream):** A cream card fill that lifts cards from the white page with warmth rather than a cool grey tint. The temperature difference from `#FFFFFF` is gentle — approximately 1.04:1 perceived contrast — perceptible when surfaces are adjacent.
- **`#1A1A2E` text primary:** Near-black with a warm navy undertone. Avoids the harshness of pure `#000000` while delivering approximately **18.5:1** on white — exceeds all WCAG thresholds.
- **`#E85B3A` primary orange:** Replaces the previous `#7C3AED` violet. Orange CTAs are warmer and more energetic on white surfaces, and they cohere naturally with the `#1A1A2E` navy-black used for headlines. Contrast on white: approximately **3.9:1** — use at button size (large text / UI component) where WCAG AA for large text applies.
- **`#0DB7C4` dev block left border (3px solid):** The "margin note" metaphor. Signals "annotation" without requiring dev blocks to compete for space. The very light teal fill (`rgba(13, 183, 196, 0.05)`) reinforces the distinction without interrupting reading flow.

### Dev Artifact Distinction

Consumer content: white background, cream card surfaces, orange CTAs, serif headlines — no teal. Developer blocks: light teal fill, 3px solid `#0DB7C4` left border, teal icon colors. The left-border pattern borrows from editorial pull-quote conventions.

### Accessibility Notes

- Text primary `#1A1A2E` on `#FFFFFF`: approximately **18.5:1** — exceeds WCAG AAA.
- Text primary `#1A1A2E` on `#FBF8F4`: approximately **17.2:1** — exceeds WCAG AAA.
- Text secondary `#4A4A5A` on `#FFFFFF`: approximately **7.1:1** — exceeds WCAG AAA.
- Orange `#E85B3A` (button) with white label: approximately **3.9:1** — passes WCAG AA for large text and UI components. Do not use orange for small body text on white.
- Dev teal `#0DB7C4` on `#FFFFFF`: approximately **3.9:1** — passes WCAG AA for large text and UI components (borders, icons). Do not use for small body text on white.
- Gold `#FFCA0B` on `#FFFFFF`: approximately **1.7:1** — insufficient for text use. Used only as decorative fill (star icons); always pair with a darker border or shadow.

---

## Prototype 3: Split Lens

A side-by-side divided layout where temperature contrast communicates consumer vs. developer context without any label. The warm editorial palette sharpens the temperature contrast: the consumer left now uses cream `#FBF8F4` and navy text `#1A1A2E`, while the developer right uses `#1A1A2E` as its background — the same value appears as text on one side and as a background on the other, creating a clean inversion.

### Full Palette

**Consumer half (left):**

| Role | Hex | Usage |
|---|---|---|
| Background | `#FBF8F4` | Warm cream page fill |
| Surface | `#FFFFFF` | Card backgrounds |
| Text primary | `#1A1A2E` | Navy-black — warm dark |
| Primary orange | `#E85B3A` | CTAs, buttons, WRITE badges |
| Accent gold | `#FFCA0B` | Highlights, ratings |

**Developer half (right):**

| Role | Hex | Usage |
|---|---|---|
| Background | `#1A1A2E` | Warm navy-black |
| Surface | `#252538` | Elevated panels |
| Text primary | `#E8E6E1` | Warm off-white |
| Dev teal | `#0DB7C4` | Panel accents, READ badges, borders |

**Divider:**

| Role | Value | Usage |
|---|---|---|
| Divider | `4px gradient` | Linear gradient from `#FBF8F4` to `#1A1A2E` (warm cream to warm navy) |

### Color Rationale

- **`#FBF8F4` (warm cream) consumer side:** The same cream used in Clean Canvas and the hub page. Signals "soft," "human," "content-first." Pairs with the `#1A1A2E` navy text, which has a warm undertone that coheres with the cream surface.
- **`#1A1A2E` developer side background:** The inversion: the same value that appears as text color on the consumer left becomes the page background on the developer right. The layout makes the meaning of the inversion immediate — no label required.
- **4px gradient divider:** A smooth blend from `#FBF8F4` to `#1A1A2E`. The warm-to-warm transition (cream to warm navy) is more harmonious than the original warm cream to cold slate — the gradient feels intentional rather than abrupt.
- **`#E85B3A` consumer CTAs:** Orange appears only on the consumer side. On the developer side, `#0DB7C4` (teal) is the only accent. The clean separation of orange and teal mirrors the clean separation of the two panes.

### Dev Artifact Distinction

The layout is the distinction. Consumer content lives on the warm cream left; developer content lives on the warm navy right. Teal `#0DB7C4` appears only on the right side. Orange `#E85B3A` appears only on the left side.

### Accessibility Notes

- Consumer text `#1A1A2E` on `#FBF8F4`: approximately **17.2:1** — exceeds WCAG AAA.
- Consumer text `#1A1A2E` on `#FFFFFF`: approximately **18.5:1** — exceeds WCAG AAA.
- Developer text `#E8E6E1` on `#1A1A2E`: approximately **10.8:1** — exceeds WCAG AAA.
- Dev teal `#0DB7C4` on `#1A1A2E`: approximately **5.3:1** — passes WCAG AA.
- Dev teal `#0DB7C4` on `#252538`: approximately **4.7:1** — passes WCAG AA.
- Orange `#E85B3A` (button) on consumer side with white label: approximately **3.9:1** — passes WCAG AA for large text / UI components.
- Gradient divider is decorative; no text sits on or near it.

---

## Prototype 4: Floating Inspector

A polished consumer UI with a frosted-glass developer panel that floats over the page. The warm editorial palette replaces the purple-to-indigo gradient header with a clean cream surface and warm navy typography. The floating panel retains its teal border and glow — the panel is the most literal expression of "teal means developer artifact." The FAB shifts from purple to orange, aligning with the primary action color across all prototypes.

### Full Palette

**Consumer UI:**

| Role | Hex | Usage |
|---|---|---|
| Background | `#FBF8F4` | Warm cream page fill |
| Surface | `#FFFFFF` | Cards with warm subtle shadow |
| Text primary | `#1A1A2E` | Navy-black |
| Text secondary | `#4A4A5A` | Captions, metadata |
| Primary orange | `#E85B3A` | CTAs, buttons |

**Floating developer panel:**

| Role | Value | Usage |
|---|---|---|
| Panel background | `rgba(26, 26, 46, 0.95)` | Frosted dark, slightly transparent |
| Panel border | `1px solid #0DB7C4` | Teal glow border |
| Panel box shadow | `0 0 20px rgba(232, 91, 58, 0.18)` | Subtle orange ambient glow |
| Panel backdrop filter | `blur(12px)` | Frosted glass effect |
| Panel text | `#E8E6E1` | Warm off-white |
| Tab active | `#0DB7C4` | Active tab indicator |

**FAB (Floating Action Button):**

| Role | Hex | Usage |
|---|---|---|
| FAB background | `#E85B3A` | Primary orange with pulse animation |

### Color Rationale

- **`#FBF8F4` background:** The shared warm cream. Consumer UI reads immediately as "content space" before any interaction.
- **`rgba(26, 26, 46, 0.95)` floating panel:** The warm navy-black at near-full opacity with `blur(12px)` backdrop-filter produces a frosted glass effect. Using `#1A1A2E` as the panel background creates continuity with the developer side of Split Lens and the Terminal Fusion background — all three dark surfaces are the same warm navy.
- **`1px solid #0DB7C4` border + `0 0 20px rgba(232, 91, 58, 0.18)` shadow:** The teal border defines the panel boundary. The orange ambient glow is a subtle departure from the earlier teal glow: the orange glow connects the floating panel to the orange CTA system, signalling "this panel is a tool you are actively operating" rather than "this is a passive annotation." The teal border remains the primary semantic signal.
- **`#E85B3A` FAB with pulse animation:** The shared primary color. The FAB is the only persistent dev-mode element visible in consumer view. Orange ensures it reads as an actionable CTA, not an informational badge.

### Dev Artifact Distinction

The consumer UI contains no teal — cream background, white cards, orange CTAs, warm navy text. The floating panel is identified by its teal border and dark frosted background. The orange glow on the panel ties it to the orange CTA system while the teal border signals its developer identity.

### Accessibility Notes

- Consumer text `#1A1A2E` on `#FBF8F4`: approximately **17.2:1** — exceeds WCAG AAA.
- Consumer text `#1A1A2E` on `#FFFFFF`: approximately **18.5:1** — exceeds WCAG AAA.
- Panel text `#E8E6E1` on `rgba(26, 26, 46, 0.95)` (effectively `#1A1A2E` at 95% opacity): approximately **10.8:1** — exceeds WCAG AAA.
- Teal active tab `#0DB7C4` on panel background: approximately **5.3:1** — passes WCAG AA.
- Orange `#E85B3A` (FAB / button) with white label: approximately **3.9:1** — passes WCAG AA for large text / UI components. Ensure the FAB label is at minimum 18px bold or 24px regular.
- The panel box shadow and backdrop blur are purely decorative. Ensure the panel has a visible `1px solid #0DB7C4` border for users with reduced transparency mode enabled.

---

## Prototype 5: Narrative Scroll

An editorial magazine layout where alternating cream and navy bands guide the reader through a learning sequence. The warm editorial palette is the most native fit here: Playfair Display headlines appear in each consumer band, and the navy developer bands use the shared `#1A1A2E` background. Orange WRITE badges and teal READ badges create a consistent read/write semantic that readers learn in the first developer band and carry through the rest of the scroll.

### Full Palette

**Alternating content bands:**

| Band type | Hex | Usage |
|---|---|---|
| Consumer band (primary) | `#FBF8F4` | Warm cream — shared light background |
| Consumer band (alternate) | `#FFFFFF` | Pure white — prevents monotony in long scroll |
| Developer band | `#1A1A2E` | Warm navy-black — shared dark background |

**Typography:**

| Role | Hex | Typeface |
|---|---|---|
| Headlines | `#1A1A2E` | Playfair Display — consumer bands |
| Headlines (dark band) | `#E8E6E1` | Playfair Display — developer bands |
| Body text (light band) | `#4A4A5A` | Inter |
| Body text (dark band) | `#B0AEA8` | Inter |

**Operation type color coding:**

| Operation | Hex | Rationale |
|---|---|---|
| READ queries | `#0DB7C4` | Teal — cool, non-destructive, shared dev signal |
| WRITE queries | `#E85B3A` | Orange — warm, mutable, matches primary action color |
| DELETE operations | `#EF4444` | Red — standard destructive convention |
| Schema elements | `#252538` surface + `#E8E6E1` text | Structural — warm dark family |

**Scrollspy dots (right edge):**

| Active band | Dot color | Hex |
|---|---|---|
| Developer band active | Teal dot | `#0DB7C4` |
| Consumer band active | Orange dot | `#E85B3A` |

### Color Rationale

- **`#FBF8F4` / `#FFFFFF` consumer bands:** Alternating between warm cream and pure white prevents the consumer bands from feeling repetitive in a long scroll. The cream signals "narrative content"; the white signals "direct information."
- **`#1A1A2E` developer band:** Warm navy rather than cold black. The same value used as text on light surfaces and as backgrounds on dark surfaces across all prototypes — the palette is fully self-consistent.
- **`#4A4A5A` body text (light bands):** Medium warm tone that reads as high-contrast on both cream and white (approximately **7.1:1** on `#FFFFFF`) without the weight of near-black. Appropriate for long-form editorial prose.
- **`#E85B3A` WRITE queries:** The read/write semantic is temperature-encoded: teal (`#0DB7C4`) is cool and signals "reading from the database — nothing changes." Orange (`#E85B3A`) is warm and signals "writing to the database — something is changing." The orange WRITE badge now uses the same color as the primary CTA, reinforcing that writes are significant actions requiring attention — consistent with button semantics elsewhere in the design system.
- **Scrollspy dots:** Orange dot for consumer bands, teal dot for developer bands. The dot color mirrors the badge color system: orange = action/consumer, teal = developer artifact. The scrollspy becomes an ambient indicator of content mode without requiring a label.

### Dev Artifact Distinction

The band itself is the distinction: developer bands are `#1A1A2E` warm navy. Consumer bands are cream or white. Within developer bands, teal marks reads and orange marks writes. Neither teal nor orange appears in consumer bands — they are exclusive to developer context.

### Accessibility Notes

- Body text `#4A4A5A` on `#FFFFFF`: approximately **7.1:1** — exceeds WCAG AAA.
- Body text `#4A4A5A` on `#FBF8F4`: approximately **6.6:1** — exceeds WCAG AAA.
- Developer band: primary text `#E8E6E1` on `#1A1A2E`: approximately **10.8:1** — exceeds WCAG AAA.
- Developer band: secondary text `#B0AEA8` on `#1A1A2E`: approximately **5.8:1** — passes WCAG AA.
- READ teal `#0DB7C4` on `#1A1A2E`: approximately **5.3:1** — passes WCAG AA.
- WRITE orange `#E85B3A` on `#1A1A2E`: approximately **4.1:1** — passes WCAG AA for normal text. Bold weight recommended for badge use.
- WRITE orange `#E85B3A` on `#FFFFFF`: approximately **3.9:1** — passes WCAG AA for large text and UI components. Orange should not appear as small body text on light consumer bands.
- Heading color `#1A1A2E` on `#FBF8F4`: approximately **17.2:1** — exceeds WCAG AAA.
- Playfair Display should be loaded from Google Fonts with an `Inter` fallback. Ensure the chosen weights render well at small sizes. The band background is the structural wayfinding signal; do not rely on typeface alone to distinguish section types.
- Scrollspy dots are decorative navigation aids; visible section headings remain the primary wayfinding mechanism.

---

## Shared Color Language

These conventions are fixed across all five prototypes. Consistency here is what makes orange and teal navigational signals rather than decorative choices.

### Semantic Color Assignments

| Meaning | Color | Hex | Notes |
|---|---|---|---|
| Primary action / CTA | Orange | `#E85B3A` | Replaces purple across all prototypes |
| Developer artifact (general) | Teal | `#0DB7C4` | Never used for consumer UI — see Principle 2 |
| Dark background / headline | Navy-black | `#1A1A2E` | Shared across dark surfaces and light-mode text |
| Light background | Warm cream | `#FBF8F4` | Shared across consumer-facing light surfaces |
| Highlight / rating | Gold | `#FFCA0B` | Star ratings, callout highlights |
| READ operation | Teal | `#0DB7C4` | "Cool = non-destructive" mental model |
| WRITE operation | Orange | `#E85B3A` | "Warm = mutable" — consistent with primary CTA color |
| DELETE operation | Red | `#EF4444` | Standard destructive action convention |

### Schema Key Badges

| Badge type | Background | Hex | Rationale |
|---|---|---|---|
| Partition Key [PK] | Orange | `#E85B3A` | Structural importance — primary action family |
| Clustering Key [CK] | Teal | `#0DB7C4` | Developer artifact family |
| Regular column | Neutral | `#8A8A9A` | No special role — visually de-emphasized |

### Query Operation Badges

| Badge | Color | Hex |
|---|---|---|
| READ | Teal | `#0DB7C4` |
| WRITE | Orange | `#E85B3A` |
| DELETE | Red | `#EF4444` |

### Why These Assignments Are Fixed

The orange/teal/gold three-way split is now the established visual grammar across all five prototypes. If any prototype reassigned teal to a consumer UI element, or used orange for a purely decorative purpose unconnected to action or mutation, the grammar would break for users who have learned the pattern from one part of the interface. The prototypes differ in layout, tone, and light/dark distribution — they do not differ in what orange, teal, or gold mean.

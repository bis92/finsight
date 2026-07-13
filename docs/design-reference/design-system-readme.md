# finsight Design System

**finsight** is a demonstration fintech/crypto brand modeled on Coinbase's marketing surfaces — an institutional financial brand that happens to trade crypto. The surfaces are quiet, white-canvas, editorially spaced, and almost monochromatic. A single brand voltage — **Coinbase Blue (`#0052ff`)** — carries every primary CTA, the wordmark, and inline emphasis links, used scarcely.

This system covers **marketing surfaces only**. In-product trading surfaces (order books, charts, order forms) live behind login walls and are out of scope.

## Sources
Built entirely from a written brand specification (the "finsight / Coinbase marketing" design brief). **No codebase, Figma file, or slide decks were provided** — there are no external source links to record. If a codebase or Figma exists, re-attach it and this system can be reconciled against it.

## Brand mark
**No logo or brand mark was supplied.** Per policy we did not draw or reconstruct one. The wordmark renders as plain type — "finsight" in the display font, Coinbase Blue — everywhere a mark would appear (`TopNav`, `Footer`). Supply a real logo file to replace it.

## Fonts — substituted (ACTION NEEDED)
CoinbaseDisplay, CoinbaseSans, and CoinbaseMono are licensed Coinbase typefaces and were **not** provided. Per the brief's documented substitutes we use Google Fonts:
- **CoinbaseDisplay → Inter** (weight 400, tracking ≈ -1.5%)
- **CoinbaseSans → Inter** (400 / 600 / 700)
- **CoinbaseMono → JetBrains Mono** (500)

These load via Google Fonts CDN in `tokens/fonts.css`. **Please provide the licensed woff2 files** to swap in `@font-face` rules for pixel-accurate output.

---

## Content Fundamentals

**Voice: calm institutional trust, not fintech urgency.** Copy reads like an editorial financial brand (closer to Bloomberg / the Financial Times than a trading dashboard). The single most distinctive signal is typographic — display headlines sit at weight 400, never bold — but it carries into copy too.

- **Person:** Second person, addressed to the reader — "Take control of your money," "Everything *you* need to get started." First-person plural for the brand ("markets we serve").
- **Casing:** Sentence case for all headlines and body. UPPERCASE only on small badge/eyebrow labels ("INSTITUTIONAL", "REGULATED", "MARKETS") rendered through `Badge`.
- **Tone:** Declarative, confident, unhurried. Short headline claims ("The future of money is here"), followed by one plain-spoken clarifying sentence. No exclamation marks, no hype adjectives, no urgency ("act now", "limited").
- **Numbers:** Always concrete and always in mono — "$63,450.00", "+2.4%", "200+ assets", "100M+". Precision signals trustworthiness.
- **Emoji:** Not used in brand copy. (A couple appear only as placeholder asset glyphs in mock UIs; replace with real asset icons.)
- **Examples:** eyebrow `Trusted by 100M+`; H1 `The future of money is here`; subhead `Buy, sell, and manage 200+ cryptocurrencies with the trust and security of an institutional-grade platform.`; CTA `Get started` / `Contact sales` / `Explore assets`.

## Visual Foundations

**Color.** White canvas + ink + soft-gray elevation bands + deep near-black editorial dark canvas (`#0a0b0d`). One accent: Coinbase Blue `#0052ff`, used for at most one or two moments per band (primary CTA, wordmark, inline link). Trading green (`#05b169`) and red (`#cf202f`) are **semantic, text-color only** — never button or badge fills. Accent yellow `#f4b000` is illustrative-only, on Bitcoin/asset glyphs. Never introduce a second brand color.

**Type.** CoinbaseDisplay (→Inter) for hero headlines only, at weight 400 with negative tracking (-1px to -2px). CoinbaseSans (→Inter) 400/600/700 for everything else, tracking 0. CoinbaseMono (→JetBrains Mono) 500 on *every* number. Never bold display; never mix display and sans within one headline.

**Spacing & layout.** 4px base unit. 96px (`--space-section`) between major editorial bands — generous, editorial pacing. Cards inside a band sit 24px apart with 32px internal padding. Content caps at 1200px, centered; hero media goes full-bleed.

**Backgrounds.** No gradients, no textures, no repeating patterns, no hand-drawn illustration. Page rhythm is a rotation of three flat modes: **bright white editorial** → **soft-gray elevation band (`#f7f7f7`)** → **full-bleed near-black dark hero**. The dark hero carrying layered product-UI mockup cards is the single most distinctive component.

**Elevation & depth.** One shadow tier only: `0 4px 12px rgba(0,0,0,0.04)`, used on hovered cards. Otherwise flat with a 1px hairline (`#dee1e6`) border. Do not add shadow tiers. Depth on dark heroes comes from layered/rotated `ProductUICard` mockups (a heavier `0 24px 60px rgba(0,0,0,.45)` float is reserved for these floating cards), not from shadows on flat content.

**Corners.** Pill (100px) for everything interactive — CTAs, search, badges. `xl` (24px) for containers — feature cards, product-UI mockups, pricing tiers. `full` circle for asset glyphs and avatars. Sharp 0px corners are essentially absent.

**Cards.** White canvas, 24px radius, 32px padding, 1px hairline border, flat by default; hover adds the single soft shadow. Dark product-UI cards use `#16181c` on the near-black canvas.

**Hover / press.** Hover documented sparingly (card shadow-lift; nav link opacity). Press state is a color darken only — primary blue → `#003ecc`. No scale/bounce. Animation timings are out of scope in the brief; keep transitions short and subtle (~120–150ms ease) or omit.

**Borders & focus.** 1px `#dee1e6` hairlines divide white surfaces. Form inputs are 12px radius with a 1px hairline that thickens to 2px Coinbase Blue on focus.

**Transparency / blur.** Not part of the system. On dark, secondary text drops to `#a8acb3`; outline-on-dark buttons use a translucent white border. No frosted glass.

## Iconography

The brief documents a **CoinbaseIcons** icon font that was not provided. This system has **no bundled icon set**. Approach:
- **Line icons** (search magnifier, checkmarks) are drawn as minimal inline SVG at 2–2.5px stroke inside components (`SearchInput`, `PricingTier`) — matching a clean, single-weight line style. If you need a broader set, substitute **Lucide** (`https://unpkg.com/lucide-static`) — same stroke feel — and flag the substitution.
- **Asset glyphs** render inside circular `AssetIcon` plates. Real product uses branded coin logos; the kit uses the ticker initial or a currency glyph (₿, Ξ) as a placeholder — **replace with real asset icon SVGs** for production.
- **Emoji / unicode:** not used as brand iconography. A few emoji appear only as temporary glyph placeholders in mock cards.

Supply the real CoinbaseIcons font (or a chosen icon set) to finalize.

---

## Index / Manifest

**Root**
- `styles.css` — global entry point; `@import`s all tokens (consumers link this one file).
- `readme.md` — this file.
- `SKILL.md` — Agent Skills manifest.
- `tokens/` — `colors.css`, `typography.css` (tokens + `.type-*` classes), `spacing.css`, `radius.css`, `elevation.css`, `fonts.css`.

**Components** (`window.FinsightDesignSystem_47d55e`) — grouped under `components/`
- `buttons/` — **Button** (primary / primary-active / secondary-light / secondary-dark / outline-on-dark / tertiary-text; sizes md, cta)
- `badges/` — **Badge**
- `forms/` — **TextInput**, **SearchInput**
- `trading/` — **AssetIcon**, **PriceCell**, **AssetRow**
- `cards/` — **FeatureCard**, **ProductUICard**, **PricingTier**
- `navigation/` — **TopNav**, **Footer**
- `layout/` — **HeroBand**, **CtaBand**

**Foundation cards** — `guidelines/` (Colors, Type, Spacing/Radius/Elevation specimen cards)

**UI kits** — `ui_kits/marketing/` — interactive marketing site (Home, Explore, Developers). See its `README.md`.

## Do / Don't (quick reference)
- **Do** reserve Coinbase Blue for primary CTAs, wordmark, and inline links; keep it scarce.
- **Do** render every number in mono; keep display headlines at weight 400.
- **Do** rotate white / soft-gray / dark bands for page rhythm; pair every dark hero with layered product-UI cards.
- **Don't** add a second brand color, bold display copy, add shadow tiers, use green/red as fills, or use sharp corners on CTAs.

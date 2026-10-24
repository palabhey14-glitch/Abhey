# Brand Guide: Abhey Pal, Mortgage Navigators

Palette: **Clear Sky**. Audience: first home buyers and refinancers in
Australia, reached mainly through Instagram carousels plus one paid post.
Candidates and the full shortlist live in `brand/color-palettes.md`; the visual
preview is `brand/palette-preview.html`.

All contrast ratios below are WCAG 2.x, recomputed for this guide. **AA body**
needs 4.5:1. **AA large** needs 3:1 and only covers text 24px+ (or 18.5px+
bold), which on a 1080×1350 slide means headlines, not captions.

---

## 1. The decision and why

### The four palettes compared

| Palette | Trust signal for a mortgage broker | Accessibility (WCAG) | Fit with first home buyers / refinancers | Verdict |
|---|---|---|---|---|
| **Olive & Cream** | Weak. Olive and brown read as wellness, organic food or interiors, not money. | Brown on cream 11.39 is fine, but the brand colour itself only scrapes AA (olive on cream 4.68). Olive on brown fails (2.43). | Calm but low energy; it gets lost in an Instagram feed. | Reject |
| **Deep Red & Gold** | Mixed to negative. Red is the colour of debt and warnings in finance ("in the red"); gold leans luxury or jewellery. | White on red 9.06 and black on gold 9.99 pass, but black on red fails (2.32), gold on white fails (2.10), and gold on red is headlines only (4.31). Flat `#D4AF37` does not look like foil on screen. | Strong cultural resonance for some communities, which also narrows the audience. Feels like a celebration card more than a loan adviser. | Reject |
| **Turmeric & Navy** | Good. Navy is the most common trust colour in Australian banking and broking; the yellow adds warmth. | Best of the four: navy on white 14.22 and navy on turmeric 6.71 both pass for body text, so the accent can carry words. Only white on turmeric fails (2.12). | Energetic and friendly, but turmeric at full saturation is loud and not the "bright, clean blue and white" brief. | Runner-up |
| **Peacock Blue & Copper** | Good. A deep teal-blue reads stable and premium. | Peacock with ivory or white is excellent (9.46–9.54). Copper fails on peacock (2.53) and is large-text-only on ivory (3.75), so the accent can never hold a sentence. | Polished but dark and moody; closer to wealth management than a first home buyer. | Third |

### Recommendation: Clear Sky

None of the four matches the brief Abhey later set (recorded at the top of
`brand/color-palettes.md`): **bright, clean, blue and white, nothing too
sharp**. Clear Sky keeps what made Turmeric & Navy the best of the four (a
navy text colour, a white base, and a warm yellow accent that navy text can sit
on) and adds the bright blue the brief asked for. It also has no pairing that
tempts people into a failing combination except white on sand, which is easy to
ban.

**Strongest counter-argument:** blue and navy is what nearly every bank and
broker uses, so Clear Sky is safe rather than distinctive. The difference has
to come from layout, photography of real clients and Abhey's own face and voice,
not from the palette. If standing out matters more than instant trust, Turmeric
& Navy is the fallback; swap sand for turmeric and keep every other rule below.

**Assumption, not yet tested:** that first home buyers on Instagram respond to
"approachable bank" colours better than to warmer, more personal ones. A cheap
check is running the one paid post in two colourways and comparing saves and
DMs.

---

## 2. Colours

| Token | Name | Hex | RGB | Use |
|---|---|---|---|---|
| `brand-blue` | Brand blue | `#1A5FD0` | 26, 95, 208 | Cover slides, headline blocks, number badges, links |
| `navy` | Navy | `#0B2545` | 11, 37, 69 | All body text, logo wordmark, text on sand |
| `sky` | Sky | `#E8F1FD` | 232, 241, 253 | Inside-slide backgrounds, cards, alternating sections |
| `white` | White | `#FFFFFF` | 255, 255, 255 | Main background, text on brand blue |
| `sand` | Sand | `#F4C77D` | 244, 199, 125 | Calls to action only (buttons, "swipe" chips, one highlight per slide) |

Proportion guide per post: roughly 60% white or sky, 30% brand blue or navy,
10% or less sand. If sand covers more than a button or a single highlight, it
stops working as the thing that draws the eye.

---

## 3. Text and background pairings

### Approved

| Text | Background | Ratio | Allowed for |
|---|---|---|---|
| Navy `#0B2545` | White `#FFFFFF` | 15.39 | Everything, including disclaimers |
| Navy `#0B2545` | Sky `#E8F1FD` | 13.51 | Everything, including disclaimers |
| Navy `#0B2545` | Sand `#F4C77D` | 9.75 | CTA labels, highlighted phrases |
| White `#FFFFFF` | Brand blue `#1A5FD0` | 5.85 | Headlines and body text on cover slides |
| Brand blue `#1A5FD0` | White `#FFFFFF` | 5.85 | Headlines, kickers, links |
| Brand blue `#1A5FD0` | Sky `#E8F1FD` | 5.13 | Headlines, kickers, links |

### Large text only (24px+, or 18.5px+ bold)

| Text | Background | Ratio |
|---|---|---|
| Brand blue `#1A5FD0` | Sand `#F4C77D` | 3.71 |

### Never

| Text | Background | Ratio | Why |
|---|---|---|---|
| White | Sand | 1.58 | Unreadable |
| Sand | White or sky | 1.58 / 1.38 | Unreadable |
| Navy | Brand blue | 2.63 | Both dark; looks muddy and fails |
| Sky | White (or reverse) | 1.14 | No contrast; use only as a background tint |

---

## 4. Usage rules

1. **Body text is always navy** on light backgrounds and **always white** on
   brand blue. No grey text; if something needs to look secondary, make it
   smaller, not lighter.
2. **One sand element per slide.** It marks the action (swipe, book a call,
   DM). Never use sand as a full-slide background.
3. **Cover slide = brand blue background, white headline, sand chip.** Inside
   slides = sky or white background, navy text, blue kicker and badges. This
   alternation is what makes a carousel feel like one brand.
4. **Disclaimers and credit representative numbers** use navy on white or sky
   only, at a size that stays readable on a phone. Do not put compliance text on
   brand blue or sand.
5. **No gradients between brand colours** and no tints made by lowering
   opacity on top of photos; tints change the contrast ratio. If a lighter blue
   is needed, use sky.
6. **Photos:** put text on a solid sky, white or brand blue panel, not directly
   on the photo.
7. **Icons and lines** may use brand blue or navy. Sand is allowed for icons only
   when they sit on navy or brand blue.

---

## 5. Setup

- **Canva:** Brand Kit → Colours → add the five hex codes above in the order
  brand blue, navy, sky, white, sand.
- **CSS tokens:**

```css
:root {
  --brand-blue: #1A5FD0;
  --navy: #0B2545;
  --sky: #E8F1FD;
  --white: #FFFFFF;
  --sand: #F4C77D;
}
```

- Check any new colour combination at a WCAG contrast checker before using it,
  and add it to section 3.

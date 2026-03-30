---
name: cortex-design
description: Use this skill when generating User Interfaces or applications in the Cortex ecosystem. It outlines the core principles of the "Bold Typography" design language with concrete tokens, component patterns, and animation specs extracted from the Cortex Landing Page.
---

# Cortex Design — Generative Guidelines for AI UIs

When creating UI components, generating websites, or building applications for the Cortex ecosystem, adhere to these design principles. This is not a strict component library, but a set of visual heuristics and concrete tokens for creating a cohesive, high-quality aesthetic.

## Core Visual Heuristics

1. **Sharpness Over Softness**
   - **Do not use rounded corners (`border-radius: 0`).**
   - Every container, button, input, and card should have sharp 90-degree angles. This conveys precision and technical confidence.

2. **Typography as the Primary Graphic Element**
   - Use extreme scale contrast. The gap between a primary headline and body text should be dramatic.
   - Use **Inter** (or Inter Tight) for display and body text.
   - Use **JetBrains Mono** for labels, badges, numbers, and technical details.
   - Tighten letter spacing on large display headings (`-0.04em` to `-0.06em`).
   - Widen letter spacing on uppercase labels or small buttons (`0.1em` to `0.2em`).

3. **Restrained, Dark-First Palette**
   - Default to dark mode.
   - **Backgrounds:** Near-black (`#0A0A0A`) rather than pure `#000000`.
   - **Foregrounds:** Off-white (`#FAFAFA`) for high contrast readability.
   - **Accent:** `#FF9500` (warm orange). Use sparingly — only for primary interactive states, key highlights, or minimal decorative rules.

4. **Deliberate Negative Space**
   - Do not cramp elements. Use generous padding inside containers.
   - Separate distinct sections with significant vertical margins.
   - Prefer asymmetric layouts (e.g., a 7/5 grid split) over perfect symmetry. Left-align text by default.

5. **Minimalist Depth and Borders**
   - **No drop shadows.**
   - Create depth by layering elements (e.g., absolute positioned large, faint text behind foreground content).
   - Use very subtle, thin borders (`1px` solid, very low opacity white/grey) to demarcate sections or cards rather than different background fills.
   - Animate underlines for link/button interactions rather than changing background colors.

---

## Typography Scale

| Token | Size | Weight | Letter Spacing | Line Height |
|-------|------|--------|----------------|-------------|
| Display XL | `clamp(4rem, 10vw, 10rem)` | 700 | `-0.06em` | 1 |
| Display Large | `clamp(3rem, 8vw, 8rem)` | 700 | `-0.06em` | 1 |
| Display | `clamp(2.5rem, 6vw, 6rem)` | 700 | `-0.04em` | 1.1 |
| Display Small | `clamp(2rem, 4vw, 4rem)` | 600 | `-0.04em` | 1.1 |
| Card Title | `text-xl md:text-2xl` | 600 | tight | 1.25 |
| Section Label | `text-xs` (mono) | 600 | `0.2em` | — |
| Body | `text-base` | 400 | `-0.01em` | 1.6 |

### Letter Spacing Tokens

```css
--tracking-tighter: -0.06em;  /* display headlines */
--tracking-tight:   -0.04em;  /* headings */
--tracking-normal:  -0.01em;  /* body */
--tracking-wide:     0.05em;
--tracking-wider:    0.1em;   /* buttons, links */
--tracking-widest:   0.2em;   /* section labels, monospace */
```

---

## Color Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--accent` | `#FF9500` | Interactive highlights, focus rings, underlines |
| `--accent-foreground` | `#0A0A0A` | Text on accent backgrounds |
| `--background` | `#0A0A0A` | Page background |
| `--foreground` | `#FAFAFA` | Primary text |
| `--muted` | `#1A1A1A` | Alternate backgrounds, inputs |
| `--muted-foreground` | `#737373` | Secondary text |
| `--border` | `#262626` | Default borders |
| `--border-hover` | `#404040` | Hover state borders |
| `--card` | `#0F0F0F` | Card backgrounds |
| `--ring` | `#FF9500` | Focus rings (matches accent) |
| `--radius` | `0px` | All corners are sharp |

---

## Component Patterns

### Section Header

```html
<span class="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-muted-foreground mb-4">
  <span class="w-8 h-px bg-accent"></span>
  Section Label
</span>
<h2 class="text-display-sm md:text-display text-foreground mb-4">
  Main Heading
  <br />
  <span class="text-muted-foreground">Secondary text</span>
</h2>
```

### Hero Section

```html
<header class="mb-32">
  <p class="font-mono text-xs uppercase tracking-widest text-orange-500 mb-4">Application Header</p>
  <h1 class="text-6xl md:text-8xl font-bold tracking-tighter leading-none">
    Generative<br/>Interfaces.
  </h1>
</header>
```

### Cards

- Base: `border border-border hover:border-border-hover transition-colors duration-150`
- Highlighted/Featured: `border-2 border-accent`
- Padding: `p-6 md:p-8`
- Featured badge: `absolute -top-3 left-6 bg-accent text-accent-foreground px-3 py-1`

```html
<div class="border border-neutral-800 p-8 rounded-none hover:border-neutral-600 transition-colors duration-150">
  <h2 class="text-2xl font-bold tracking-tight mb-2">Module 01</h2>
  <p class="text-neutral-400 leading-relaxed">
    Content goes here. Note the sharp edges and subtle borders.
  </p>
</div>
```

### Callout Box

```html
<div class="border border-accent/30 bg-accent/5 p-6">
  <p class="text-sm leading-relaxed">Important callout text here.</p>
</div>
```

### Badge Styling

- Font: mono, `text-xs`, uppercase, `tracking-widest`
- Colors: `text-accent` or `bg-accent text-accent-foreground`
- No border-radius

### Accent Bar Divider

```html
<div class="w-16 h-1 bg-accent"></div>
```

### Decorative Numbers

- Size: `clamp(6rem, 20vw, 16rem)`
- Weight: 700, letter-spacing: `-0.06em`
- Color: `var(--border)` (low contrast)
- `user-select: none`

---

## Buttons

**Base styles:** `font-semibold uppercase tracking-wider transition-all duration-150 active:translate-y-px`

| Variant | Styles |
|---------|--------|
| Primary | Accent underline, `hover:scale-x-110` on underline |
| Secondary | `border border-foreground hover:bg-foreground hover:text-background` |
| Ghost | Hidden underline appears on hover |
| Outline | `border border-border hover:border-foreground` |

**Sizes:** Small (`py-2 text-xs`), Default (`py-3 text-sm`), Large (`py-4 text-base`)

**Focus:** `focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2`

---

## Animation — Framer Motion

### Stagger Pattern

```tsx
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,   // 80ms–150ms typical
      delayChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5 },
  },
};
```

### Viewport Reveals

```tsx
<motion.div
  initial={{ opacity: 0, y: 20 }}
  whileInView={{ opacity: 1, y: 0 }}
  viewport={{ once: true, margin: "-50px" }}
  transition={{ duration: 0.5 }}
/>
```

### Duration Tokens

| Token | Value | Usage |
|-------|-------|-------|
| Fast | `150ms` | Hover effects, underline transitions |
| Normal | `200ms` | Mobile nav, button states |
| Slow | `500ms` | Section reveals, stagger items |

### Easing

- **Expo Out:** `cubic-bezier(0.25, 0, 0, 1)` — used for accent underline hover effects

---

## Layout

### Section Container

```css
max-width: 1200px;
margin: 0 auto;
padding: 1.5rem;          /* mobile */
@media (md) padding: 3rem;   /* tablet */
@media (lg) padding: 4rem;   /* desktop */
```

### Section Spacing

- Vertical padding: `py-20 md:py-28 lg:py-40`

### Grid Patterns

| Pattern | Breakpoint | Usage |
|---------|-----------|-------|
| `sm:grid-cols-2` | 640px | Two-column card layouts |
| `md:grid-cols-3` | 768px | Feature grids |
| `lg:grid-cols-2` | 1024px | Content + visual splits |
| `lg:grid-cols-4` | 1024px | Stat grids |

### Grid Gaps

- `gap-px bg-border` — 1px borders between items
- `gap-6` (1.5rem) — Standard card gap
- `gap-12` to `gap-16` — Large section gaps

---

## Inputs

- Height: `h-12 md:h-14`
- Default: `bg-input border-border focus:border-accent`
- Inverted (dark CTA section): `bg-transparent border-background/30 focus:border-accent`

---

## Underline Animations

### Accent Underline (visible, grows on hover)

```css
.accent-underline::after {
  content: "";
  width: 100%;
  height: 2px;
  bottom: -2px;
  background-color: var(--accent);
  transition: transform 150ms cubic-bezier(0.25, 0, 0, 1);
}
.accent-underline:hover::after {
  transform: scaleX(1.1);
}
```

### Ghost Underline (hidden, appears on hover)

```css
.ghost-underline::after {
  transform: scaleX(0);
  transition: transform 150ms cubic-bezier(0.25, 0, 0, 1);
}
.ghost-underline:hover::after {
  transform: scaleX(1);
}
```

---

## Scrollbar

```css
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: var(--background); }
::-webkit-scrollbar-thumb { background: var(--border); }
::-webkit-scrollbar-thumb:hover { background: var(--border-hover); }
/* border-radius: 0 — sharp, matching design */
```

---

## Prompting an Agent

When you need to generate a new UI, instruct yourself or a sub-agent with these constraints:
*"Generate a React/Tailwind component using the Cortex design language: dark mode (#0A0A0A background), strictly 0px border-radius, Inter for display text with tight tracking (-0.04em to -0.06em), JetBrains Mono for labels with wide tracking (0.2em), accent color #FF9500 used sparingly, no box-shadows, 1px subtle borders (#262626), Framer Motion stagger reveals (0.1s stagger, 0.5s duration), and viewport-triggered animations."*

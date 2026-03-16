---
name: cortex-design
description: Use this skill when generating User Interfaces or applications in the Cortex ecosystem. It outlines the core principles of the "Bold Typography" design language in a flexible, framework-agnostic way.
---

# Cortex Design — Generative Guidelines for AI UIs

When creating UI components, generating websites, or building applications for the Cortex ecosystem, adhere to these generalized design principles. This is not a strict component library, but a set of visual heuristics for creating a cohesive, high-quality aesthetic.

## Core Visual Heuristics

1. **Sharpness Over Softness**
   - **Do not use rounded corners (`border-radius: 0`).**
   - Every container, button, input, and card should have sharp 90-degree angles. This conveys precision and technical confidence.

2. **Typography as the Primary Graphic Element**
   - Use extreme scale contrast. The gap between a primary headline and body text should be dramatic.
   - Use clean, geometric sans-serif fonts for primary interfaces (e.g., Inter, system-ui).
   - Use monospace fonts for labels, badges, numbers, and technical details.
   - Tighten letter spacing on large display headings (`-0.04em` to `-0.06em`).
   - Widen letter spacing on uppercase labels or small buttons (`0.1em` to `0.2em`).

3. **Restrained, Dark-First Palette**
   - Default to dark mode.
   - **Backgrounds:** Near-black (e.g., `#0A0A0A`, `#111111`) rather than pure `#000000`.
   - **Foregrounds:** Warm or stark whites for high contrast readability.
   - **Accents:** Use exactly *one* highly vibrant accent color (e.g., a warm orange, vermillion, or electric yellow). Use it sparingly—only for primary interactive states, key highlights, or minimal decorative rules.

4. **Deliberate Negative Space**
   - Do not cramp elements. Use generous padding inside containers.
   - Separate distinct sections with significant vertical margins.
   - Prefer asymmetric layouts (e.g., a 7/5 grid split) over perfect symmetry. Left-align text by default.

5. **Minimalist Depth and Borders**
   - **No drop shadows.**
   - Create depth by layering elements (e.g., absolute positioned large, faint text behind foreground content).
   - Use very subtle, thin borders (`1px` solid, very low opacity white/grey) to demarcate sections or cards rather than different background fills.
   - Animate underlines for link/button interactions rather than changing background colors.

## Example Tailwind Application

If generating Tailwind CSS code, your output should resemble this style:

```html
<!-- Container -->
<div class="bg-neutral-950 text-neutral-50 min-h-screen p-8 md:p-16 font-sans">
  
  <!-- Hero Section -->
  <header class="mb-32">
    <p class="font-mono text-xs uppercase tracking-widest text-orange-500 mb-4">Application Header</p>
    <h1 class="text-6xl md:text-8xl font-bold tracking-tighter leading-none">
      Generative<br/>Interfaces.
    </h1>
  </header>

  <!-- Interactive Element -->
  <button class="group relative inline-flex items-center text-orange-500 font-semibold uppercase tracking-wider px-0 py-3">
    Initialize Sequence
    <!-- Animated Underline -->
    <span class="absolute bottom-0 left-0 h-0.5 w-full origin-left scale-x-100 bg-orange-500 transition-transform group-hover:scale-x-110"></span>
  </button>

  <!-- Card / Container -->
  <div class="border border-neutral-800 p-8 mt-16 rounded-none">
    <h2 class="text-2xl font-bold tracking-tight mb-2">Module 01</h2>
    <p class="text-neutral-400 leading-relaxed">
      Content goes here. Note the sharp edges and subtle borders.
    </p>
  </div>

</div>
```

## Prompting an Agent

When you need to generate a new UI, instruct yourself or a sub-agent with these constraints:
*"Generate a React/Tailwind component using the Cortex design language: dark mode, strictly 0px border-radius, geometric sans-serif fonts with tight heading tracking, monospace labels with wide tracking, no box-shadows, 1px subtle borders, and a single vibrant accent color used sparingly."*

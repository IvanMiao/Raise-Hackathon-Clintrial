# Clintrial Design System

This document outlines the core design tokens, typography, colors, and layout components of the **Clintrial** premium medical-editorial theme, matching the **clin-scan-thib** landing page style.

---

## 1. Aesthetic Vision

Clintrial transitions away from dark glassmorphic dashboards toward a **minimalist, high-end light cream editorial aesthetic** inspired by premium clinical and scientific publication layout structures. 

*   **Premium Simplicity**: Leverages white workspace layouts, light cream-tinted backgrounds, and fine bordered dividers.
*   **Academic Contrast**: Incorporates a mixture of clean geometric sans-serif numbers/tables with elegant, italicized serif display titles to convey authority and trust.
*   **Forest Accents**: Replaces cold blues with organic forest greens as primary interaction cues and success states.

---

## 2. Color System

| Token Name | Hex Code | Tailwind Mapping | Application |
| :--- | :--- | :--- | :--- |
| **Cream** (Base) | `#f9f7f4` | `bg-cream` / `bg-[#f9f7f4]` | Overall page backgrounds, margins, context headers. |
| **Charcoal** (Primary) | `#1a1a1a` | `text-charcoal` / `bg-charcoal` | Headers, primary titles, default body copy, primary buttons. |
| **Forest** (Accent) | `#2d4f3f` | `text-forest` / `bg-forest` | Brand colors, positive statuses, connection vectors, DNA animations. |
| **Ghost** (Borders) | `#e8e5e0` | `border-ghost` / `bg-ghost` | Fine container dividers, input frames, scrollbar tracks. |
| **Ghost Deep** (Muted) | `#8a8580` | `text-ghost-deep` | Muted descriptions, secondary labels, console date signatures. |

### Payer / Audit Status Tokens

*   🟢 **Reimbursable** (Success): `text-forest` / `bg-forest/10` / `border-forest/20`
*   🟡 **To Confirm** (Review): `text-amber-700` / `bg-amber-500/10` / `border-amber-500/20`
*   🔴 **Standard Care** (Excluded): `text-rose-700` / `bg-rose-500/10` / `border-rose-500/20`
*   ⚪ **Canceled** (Line Excluded): `text-ghost-deep` / `bg-ghost/50` / `border-ghost` (with text-decoration `line-through`)

---

## 3. Typography

The font hierarchy is split between data readability and brand editorial character:

### Sans-serif: `Inter`
*   **CSS Variable**: `var(--font-sans)`
*   **Usage**: Applied globally. Used for tabular logs, metadata cards, data numbers, billing codes, and terminal output.
*   **Tone**: Strict, readable, dense, structured.

### Serif: `Cormorant Garamond`
*   **CSS Variable**: `var(--font-serif)`
*   **Usage**: Applied via `.font-display` or `font-serif` to display headers, italic branding elements, audit titles, and dialogue headers.
*   **Tone**: Classical, trustworthy, authoritative, editorial.

---

## 4. Key Components

### 1. Header Layout
A clean, white capsule card with a subtle shadow (`shadow-[0_1px_3px_rgba(0,0,0,0.04)]`) and `border-ghost`. Brand headers are italicized in serif font: `font-serif italic text-forest`.

### 2. Main Workspace Split Panel
A two-column grid (`grid-cols-[55fr_45fr]`) where each side is encapsulated in a white card (`bg-white`), featuring thin borders (`border-ghost`) and soft outer shadows.

### 3. Action Buttons
Buttons use a pill-capsule format (`rounded-full`):
*   **Primary Action**: Solid charcoal (`bg-charcoal text-cream hover:bg-forest transition-all`).
*   **Secondary Action**: Outlined/Soft cream (`bg-white border border-ghost hover:bg-cream text-charcoal`).

### 4. Interactive Connection SVG
A vector connection plane overlaying the protocol corpus map.
*   **Dashed Curves**: Curved quadratic bezier paths (`d="M x1 y1 Q cx cy x2 y2"`) featuring animated dashes.
*   **Flow Motion**: Uses keyframe `.animate-dash` to flow dashes from the central audited item node toward active context databases (SoA, CTA, Consent).

### 5. Cream Terminal Log Console
A "paper" styled console log pane:
*   Header: `#f0ede9` (`bg-[#f0ede9]`) with soft mute tags.
*   Console Body: Solid cream `#FAF9F6` with `font-mono` text and color-coded tags indicating levels (Info, Success, Warning, Error, and JSON).

---

## 5. Global CSS Keyframe Utility Animations

The system defines 4 custom animations inside the tailwind config utility scope:
1.  `fade-up`: Soft vertical entry animations (`translateY(14px) ➔ 0`) for elements loading in steps.
2.  `ghost-in`: Soft fade-in for background watermarks.
3.  `laser-scan`: Up-and-down laser line transitions for the OCR step.
4.  `path-dash`: Continuous moving dash-offset flow for active database connectors.

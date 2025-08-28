# Linear‑style aesthetic: dark, subtle gradients and textured noise

## Introduction

Linear’s marketing site and application interface deliberately avoid flat surfaces.  Instead of bright colours and heavy chrome, the brand leans into a **dark, understated palette** with subtle gradients, blurred panels and a very light grain.  The redesign shipped in early 2024 introduced a new theme system based on the **LCH colour space**, where only three variables – base colour, accent colour and contrast – generate entire themes [oai_citation:0‡linear.app](https://linear.app/now/how-we-redesigned-the-linear-ui#:~:text=With%20this%20UI%20refresh%2C%20we,color%2C%20accent%20color%2C%20and%20contrast).  This system allows light and dark themes to share the same logic and automatically adjust contrast for accessibility [oai_citation:1‡linear.app](https://linear.app/now/how-we-redesigned-the-linear-ui#:~:text=With%20this%20UI%20refresh%2C%20we,color%2C%20accent%20color%2C%20and%20contrast).  Headings use **Inter Display**, while body text uses **Inter**, giving headings more personality without sacrificing clarity [oai_citation:2‡linear.app](https://linear.app/now/how-we-redesigned-the-linear-ui#:~:text=We%20continued%20polishing%20the%20new,and%20lighter%20in%20dark%20mode).

This guide analyses Linear’s design language and demonstrates how to recreate its aesthetic using CSS.  It focuses on dark surfaces, noisy gradients and masking effects.  All examples are self‑contained and use semantic HTML.

## Colour system and palette

Linear’s dark theme is built by combining a base colour with accent and contrast variables in the LCH colour space [oai_citation:3‡linear.app](https://linear.app/now/how-we-redesigned-the-linear-ui#:~:text=With%20this%20UI%20refresh%2C%20we,color%2C%20accent%20color%2C%20and%20contrast).  The accent colour (often a subtle blue or purple) is rarely visible on surfaces; it mostly appears on interactive elements like buttons or highlights.  The contrast value controls how light or dark surfaces are relative to text, making it easy to create high‑contrast themes for accessibility [oai_citation:4‡linear.app](https://linear.app/now/how-we-redesigned-the-linear-ui#:~:text=With%20this%20UI%20refresh%2C%20we,color%2C%20accent%20color%2C%20and%20contrast).  During the redesign, the team limited the use of their blue chrome to return to a neutral, timeless appearance and improved contrast by darkening text and icons in light mode and lightening them in dark mode [oai_citation:5‡linear.app](https://linear.app/now/how-we-redesigned-the-linear-ui#:~:text=We%20continued%20polishing%20the%20new,and%20lighter%20in%20dark%20mode).

An approximate dark palette for personal projects might look like this (feel free to tweak values to fit your brand):

| Variable | Purpose | Suggested value |
|---------|---------|----------------|
| `--color-bg-primary` | Primary background (panels, cards) | `#0f0f10` |
| `--color-bg-secondary` | Slightly lighter background used for raised panels | `#151618` |
| `--color-bg-tertiary` | Even lighter background used for buttons or badges | `#1e1e22` |
| `--color-border-translucent` | Subtle borders and separators | `rgba(255,255,255,0.06)` |
| `--color-text-primary` | Main text colour | `#ffffff` |
| `--color-text-secondary` | Secondary text (labels, descriptions) | `#9fa4ad` |
| `--color-brand-bg` | Accent background (buttons, links) | `#5959e6` |
| `--color-brand-text` | Text on accent backgrounds | `#ffffff` |

> **Tip:** When implementing themes, store the three core variables (base, accent and contrast) as LCH values and derive your palette from them.  The Linear team uses only these variables to generate the rest of their colours [oai_citation:6‡linear.app](https://linear.app/now/how-we-redesigned-the-linear-ui#:~:text=With%20this%20UI%20refresh%2C%20we,color%2C%20accent%20color%2C%20and%20contrast).

## Typography

Linear uses the **Inter** type family throughout the product.  Heading styles use the *Inter Display* cut to introduce more personality, while body copy uses the regular Inter variant for optimal legibility [oai_citation:7‡linear.app](https://linear.app/now/how-we-redesigned-the-linear-ui#:~:text=We%20continued%20polishing%20the%20new,and%20lighter%20in%20dark%20mode).  Keeping the family consistent simplifies the system while allowing subtle differentiation between titles and body text.  Common settings include:

| Element | Font family | Weight & size |
|---------|-------------|---------------|
| Heading 1 (page titles) | `Inter Display` | `700` weight, ~`48–64 px` on desktop |
| Heading 2 (section titles) | `Inter Display` | `600–700` weight, ~`32 px` |
| Body text | `Inter` | `400–500` weight, `16–18 px` with a relaxed line height |
| Labels / Eyebrow | `Inter` | `500–600` weight, small size (`12–14 px`) |

## Layout

### Structure

Linear’s layout is heavily grid‑based.  Pages are often divided into vertical *bento* sections separated by hairline borders and generous padding.  Cards within these sections maintain a consistent aspect ratio using the `aspect-ratio` property, ensuring they scale gracefully across breakpoints.  Negative space and large headlines make the interface feel airy despite the dark palette.

### Glass containers and blurred panels

Many panels and cards are translucent with a subtle grain.  The `GlassContainer` component uses a combination of gradients and a noise filter.  The outer container draws a faint gradient border, while the inner container has a translucent gradient background and a noise overlay.  In Linear’s CSS this looks like:
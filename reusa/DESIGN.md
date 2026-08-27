---
name: REUSA+
colors:
  surface: '#f8f9ff'
  surface-dim: '#d0dbed'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e6eeff'
  surface-container-high: '#dee9fc'
  surface-container-highest: '#d9e3f6'
  on-surface: '#121c2a'
  on-surface-variant: '#3c4a3f'
  inverse-surface: '#27313f'
  inverse-on-surface: '#eaf1ff'
  outline: '#6b7b6e'
  outline-variant: '#bacbbc'
  surface-tint: '#006d3d'
  primary: '#006d3d'
  on-primary: '#ffffff'
  primary-container: '#00d67d'
  on-primary-container: '#00572f'
  inverse-primary: '#28e288'
  secondary: '#416656'
  on-secondary: '#ffffff'
  secondary-container: '#c3ecd7'
  on-secondary-container: '#476c5b'
  tertiary: '#ae2f34'
  on-tertiary: '#ffffff'
  tertiary-container: '#ffa29f'
  on-tertiary-container: '#921a23'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#5affa3'
  primary-fixed-dim: '#28e288'
  on-primary-fixed: '#00210f'
  on-primary-fixed-variant: '#00522d'
  secondary-fixed: '#c3ecd7'
  secondary-fixed-dim: '#a8cfbc'
  on-secondary-fixed: '#002115'
  on-secondary-fixed-variant: '#294e3f'
  tertiary-fixed: '#ffdad8'
  tertiary-fixed-dim: '#ffb3b0'
  on-tertiary-fixed: '#410006'
  on-tertiary-fixed-variant: '#8c1520'
  background: '#f8f9ff'
  on-background: '#121c2a'
  surface-variant: '#d9e3f6'
typography:
  display:
    fontFamily: Hanken Grotesk
    fontSize: 48px
    fontWeight: '800'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: Hanken Grotesk
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.05em
  caption:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  container-max: 1280px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 40px
---

## Brand & Style

The design system is built for a contemporary circular economy platform that bridges the gap between environmental responsibility and high-tech social networking. The aesthetic avoids the "clutter" often associated with recycling apps, opting instead for a **Tech-Minimalist** approach with a **Sustainable Edge**.

The brand personality is **Active, Trustworthy, and Vital**. It utilizes a "Clean Slate" philosophy: vast amounts of white space allow the vibrant primary colors to act as functional signals rather than just decoration. The style focuses on high-clarity interfaces that feel like a premium SaaS product but retain the warmth of a community-driven social network.

## Colors

The palette is designed to evoke growth and urgency without appearing "earthy" or "dull."

- **Primary Green (#00D67D):** An electric, "Neo-Mint" green used for brand presence, primary actions, and success states. It represents the vitality of the circular economy.
- **Secondary Green (#D1FAE5):** A soft, minty tint used for subtle backgrounds, badge containers, and secondary UI flourishes.
- **Vibrant Coral (#FF6B6B):** The "Highlight" color. Used sparingly for high-impact CTAs, notifications, and critical alerts to provide a warm, energetic contrast to the greens.
- **Neutrals:** Surfaces use a crisp white or a very pale "Ice Gray" (#F9FAFB) to maintain a sterile, modern feel. Text is set in a deep slate (#1F2937) to ensure high readability while feeling softer than pure black.

## Typography

This design system uses a dual-font strategy to balance technical precision with social approachability.

- **Hanken Grotesk** is used for headlines and labels. Its sharp, contemporary geometry provides the "Tech-Oriented" feel required for the marketplace and recycling data tracking.
- **Plus Jakarta Sans** is used for body copy and social interactions. Its softer, rounded apertures make long-form reading and community posts feel welcoming and human.

All "Display" and "Headline-LG" styles should use tighter letter-spacing to maintain a punchy, editorial look.

## Layout & Spacing

The system follows a strict **8px linear grid**. 

- **Desktop:** 12-column fluid grid with a maximum container width of 1280px to prevent excessive line lengths in social feeds. 
- **Mobile:** 4-column layout with 16px side margins. 
- **Rhythm:** Use large vertical gaps (64px+) between major sections to emphasize the minimalist aesthetic. Content cards within the marketplace should use "Space Between" logic to maximize the visibility of item photography.

## Elevation & Depth

To maintain a clean, flat aesthetic while indicating interactivity, the system uses **Tonal Layering** supplemented by **Ultra-Soft Shadows**.

- **Level 0 (Background):** #F9FAFB.
- **Level 1 (Cards/Surface):** Pure White (#FFFFFF) with a 1px stroke of #E5E7EB. No shadow for static items.
- **Level 2 (Interactive/Hover):** Pure White with a "Large Diffused Shadow" (0px 10px 25px rgba(0, 0, 0, 0.04)). This creates a sense of "floating" without visual weight.
- **Depth Cues:** Use the Secondary Green (#D1FAE5) to highlight active areas or containers rather than using deep shadows.

## Shapes

The shape language is "Friendly-Geometric."

- **Standard Radius:** 0.5rem (8px) for input fields, small buttons, and informational chips.
- **Large Radius:** 1rem (16px) for main content cards and imagery.
- **Pill Shapes:** Reserved exclusively for status indicators (e.g., "Available," "Recyclable") and primary navigation tags to differentiate them from functional buttons.

## Components

- **Buttons:** 
  - *Primary:* Solid #00D67D with white text. 8px radius. High-energy, bold.
  - *Highlight (CTA):* Solid #FF6B6B. Used for "Donate Now" or "Buy" to stand out from the green ecosystem.
  - *Ghost:* 1px #E5E7EB border with slate text, shifting to a #F9FAFB background on hover.
- **Cards:** White background, 16px radius, subtle 1px gray border. Images inside cards should have a 12px internal radius to create a "nested" look.
- **Chips:** Small, pill-shaped tags using #D1FAE5 background and dark green text for categories like "Glass," "Plastic," or "Free."
- **Input Fields:** 8px radius, white background, 1px border. On focus, the border transitions to 2px Primary Green with a soft outer glow.
- **Icons:** Use 2px "Thin-Line" icons. Avoid filled icons unless indicating an "active" state (e.g., a filled heart for a liked item). Icons should be monochromatic Slate or Primary Green.
- **Sustainability Tracker:** A custom component—a linear progress bar using a gradient from #D1FAE5 to #00D67D to visualize carbon savings or recycling goals.
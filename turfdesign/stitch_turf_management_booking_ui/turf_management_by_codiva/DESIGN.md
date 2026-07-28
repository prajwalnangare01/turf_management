---
name: Turf Management - by Codiva
colors:
  surface: '#f7fafc'
  surface-dim: '#d7dadc'
  surface-bright: '#f7fafc'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f1f4f6'
  surface-container: '#ebeef0'
  surface-container-high: '#e5e9eb'
  surface-container-highest: '#e0e3e5'
  on-surface: '#181c1e'
  on-surface-variant: '#3f4a3f'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eef1f3'
  outline: '#6f7a6e'
  outline-variant: '#becabb'
  surface-tint: '#006d31'
  primary: '#006b30'
  on-primary: '#ffffff'
  primary-container: '#148641'
  on-primary-container: '#f7fff3'
  inverse-primary: '#75dc8b'
  secondary: '#8c5000'
  on-secondary: '#ffffff'
  secondary-container: '#fe9400'
  on-secondary-container: '#633700'
  tertiary: '#565c6a'
  on-tertiary: '#ffffff'
  tertiary-container: '#6f7483'
  on-tertiary-container: '#fefcff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#91f9a5'
  primary-fixed-dim: '#75dc8b'
  on-primary-fixed: '#00210a'
  on-primary-fixed-variant: '#005323'
  secondary-fixed: '#ffdcbf'
  secondary-fixed-dim: '#ffb874'
  on-secondary-fixed: '#2d1600'
  on-secondary-fixed-variant: '#6a3b00'
  tertiary-fixed: '#dde2f3'
  tertiary-fixed-dim: '#c1c6d7'
  on-tertiary-fixed: '#161c27'
  on-tertiary-fixed-variant: '#414754'
  background: '#f7fafc'
  on-background: '#181c1e'
  surface-variant: '#e0e3e5'
typography:
  display-lg:
    fontFamily: Archivo Narrow
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Archivo Narrow
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 38px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Archivo Narrow
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-sm:
    fontFamily: Archivo Narrow
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-bold:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Inter
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
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  gutter: 16px
  margin-mobile: 16px
  margin-desktop: 40px
---

## Brand & Style

The design system is built for a high-performance sports venue marketplace, balancing the kinetic energy of athletics with the precision of a professional management tool. The brand personality is **sporty and energetic** yet deeply **trustworthy and reliable**, ensuring users feel the speed of a modern booking experience while trusting the underlying logistics.

The visual style is **Corporate Modern with a Sports-Tech edge**. It utilizes a clean, high-contrast interface that prioritizes legibility and rapid decision-making. By moving away from over-saturated "neon" aesthetics in favor of a structured, refined palette, the system communicates professional-grade reliability. The aesthetic is defined by ample whitespace, bold typographic hierarchies, and subtle depth to guide the user through the booking funnel without friction.

## Colors

The color strategy uses a **Strong Turf Green** as the primary anchor, representing the field of play and providing a sense of growth and vitality. An **Amber Accent** is reserved strictly for high-priority calls to action and active selection states, creating a clear visual heat map for the user.

- **Primary (#1B8A44):** A vibrant yet grounded green used for branding, primary buttons, and success states.
- **Secondary (#FF9500):** A warm amber for urgency, CTAs, and highlighting available time slots.
- **Tertiary (#1A202C):** A deep charcoal for primary text and headers to ensure maximum contrast and readability.
- **Neutral (#F7FAFC):** A cool-toned off-white for backgrounds to reduce eye strain and separate content cards cleanly.

## Typography

This design system utilizes a dual-font strategy to balance character and utility. **Archivo Narrow** is used for headlines and display styles; its condensed nature evokes sports scoreboards and technical data, allowing for impactful, large-scale titles that don't crowd the mobile viewport. 

**Inter** is the workhorse for body text and labels, chosen for its exceptional legibility at small sizes and its neutral, systematic feel. All pricing and time-slot data should use **Label-Bold** or **Headline-SM** to ensure they are the most prominent elements on the card.

## Layout & Spacing

The layout philosophy follows a **Fluid Grid** model optimized for mobile-first consumption. A strict 4px baseline grid ensures vertical rhythm across all components.

On mobile devices, a 16px outer margin is maintained to prevent content from hitting the screen edge. On desktop, the layout centers with a maximum width of 1200px. Component spacing relies on "generous breathing room"—using 24px (lg) between distinct sections to ensure the interface never feels cluttered. Use 8px (sm) for internal element grouping (e.g., an icon next to a label) and 16px (md) for standard padding within cards and containers.

## Elevation & Depth

Visual hierarchy is established through **Tonal Layers** and **Ambient Shadows**. Instead of heavy borders, the design system uses subtle shifts in background color to define surfaces.

- **Level 0 (Background):** The neutral light-gray base.
- **Level 1 (Cards/Surface):** Pure white surfaces with a very soft, diffused shadow (0px 4px 20px rgba(0,0,0,0.05)).
- **Level 2 (Active/Floating):** Used for sticky booking bars or active modals, featuring a slightly more pronounced shadow (0px 8px 30px rgba(0,0,0,0.08)) to indicate interactivity.

High-contrast outlines (1px, #E2E8F0) are used for inactive input fields and secondary buttons to maintain a clean, flat aesthetic without sacrificing structural clarity.

## Shapes

The design system employs **Medium-Radius Rounded Corners (0.5rem / 8px)**. This specific radius is chosen to feel modern and friendly while maintaining enough structural "sharpness" to feel professional and organized.

- **Standard Elements:** 8px (Buttons, Inputs, Small Cards).
- **Large Containers:** 16px (Venue images, Detail Modals).
- **Pills:** Full rounding (999px) is reserved exclusively for status indicators (e.g., "Available", "Booked") and filter chips to distinguish them from actionable buttons.

## Components

### Buttons
- **Primary:** Solid Turf Green with white text. Archivo Narrow Semibold.
- **Secondary:** Transparent with a 2px Green border.
- **CTA:** Solid Amber for "Book Now" or "Confirm Payment."

### Chips & Slots
- **Time Slots:** Rectangular with 8px radius. White background with 1px border for available; Solid Amber for selected; Light Gray for unavailable.

### Inputs
- **Field Style:** White background with a subtle gray border. Focus state uses a 2px Turf Green ring. Labels are placed above the field in **Label-Bold**.

### Cards
- **Venue Cards:** Full-width image at the top with 16px padding for text content below. Use high-contrast price tags in the top right corner of the image using an Amber background.

### Lists
- **Schedule List:** Clean, horizontal rows with 16px padding. Use thin dividers (#EDF2F7) and chevron indicators for navigation.

### Progress Indicators
- **Step Tracker:** Minimalist line at the top of the booking flow using Turf Green to show completion, ensuring the user knows exactly where they are in the transaction.
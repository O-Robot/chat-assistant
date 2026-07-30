# Design system

## Purpose

Record the design tokens and component direction visible in the current frontend.

## Current visual foundation

Global CSS defines light and dark custom properties for background, primary, text, secondary text, accent, and gradients. The visual language uses Space Grotesk, rounded surfaces, purple/pink tones, glass effects, and Tailwind utilities.

Key reusable UI pieces include buttons, inputs, cards, toasts, confirmation modals, dark-mode control, avatars, and chat bubbles.

## Design rules

- Use semantic token names such as `--background`, `--primary`, and `--primary-text`; avoid one-off colour values where a token exists.
- Maintain a clear hierarchy: page title/context, primary action, supporting information, then tertiary controls.
- Use a consistent spacing scale and standard icon-button dimensions.
- Preserve light and dark mode parity.
- Check contrast and focus visibility whenever a token changes.

## TODO

- Define measured colour contrast, type scale, spacing scale, elevation, radius, breakpoints, and component states.
- Create visual regression/accessibility checks and a component inventory.

See [UI principles](ui-principles.md) and [accessibility guidance](../security/checklist.md#frontend-and-widget).


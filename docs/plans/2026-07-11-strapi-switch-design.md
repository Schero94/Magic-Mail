# Strapi Switch UI Design

## Problem

MagicMail uses the Strapi Design System `Toggle` for nine boolean settings.
`Toggle` is a wide, two-segment control. In narrow form columns its two halves
wrap vertically, producing the unreadable `INACTIVE / ACTIVE` stack shown in
the admin UI. Several screens also repeat the same state in nearby text,
badges, emojis, and custom color overrides.

## Decision

Use the Design System v2 `Switch` for every boolean setting. `Switch` is the
official compact on/off control and remains usable in narrow dialogs.

## Visual Contract

- Information is left-aligned: one title and one short description.
- A compact `Switch` is right-aligned and never shrinks.
- No duplicate state label, state emoji, or redundant enabled/disabled badge.
- Use Strapi theme colors and the native Switch states; remove CSS selectors
  that restyle the internal control.
- Keep existing surrounding cards where they communicate useful context, but
  reduce active-state styling to subtle theme-aware backgrounds/borders.

## Accessibility Contract

- Every switch receives a descriptive `aria-label`.
- `onLabel` and `offLabel` describe its two states.
- `visibleLabels={false}` avoids visual duplication while retaining the native
  compact control.
- State changes continue to use controlled React values through
  `onCheckedChange`.

## Scope

Replace all nine boolean controls in:

- `admin/src/pages/PluginSettings.jsx`
- `admin/src/components/AddAccountModal.jsx`
- `admin/src/pages/RoutingRules.jsx`
- `admin/src/pages/EmailDesigner/EditorPage.jsx`

No API, persistence, or business-logic behavior changes.

## Verification

- Static scan finds no `Toggle` imports or `<Toggle>` usages in `admin/src`.
- `npm run build`, `npm test`, `npm run verify`, and
  `npm run verify:runtime` pass.
- The release pipeline publishes a patch version after one final push.

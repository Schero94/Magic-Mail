# Compact Strapi Switch Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace every wrapping Design System `Toggle` with the compact native
`Switch` and remove redundant boolean-state decorations.

**Architecture:** Keep each screen's existing data flow and controlled state.
Only the presentation primitive changes: imports use `Switch`, state updates use
Radix's `onCheckedChange`, and visual duplication around the control is removed.
A static source test prevents the wide `Toggle` from returning.

**Tech Stack:** React 18, Strapi Design System v2.2, styled-components, Node test
runner.

---

### Task 1: Add a regression test for compact boolean controls

**Files:**
- Create: `tests/admin-switches.test.js`

**Step 1: Write the failing test**

Read the four affected JSX files and assert:

- no file imports `Toggle`;
- no file contains `<Toggle`;
- all four files import `Switch`;
- exactly nine `<Switch` usages exist in total;
- each switch has `aria-label`, `onLabel`, `offLabel`, and
  `visibleLabels={false}`.

**Step 2: Run the test to verify it fails**

Run: `node --test tests/admin-switches.test.js`

Expected: FAIL because the four files still import and render `Toggle`.

### Task 2: Convert plugin settings controls

**Files:**
- Modify: `admin/src/pages/PluginSettings.jsx:1-15,301-413`

**Step 1: Replace the component**

- Import `Switch` instead of `Toggle`.
- Convert the three tracking/unsubscribe controls to:

```jsx
<Switch
  checked={settings.enableLinkTracking}
  onCheckedChange={(checked) => handleChange('enableLinkTracking', checked)}
  onLabel="Enabled"
  offLabel="Disabled"
  visibleLabels={false}
  aria-label="Enable link tracking"
/>
```

- Keep the existing label/description-left, control-right layout.

### Task 3: Convert account setup controls

**Files:**
- Modify: `admin/src/components/AddAccountModal.jsx:1-40,1295-1335,1949-2030`

**Step 1: Replace SSL, active, and primary controls**

- Import `Switch` instead of `Toggle`.
- Use `onCheckedChange={(checked) => handleChange(field, checked)}`.
- Place information first and the switch at the right edge.
- Remove enabled/disabled/primary badges and state emojis that duplicate the
  switch state.
- Preserve explanatory descriptions and conditional warning text.

### Task 4: Convert routing rule controls

**Files:**
- Modify: `admin/src/pages/RoutingRules.jsx:1-40,1068-1163`

**Step 1: Replace fallback and active controls**

- Import `Switch` instead of `Toggle`.
- Right-align the compact switch in each setting card.
- Remove duplicate enabled/disabled badges and active/inactive emojis.
- Keep the dynamic explanatory text and card context.

### Task 5: Convert template editor control and delete Toggle CSS overrides

**Files:**
- Modify: `admin/src/pages/EmailDesigner/EditorPage.jsx:1-40,168-199,1119-1132`

**Step 1: Simplify the wrapper**

- Import `Switch` instead of `Toggle`.
- Delete internal `button[aria-checked]`, `span`, and status-text styling from
  `ToggleWrapper`; keep only layout.
- Replace the duplicate external Active/Inactive text with a single visible
  label (`Template active`) and one right-aligned switch.

### Task 6: Verify and release

**Step 1: Run the regression test**

Run: `node --test tests/admin-switches.test.js`

Expected: PASS.

**Step 2: Run all quality gates**

Run:

```bash
npm test
npm run build
npm run verify
npm run verify:runtime
```

Expected: all pass.

**Step 3: Scan the source**

Run:

```bash
rg -n '\bToggle\b|<Toggle' admin/src
```

Expected: no matches.

**Step 4: Commit and push once**

Commit the implementation and tests with:

```text
fix(admin): replace wrapping toggles with compact Strapi switches
```

Push `main` once and watch the release workflow until the patch is published.

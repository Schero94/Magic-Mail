---
name: strapi-plugin-maintenance
description: Maintain Magic-Mail as a standalone Strapi 5 plugin and verify email, WhatsApp, admin UI and API access through the shared local workbench.
---

# Magic-Mail maintenance

Use Node 22. Before code changes, read local rules, compare the pinned Strapi version with current 5.x, and fetch relevant Strapi 5 Plugin SDK, routes, Design System and permission docs via Context7. Do not copy credentials or provider tokens into source, skills, Playwright traces or Git; do not push without an explicit request.

Inspect `server/src/routes/admin.js`, `content-api.js`, controllers and `admin/src/permissions.js` together. For every route state anonymous, admin-without-permission, authorised admin, owner/other-user outcomes and test denials server-side; menu permissions alone do not protect the API. OAuth callbacks are intentionally public: verify signed state, expiry, replay handling, redirect allowlist and account ownership, not blanket authentication. Sending requires scoped token/role, validation and shared rate limit; tracking pixel/click remain public only with bounded identifiers, safe redirect and rate limits. Never test against live email or WhatsApp accounts without separate authority.

Use Strapi 5 Design System and keyboard-accessible labels for accounts, routing, template editor, analytics and settings; verify empty/loading/error states and desktop/mobile layout with Playwright CLI in the local test app. Build and test with `npm test`, `npm run build`, `npm run verify:runtime`, then rebuild/boot the shared app and check the seven-plugin startup assertion. Record what was not exercised (provider integrations, delivery and OAuth).

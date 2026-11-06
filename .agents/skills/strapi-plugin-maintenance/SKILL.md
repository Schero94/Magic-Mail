---
name: strapi-plugin-maintenance
description: Maintain Magic-Mail as a standalone Strapi 5 plugin and verify email, WhatsApp, admin UI and API access through the shared local workbench.
---

# Magic-Mail maintenance

Use Node 22. Before code changes, read local rules, compare the pinned Strapi version with current 5.x, and fetch relevant Strapi 5 Plugin SDK, routes, Design System and permission docs via Context7. Do not copy credentials or provider tokens into source, skills, Playwright traces or Git; do not push without an explicit request.

Inspect `server/src/routes/admin.js`, `content-api.js`, controllers and `admin/src/permissions.js` together. For every route state anonymous, admin-without-permission, authorised admin, owner/other-user outcomes and test denials server-side; menu permissions alone do not protect the API. OAuth callbacks are intentionally public: verify signed state, expiry, replay handling, redirect allowlist and account ownership, not blanket authentication. Sending requires scoped token/role, validation and shared rate limit; tracking pixel/click remain public only with bounded identifiers, safe redirect and rate limits. Never test against live email or WhatsApp accounts without separate authority.

For UI changes, first read the workbench root skill's `references/ui-ux-standards.md`; it defines the shared responsive, alignment, readable-copy, accessibility and Playwright acceptance checks. Use Strapi 5 Design System and keyboard-accessible labels for accounts, routing, template editor, analytics and settings; verify empty/loading/error states and desktop/mobile layout with Playwright CLI in the local test app. Build and test with `npm test`, `npm run build`, `npm run verify:runtime`, then rebuild/boot the shared app and check the seven-plugin startup assertion. Record what was not exercised (provider integrations, delivery and OAuth).

## Shared product quality contract

Use spec-first development: define acceptance criteria and API response/error contracts before implementation.

Follow the detailed JSDoc contract in the always-applied plugin rule for new and substantially changed exported or non-trivial functions, handlers, services, hooks, middleware, policies and components. Document purpose, context, applicable `@param` and `@returns`, and only actually propagated `@throws`. Verify HTTP `@route`, access, inputs and outcomes against the implementation; describe applicable mutations and security/privacy effects with `@sideeffect`. These are custom tags; respect configured tools, never invent behavior, and update comments when contracts change.

Every behavior change starts with a written current-state and target-state analysis covering screens, controls, routes, roles, data, known gaps and non-goals. Define acceptance criteria and API response/error contracts before implementation, then add a failing regression test first. A primary task should take no more than four meaningful user interactions from the plugin entry page; exclude login and mandatory security confirmations, and measure and document any justified exception. Use the Strapi Design System, responsive layouts, keyboard accessibility and explicit loading, empty, success and error states. Enforce authentication, plugin permissions, validation and owner boundaries server-side. Keep API error contracts consistent within each Strapi surface and never return stack traces or internal details. Do not log secrets, tokens, cookies, request bodies, email, IP or stable user/session identifiers. Use fakes for providers and record unverified behavior accurately.

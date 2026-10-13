# Magic-Mail email-only modernization implementation plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove Magic-Mail's WhatsApp transport and behavior while preserving email, OAuth, and tracking, and refresh the plugin's compatible packages.

**Architecture:** Make the server inventory, route definitions, email router, admin navigation, package manifest, and README agree that Magic-Mail owns email only. Add regression tests before each behavior change, use only fake transports, and retain existing persisted data without silently migrating or deleting it.

**Tech Stack:** Strapi 5, Node.js 22, npm, node:test, Strapi Design System, local shared Strapi test app.

---

### Task 1: Lock the email-only ownership boundary with failing tests

**Files:**
- Modify: `tests/route-inventory.test.js`
- Create: `tests/email-only-boundary.test.js`
- Modify: `tests/providers.test.js`

**Steps:** Update expected route inventory and add assertions that no WhatsApp routes, service, controller, menu entry, or Baileys dependency is registered. Add tests that `/send-message` keeps email behavior and rejects removed WhatsApp channels without calling a provider. Run those tests and confirm they fail against the current implementation.

### Task 2: Remove transport ownership and preserve email behavior

**Files:**
- Modify: `server/src/routes/admin.js`, `server/src/routes/content-api.js`
- Modify: `server/src/controllers/index.js`, `server/src/services/index.js`
- Delete: `server/src/controllers/whatsapp.js`, `server/src/services/whatsapp.js`
- Modify: `server/src/services/email-router.js`, `server/src/services/plugin-settings.js`
- Modify: `server/src/content-types/routing-rule/schema.json`
- Modify: affected admin navigation, routing UI, translations, and tests

**Steps:** Remove WhatsApp routes, controllers, service registration, fallback and unified-send branches. Preserve email send, OAuth callbacks, tracking, email routing, and existing stored settings. Verify the new regression tests pass with fake-only dependencies.

### Task 3: Update published behavior and compatible packages

**Files:**
- Modify: `package.json`, `package-lock.json`, `README.md`

**Steps:** Remove obsolete WhatsApp metadata and dependencies, refresh remaining direct packages to the newest compatible releases, regenerate the lockfile, and document removed endpoints/services plus retained local settings. Run tests after dependency installation.

### Task 4: Verify the checkout and record evidence

**Files:**
- Modify: root `gates/magic-mail.md` only

**Steps:** Run tests, lint if available, verify, runtime verification, build, fake-only integration checks, package and boundary checks, and local Strapi admin acceptance when available. Inspect the final diff for scope, data retention, authorization, and secret leakage. Record each result and any unavailable check in the root gate without changing other root files. Do not commit or push.

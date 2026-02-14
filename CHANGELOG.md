## [2.6.5](https://github.com/Schero94/Magic-Mail/compare/v2.6.4...v2.6.5) (2026-02-14)


### Bug Fixes

* resolve libsignal git+ssh dependency issue for CI/CD compatibility ([3975015](https://github.com/Schero94/Magic-Mail/commit/3975015c96538bbb694233c94588893735cff582))

## [2.6.4](https://github.com/Schero94/Magic-Mail/compare/v2.6.3...v2.6.4) (2026-02-08)


### Bug Fixes

* dark mode compatibility for LicensePage and LicenseGuard ([21427be](https://github.com/Schero94/Magic-Mail/commit/21427bed9fe461590db8dc4712f8a568d38ccc48)), closes [#4945ff](https://github.com/Schero94/Magic-Mail/issues/4945ff)
* remove TypeScript syntax from JSX file (FeatureText) ([749d2a4](https://github.com/Schero94/Magic-Mail/commit/749d2a491f81f1098bb479aebca7d143b6596ee9))

## [2.6.3](https://github.com/Schero94/Magic-Mail/compare/v2.6.2...v2.6.3) (2026-02-08)


### Bug Fixes

* use props.theme.colors.neutral0 for dark mode card backgrounds ([15df80f](https://github.com/Schero94/Magic-Mail/commit/15df80f4790b39c2b4b0595325fcf1f6326f94a1))

## [2.6.2](https://github.com/Schero94/Magic-Mail/compare/v2.6.1...v2.6.2) (2026-02-07)


### Bug Fixes

* dark/light mode compatibility for entire admin UI ([f373d6f](https://github.com/Schero94/Magic-Mail/commit/f373d6f97f4dfb625a40407e53b261467548b43f))

## [2.6.1](https://github.com/Schero94/Magic-Mail/compare/v2.6.0...v2.6.1) (2026-02-07)


### Bug Fixes

* **admin:** use templateReferenceId for template navigation ([d91f03d](https://github.com/Schero94/Magic-Mail/commit/d91f03da5ca956a7b1540a4671ac7b9962baea10))

# [2.6.0](https://github.com/Schero94/Magic-Mail/compare/v2.5.0...v2.6.0) (2026-01-26)


### Features

* **admin:** add session heartbeat to prevent token expiration ([045a728](https://github.com/Schero94/Magic-Mail/commit/045a728dbe694c028b44a1f89929c7537c5d6e40))

# [2.5.0](https://github.com/Schero94/Magic-Mail/compare/v2.4.0...v2.5.0) (2026-01-25)


### Features

* **whatsapp:** add send test message modal with styled UI ([c3bda11](https://github.com/Schero94/Magic-Mail/commit/c3bda110fc32ebaf1e12eccaf2ee51aca7647ae1))

# [2.4.0](https://github.com/Schero94/Magic-Mail/compare/v2.3.11...v2.4.0) (2026-01-25)


### Features

* v2.4.0 - Major UI improvements and WhatsApp integration ([e5df08e](https://github.com/Schero94/Magic-Mail/commit/e5df08e431ec978706c14d5862d7819bdf89e53d))

## [2.3.11](https://github.com/Schero94/Magic-Mail/compare/v2.3.10...v2.3.11) (2026-01-04)


### Bug Fixes

* use relative paths for menu and settings links ([709849a](https://github.com/Schero94/Magic-Mail/commit/709849a5b7c78813380f1ae62bce137b792a1118))

## [2.3.10](https://github.com/Schero94/Magic-Mail/compare/v2.3.9...v2.3.10) (2026-01-01)


### Bug Fixes

* only replace URLs in href attributes, not in link text ([7bd1054](https://github.com/Schero94/Magic-Mail/commit/7bd10547834317456a689e55c810de9baf4d6b6b))

## [2.3.9](https://github.com/Schero94/Magic-Mail/compare/v2.3.8...v2.3.9) (2026-01-01)


### Bug Fixes

* add findVersionById to support numeric version IDs ([648d5ca](https://github.com/Schero94/Magic-Mail/commit/648d5ca805aa93abaad5e223ba54dea628d547b2))

## [2.3.8](https://github.com/Schero94/Magic-Mail/compare/v2.3.7...v2.3.8) (2026-01-01)


### Bug Fixes

* correct populate syntax for Strapi v5 ([465a6e0](https://github.com/Schero94/Magic-Mail/commit/465a6e04ac6ea848bf55c345cfa7570b6d66676a))

## [2.3.7](https://github.com/Schero94/Magic-Mail/compare/v2.3.6...v2.3.7) (2026-01-01)


### Bug Fixes

* support both templateReferenceId and internal db id lookup ([163529f](https://github.com/Schero94/Magic-Mail/commit/163529f91fa8dd0cac3803797b2fa58a711a4920))

## [2.3.6](https://github.com/Schero94/Magic-Mail/compare/v2.3.5...v2.3.6) (2026-01-01)


### Bug Fixes

* use templateReferenceId for numeric ID lookup ([85aa4d8](https://github.com/Schero94/Magic-Mail/commit/85aa4d83dc08943a20b21ef9a6accc62b43c7445))

## [2.3.5](https://github.com/Schero94/Magic-Mail/compare/v2.3.4...v2.3.5) (2026-01-01)


### Bug Fixes

* use entityService for numeric ID lookup in findById ([94b7cad](https://github.com/Schero94/Magic-Mail/commit/94b7cad283f6d070ee168295d912feae1ae11e88))

## [2.3.4](https://github.com/Schero94/Magic-Mail/compare/v2.3.3...v2.3.4) (2026-01-01)


### Bug Fixes

* resolve documentId from findOne for all template operations ([1c4ff2b](https://github.com/Schero94/Magic-Mail/commit/1c4ff2ba241e986a046d46c0c1c483c2648c2bf5))

## [2.3.3](https://github.com/Schero94/Magic-Mail/compare/v2.3.2...v2.3.3) (2026-01-01)


### Bug Fixes

* findOne supports both numeric id and documentId ([c1b3312](https://github.com/Schero94/Magic-Mail/commit/c1b3312694f633b210eac5728b7a819044f9c163))

## [2.3.2](https://github.com/Schero94/Magic-Mail/compare/v2.3.1...v2.3.2) (2026-01-01)


### Bug Fixes

* improve template import to support email-designer-5 format ([290d31a](https://github.com/Schero94/Magic-Mail/commit/290d31a57b109137f74c547a8c64b90e80e37f29))

## [2.3.1](https://github.com/Schero94/Magic-Mail/compare/v2.3.0...v2.3.1) (2026-01-01)


### Bug Fixes

* JSON encryption + documentId filter + remove emojis from logs ([b1433ce](https://github.com/Schero94/Magic-Mail/commit/b1433ce6a762eaae846de3eb4e76e775956f6214))

# [2.3.0](https://github.com/Schero94/Magic-Mail/compare/v2.2.6...v2.3.0) (2025-12-16)


### Features

* add WhatsApp messaging integration v2.4.0 ([a3e6dca](https://github.com/Schero94/Magic-Mail/commit/a3e6dca51b00782860e6120c71ec6605dd03ef89))

## [2.2.6](https://github.com/Schero94/Magic-Mail/compare/v2.2.5...v2.2.6) (2025-12-14)


### Bug Fixes

* clean up README formatting ([e8f4f45](https://github.com/Schero94/Magic-Mail/commit/e8f4f4530e74fca7b4c4f115d8e3da9ca9e0abdb))

## [2.2.5](https://github.com/Schero94/Magic-Mail/compare/v2.2.4...v2.2.5) (2025-12-14)


### Bug Fixes

* remove source folders from npm package ([d14411f](https://github.com/Schero94/Magic-Mail/commit/d14411f18e424f885cfec1dabe002d2367f6da83))

## [2.2.4](https://github.com/Schero94/Magic-Mail/compare/v2.2.3...v2.2.4) (2025-12-14)


### Bug Fixes

* enable npm provenance with OIDC trusted publishing ([317db0e](https://github.com/Schero94/Magic-Mail/commit/317db0ea6d36b546dbb50a72ae5d14f965a6c0a4))

## [2.2.3](https://github.com/Schero94/Magic-Mail/compare/v2.2.2...v2.2.3) (2025-12-14)


### Bug Fixes

* update release workflow for new npm token requirements ([a4900b4](https://github.com/Schero94/Magic-Mail/commit/a4900b40da2a7e0f95493b9770c45b51ebd787dd))

## [2.2.2](https://github.com/Schero94/Magic-Mail/compare/v2.2.1...v2.2.2) (2025-12-14)


### Bug Fixes

* add debug mode documentation to README ([5fe8e26](https://github.com/Schero94/Magic-Mail/commit/5fe8e26b8b86ee8d5e55e3627b697c8f7fe1c683))

## [2.2.1](https://github.com/Schero94/Magic-Mail/compare/v2.2.0...v2.2.1) (2025-12-14)


### Bug Fixes

* add debug mode for plugin logging ([a95711e](https://github.com/Schero94/Magic-Mail/commit/a95711e9f88ccb20030ce1c05a2cd11ea89bf577))

# [2.2.0](https://github.com/Schero94/Magic-Mail/compare/v2.1.0...v2.2.0) (2025-12-08)


### Features

* enhance pull request template with email-specific sections and provider testing checklist ([6040125](https://github.com/Schero94/Magic-Mail/commit/6040125508af8a2209b3d37693e102f2aeb80325))

# [2.1.0](https://github.com/Schero94/Magic-Mail/compare/v2.0.4...v2.1.0) (2025-12-08)


### Features

* enhance GitHub issue templates with email provider specific fields and feature request template ([bec7d30](https://github.com/Schero94/Magic-Mail/commit/bec7d30de766c041f07c6f07fa2476fe4e285fe7))

## [2.0.4](https://github.com/Schero94/Magic-Mail/compare/v2.0.3...v2.0.4) (2025-12-08)


### Bug Fixes

* add GitHub templates for better open-source collaboration ([d412ece](https://github.com/Schero94/Magic-Mail/commit/d412eceb29455a494b1f839dc55308d783752bbe))

## [2.0.3](https://github.com/Schero94/Magic-Mail/compare/v2.0.2...v2.0.3) (2025-12-04)


### Bug Fixes

* relation filtering for Strapi v5 Document Service API ([03818b4](https://github.com/Schero94/Magic-Mail/commit/03818b49347893c9c88def5b25a2c3a86a308c74))

## [2.0.2](https://github.com/Schero94/Magic-Mail/compare/v2.0.1...v2.0.2) (2025-11-23)


### Bug Fixes

* Readme with real limits ([b861c33](https://github.com/Schero94/Magic-Mail/commit/b861c33956fcc90206e6d825a2664de00e10b84b))

## [2.0.1](https://github.com/Schero94/Magic-Mail/compare/v2.0.0...v2.0.1) (2025-11-23)


### Bug Fixes

* Update readme ([caf4e21](https://github.com/Schero94/Magic-Mail/commit/caf4e217811772d1489d9267f88d9015f95f8b46))

# [2.0.0](https://github.com/Schero94/Magic-Mail/compare/v1.0.5...v2.0.0) (2025-11-23)


### Bug Fixes

* resolve EmailEditor component export ([7fa3368](https://github.com/Schero94/Magic-Mail/commit/7fa3368db66476697894e45c76263d5bc2e58770))
* resolve react-email-editor import issue in production builds ([3c90d35](https://github.com/Schero94/Magic-Mail/commit/3c90d358ed76352bd5494a01e1fb3c110f2d8cef))
* resolve react-email-editor import issue in production builds ([fdb54c3](https://github.com/Schero94/Magic-Mail/commit/fdb54c3c283d897fd4230c721309e86633458d3f))
* Update readme ([965c663](https://github.com/Schero94/Magic-Mail/commit/965c663c9c657c37201cda89e2a2597aa45f88ec))


### BREAKING CHANGES

* Changed from lazy import to static import to fix 'Element type is invalid' error when creating email templates in production environments

# [2.0.0](https://github.com/Schero94/Magic-Mail/compare/v1.0.5...v2.0.0) (2025-11-23)


### Bug Fixes

* resolve EmailEditor component export ([7fa3368](https://github.com/Schero94/Magic-Mail/commit/7fa3368db66476697894e45c76263d5bc2e58770))
* resolve react-email-editor import issue in production builds ([3c90d35](https://github.com/Schero94/Magic-Mail/commit/3c90d358ed76352bd5494a01e1fb3c110f2d8cef))
* resolve react-email-editor import issue in production builds ([fdb54c3](https://github.com/Schero94/Magic-Mail/commit/fdb54c3c283d897fd4230c721309e86633458d3f))


### BREAKING CHANGES

* Changed from lazy import to static import to fix 'Element type is invalid' error when creating email templates in production environments

## [1.0.5](https://github.com/Schero94/Magic-Mail/compare/v1.0.4...v1.0.5) (2025-11-23)


### Bug Fixes

* load email designer without lazy import ([4832fee](https://github.com/Schero94/Magic-Mail/commit/4832fee7f4e213267419aede9ee897135ac64eee))

## [1.0.4](https://github.com/Schero94/Magic-Mail/compare/v1.0.3...v1.0.4) (2025-11-23)


### Bug Fixes

* Correct lazy loading for react-email-editor ([674f7eb](https://github.com/Schero94/Magic-Mail/commit/674f7eb33bf063723302a9ca5836def201ee6418))

## [1.0.3](https://github.com/Schero94/Magic-Mail/compare/v1.0.2...v1.0.3) (2025-11-23)


### Bug Fixes

* Update email designer editor page ([65fdcc0](https://github.com/Schero94/Magic-Mail/commit/65fdcc0feda08ce8d202a81870ccf7fb28d2f40d))

## [1.0.1](https://github.com/Schero94/Magic-Mail/compare/v1.0.0...v1.0.1) (2025-11-23)


### Bug Fixes

* Correct repository URL to Magic-Mail (with hyphen) ([9122f54](https://github.com/Schero94/Magic-Mail/commit/9122f5444809c9099d0788b7f17f4abb591f2b3e))
* Update Node.js to v22 and sync package-lock.json ([3c3f074](https://github.com/Schero94/Magic-Mail/commit/3c3f0743a99c7998c12c24ed2b402bbbf2fd6257))
* Update Node.js version to 22 in semantic-release workflow ([dd24139](https://github.com/Schero94/Magic-Mail/commit/dd241398aeea160d9dbc59f4ae533c0fb4611176))

## [1.0.1](https://github.com/Schero94/Magic-Mail/compare/v1.0.0...v1.0.1) (2025-11-23)


### Bug Fixes

* Correct repository URL to Magic-Mail (with hyphen) ([9122f54](https://github.com/Schero94/Magic-Mail/commit/9122f5444809c9099d0788b7f17f4abb591f2b3e))
* Update Node.js to v22 and sync package-lock.json ([3c3f074](https://github.com/Schero94/Magic-Mail/commit/3c3f0743a99c7998c12c24ed2b402bbbf2fd6257))
* Update Node.js version to 22 in semantic-release workflow ([dd24139](https://github.com/Schero94/Magic-Mail/commit/dd241398aeea160d9dbc59f4ae533c0fb4611176))

## [1.0.1](https://github.com/Schero94/Magic-Mail/compare/v1.0.0...v1.0.1) (2025-11-23)


### Bug Fixes

* Correct repository URL to Magic-Mail (with hyphen) ([1801a22](https://github.com/Schero94/Magic-Mail/commit/1801a228b83aa2ac69c8d93482db753d446ab8cc))
* Update Node.js to v22 and sync package-lock.json ([1e0e0ad](https://github.com/Schero94/Magic-Mail/commit/1e0e0ad4dbddabe6fcee88122f38b3f6852a6c9d))
* Update Node.js version to 22 in semantic-release workflow ([7ed867f](https://github.com/Schero94/Magic-Mail/commit/7ed867f45e1f160c1617dc5c27ebb0b60a9a21a4))

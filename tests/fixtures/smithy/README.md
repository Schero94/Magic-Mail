# Amazon SES v2 Smithy model (subset)

`sesv2.json` is a subset of the official Smithy JSON model of Amazon SES API v2:

- Repository: <https://github.com/aws/api-models-aws>
- File: `models/sesv2/service/2019-09-27/sesv2-2019-09-27.json`
- Commit: `9f371492a21b16552652248af39cb2efa4abcfc0` (retrieved 2026-11-18)
- SHA-256 of the full file: `f34aeda95c11bd696714f5ff2be180ecb5b48ad3bfdfd6fb73de31aa3d42b891`
- License: Apache-2.0

Kept: the operations `SendEmail`, `GetAccount`, `ListEmailTemplates` and
`GetEmailTemplate`, every shape reachable from their input, output and error
shapes, and the service's `aws.api#service`, `aws.auth#sigv4` and
`aws.protocols#restJson1` traits. Removed: documentation traits.

`tests/helpers/smithy-contract.js` validates the request bodies Magic Mail
builds and the fake SES responses against these shapes
(`tests/ses-contract.test.js`).

Re-generate (development only):

```sh
node tests/helpers/vendor-aws-fixtures.js smithy <path>/sesv2-2019-09-27.json <commit>
npx prettier --write tests/fixtures/smithy/sesv2.json
```

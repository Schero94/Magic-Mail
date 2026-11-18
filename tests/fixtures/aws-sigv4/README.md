# AWS SigV4 test vectors

`v4-vectors.json` holds every case of the official AWS Signature Version 4
test suite as shipped in `awslabs/aws-c-auth`:

- Repository: <https://github.com/awslabs/aws-c-auth>
- Path: `tests/aws-signing-test-suite/v4/<case>/`
- Commit: `cf69fb7edf7c973524348bbcecda1b1684de4d5e` (retrieved 2026-11-18)
- License: Apache-2.0 (aws-c-auth `LICENSE`)

Per case the files `context.json`, `request.txt`,
`header-canonical-request.txt`, `header-string-to-sign.txt`,
`header-signature.txt` and `header-signed-request.txt` are stored as strings,
each with the SHA-256 of the original upstream file. `tests/aws-sigv4.test.js`
re-computes every SHA-256 and runs all 38 cases against
`server/src/utils/aws-sigv4.js`. The credentials inside are the published AWS
example keys (`AKIDEXAMPLE`), not secrets.

Re-generate (development only):

```sh
node tests/helpers/vendor-aws-fixtures.js sigv4 <checkout>/tests/aws-signing-test-suite/v4 <commit>
npx prettier --write tests/fixtures/aws-sigv4/v4-vectors.json
```

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const quietLog = { debug() {}, info() {}, warn() {}, error() {} };

function makeCtx(path) {
  return {
    path,
    state: { auth: { credentials: { id: 'api-token-abc' } } },
    request: { ip: '1.2.3.4' },
    status: 200,
    body: null,
    set() {},
  };
}

test('rate limiter buckets by stable id, not by dynamic request path', async () => {
  const rateLimit = require('../server/src/middlewares/rate-limit');
  const mw = rateLimit({ bucket: 'send', max: 2, window: 60_000 }, { strapi: { log: quietLog } });

  const outcomes = [];
  // Each call uses a DIFFERENT dynamic path but the same logical bucket+caller.
  for (let i = 0; i < 3; i++) {
    const ctx = makeCtx(`/api/magic-mail/track/click/email-${i}/hash-${i}`);
    let passed = false;
    await mw(ctx, async () => { passed = true; });
    outcomes.push({ passed, status: ctx.status });
  }

  assert.equal(outcomes[0].passed, true);
  assert.equal(outcomes[1].passed, true);
  assert.equal(outcomes[2].passed, false, 'third request over the limit is blocked despite a new path');
  assert.equal(outcomes[2].status, 429);
});

test('rate limiter isolates distinct callers', async () => {
  const rateLimit = require('../server/src/middlewares/rate-limit');
  // Distinct bucket id keeps this test independent from the shared module-level
  // store used by the other test.
  const mw = rateLimit({ bucket: 'send-isolation', max: 1, window: 60_000 }, { strapi: { log: quietLog } });

  const first = makeCtx('/api/magic-mail/send');
  first.state.auth.credentials.id = 'caller-one';
  const second = makeCtx('/api/magic-mail/send');
  second.state.auth.credentials.id = 'caller-two';

  let firstPassed = false;
  let secondPassed = false;
  await mw(first, async () => { firstPassed = true; });
  await mw(second, async () => { secondPassed = true; });

  assert.equal(firstPassed, true);
  assert.equal(secondPassed, true, 'a different caller has an independent quota');
});

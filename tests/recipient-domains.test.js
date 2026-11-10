'use strict';

/**
 * Pre-send recipient checks: reserved/test domains, provider typo domains,
 * optional MX lookup (injected resolver, no network), and the router
 * integration including the hard-bounce suppression list.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  checkRecipientDomains,
  isReservedDomain,
  typoSuggestion,
  setResolver,
} = require('../server/src/utils/recipient-domains');

test('reserved and test domains', () => {
  for (const domain of [
    'nowhere.test',
    'x.invalid',
    'mail.example',
    'localhost',
    'example.com',
    'a.example.org',
  ]) {
    assert.equal(isReservedDomain(domain), true, domain);
  }
  for (const domain of ['gmail.com', 'web.de', 'test.de', 'examples.com']) {
    assert.equal(isReservedDomain(domain), false, domain);
  }
});

test('typo domains suggest the intended provider', () => {
  assert.equal(typoSuggestion('googelmail.com'), 'googlemail.com');
  assert.equal(typoSuggestion('gmx.ed'), 'gmx.de');
  assert.equal(typoSuggestion('web.ed'), 'web.de');
  assert.equal(typoSuggestion('t-onlien.de'), 't-online.de');
  assert.equal(typoSuggestion('outlok.com'), 'outlook.com');
  assert.equal(typoSuggestion('hotmial.com'), 'hotmail.com');
  assert.equal(typoSuggestion('gmail.com'), null);
});

test('checkRecipientDomains: first problem wins, settings respected', async () => {
  assert.deepEqual(await checkRecipientDomains(['a@gmail.com', 'b@pool.sender.test']), {
    code: 'INVALID_RECIPIENT_DOMAIN',
    domain: 'pool.sender.test',
  });
  assert.equal(await checkRecipientDomains(['b@pool.sender.test'], { allowReserved: true }), null);
  assert.deepEqual(await checkRecipientDomains(['Kunde@GoogelMail.com']), {
    code: 'RECIPIENT_DOMAIN_TYPO',
    domain: 'googelmail.com',
    suggestion: 'googlemail.com',
  });
  assert.equal(await checkRecipientDomains(['x@googelmail.com'], { enabled: false }), null);
  assert.equal(await checkRecipientDomains(['ok@web.de']), null);
});

test('optional MX lookup: NXDOMAIN and null MX block, DNS errors and timeouts do not', async () => {
  const answers = {
    'nomail.example-mx.de': { mx: Object.assign(new Error('nx'), { code: 'ENOTFOUND' }) },
    'nullmx.example-mx.de': { mx: [{ exchange: '', priority: 0 }] },
    'good.example-mx.de': { mx: [{ exchange: 'mx.good.example-mx.de', priority: 10 }] },
    'aonly.example-mx.de': {
      mx: Object.assign(new Error('nodata'), { code: 'ENODATA' }),
      a: ['192.0.2.1'],
    },
    'servfail.example-mx.de': { mx: Object.assign(new Error('fail'), { code: 'ESERVFAIL' }) },
  };
  setResolver({
    resolveMx: async (domain) => {
      const answer = answers[domain]?.mx;
      if (answer instanceof Error) throw answer;
      return answer || [];
    },
    resolve4: async (domain) => {
      if (answers[domain]?.a) return answers[domain].a;
      throw Object.assign(new Error('nx'), { code: 'ENOTFOUND' });
    },
  });
  const check = (address) => checkRecipientDomains([address], { verifyMx: true });
  assert.equal((await check('x@nomail.example-mx.de'))?.code, 'INVALID_RECIPIENT_DOMAIN');
  assert.equal((await check('x@nullmx.example-mx.de'))?.code, 'INVALID_RECIPIENT_DOMAIN');
  assert.equal(await check('x@good.example-mx.de'), null);
  assert.equal(await check('x@aonly.example-mx.de'), null);
  assert.equal(await check('x@servfail.example-mx.de'), null);
  // MX lookups are off by default.
  assert.equal(await checkRecipientDomains(['x@nomail.example-mx.de']), null);
});

function routerWith(settings, { suppressed = [] } = {}) {
  const services = {
    'plugin-settings': { getSettings: async () => settings },
    'bounce-monitor': { isSuppressed: async (address) => suppressed.includes(address) },
  };
  const strapi = {
    log: { info() {}, warn() {}, error() {}, debug() {} },
    plugin: () => ({ service: (name) => services[name] }),
  };
  return require('../server/src/services/email-router')({ strapi });
}

test('router: test domains are rejected in production unless allowed', async () => {
  const router = routerWith({});
  const previous = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    await assert.rejects(router.assertRecipientsDeliverable({ to: 'a@pool.sender.test' }, {}), {
      code: 'INVALID_RECIPIENT_DOMAIN',
    });
    await router.assertRecipientsDeliverable(
      { to: 'a@pool.sender.test' },
      { allowReservedRecipientDomains: true }
    );
    process.env.NODE_ENV = 'development';
    await router.assertRecipientsDeliverable({ to: 'a@pool.sender.test' }, {});
    await assert.rejects(
      router.assertRecipientsDeliverable(
        { to: 'a@x.test' },
        { allowReservedRecipientDomains: false }
      ),
      { code: 'INVALID_RECIPIENT_DOMAIN' }
    );
  } finally {
    process.env.NODE_ENV = previous;
  }
});

test('router: typo domains are rejected with a suggestion, also in cc/bcc', async () => {
  const router = routerWith({});
  await assert.rejects(
    router.assertRecipientsDeliverable({ to: 'ok@web.de', bcc: ['x@gmx.ed'] }, {}),
    (error) => error.code === 'RECIPIENT_DOMAIN_TYPO' && error.details.suggestion === 'gmx.de'
  );
});

test('router: the suppression list blocks only when the owner turned it on', async () => {
  const router = routerWith({}, { suppressed: ['gone@receiver.de'] });
  await router.assertRecipientsDeliverable({ to: 'gone@receiver.de' }, {});
  await assert.rejects(
    router.assertRecipientsDeliverable({ to: 'gone@receiver.de' }, { suppressHardBounces: true }),
    { code: 'MAGIC_MAIL_RECIPIENT_SUPPRESSED' }
  );
});

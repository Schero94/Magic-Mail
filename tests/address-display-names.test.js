'use strict';

// Regression tests: display names in to/cc/bcc reach every provider
// unchanged. send() used to split address strings on every comma (also
// inside quoted display names) and lower-case the pieces, so
// `"Ops, Live" <cc@x>` arrived as `"ops,  Live" <cc@x>`. Found by the live
// SendGrid run (SG-9). Only the address part may be lower-cased.
// Synthetic data only; fetch is faked and the SMTP/OAuth transports are
// replaced by recorders at the provider boundary.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  accountFor,
  createHarness,
  fakeFetch,
  withEncryptionKey,
} = require('./helpers/provider-send-harness');

/** Input address strings and the mailboxes every provider must receive. */
const CASES = [
  {
    label: 'comma in a quoted name',
    cc: '"Ops, Live" <CC@Example.test>',
    expected: [{ name: 'Ops, Live', address: 'cc@example.test' }],
  },
  {
    label: 'escaped quotes and a comma in a quoted name',
    cc: '"Doe, Jane \\"JD\\"" <jd@example.test>',
    expected: [{ name: 'Doe, Jane "JD"', address: 'jd@example.test' }],
  },
  {
    label: 'unicode names, quoted with a comma and unquoted',
    cc: '"Müller, Zoë" <zoe@example.test>, Zoë Müller <ZOE2@example.test>',
    expected: [
      { name: 'Müller, Zoë', address: 'zoe@example.test' },
      { name: 'Zoë Müller', address: 'zoe2@example.test' },
    ],
  },
  {
    label: 'angle brackets inside a quoted name',
    cc: '"Ops <Team>" <OPS@example.test>',
    expected: [{ name: 'Ops <Team>', address: 'ops@example.test' }],
  },
  {
    label: 'mixed list: quoted comma name, plain name, bare address',
    cc: '"Ops, Live" <a@example.test>, Bob Builder <B@Example.test>, C@example.test',
    expected: [
      { name: 'Ops, Live', address: 'a@example.test' },
      { name: 'Bob Builder', address: 'b@example.test' },
      { name: '', address: 'c@example.test' },
    ],
  },
  {
    label: 'array items with quoted comma names',
    cc: ['"Ops, Live" <a@example.test>', '"Ünal, Ada" <ADA@example.test>'],
    expected: [
      { name: 'Ops, Live', address: 'a@example.test' },
      { name: 'Ünal, Ada', address: 'ada@example.test' },
    ],
  },
];

const TO = 'Primary Person <TO@Example.test>';
const TO_EXPECTED = [{ name: 'Primary Person', address: 'to@example.test' }];

/**
 * Parses what a provider received into mailboxes.
 *
 * @param {*} value
 * @returns {{name: string, address: string}[]}
 */
function mailboxes(value) {
  const parse = require('nodemailer/lib/addressparser');
  const items = Array.isArray(value) ? value : [value];
  return items.flatMap((item) =>
    typeof item === 'string'
      ? parse(item).map((e) => ({ name: e.name || '', address: (e.address || '').toLowerCase() }))
      : [{ name: item.name || '', address: String(item.address).toLowerCase() }]
  );
}

for (const { label, cc, expected } of CASES) {
  test(`SendGrid receives the right addresses: ${label}`, async () => {
    // SendGrid sends bare addresses in this release (names are not passed
    // on), so only the addresses are compared.
    const restoreKey = withEncryptionKey();
    const fetchFake = fakeFetch();
    try {
      const { router } = createHarness([accountFor('sendgrid')]);
      await router.send({ to: TO, cc, subject: 'Names', text: 'x' });
      const p = fetchFake.calls.at(-1).json.personalizations[0];
      assert.deepEqual(
        p.to.map((entry) => entry.email),
        TO_EXPECTED.map((m) => m.address)
      );
      assert.deepEqual(
        p.cc.map((entry) => entry.email),
        expected.map((m) => m.address)
      );
    } finally {
      fetchFake.restore();
      restoreKey();
    }
  });

  test(`Mailgun keeps display names: ${label}`, async () => {
    const restoreKey = withEncryptionKey();
    const fetchFake = fakeFetch();
    try {
      const { router } = createHarness([accountFor('mailgun')]);
      await router.send({ to: TO, cc, subject: 'Names', text: 'x' });
      const form = fetchFake.calls.at(-1).form;
      const field = (key) => form.filter(([k]) => k === key).map(([, v]) => v);
      assert.deepEqual(mailboxes(field('to')), TO_EXPECTED);
      assert.deepEqual(mailboxes(field('cc')), expected);
    } finally {
      fetchFake.restore();
      restoreKey();
    }
  });

  for (const [provider, method] of [
    ['smtp', 'sendViaSMTP'],
    ['gmail-oauth', 'sendViaGmailOAuth'],
    ['microsoft-oauth', 'sendViaMicrosoftOAuth'],
    ['yahoo-oauth', 'sendViaYahooOAuth'],
  ]) {
    test(`${provider} receives the display names unchanged: ${label}`, async () => {
      const restoreKey = withEncryptionKey();
      try {
        const account = { ...accountFor('sendgrid'), provider, documentId: `acc-${provider}` };
        const { router } = createHarness([account]);
        let received;
        router[method] = async (_account, emailData) => {
          received = emailData;
          return { messageId: 'm1' };
        };
        await router.send({ to: TO, cc, bcc: cc, subject: 'Names', text: 'x' });
        assert.deepEqual(mailboxes(received.to), TO_EXPECTED);
        assert.deepEqual(mailboxes(received.cc), expected);
        assert.deepEqual(mailboxes(received.bcc), expected);
      } finally {
        restoreKey();
      }
    });
  }
}

test('bare address lists are normalised exactly as before', async () => {
  const restoreKey = withEncryptionKey();
  try {
    const account = { ...accountFor('sendgrid'), provider: 'smtp', documentId: 'acc-smtp' };
    const { router } = createHarness([account]);
    let received;
    router.sendViaSMTP = async (_account, emailData) => {
      received = emailData;
      return { messageId: 'm1' };
    };
    await router.send({
      to: ['Ada@Example.test', 'bob@example.test'],
      cc: 'Carol@Example.test,dave@example.test',
      bcc: ' Eve@Example.test ',
      subject: 'Bare',
      text: 'x',
    });
    assert.deepEqual(received.to, ['ada@example.test', 'bob@example.test']);
    assert.equal(received.cc, 'carol@example.test, dave@example.test');
    assert.equal(received.bcc, 'eve@example.test');
  } finally {
    restoreKey();
  }
});

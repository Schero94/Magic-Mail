'use strict';

// FUN-15 (router part): OAuth token refresh with expiry skew, rotated refresh
// tokens, single-flight refresh and one retry after a 401.
// SUP-02 (server part): GET /designer/editor-config and the `designer` config.
// Synthetic data only: provider calls go to a fake fetch, no real tokens.

const test = require('node:test');
const assert = require('node:assert/strict');

const quietLog = { debug() {}, info() {}, warn() {}, error() {} };
const KEY = 'k'.repeat(32);

async function withKey(fn) {
  const previous = process.env.MAGIC_MAIL_ENCRYPTION_KEY;
  process.env.MAGIC_MAIL_ENCRYPTION_KEY = KEY;
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env.MAGIC_MAIL_ENCRYPTION_KEY;
    else process.env.MAGIC_MAIL_ENCRYPTION_KEY = previous;
  }
}

function harness({ refreshImpl } = {}) {
  const updates = [];
  const refreshCalls = [];
  const oauthService = require('../server/src/services/oauth')({
    strapi: { log: quietLog, config: { get: () => undefined } },
  });
  const strapi = {
    log: quietLog,
    config: { get: (_key, fallback) => fallback },
    plugin: () => ({
      service: (name) => {
        if (name !== 'oauth') throw new Error(`unexpected service ${name}`);
        return {
          buildOAuthBlob: oauthService.buildOAuthBlob.bind(oauthService),
          refreshGmailTokens: async (refreshToken) => {
            refreshCalls.push(refreshToken);
            return refreshImpl(refreshToken, refreshCalls.length);
          },
        };
      },
    }),
    documents: () => ({
      update: async (params) => {
        updates.push(params);
        return params;
      },
    }),
  };
  const router = require('../server/src/services/email-router')({ strapi });
  return { router, updates, refreshCalls };
}

const gmailAccount = (oauth) => {
  const { encryptCredentials } = require('../server/src/utils/encryption');
  return {
    documentId: 'acc-1',
    name: 'Gmail',
    provider: 'gmail-oauth',
    fromEmail: 'sender@example.test',
    fromName: 'Sender',
    oauth: encryptCredentials(oauth),
    config: encryptCredentials({ clientId: 'client-id', clientSecret: 'client-secret' }),
  };
};

const emailData = {
  to: 'recipient@example.test',
  subject: 'Synthetic',
  text: 'Hello',
  html: '<p>Hello</p>',
};

test('a token that expires within 60 seconds is refreshed and the rotated refresh token is stored', async () => {
  await withKey(async () => {
    const { decryptCredentials } = require('../server/src/utils/encryption');
    const { router, updates } = harness({
      refreshImpl: async () => ({
        accessToken: 'access-2',
        refreshToken: 'refresh-2',
        expiresAt: new Date(Date.now() + 3600_000),
      }),
    });
    const oauth = {
      email: 'sender@example.test',
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt: new Date(Date.now() + 30_000).toISOString(),
    };
    const token = await router.currentOAuthToken({ documentId: 'acc-1' }, oauth, () => ({
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
      expiresAt: new Date(Date.now() + 3600_000),
    }));
    assert.equal(token, 'access-2');
    assert.equal(updates.length, 1);
    const stored = decryptCredentials(updates[0].data.oauth);
    assert.equal(stored.refreshToken, 'refresh-2', 'rotated refresh token persisted');
    assert.equal(stored.email, 'sender@example.test', 'mailbox kept');
  });
});

test('a fresh token is used as is, and a missing rotated token keeps the old refresh token', async () => {
  await withKey(async () => {
    const { decryptCredentials } = require('../server/src/utils/encryption');
    const { router, updates } = harness();
    let calls = 0;
    const fresh = {
      accessToken: 'still-good',
      refreshToken: 'r',
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
    };
    assert.equal(
      await router.currentOAuthToken({ documentId: 'a' }, fresh, () => {
        calls += 1;
      }),
      'still-good'
    );
    assert.equal(calls, 0);

    const expired = {
      accessToken: 'old',
      refreshToken: 'keep-me',
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    };
    await router.currentOAuthToken({ documentId: 'a' }, expired, async () => ({
      accessToken: 'new',
      expiresAt: new Date(Date.now() + 3600_000),
    }));
    assert.equal(decryptCredentials(updates[0].data.oauth).refreshToken, 'keep-me');
  });
});

test('concurrent sends of one account share a single refresh', async () => {
  await withKey(async () => {
    const { router, updates } = harness();
    let calls = 0;
    const refresh = async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return {
        accessToken: 'shared',
        refreshToken: 'rotated',
        expiresAt: new Date(Date.now() + 3600_000),
      };
    };
    const tokens = await Promise.all(
      Array.from({ length: 5 }, () =>
        router.currentOAuthToken(
          { documentId: 'acc-x' },
          {
            accessToken: 'old',
            refreshToken: 'r',
            expiresAt: new Date(Date.now() - 1).toISOString(),
          },
          refresh
        )
      )
    );
    assert.deepEqual(new Set(tokens), new Set(['shared']));
    assert.equal(calls, 1);
    assert.equal(updates.length, 1);
  });
});

test('Gmail 401 triggers exactly one refresh and retry; a second 401 fails', async () => {
  await withKey(async () => {
    const previousFetch = global.fetch;
    const seen = [];
    let statuses = [401, 200];
    global.fetch = async (_url, options) => {
      seen.push(options.headers.Authorization);
      const status = statuses.shift();
      return { ok: status === 200, status, json: async () => ({ id: 'gmail-id' }) };
    };
    try {
      const { router, refreshCalls } = harness({
        refreshImpl: async (_token, n) => ({
          accessToken: `renewed-${n}`,
          expiresAt: new Date(Date.now() + 3600_000),
        }),
      });
      const account = gmailAccount({
        email: 'sender@example.test',
        accessToken: 'revoked',
        refreshToken: 'r1',
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      });
      const result = await router.sendViaGmailOAuth(account, { ...emailData });
      assert.equal(result.messageId, 'gmail-id');
      assert.deepEqual(seen, ['Bearer revoked', 'Bearer renewed-1']);
      assert.equal(refreshCalls.length, 1);

      statuses = [401, 401];
      seen.length = 0;
      await assert.rejects(
        router.sendViaGmailOAuth(
          gmailAccount({
            email: 'sender@example.test',
            accessToken: 'revoked',
            refreshToken: 'r1',
            expiresAt: new Date(Date.now() + 3600_000).toISOString(),
          }),
          { ...emailData }
        ),
        (error) => error.status === 401
      );
      assert.equal(seen.length, 2, 'no retry loop');
    } finally {
      global.fetch = previousFetch;
    }
  });
});

test('Gmail errors other than 401 are not retried', async () => {
  await withKey(async () => {
    const previousFetch = global.fetch;
    let requests = 0;
    global.fetch = async () => {
      requests += 1;
      return { ok: false, status: 500, json: async () => ({}) };
    };
    try {
      const { router, refreshCalls } = harness({
        refreshImpl: async () => {
          throw new Error('must not refresh');
        },
      });
      const account = gmailAccount({
        email: 'sender@example.test',
        accessToken: 'ok',
        refreshToken: 'r1',
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      });
      await assert.rejects(
        router.sendViaGmailOAuth(account, { ...emailData }),
        (error) => error.status === 500
      );
      assert.equal(requests, 1);
      assert.equal(refreshCalls.length, 0);
    } finally {
      global.fetch = previousFetch;
    }
  });
});

test('editor-config returns only well-formed designer settings and enables system merge tags', async () => {
  const { editorConfigFrom } = require('../server/src/controllers/email-designer');
  assert.deepEqual(editorConfigFrom({}), {
    projectId: null,
    scriptUrl: null,
    version: null,
    systemMergeTags: true,
  });
  assert.deepEqual(
    editorConfigFrom({
      projectId: 1234,
      scriptUrl: 'https://cdn.example.test/unlayer/embed.js',
      version: '1.524.0',
    }),
    {
      projectId: 1234,
      scriptUrl: 'https://cdn.example.test/unlayer/embed.js',
      version: '1.524.0',
      systemMergeTags: true,
    }
  );
  assert.deepEqual(
    editorConfigFrom({
      projectId: -1,
      scriptUrl: 'http://cdn.example.test/embed.js',
      version: 'latest',
    }),
    { projectId: null, scriptUrl: null, version: null, systemMergeTags: true }
  );

  const controller = require('../server/src/controllers/email-designer')({
    strapi: {
      config: {
        get: (key) => (key === 'plugin::magic-mail.designer' ? { projectId: 7 } : undefined),
      },
    },
  });
  let sent;
  await controller.getEditorConfig({
    send: (body) => {
      sent = body;
    },
  });
  assert.equal(sent.data.projectId, 7);
});

test('the designer config block is validated at boot', () => {
  const { validator, default: defaults } = require('../server/src/config');
  assert.equal(defaults.designer.projectId, null, 'no foreign Unlayer project by default');
  assert.doesNotThrow(() =>
    validator({
      designer: { projectId: 5, scriptUrl: 'https://cdn.example.test/e.js', version: '1.2.3' },
    })
  );
  assert.throws(() => validator({ designer: { projectId: 'abc' } }), /projectId/);
  assert.throws(
    () => validator({ designer: { scriptUrl: 'http://cdn.example.test/e.js' } }),
    /scriptUrl/
  );
  assert.throws(() => validator({ designer: { version: '^1.2.0' } }), /version/);
});

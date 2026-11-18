'use strict';

// Amazon SES requests and fake responses against the vendored official Smithy
// model (tests/fixtures/smithy/sesv2.json, aws/api-models-aws pinned by
// commit and SHA-256). Also checks the validator itself with negative cases.

const test = require('node:test');
const assert = require('node:assert/strict');

const ses = require('../server/src/providers/ses');
const smithy = require('./helpers/smithy-contract');
const {
  PIXEL_PNG,
  accountFor,
  createHarness,
  withEncryptionKey,
} = require('./helpers/provider-send-harness');
const { createSesState } = require('./helpers/fake-ses');

const MODEL = smithy.loadModel();

/** Builds one SendEmail body through the real router helpers (no network). */
function build(emailData, { config = {}, template = null } = {}) {
  const restore = withEncryptionKey();
  try {
    const account = accountFor('ses');
    const { router } = createHarness([account]);
    const h = require('../server/src/services/email-router').__test__.providerSendHelpers(router);
    const data = { __logDocumentId: 'logdoc123', ...emailData };
    if (template) {
      data.__providerTemplate = {
        rowsByAccount: { [account.documentId]: template.row },
        variables: template.variables,
      };
    }
    return ses.buildSendRequest({ account, config, emailData: data, h }).body;
  } finally {
    restore();
  }
}

const sendEmailErrors = (json) =>
  smithy.validateHttpRequest(MODEL, 'SendEmail', {
    method: 'POST',
    path: '/v2/email/outbound-emails',
    json,
  });

test('the vendored model is pinned and covers the four operations', () => {
  const source = MODEL['x-magic-mail-source'];
  assert.equal(source.repository, 'https://github.com/aws/api-models-aws');
  assert.equal(source.commit, '9f371492a21b16552652248af39cb2efa4abcfc0');
  assert.equal(source.sha256, 'f34aeda95c11bd696714f5ff2be180ecb5b48ad3bfdfd6fb73de31aa3d42b891');
  assert.deepEqual(source.operations, [
    'SendEmail',
    'GetAccount',
    'ListEmailTemplates',
    'GetEmailTemplate',
  ]);
  assert.deepEqual(MODEL.service['aws.auth#sigv4'], { name: 'ses' });
  assert.equal(MODEL.service['aws.api#service'].endpointPrefix, 'email');
  assert.ok(MODEL.service['aws.protocols#restJson1']);
});

test('SendEmail bodies Magic Mail builds are valid against the model', () => {
  const bodies = {
    plain: build({ to: 'a@example.test', subject: 'x', text: 'y' }),
    full: build(
      {
        to: ['"Zoë" <z@example.test>', 'b@example.test'],
        cc: 'c@example.test',
        bcc: 'd@example.test',
        replyTo: 'r@example.test',
        subject: 'Ünïcode',
        html: '<p>x</p>',
        text: 'x',
        type: 'marketing',
        priority: 'low',
        unsubscribeUrl: 'https://example.test/u',
        headers: { 'X-Campaign': 'autumn', References: '<a@example.test>' },
        attachments: [
          { filename: 'a.txt', content: 'hello' },
          { cid: 'logo', content: PIXEL_PNG, encoding: 'base64', contentType: 'image/png' },
        ],
        __trackingApplied: { opens: true, clicks: true },
      },
      { config: { configurationSetName: 'magicmail-events' } }
    ),
    template: build(
      { to: 'a@example.test', __providerTracking: true },
      {
        template: {
          row: { remoteId: 'welcome', name: 'welcome', scope: 'default', subject: 'Hi {{name}}' },
          variables: { name: 'Ada', items: [{ label: 'One' }] },
        },
      }
    ),
  };
  for (const [name, body] of Object.entries(bodies)) {
    assert.deepEqual(sendEmailErrors(body), [], name);
    // MessageTag name/value charset is documented, not a Smithy pattern.
    for (const tag of body.EmailTags) {
      assert.match(tag.Name, /^[A-Za-z0-9_-]{1,256}$/);
      assert.match(tag.Value, /^[A-Za-z0-9_-]{1,256}$/);
    }
    // Headers SES sets itself may not be sent (header-fields page).
    const content = body.Content.Simple || body.Content.Template;
    for (const header of content.Headers || []) {
      assert.equal(
        /^(bcc|cc|content-disposition|content-type|date|from|message-id|mime-version|reply-to|return-path|subject|to)$/i.test(
          header.Name
        ),
        false,
        header.Name
      );
      assert.match(header.Value, /^[\x20-\x7e]*$/);
    }
  }
  assert.equal(
    bodies.template.Content.Template.TemplateData,
    '{"name":"Ada","items":[{"label":"One"}]}'
  );
});

test('fake SES responses are valid outputs of the model', () => {
  const state = createSesState();
  assert.deepEqual(smithy.validateOutput(MODEL, 'GetAccount', state.account), []);
  assert.deepEqual(
    smithy.validateOutput(MODEL, 'ListEmailTemplates', {
      TemplatesMetadata: [{ TemplateName: 'welcome', CreatedTimestamp: 1763460000 }],
      NextToken: 'MTA=',
    }),
    []
  );
  assert.deepEqual(
    smithy.validateOutput(MODEL, 'GetEmailTemplate', {
      TemplateName: 'welcome',
      TemplateContent: { Subject: 'Hi', Html: '<p>x</p>', Text: 'x' },
    }),
    []
  );
  assert.deepEqual(smithy.validateOutput(MODEL, 'SendEmail', { MessageId: 'abc-000000' }), []);
  assert.deepEqual(
    smithy.validateHttpRequest(MODEL, 'ListEmailTemplates', {
      method: 'GET',
      path: '/v2/email/templates',
      query: new URLSearchParams('NextToken=MTA%3D&PageSize=100'),
    }),
    []
  );
  assert.deepEqual(
    smithy.validateHttpRequest(MODEL, 'GetEmailTemplate', {
      method: 'GET',
      path: '/v2/email/templates/welcome_v2',
    }),
    []
  );
});

test('error types the adapter maps are declared with the statuses it expects', () => {
  const expected = {
    MessageRejected: 400,
    AccountSuspendedException: 400,
    SendingPausedException: 400,
    MailFromDomainNotVerifiedException: 400,
    LimitExceededException: 400,
    BadRequestException: 400,
    NotFoundException: 404,
    TooManyRequestsException: 429,
  };
  for (const [name, status] of Object.entries(expected)) {
    assert.equal(smithy.declaredErrorStatus(MODEL, 'SendEmail', name), status, name);
  }
  assert.equal(smithy.declaredErrorStatus(MODEL, 'GetEmailTemplate', 'NotFoundException'), 404);
  assert.equal(smithy.declaredErrorStatus(MODEL, 'GetAccount', 'MessageRejected'), null);
});

test('limits used by the adapter match the model', () => {
  const header = smithy.shapeOf(MODEL, 'MessageHeaderList').traits['smithy.api#length'];
  assert.equal(header.max, ses.LIMITS.MAX_HEADERS);
  const data = smithy.shapeOf(MODEL, 'EmailTemplateData').traits['smithy.api#length'];
  assert.equal(data.max, ses.LIMITS.MAX_TEMPLATE_DATA);
  assert.deepEqual(
    Object.keys(smithy.shapeOf(MODEL, 'TrackingConfigurationOverrides').members).sort(),
    ['ClickTrackingEnabled', 'OpenTrackingEnabled']
  );
});

test('the validator catches undeclared, missing, mistyped and oversized members', () => {
  const body = build({ to: 'a@example.test', subject: 'x', text: 'y' });
  const mutate = (fn) => {
    const copy = JSON.parse(JSON.stringify(body));
    fn(copy);
    return sendEmailErrors(copy);
  };
  assert.match(mutate((b) => (b.Bogus = 1)).join(), /undeclared member "Bogus"/);
  assert.match(mutate((b) => delete b.Content).join(), /missing required member "Content"/);
  assert.match(mutate((b) => delete b.Content.Simple.Subject.Data).join(), /"Data"/);
  assert.match(
    mutate((b) => (b.Destination.ToAddresses = 'a@example.test')).join(),
    /expected array/
  );
  assert.match(
    mutate((b) => (b.ConfigurationOverrides = { Tracking: { OpenTrackingEnabled: 'YES' } })).join(),
    /not one of ENABLED\|DISABLED/
  );
  assert.match(
    mutate(
      (b) =>
        (b.Content.Simple.Headers = Array.from({ length: 16 }, (_, i) => ({
          Name: `X-${i}`,
          Value: 'v',
        })))
    ).join(),
    /length 16 > 15/
  );
  assert.match(
    mutate(
      (b) => (b.Content.Simple.Attachments = [{ FileName: 'a', RawContent: 'not base64!' }])
    ).join(),
    /expected base64/
  );
  const tooBig = JSON.parse(JSON.stringify(body));
  tooBig.Content = { Template: { TemplateName: 't', TemplateData: 'x'.repeat(262_145) } };
  assert.match(sendEmailErrors(tooBig).join(), /length 262145 > 262144/);
  assert.match(
    smithy
      .validateHttpRequest(MODEL, 'ListEmailTemplates', {
        method: 'GET',
        path: '/v2/email/templates',
        query: new URLSearchParams('Limit=10'),
      })
      .join(),
    /undeclared query parameter Limit/
  );
  assert.match(
    smithy
      .validateHttpRequest(MODEL, 'SendEmail', { method: 'PUT', path: '/v2/email/x', json: {} })
      .join(),
    /method PUT/
  );
});

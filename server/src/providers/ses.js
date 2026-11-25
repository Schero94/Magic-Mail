'use strict';

/**
 * Amazon SES (API v2) adapter. See ./index.js for the interface.
 *
 * Requests go to the fixed regional host `https://email.<region>.amazonaws.com`
 * (commercial and AWS GovCloud (US) regions) and are signed with SigV4
 * (signing name `ses`) by utils/aws-sigv4.js; the AWS SDK is not used.
 *
 * Docs and model (checked 2026-11-18):
 * - Smithy model aws/api-models-aws@9f371492a21b16552652248af39cb2efa4abcfc0,
 *   models/sesv2/service/2019-09-27/sesv2-2019-09-27.json (vendored subset in
 *   tests/fixtures/smithy/sesv2.json): SendEmail, GetAccount,
 *   ListEmailTemplates, GetEmailTemplate; restJson1; Message.Headers (max 15),
 *   Message.Attachments, Template.Headers/Attachments, EmailTemplateData max
 *   262144, MessageTag name/value [A-Za-z0-9_-] up to 256,
 *   ConfigurationOverrides.Tracking.
 * - API reference https://docs.aws.amazon.com/ses/latest/APIReference-V2/API_SendEmail.html,
 *   common errors https://docs.aws.amazon.com/ses/latest/APIReference-V2/CommonErrors.html
 * - Quotas https://docs.aws.amazon.com/ses/latest/dg/quotas.html: 40 MB per
 *   message after base64 (v2 API), 50 recipients per message, templates 500 KB.
 * - Header rules https://docs.aws.amazon.com/ses/latest/dg/header-fields.html:
 *   Simple/Template content may not set BCC, CC, Content-Disposition,
 *   Content-Type, Date, From, Message-ID, MIME-Version, Reply-To,
 *   Return-Path, Subject, To (Magic Mail never sends those as headers).
 * - Event contents https://docs.aws.amazon.com/ses/latest/dg/event-publishing-retrieving-sns-contents.html
 *   and identity notifications https://docs.aws.amazon.com/ses/latest/dg/notification-contents.html
 * - IAM actions https://docs.aws.amazon.com/service-authorization/latest/reference/list_amazonsimpleemailservicev2.html
 *
 * Credentials: `credentialSource: 'keys'` uses the stored access key pair;
 * `'environment'` reads AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and the
 * optional AWS_SESSION_TOKEN at request time (hosts that inject role
 * credentials as environment variables). The plugin never calls the EC2
 * instance-metadata or ECS credential endpoints.
 *
 * Tracking: SES open/click tracking and the Open/Click events need a
 * configuration set with an event destination that publishes OPEN and CLICK.
 * Per message, `ConfigurationOverrides.Tracking` switches SES tracking on for
 * provider-template sends with provider tracking, and off for the parts Magic
 * Mail tracks itself.
 */

const crypto = require('node:crypto');
const { errors } = require('@strapi/utils');
const { ProviderApiError, codeForStatus } = require('../utils/provider-api');
const { signRequest, uriEncode } = require('../utils/aws-sigv4');
const { normalizeMessageId } = require('../utils/message-id');
const sns = require('../utils/sns-verify');

const LABEL = 'Amazon SES';
const SIGNING_NAME = 'ses';
const SECRET_MASK = '********';

/** Region codes; China and the isolated partitions use other hosts and are refused. */
const REGION_PATTERN = /^[a-z]{2}(?:-[a-z]+)+-\d{1,2}$/;
const UNSUPPORTED_REGION = /^(?:cn-|[a-z]{2}-iso)/;
/** IAM AccessKey.AccessKeyId: 16-128 word characters (IAM API reference). */
const ACCESS_KEY_ID_PATTERN = /^\w{16,128}$/;
const SECRET_PATTERN = /^[\x21-\x7e]{16,128}$/;
/** CreateConfigurationSet: up to 64 letters, numbers, hyphens and underscores. */
const CONFIGURATION_SET_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
/** Standard SNS topic in the commercial or GovCloud partition (SES does not support FIFO topics). */
const TOPIC_ARN_PATTERN =
  /^arn:(aws|aws-us-gov):sns:([a-z]{2}(?:-[a-z]+)+-\d{1,2}):(\d{12}):([A-Za-z0-9_-]{1,256})$/;
/** Template names Magic Mail sends by name (SES v1 CreateTemplate rule; v2 has no pattern). */
const TEMPLATE_NAME_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const TAG_VALUE_PATTERN = /^[A-Za-z0-9_-]{1,256}$/;

const MAX_MESSAGE_BYTES = 40_000_000;
const MAX_RECIPIENTS = 50;
const MAX_HEADERS = 15;
const MAX_HEADER_NAME = 126;
const MAX_HEADER_VALUE = 995;
const MAX_HEADER_LINE = 996;
const MAX_TEMPLATE_DATA = 262_144;
const MAX_ATTACHMENT_META = 78;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const MAX_ERROR_BYTES = 4 * 1024;
const MAX_LIST_PAGES = 10;
const PAGE_SIZE = 100;
const MAX_EVENTS = 100;
const MIN_EVENT_TIME_MS = Date.UTC(2000, 0, 1);
const MAX_EVENT_SKEW_MS = 24 * 3600_000;

/**
 * SES and AWS error type names that may be kept as `providerReason`. Any
 * other name, and every error message, is dropped.
 */
const KNOWN_ERROR_TYPES = new Set([
  'AccessDeniedException',
  'AccountSuspendedException',
  'BadRequestException',
  'ExpiredTokenException',
  'IncompleteSignature',
  'InternalFailure',
  'InvalidClientTokenId',
  'InvalidSignatureException',
  'LimitExceededException',
  'MailFromDomainNotVerifiedException',
  'MessageRejected',
  'MissingAuthenticationToken',
  'MissingAuthenticationTokenException',
  'NotAuthorized',
  'NotFoundException',
  'OptInRequired',
  'RequestEntityTooLargeException',
  'ServiceUnavailable',
  'SendingPausedException',
  'SignatureDoesNotMatch',
  'ThrottlingException',
  'TooManyRequestsException',
  'UnrecognizedClientException',
]);

/** Account-level refusals: nothing was accepted and another account may send. */
const ACCOUNT_REFUSALS = new Set([
  'AccountSuspendedException',
  'SendingPausedException',
  'MailFromDomainNotVerifiedException',
]);

/** Fixed hints (English; never contain provider text). */
const HINTS = Object.freeze({
  SES_INVALID_CREDENTIALS:
    'Amazon SES does not know this access key. Check the access key ID and that the key is active in IAM.',
  SES_SIGNATURE_MISMATCH:
    'The secret access key does not belong to this access key ID. Enter the secret access key again.',
  SES_CLOCK_SKEW:
    'The server clock differs from AWS time by more than 5 minutes. Synchronise the server clock (NTP).',
  SES_ACCESS_DENIED:
    'The IAM user or role is missing a permission. Allow ses:SendEmail, ses:GetAccount, ses:ListEmailTemplates and ses:GetEmailTemplate in this region.',
  SES_EXPIRED_TOKEN:
    'The temporary AWS credentials (AWS_SESSION_TOKEN) have expired. Renew the role credentials of the server.',
  SES_CREDENTIALS_MISSING:
    'No AWS credentials are available. Enter an access key, or set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY on the server.',
  SES_UNVERIFIED_IDENTITY:
    'Amazon SES rejected an address that is not verified in this region. In the SES sandbox the sender and every recipient must be verified; outside the sandbox, verify the From address or its domain in the region of this account.',
  SES_MESSAGE_REJECTED:
    'Amazon SES rejected the message, for example because of its content or an attachment type it does not accept.',
  SES_SENDING_PAUSED:
    'Sending is paused for this AWS account or configuration set. Re-enable sending in the Amazon SES console.',
  SES_ACCOUNT_SUSPENDED:
    "AWS has restricted this account's ability to send email. Contact AWS Support.",
  SES_MAIL_FROM_NOT_VERIFIED:
    'The custom MAIL FROM domain of the sender is not verified. Check its MX and SPF records in the Amazon SES console.',
  SES_LIMIT_EXCEEDED:
    'An Amazon SES limit was exceeded, for example the daily sending quota. Check the quotas in the Amazon SES console.',
  SES_NOT_FOUND:
    'Amazon SES did not find the template or the configuration set in this region. Check the names and the region.',
  SES_MESSAGE_TOO_LARGE:
    'Amazon SES rejected the message as too large (40 MB including attachments).',
  SES_SANDBOX:
    'The AWS account is in the SES sandbox: it can only send to verified addresses and the mailbox simulator. Request production access in the Amazon SES console.',
  SES_SENDING_DISABLED:
    'Email sending is disabled for this AWS account in this region. Check the account status in the Amazon SES console.',
});

/** Hint code per error type. */
const HINT_BY_TYPE = Object.freeze({
  UnrecognizedClientException: 'SES_INVALID_CREDENTIALS',
  InvalidClientTokenId: 'SES_INVALID_CREDENTIALS',
  MissingAuthenticationToken: 'SES_INVALID_CREDENTIALS',
  // Seen in an unauthenticated probe of email.eu-west-1.amazonaws.com (2026-11-18).
  MissingAuthenticationTokenException: 'SES_INVALID_CREDENTIALS',
  IncompleteSignature: 'SES_SIGNATURE_MISMATCH',
  InvalidSignatureException: 'SES_SIGNATURE_MISMATCH',
  SignatureDoesNotMatch: 'SES_SIGNATURE_MISMATCH',
  AccessDeniedException: 'SES_ACCESS_DENIED',
  NotAuthorized: 'SES_ACCESS_DENIED',
  OptInRequired: 'SES_ACCESS_DENIED',
  ExpiredTokenException: 'SES_EXPIRED_TOKEN',
  MessageRejected: 'SES_MESSAGE_REJECTED',
  SendingPausedException: 'SES_SENDING_PAUSED',
  AccountSuspendedException: 'SES_ACCOUNT_SUSPENDED',
  MailFromDomainNotVerifiedException: 'SES_MAIL_FROM_NOT_VERIFIED',
  LimitExceededException: 'SES_LIMIT_EXCEEDED',
  NotFoundException: 'SES_NOT_FOUND',
  RequestEntityTooLargeException: 'SES_MESSAGE_TOO_LARGE',
});

// ─── Configuration ─────────────────────────────────────────────────────────

/**
 * Validated region, or null.
 *
 * @param {unknown} value
 * @returns {string|null}
 */
function resolveRegion(value) {
  if (typeof value !== 'string') return null;
  const region = value.trim().toLowerCase();
  return REGION_PATTERN.test(region) && !UNSUPPORTED_REGION.test(region) ? region : null;
}

/** @param {string} region @returns {string} Fixed SES v2 host of a region */
const hostFor = (region) => `email.${region}.amazonaws.com`;

/** @param {string} region @returns {'aws'|'aws-us-gov'} */
const partitionOf = (region) => (region.startsWith('us-gov-') ? 'aws-us-gov' : 'aws');

const present = (config, key) => Object.hasOwn(config, key) && config[key] !== undefined;

/**
 * Validated copy of an Amazon SES account config. Unknown keys are dropped.
 *
 * On create (or a provider change) region and credentials are required. On
 * update only the sent fields are checked; a secret sent as the mask is kept
 * for account-manager's merge. Switching to `environment` clears the stored
 * key pair (`accessKeyId` and `secretAccessKey` become '').
 *
 * @param {object} config - Incoming plain config
 * @param {{creating?: boolean}} [options]
 * @returns {object}
 * @throws {errors.ValidationError} With `details.config` naming the fields, never their values
 */
function normalizeConfig(config, { creating = false } = {}) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new errors.ValidationError('Invalid Amazon SES configuration', {
      config: ['config: required'],
    });
  }
  const problems = [];
  const out = {};

  if (present(config, 'region') || creating) {
    const region = resolveRegion(config.region);
    if (region) out.region = region;
    else {
      problems.push(
        'region: use an AWS region code such as eu-west-1 (China regions are not supported)'
      );
    }
  }

  let source = config.credentialSource;
  if (source === undefined && creating) source = 'keys';
  if (source !== undefined) {
    if (source === 'keys' || source === 'environment') out.credentialSource = source;
    else problems.push('credentialSource: must be "keys" or "environment"');
  }

  if (source === 'environment') {
    out.accessKeyId = '';
    out.secretAccessKey = '';
  } else {
    if (present(config, 'accessKeyId') || (creating && source === 'keys')) {
      const id = typeof config.accessKeyId === 'string' ? config.accessKeyId.trim() : '';
      if (ACCESS_KEY_ID_PATTERN.test(id)) out.accessKeyId = id;
      else problems.push('accessKeyId: 16 to 128 letters and digits');
    }
    if (present(config, 'secretAccessKey') || (creating && source === 'keys')) {
      const secret = config.secretAccessKey;
      if (secret === SECRET_MASK && !creating) out.secretAccessKey = secret;
      else if (typeof secret === 'string' && SECRET_PATTERN.test(secret.trim())) {
        out.secretAccessKey = secret.trim();
      } else problems.push('secretAccessKey: required (16 to 128 printable characters)');
    }
  }

  if (present(config, 'configurationSetName')) {
    const name = config.configurationSetName === null ? '' : config.configurationSetName;
    if (name === '') out.configurationSetName = '';
    else if (typeof name === 'string' && CONFIGURATION_SET_PATTERN.test(name.trim())) {
      out.configurationSetName = name.trim();
    } else problems.push('configurationSetName: up to 64 letters, digits, - and _');
  }

  if (present(config, 'snsTopicArn')) {
    const arn = config.snsTopicArn === null ? '' : config.snsTopicArn;
    const match = typeof arn === 'string' ? TOPIC_ARN_PATTERN.exec(arn.trim()) : null;
    if (arn === '') out.snsTopicArn = '';
    else if (!match) {
      problems.push(
        'snsTopicArn: an SNS topic ARN such as arn:aws:sns:eu-west-1:123456789012:ses-events'
      );
    } else if (out.region && match[1] !== partitionOf(out.region)) {
      problems.push('snsTopicArn: the topic must be in the same AWS partition as the region');
    } else out.snsTopicArn = arn.trim();
  }

  if (problems.length > 0) {
    throw new errors.ValidationError('Invalid Amazon SES configuration', { config: problems });
  }
  return out;
}

/**
 * Credentials for one request.
 *
 * @param {object} config - Stored config
 * @param {NodeJS.ProcessEnv} [env=process.env]
 * @returns {{accessKeyId: string, secretAccessKey: string, sessionToken?: string}|null}
 *   null when none are available
 */
function credentialsFor(config, env = process.env) {
  if (config?.credentialSource === 'environment') {
    const accessKeyId = (env.AWS_ACCESS_KEY_ID || '').trim();
    const secretAccessKey = (env.AWS_SECRET_ACCESS_KEY || '').trim();
    const sessionToken = (env.AWS_SESSION_TOKEN || '').trim();
    if (!ACCESS_KEY_ID_PATTERN.test(accessKeyId) || !SECRET_PATTERN.test(secretAccessKey)) {
      return null;
    }
    return { accessKeyId, secretAccessKey, ...(sessionToken ? { sessionToken } : {}) };
  }
  const accessKeyId = typeof config?.accessKeyId === 'string' ? config.accessKeyId.trim() : '';
  const secret = config?.secretAccessKey;
  if (!ACCESS_KEY_ID_PATTERN.test(accessKeyId)) return null;
  if (typeof secret !== 'string' || secret === SECRET_MASK || !SECRET_PATTERN.test(secret)) {
    return null;
  }
  return { accessKeyId, secretAccessKey: secret };
}

// ─── HTTP ──────────────────────────────────────────────────────────────────

/**
 * Sends one SigV4-signed request to the regional SES host. The host is
 * derived from the validated region only, never from stored URLs.
 *
 * @param {object} options
 * @param {string} options.region - Validated region
 * @param {{accessKeyId: string, secretAccessKey: string, sessionToken?: string}} options.credentials
 * @param {'GET'|'POST'} options.method
 * @param {string} options.path - Wire path
 * @param {string} [options.query] - Encoded query string
 * @param {string} [options.body] - JSON text
 * @param {AbortSignal} [options.signal]
 * @param {Date} [options.date]
 * @returns {Promise<Response>}
 * @sideeffect One HTTPS request to email.<region>.amazonaws.com.
 */
async function sesFetch({ region, credentials, method, path, query = '', body, signal, date }) {
  const host = hostFor(region);
  const headers = { host };
  if (body !== undefined) headers['content-type'] = 'application/json';
  const signed = signRequest(
    { method, path, query, headers, body: body ?? '' },
    { credentials, region, service: SIGNING_NAME, date }
  );
  const { host: _host, ...sendHeaders } = signed.headers;
  return fetch(`https://${host}${path}${query ? `?${query}` : ''}`, {
    method,
    headers: sendHeaders,
    ...(body !== undefined ? { body } : {}),
    redirect: 'error',
    ...(signal ? { signal } : {}),
  });
}

/**
 * Error type of a failed AWS response: the `x-amzn-ErrorType` header
 * ("Name:namespace-url") or the body's `__type` / `code`. Only allowlisted
 * names are returned.
 *
 * @param {Response} response
 * @param {string|null} text - Bounded body (never logged or returned)
 * @returns {string|null}
 */
function errorTypeOf(response, text) {
  const candidates = [];
  const header = response?.headers?.get?.('x-amzn-errortype');
  if (typeof header === 'string') candidates.push(header);
  if (typeof text === 'string' && text) {
    try {
      const parsed = JSON.parse(text);
      for (const key of ['__type', 'code', 'Code']) {
        if (typeof parsed?.[key] === 'string') candidates.push(parsed[key]);
      }
      if (typeof parsed?.Error?.Code === 'string') candidates.push(parsed.Error.Code);
    } catch {
      // not JSON
    }
  }
  for (const raw of candidates) {
    const name = raw.split(':')[0].split('#').pop().trim();
    if (KNOWN_ERROR_TYPES.has(name)) return name;
  }
  return null;
}

/** Message text only compared, never kept: SigV4 time-window failures. */
const isClockSkew = (text) =>
  typeof text === 'string' && /signature expired|signature not yet current/i.test(text);
/** Message text only compared, never kept: unverified identity rejections. */
const isUnverified = (text) => typeof text === 'string' && /not verified/i.test(text);

/**
 * Hint code for a failed request.
 *
 * @param {number|undefined} status
 * @param {string|undefined|null} code - Error code (an SES hint code or a ProviderApiError code)
 * @returns {string|null}
 */
function hintFor(status, code) {
  if (typeof code === 'string' && Object.hasOwn(HINTS, code)) return code;
  if (code === 'CREDENTIALS') return 'SES_CREDENTIALS_MISSING';
  if (status === 401 || status === 403) return 'SES_ACCESS_DENIED';
  if (status === 404) return 'SES_NOT_FOUND';
  if (status === 413) return 'SES_MESSAGE_TOO_LARGE';
  return null;
}

/**
 * Classifies a failed SES response.
 *
 * @param {Response} response
 * @param {string|null} text
 * @returns {{status: number, type: string|null, hint: string|null}} `status`
 *   is the status used for failover: throttling becomes 429, account-level
 *   refusals 403; everything else keeps the HTTP status.
 */
function classifyFailure(response, text) {
  const type = errorTypeOf(response, text);
  let status = response.status;
  if (type === 'ThrottlingException' || type === 'TooManyRequestsException') status = 429;
  else if (type && ACCOUNT_REFUSALS.has(type)) status = 403;
  let hint = type ? HINT_BY_TYPE[type] || null : null;
  if (hint === 'SES_SIGNATURE_MISMATCH' && isClockSkew(text)) hint = 'SES_CLOCK_SKEW';
  if (type === 'MessageRejected' && isUnverified(text)) hint = 'SES_UNVERIFIED_IDENTITY';
  if (!hint && status !== 429) hint = hintFor(status, null);
  return { status, type, hint };
}

/**
 * Reads at most `max` bytes of a body.
 *
 * @param {Response} response
 * @param {number} max
 * @param {boolean} truncate - true: cut at `max`; false: null when larger
 * @returns {Promise<string|null>}
 */
async function readCapped(response, max, truncate) {
  const reader = response.body?.getReader?.();
  if (!reader) {
    const text = await response.text();
    if (Buffer.byteLength(text) <= max) return text;
    return truncate ? text.slice(0, max) : null;
  }
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    chunks.push(Buffer.from(value));
    if (total > max) {
      await reader.cancel().catch(() => {});
      if (!truncate) return null;
      break;
    }
  }
  return Buffer.concat(chunks).subarray(0, max).toString('utf8');
}

/**
 * Reads a successful JSON response with a size cap.
 *
 * @param {Response} response
 * @returns {Promise<any>}
 * @throws {ProviderApiError} BAD_RESPONSE when too large or not JSON
 */
async function readJson(response) {
  const text = await readCapped(response, MAX_RESPONSE_BYTES, false);
  if (text === null) throw new ProviderApiError('BAD_RESPONSE');
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new ProviderApiError('BAD_RESPONSE');
  }
}

/**
 * Signed GET for the read-only operations (account, templates).
 *
 * @param {object} config - Normalised config
 * @param {string} path
 * @param {string} [query]
 * @returns {Promise<any>} Parsed JSON
 * @throws {ProviderApiError} CREDENTIALS, NETWORK, BAD_RESPONSE, or a status
 *   code (AUTH, NOT_FOUND, RATE_LIMITED, UNAVAILABLE) with `hint` and `providerReason`
 */
async function sesGet(config, path, query = '') {
  const region = resolveRegion(config?.region);
  const credentials = credentialsFor(config);
  if (!region || !credentials) throw new ProviderApiError('CREDENTIALS');
  let response;
  try {
    response = await sesFetch({
      region,
      credentials,
      method: 'GET',
      path,
      query,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new ProviderApiError('NETWORK');
  }
  if (!response.ok) {
    const text = await readCapped(response, MAX_ERROR_BYTES, true).catch(() => null);
    const failure = classifyFailure(response, text);
    const error = new ProviderApiError(
      failure.status === 429 ? 'RATE_LIMITED' : codeForStatus(response.status),
      response.status
    );
    if (failure.type) error.providerReason = failure.type;
    if (failure.hint) error.hint = failure.hint;
    throw error;
  }
  return readJson(response);
}

// ─── Send ──────────────────────────────────────────────────────────────────

/**
 * True when every character is 7-bit ASCII (UTF-8 then needs one byte per
 * UTF-16 code unit).
 *
 * @param {string} value
 * @returns {boolean}
 */
const isAscii = (value) => Buffer.byteLength(value, 'utf8') === value.length;

/**
 * RFC 2047 encoded word for non-ASCII header text; ASCII is returned as is.
 *
 * @param {string} value
 * @returns {string}
 */
function encodeWord(value) {
  if (isAscii(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

/**
 * One mailbox as SES expects it: `addr`, `"Name" <addr>`, or an encoded word
 * name for non-ASCII display names.
 *
 * @param {{name?: string, address?: string, email?: string}} mailbox
 * @param {object} h - Router helpers
 * @returns {string}
 */
function sesMailbox(mailbox, h) {
  const address = mailbox.address || mailbox.email;
  const name = h.stripHeaderInjection(mailbox.name || '');
  if (!name) return address;
  if (isAscii(name)) return h.formatAddress({ name, address });
  return `${encodeWord(name)} <${address}>`;
}

/**
 * Outbound headers as SES `MessageHeader` entries, within the documented
 * limits (15 headers, name up to 126 and value up to 995 characters, 996
 * for both; printable ASCII). Non-ASCII values become encoded words.
 *
 * @param {Record<string, string>} headers
 * @param {object} h
 * @returns {{Name: string, Value: string}[]}
 * @throws {errors.ValidationError} When a limit is exceeded (nothing was sent)
 */
function sesHeaders(headers, h) {
  const out = Object.entries(headers).map(([name, value]) => ({
    Name: name,
    Value: encodeWord(String(value)),
  }));
  if (out.length > MAX_HEADERS) {
    throw h.validationError(
      `Amazon SES accepts at most ${MAX_HEADERS} custom headers per message; remove some X- headers`
    );
  }
  for (const header of out) {
    if (
      header.Name.length > MAX_HEADER_NAME ||
      header.Value.length > MAX_HEADER_VALUE ||
      header.Name.length + header.Value.length > MAX_HEADER_LINE
    ) {
      throw h.validationError('A header is longer than Amazon SES accepts (996 characters)');
    }
  }
  return out;
}

/**
 * Builds the SendEmail request body (pure: no network, no clock).
 *
 * - Simple content (Subject, Text/Html with Charset UTF-8, Headers,
 *   Attachments) or, for a provider template, Template content
 *   (`TemplateName` = remote id, `TemplateData` = the caller's data as JSON;
 *   the subject comes from the template, a caller subject is not sent).
 * - Destination To/Cc/Bcc, every address once (first occurrence wins), at
 *   most 50 in total; ReplyToAddresses; EmailTags `magicmail_id` and
 *   `magicmail_email_type`; ConfigurationSetName when configured;
 *   ConfigurationOverrides.Tracking for provider tracking or for the parts
 *   Magic Mail tracks itself.
 *
 * @param {{account: object, config: object, emailData: object, h: object}} input
 * @returns {{body: object, template: object|null}}
 * @throws {errors.ValidationError} Invalid message, too many recipients or headers
 * @throws {Error} Provider template errors (too large, missing on the account)
 */
function buildSendRequest({ account, config, emailData, h }) {
  const template = h.providerTemplateFor(account, emailData);
  const recipients = h.uniqueRecipients(emailData);
  if (recipients.to.length === 0) {
    throw h.validationError('Amazon SES send requires at least one valid recipient');
  }
  const total = recipients.to.length + recipients.cc.length + recipients.bcc.length;
  if (total > MAX_RECIPIENTS) {
    throw h.validationError(
      `Amazon SES accepts at most ${MAX_RECIPIENTS} recipients (To, Cc and Bcc) per message`
    );
  }
  const destination = { ToAddresses: recipients.to.map((entry) => sesMailbox(entry, h)) };
  if (recipients.cc.length > 0) {
    destination.CcAddresses = recipients.cc.map((entry) => sesMailbox(entry, h));
  }
  if (recipients.bcc.length > 0) {
    destination.BccAddresses = recipients.bcc.map((entry) => sesMailbox(entry, h));
  }

  const headers = sesHeaders(h.buildOutboundHeaders(emailData), h);
  const attachments = h.normalizeAttachments(emailData.attachments).map((attachment) => ({
    RawContent: attachment.content.toString('base64'),
    FileName: attachment.filename || attachment.cid,
    ContentType:
      attachment.contentType.length <= MAX_ATTACHMENT_META
        ? attachment.contentType
        : 'application/octet-stream',
    ContentDisposition: attachment.cid ? 'INLINE' : 'ATTACHMENT',
    ...(attachment.cid && attachment.cid.length <= MAX_ATTACHMENT_META
      ? { ContentId: attachment.cid }
      : {}),
    ContentTransferEncoding: 'BASE64',
  }));
  const extras = {
    ...(headers.length > 0 ? { Headers: headers } : {}),
    ...(attachments.length > 0 ? { Attachments: attachments } : {}),
  };

  let content;
  if (template) {
    if (!TEMPLATE_NAME_PATTERN.test(String(template.remoteId))) {
      throw h.providerTemplateError(
        `The Amazon SES template "${template.name}" has a name Magic Mail can not send; rename it at Amazon SES`,
        'MAGIC_MAIL_PROVIDER_TEMPLATE_UNAVAILABLE'
      );
    }
    const data = JSON.stringify(template.variables ?? {});
    if ([...data].length > MAX_TEMPLATE_DATA) {
      throw h.tooLargeError(
        template,
        'Template data is larger than Amazon SES accepts (262,144 characters as JSON)'
      );
    }
    content = { Template: { TemplateName: template.remoteId, TemplateData: data, ...extras } };
  } else {
    const subject = h.stripHeaderInjection(emailData.subject);
    const bodyPart = {
      ...(emailData.text ? { Text: { Data: String(emailData.text), Charset: 'UTF-8' } } : {}),
      ...(emailData.html ? { Html: { Data: String(emailData.html), Charset: 'UTF-8' } } : {}),
    };
    content = {
      Simple: { Subject: { Data: subject, Charset: 'UTF-8' }, Body: bodyPart, ...extras },
    };
  }

  const sender = h.senderFor(account, emailData);
  const body = {
    FromEmailAddress: sesMailbox(sender, h),
    Destination: destination,
    Content: content,
  };
  const replyTo = h.resolveReplyTo(emailData.replyTo || account.replyTo);
  if (replyTo) body.ReplyToAddresses = replyTo.map((entry) => sesMailbox(entry, h));

  const type = h.EMAIL_TYPES.includes(emailData.type) ? emailData.type : 'transactional';
  const tags = [{ Name: 'magicmail_email_type', Value: type }];
  const magicmailId = h.magicmailIdOf(emailData);
  if (magicmailId && TAG_VALUE_PATTERN.test(magicmailId)) {
    tags.push({ Name: 'magicmail_id', Value: magicmailId });
  }
  body.EmailTags = tags;

  if (typeof config?.configurationSetName === 'string' && config.configurationSetName) {
    body.ConfigurationSetName = config.configurationSetName;
  }

  const tracking = h.trackingAppliedOf(emailData);
  if (h.providerTrackingOf(emailData)) {
    body.ConfigurationOverrides = {
      Tracking: { OpenTrackingEnabled: 'ENABLED', ClickTrackingEnabled: 'ENABLED' },
    };
  } else if (tracking.opens || tracking.clicks) {
    body.ConfigurationOverrides = {
      Tracking: {
        ...(tracking.opens ? { OpenTrackingEnabled: 'DISABLED' } : {}),
        ...(tracking.clicks ? { ClickTrackingEnabled: 'DISABLED' } : {}),
      },
    };
  }

  return { body, template };
}

/**
 * Sends one message through SES v2 SendEmail.
 *
 * @param {{account: object, config: object, emailData: object, h: object}} input
 * @returns {Promise<{messageId: string|null, response: string}>} SES MessageId
 * @throws {Error} Account configuration error (region, credentials), validation
 *   errors, "Amazon SES API request failed: <status>" with `status`,
 *   `provider`, `code` (hint) and the allowlisted `providerReason`
 * @sideeffect One signed HTTPS request to Amazon SES with recipients and content.
 */
async function send({ account, config, emailData, h }) {
  const region = resolveRegion(config?.region);
  if (!region) throw h.accountConfigError('Amazon SES region is not configured');
  const credentials = credentialsFor(config);
  if (!credentials) {
    throw h.accountConfigError(
      config?.credentialSource === 'environment'
        ? 'Amazon SES credentials are not set in the server environment'
        : 'Amazon SES access key not configured'
    );
  }

  h.validateEmailSecurity(emailData);
  const { body, template } = buildSendRequest({ account, config, emailData, h });
  const json = JSON.stringify(body);
  if (Buffer.byteLength(json) >= MAX_MESSAGE_BYTES) {
    throw h.tooLargeError(
      template,
      'The message is larger than Amazon SES accepts (40 MB including attachments)'
    );
  }

  const response = await sesFetch({
    region,
    credentials,
    method: 'POST',
    path: '/v2/email/outbound-emails',
    body: json,
    signal: h.fetchBounds(emailData).signal,
  });

  if (!response.ok) {
    const text = await h.readProviderErrorBody(response);
    const failure = classifyFailure(response, text);
    const error = h.providerHttpError(LABEL, failure.status, {
      ...(failure.type ? { providerReason: failure.type } : {}),
    });
    if (failure.hint && failure.status !== 413) error.code = failure.hint;
    throw error;
  }

  const result = await readJson(response).catch(() => ({}));
  return { messageId: normalizeMessageId(result?.MessageId), response: 'Accepted' };
}

// ─── Templates ─────────────────────────────────────────────────────────────

/** @param {unknown} value - restJson1 timestamp (epoch seconds) @returns {string|null} */
function epochToIso(value) {
  const seconds = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return null;
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

const asString = (value, max = 1_000_000) => (typeof value === 'string' ? value.slice(0, max) : '');

/**
 * Lists the stored templates of the account's region (ListEmailTemplates,
 * NextToken paging, at most 10 pages of 100) with their content
 * (GetEmailTemplate, 4 in flight). SES templates have no versions:
 * `activeVersion` is a content hash, so an edit at SES shows as a new
 * version after a sync.
 *
 * @param {object} config - Normalised config
 * @param {{pageSize?: number}} [options] - 1..100 (tests force paging)
 * @returns {Promise<{templates: import('../utils/provider-api').RemoteTemplate[], warning: string|null}>}
 *   `warning` 'TRUNCATED' when more than 10 pages exist
 * @throws {ProviderApiError}
 * @sideeffect Read-only HTTPS requests to Amazon SES.
 */
async function listTemplates(config, { pageSize = PAGE_SIZE } = {}) {
  const size = Math.min(PAGE_SIZE, Math.max(1, Math.trunc(pageSize) || PAGE_SIZE));
  const items = [];
  let token = null;
  let truncated = false;
  for (let page = 0; page < MAX_LIST_PAGES; page += 1) {
    const query = `${token ? `NextToken=${uriEncode(token)}&` : ''}PageSize=${size}`;
    const body = await sesGet(config, '/v2/email/templates', query);
    const list = Array.isArray(body?.TemplatesMetadata) ? body.TemplatesMetadata : [];
    for (const item of list) {
      if (item && typeof item.TemplateName === 'string' && item.TemplateName.length <= 200) {
        items.push(item);
      }
    }
    const next =
      typeof body?.NextToken === 'string' && body.NextToken.length <= 2048 ? body.NextToken : null;
    if (!next || next === token || list.length === 0) break;
    token = next;
    if (page === MAX_LIST_PAGES - 1) truncated = true;
  }

  const templates = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const item = items[cursor];
      cursor += 1;
      let detail;
      try {
        detail = await sesGet(config, `/v2/email/templates/${uriEncode(item.TemplateName)}`);
      } catch (error) {
        if (error?.code === 'NOT_FOUND') continue; // deleted between list and get
        throw error;
      }
      const content = detail?.TemplateContent || {};
      const subject = asString(content.Subject, 998);
      const html = asString(content.Html);
      const text = asString(content.Text);
      const hash = crypto
        .createHash('sha256')
        .update(JSON.stringify([subject, html, text]))
        .digest('hex')
        .slice(0, 16);
      templates.push({
        remoteId: item.TemplateName,
        name: asString(detail?.TemplateName ?? item.TemplateName, 200),
        scope: 'default',
        activeVersion: `sha256-${hash}`,
        subject,
        html,
        text,
        updatedAt: epochToIso(item.CreatedTimestamp),
      });
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, worker));
  templates.sort((a, b) => (a.remoteId < b.remoteId ? -1 : a.remoteId > b.remoteId ? 1 : 0));
  return { templates, warning: truncated ? 'TRUNCATED' : null };
}

// ─── Connection check ──────────────────────────────────────────────────────

/**
 * Read-only check with GetAccount. Details carry no personal data: the
 * sandbox and sending flags, the send quota and the region.
 *
 * @param {object} config - Normalised config
 * @returns {Promise<{ok: true, details: object}>}
 * @throws {ProviderApiError} With an SES hint code as `code` when one applies
 * @sideeffect One read-only HTTPS request to Amazon SES.
 */
async function checkConnection(config) {
  let body;
  try {
    body = await sesGet(config, '/v2/email/account');
  } catch (error) {
    if (error instanceof ProviderApiError && error.hint) {
      const specific = new ProviderApiError(error.hint, error.status);
      if (error.providerReason) specific.providerReason = error.providerReason;
      throw specific;
    }
    throw error;
  }
  const quota = body?.SendQuota || {};
  const number = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
  const sandbox = body?.ProductionAccessEnabled !== true;
  const sendingEnabled = body?.SendingEnabled === true;
  let hintCode = null;
  if (!sendingEnabled) hintCode = 'SES_SENDING_DISABLED';
  else if (sandbox) hintCode = 'SES_SANDBOX';
  return {
    ok: true,
    details: {
      region: resolveRegion(config.region),
      sandbox,
      sendingEnabled,
      sendQuota: {
        max24HourSend: number(quota.Max24HourSend),
        maxSendRate: number(quota.MaxSendRate),
        sentLast24Hours: number(quota.SentLast24Hours),
      },
      configurationSet: config.configurationSetName || null,
      webhookReady: Boolean(config.snsTopicArn),
      ...(hintCode ? { hintCode } : {}),
    },
  };
}

// ─── Webhook ───────────────────────────────────────────────────────────────

const codePart = (value) =>
  String(value ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24);

/**
 * Reason code such as SES_BOUNCE_NOEMAIL (each part at most 24 characters).
 *
 * @param {string} kind
 * @param {unknown} [detail] - Sub type from the event
 * @returns {string}
 */
const sesReason = (kind, detail) => {
  const extra = codePart(detail);
  return `SES_${codePart(kind)}${extra ? `_${extra}` : ''}`;
};

/** @param {unknown} value @param {number} now @returns {number|null} */
function isoTime(value, now) {
  if (typeof value !== 'string') return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || ms < MIN_EVENT_TIME_MS || ms > now + MAX_EVENT_SKEW_MS) return null;
  return ms;
}

/** @param {unknown} value @returns {string|null} lower-cased plausible address */
function recipientOf(value) {
  if (typeof value !== 'string') return null;
  const address = value.trim().toLowerCase();
  if (address.length < 3 || address.length > 254 || !/^[^\s@]+@[^\s@]+$/.test(address)) {
    return null;
  }
  return address;
}

/**
 * Maps one SES event record (event publishing `eventType`, or an identity
 * notification `notificationType` Bounce/Complaint/Delivery) to delivery
 * events, one per affected recipient.
 *
 * - Bounce Permanent -> bounced (suppress 'bounce'); Transient and
 *   Undetermined -> blocked: SES publishes them only after it stopped
 *   retrying, so the mail was not delivered (not suppressed).
 * - Complaint -> complained (suppress 'complaint'); subtype
 *   OnAccountSuppressionList / OnTenantSuppressionList: also not delivered.
 * - Delivery -> delivered; DeliveryDelay -> deferred.
 * - Reject, Rendering Failure -> dropped (not delivered).
 * - Open -> opened; Click -> clicked with `click.link`.
 * - Subscription with newTopicPreferences.unsubscribeAll -> unsubscribed.
 * - Send and unknown types -> none.
 *
 * @param {unknown} record - Parsed SNS `Message`
 * @param {{snsMessageId: string, now?: number}} context
 * @returns {object[]} DeliveryEvent list (services/delivery-webhooks.js)
 */
function parseSesEvent(record, { snsMessageId, now = Date.now() }) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return [];
  let type = null;
  if (typeof record.eventType === 'string') type = record.eventType;
  else if (['Bounce', 'Complaint', 'Delivery'].includes(record.notificationType)) {
    type = record.notificationType;
  }
  if (!type) return [];
  const mail = record.mail && typeof record.mail === 'object' ? record.mail : {};
  const messageId = typeof mail.messageId === 'string' ? mail.messageId : null;
  const tagged = Array.isArray(mail.tags?.magicmail_id) ? mail.tags.magicmail_id[0] : null;
  const magicmailId = typeof tagged === 'string' ? tagged : null;
  const destination = Array.isArray(mail.destination) ? mail.destination : [];
  const single = destination.length === 1 ? recipientOf(destination[0]) : null;
  const events = [];
  const push = (fields) => {
    if (events.length >= MAX_EVENTS) return;
    events.push({
      eventId: `${snsMessageId}:${events.length}`,
      messageId,
      magicmailId,
      recipient: null,
      occurredAt: null,
      ...fields,
    });
  };
  const listOf = (value) => (Array.isArray(value) ? value.slice(0, MAX_EVENTS) : []);

  switch (type) {
    case 'Bounce': {
      const bounce = record.bounce || {};
      const permanent = bounce.bounceType === 'Permanent';
      const occurredAt = isoTime(bounce.timestamp, now);
      for (const entry of listOf(bounce.bouncedRecipients)) {
        push({
          kind: permanent ? 'bounced' : 'blocked',
          reasonCode: sesReason('bounce', bounce.bounceSubType || bounce.bounceType),
          recipient: recipientOf(entry?.emailAddress),
          occurredAt,
          suppress: permanent ? 'bounce' : null,
        });
      }
      break;
    }
    case 'Complaint': {
      const complaint = record.complaint || {};
      const suppressed = /^On(Account|Tenant)SuppressionList$/.test(
        String(complaint.complaintSubType || '')
      );
      const occurredAt = isoTime(complaint.timestamp, now);
      for (const entry of listOf(complaint.complainedRecipients)) {
        push({
          kind: 'complained',
          reasonCode: sesReason('complaint', suppressed ? complaint.complaintSubType : null),
          recipient: recipientOf(entry?.emailAddress),
          occurredAt,
          suppress: 'complaint',
          ...(suppressed ? { notDelivered: true } : {}),
        });
      }
      break;
    }
    case 'Delivery': {
      const delivery = record.delivery || {};
      const occurredAt = isoTime(delivery.timestamp, now);
      for (const address of listOf(delivery.recipients)) {
        push({
          kind: 'delivered',
          reasonCode: sesReason('delivery'),
          recipient: recipientOf(address),
          occurredAt,
        });
      }
      break;
    }
    case 'DeliveryDelay': {
      const delay = record.deliveryDelay || {};
      const occurredAt = isoTime(delay.timestamp, now);
      for (const entry of listOf(delay.delayedRecipients)) {
        push({
          kind: 'deferred',
          reasonCode: sesReason('delay', delay.delayType || 'undetermined'),
          recipient: recipientOf(entry?.emailAddress),
          occurredAt,
        });
      }
      break;
    }
    case 'Reject':
    case 'Rendering Failure':
      push({
        kind: 'dropped',
        reasonCode: sesReason(type === 'Reject' ? 'reject' : 'rendering_failure'),
        recipient: single,
        occurredAt: isoTime(mail.timestamp, now),
        notDelivered: true,
      });
      break;
    case 'Open':
      push({
        kind: 'opened',
        reasonCode: sesReason('open'),
        recipient: single,
        occurredAt: isoTime(record.open?.timestamp, now),
      });
      break;
    case 'Click':
      push({
        kind: 'clicked',
        reasonCode: sesReason('click'),
        recipient: single,
        occurredAt: isoTime(record.click?.timestamp, now),
        url: typeof record.click?.link === 'string' ? record.click.link : null,
      });
      break;
    case 'Subscription':
      if (record.subscription?.newTopicPreferences?.unsubscribeAll === true) {
        push({
          kind: 'unsubscribed',
          reasonCode: sesReason('subscription'),
          recipient: single,
          occurredAt: isoTime(record.subscription.timestamp, now),
        });
      }
      break;
    default:
      break;
  }
  return events;
}

/**
 * Verifies and parses one SNS request for an SES account.
 *
 * - No (valid) `snsTopicArn` configured -> 401; malformed body -> 400.
 * - `TopicArn` must equal the configured topic, the certificate URL must be
 *   the SNS host of the topic's region, and the `x-amz-sns-message-type`
 *   header (when sent) must match `Type`.
 * - The SNS signature is verified (utils/sns-verify.js) before anything is used.
 * - SubscriptionConfirmation: confirmed by GET of its SubscribeURL (SNS host
 *   and topic checked); 200 without events, 400 when SNS did not confirm.
 * - UnsubscribeConfirmation: 200 without events (nothing is re-subscribed).
 * - Notification: the SES event record in `Message`; replay key = SNS MessageId.
 *
 * @param {{config: object, rawBody: Buffer, headers?: Record<string, string|undefined>, now?: number, fetchImpl?: Function}} input
 *   `fetchImpl` is for tests (certificate and confirmation requests)
 * @returns {Promise<{status: 200|400|401, events: object[], replayKey?: string}>}
 * @sideeffect May fetch the SNS signing certificate and confirm a subscription.
 */
async function webhook({ config, rawBody, headers = {}, now = Date.now(), fetchImpl }) {
  const topicArn =
    typeof config?.snsTopicArn === 'string' && TOPIC_ARN_PATTERN.test(config.snsTopicArn)
      ? config.snsTopicArn
      : null;
  if (!topicArn) return { status: 401, events: [] };
  // Every failure before the signature is verified answers 401, so the
  // status does not reveal which account ids exist (MM-SA-11).
  const message = sns.parseSnsMessage(rawBody);
  if (!message) return { status: 401, events: [] };
  if (message.TopicArn !== topicArn) return { status: 401, events: [] };
  // SNS signs with the certificate of the topic's region and links to it.
  const topicRegion = TOPIC_ARN_PATTERN.exec(topicArn)[2];
  const certHost = sns.signingCertUrl(message.SigningCertURL)?.hostname;
  if (certHost !== `sns.${topicRegion}.amazonaws.com`) return { status: 401, events: [] };
  const declared = headers['x-amz-sns-message-type'];
  if (declared !== undefined && declared !== message.Type) return { status: 401, events: [] };
  const options = { now, ...(fetchImpl ? { fetchImpl } : {}) };
  if (!(await sns.verifySnsMessage(message, options))) return { status: 401, events: [] };

  if (message.Type === 'SubscriptionConfirmation') {
    const subscribeHost = sns.subscribeUrl(message.SubscribeURL, topicArn)?.hostname;
    const confirmed =
      subscribeHost === `sns.${topicRegion}.amazonaws.com` &&
      (await sns.confirmSubscription(message, topicArn, options));
    return { status: confirmed ? 200 : 400, events: [] };
  }
  if (message.Type === 'UnsubscribeConfirmation') return { status: 200, events: [] };

  let record;
  try {
    record = JSON.parse(message.Message);
  } catch {
    return { status: 200, events: [], replayKey: message.MessageId };
  }
  return {
    status: 200,
    events: parseSesEvent(record, { snsMessageId: message.MessageId, now }),
    replayKey: message.MessageId,
  };
}

module.exports = {
  id: 'ses',
  label: LABEL,
  SECRET_FIELDS: Object.freeze(['secretAccessKey']),
  IDENTITY_FIELDS: Object.freeze(['accessKeyId', 'credentialSource']),
  HINTS,
  hintFor,
  normalizeConfig,
  send,
  templates: { list: listTemplates },
  checkConnection,
  webhook,
  // Pure helpers for tests and contract checks.
  buildSendRequest,
  classifyFailure,
  credentialsFor,
  errorTypeOf,
  hostFor,
  parseSesEvent,
  resolveRegion,
  LIMITS: Object.freeze({
    MAX_MESSAGE_BYTES,
    MAX_RECIPIENTS,
    MAX_HEADERS,
    MAX_TEMPLATE_DATA,
    MAX_LIST_PAGES,
    PAGE_SIZE,
  }),
};

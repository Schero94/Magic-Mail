/**
 * Translated text for the provider hint codes returned by the account test
 * (`hintCode`, see server/src/utils/client-errors.js PROVIDER_HINTS).
 *
 * @param {(key: string, defaultMessage: string, values?: object) => string} t - useMagicMailIntl().t
 * @param {unknown} code - `hintCode` from the server
 * @param {unknown} [fallback] - English `hint` from the server, used for a code this admin build does not know
 * @returns {string|null} Hint text, or null when there is none
 */
export const providerHintMessage = (t, code, fallback) => {
  switch (code) {
    case 'SENDGRID_UNAUTHORIZED':
      return t(
        'accounts.test.hint.sendgridUnauthorized',
        'SendGrid rejected the API key. Check that the key was copied completely and has not been deleted.'
      );
    case 'SENDGRID_FORBIDDEN':
      return t(
        'accounts.test.hint.sendgridForbidden',
        'SendGrid refused the request. Check that the API key has the Mail Send permission and that the From address is a verified Sender Identity.'
      );
    case 'SENDGRID_PAYLOAD_TOO_LARGE':
      return t(
        'accounts.test.hint.sendgridPayloadTooLarge',
        'SendGrid rejected the message as too large. Reduce the size of the content and attachments.'
      );
    case 'MAILGUN_UNAUTHORIZED':
      return t(
        'accounts.test.hint.mailgunUnauthorized',
        'Mailgun rejected the API key. Check the key and the region: a domain created in the EU region needs the EU region.'
      );
    case 'MAILGUN_DOMAIN_NOT_FOUND':
      return t(
        'accounts.test.hint.mailgunDomainNotFound',
        'Mailgun does not know this domain in the selected region. Check the domain name and the region.'
      );
    case 'MAILGUN_SANDBOX_RECIPIENT':
      return t(
        'accounts.test.hint.mailgunSandboxRecipient',
        'Sandbox domains only deliver to authorized recipients. Add the recipient in Mailgun first.'
      );
    case 'PROVIDER_RATE_LIMITED':
      return t(
        'accounts.test.hint.rateLimited',
        'The provider is rate limiting requests. Wait a moment and try again.'
      );
    default:
      return typeof fallback === 'string' && fallback ? fallback : null;
  }
};

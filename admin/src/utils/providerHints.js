/**
 * Translated text for the provider hint codes returned by the account test
 * and the connection check (`hintCode`, see server/src/utils/client-errors.js
 * PROVIDER_HINTS and the HINTS of server/src/providers/brevo.js and ses.js).
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
    case 'SENDGRID_MISSING_MAIL_SEND':
      return t(
        'accounts.test.hint.sendgridMissingMailSend',
        'The SendGrid API key is valid but does not have the Mail Send permission. Give the key Mail Send access or create a key that has it.'
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
    case 'BREVO_INVALID_KEY':
      return t(
        'accounts.test.hint.brevoInvalidKey',
        'Brevo rejected the API key. Create an API key under SMTP & API > API keys (not an SMTP key) and paste it completely.'
      );
    case 'BREVO_IP_NOT_AUTHORIZED':
      return t(
        'accounts.test.hint.brevoIpNotAuthorized',
        'Brevo blocked the request because the server IP address is not authorised. Add the IP address of this Strapi server under Security > Authorised IPs in Brevo, or turn off blocking of unknown IP addresses.'
      );
    case 'BREVO_FORBIDDEN':
      return t(
        'accounts.test.hint.brevoForbidden',
        'Brevo refused the request. Check that the API key may send transactional email and that the Brevo account is fully activated.'
      );
    case 'BREVO_ACCOUNT_UNDER_VALIDATION':
      return t(
        'accounts.test.hint.brevoAccountUnderValidation',
        'The Brevo account is still being validated. Sending works once Brevo has activated the account.'
      );
    case 'BREVO_SENDER_NOT_VERIFIED':
      return t(
        'accounts.test.hint.brevoSenderNotVerified',
        'Brevo rejected the sender. Add and verify the From address under Senders, Domains & Dedicated IPs in Brevo, or authenticate its domain.'
      );
    case 'BREVO_NO_CREDITS':
      return t(
        'accounts.test.hint.brevoNoCredits',
        'The Brevo account has no email credits left. Check the plan and credits in Brevo.'
      );
    case 'BREVO_TEMPLATE_NOT_FOUND':
      return t(
        'accounts.test.hint.brevoTemplateNotFound',
        'Brevo does not know this template or it is inactive. Activate it in Brevo and sync the provider templates again.'
      );
    case 'BREVO_TOO_LARGE':
      return t(
        'accounts.test.hint.brevoTooLarge',
        'Brevo rejected the message as too large. Brevo accepts at most 20 MB including attachments.'
      );
    case 'BREVO_RATE_LIMITED':
      return t(
        'accounts.test.hint.brevoRateLimited',
        'Brevo is rate limiting requests. Wait a moment and try again; the queue retries automatically.'
      );
    case 'BREVO_UNAVAILABLE':
      return t(
        'accounts.test.hint.brevoUnavailable',
        'Brevo is not reachable right now. Try again later.'
      );
    case 'SES_INVALID_CREDENTIALS':
      return t(
        'accounts.test.hint.sesInvalidCredentials',
        'Amazon SES does not know this access key. Check the access key ID and that the key is active in IAM.'
      );
    case 'SES_SIGNATURE_MISMATCH':
      return t(
        'accounts.test.hint.sesSignatureMismatch',
        'The secret access key does not belong to this access key ID. Enter the secret access key again.'
      );
    case 'SES_CLOCK_SKEW':
      return t(
        'accounts.test.hint.sesClockSkew',
        'The server clock differs from AWS time by more than 5 minutes. Synchronise the server clock (NTP).'
      );
    case 'SES_ACCESS_DENIED':
      return t(
        'accounts.test.hint.sesAccessDenied',
        'The IAM user or role is missing a permission. Allow ses:SendEmail, ses:GetAccount, ses:ListEmailTemplates and ses:GetEmailTemplate in this region.'
      );
    case 'SES_EXPIRED_TOKEN':
      return t(
        'accounts.test.hint.sesExpiredToken',
        'The temporary AWS credentials (AWS_SESSION_TOKEN) have expired. Renew the role credentials of the server.'
      );
    case 'SES_CREDENTIALS_MISSING':
      return t(
        'accounts.test.hint.sesCredentialsMissing',
        'No AWS credentials are available. Enter an access key, or set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY on the server.'
      );
    case 'SES_UNVERIFIED_IDENTITY':
      return t(
        'accounts.test.hint.sesUnverifiedIdentity',
        'Amazon SES rejected an address that is not verified in this region. In the SES sandbox the sender and every recipient must be verified; outside the sandbox, verify the From address or its domain in the region of this account.'
      );
    case 'SES_MESSAGE_REJECTED':
      return t(
        'accounts.test.hint.sesMessageRejected',
        'Amazon SES rejected the message, for example because of its content or an attachment type it does not accept.'
      );
    case 'SES_SENDING_PAUSED':
      return t(
        'accounts.test.hint.sesSendingPaused',
        'Sending is paused for this AWS account or configuration set. Re-enable sending in the Amazon SES console.'
      );
    case 'SES_ACCOUNT_SUSPENDED':
      return t(
        'accounts.test.hint.sesAccountSuspended',
        "AWS has restricted this account's ability to send email. Contact AWS Support."
      );
    case 'SES_MAIL_FROM_NOT_VERIFIED':
      return t(
        'accounts.test.hint.sesMailFromNotVerified',
        'The custom MAIL FROM domain of the sender is not verified. Check its MX and SPF records in the Amazon SES console.'
      );
    case 'SES_LIMIT_EXCEEDED':
      return t(
        'accounts.test.hint.sesLimitExceeded',
        'An Amazon SES limit was exceeded, for example the daily sending quota. Check the quotas in the Amazon SES console.'
      );
    case 'SES_NOT_FOUND':
      return t(
        'accounts.test.hint.sesNotFound',
        'Amazon SES did not find the template or the configuration set in this region. Check the names and the region.'
      );
    case 'SES_MESSAGE_TOO_LARGE':
      return t(
        'accounts.test.hint.sesMessageTooLarge',
        'Amazon SES rejected the message as too large (40 MB including attachments).'
      );
    case 'SES_SANDBOX':
      return t(
        'accounts.test.hint.sesSandbox',
        'The AWS account is in the SES sandbox: it can only send to verified addresses and the mailbox simulator. Request production access in the Amazon SES console.'
      );
    case 'SES_SENDING_DISABLED':
      return t(
        'accounts.test.hint.sesSendingDisabled',
        'Email sending is disabled for this AWS account in this region. Check the account status in the Amazon SES console.'
      );
    case 'CREDENTIALS':
      return t(
        'accounts.test.hint.credentials',
        'The stored credentials can not be read. Open the account, enter the credentials again and save.'
      );
    case 'AUTH':
      return t(
        'accounts.test.hint.auth',
        'The provider rejected the credentials. Check the key and its permissions.'
      );
    case 'NETWORK':
    case 'UNAVAILABLE':
      return t(
        'accounts.test.hint.unavailable',
        'The provider could not be reached. Check the network connection of the server and try again.'
      );
    case 'RATE_LIMITED':
    case 'PROVIDER_RATE_LIMITED':
      return t(
        'accounts.test.hint.rateLimited',
        'The provider is rate limiting requests. Wait a moment and try again.'
      );
    default:
      return typeof fallback === 'string' && fallback ? fallback : null;
  }
};

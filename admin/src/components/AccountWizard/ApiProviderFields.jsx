import { useState } from 'react';
import { Box, Button, Field, Flex, Radio, TextInput, Typography } from '@strapi/design-system';
import { Key, Lock } from '@strapi/icons';
import { useFetchClient, useNotification } from '@strapi/strapi/admin';
import { useMagicMailIntl } from '../../hooks/useMagicMailIntl';
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard';
import { providerHintMessage } from '../../utils/providerHints';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { ExternalLink, SecretField, SecurityAlert } from './fieldParts';
import {
  FullWidthField,
  GuideBox,
  GuideList,
  RedirectUriRow,
  RedirectUriValue,
  SectionTitle,
  StaticAlert,
} from './styles';
import { getWebhookUrl, validateCredentials } from './wizardState';

const code = (chunks) => <code>{chunks}</code>;

/**
 * Absolute webhook URL of a saved account, or null before the first save.
 *
 * @param {'brevo'|'ses'} provider
 * @param {string|null} accountId
 * @returns {string|null}
 */
const webhookUrlFor = (provider, accountId) =>
  getWebhookUrl(provider, accountId, {
    backendURL: typeof window !== 'undefined' ? window.strapi?.backendURL : undefined,
    origin: typeof window !== 'undefined' ? window.location.origin : '',
  });

/**
 * Read-only value with a Copy button (webhook URL, webhook token).
 *
 * @param {{label: string, value: string, copyLabel: string, copied: string}} props
 */
const CopyRow = ({ label, value, copyLabel, copied }) => {
  const { t } = useMagicMailIntl();
  const copy = useCopyToClipboard();
  return (
    <div>
      <Typography variant="pi" fontWeight="bold" textColor="neutral800" tag="p">
        {label}
      </Typography>
      <RedirectUriRow>
        <RedirectUriValue>{value}</RedirectUriValue>
        <Button
          variant="secondary"
          size="S"
          onClick={() => copy(value, { success: copied })}
          aria-label={copyLabel}
        >
          {t('accountModal.guide.copy', 'Copy')}
        </Button>
      </RedirectUriRow>
    </div>
  );
};

/**
 * Webhook URL of a saved account, or the "shown after saving" note.
 *
 * @param {{provider: 'brevo'|'ses', accountId: string|null}} props
 */
const WebhookUrl = ({ provider, accountId }) => {
  const { t } = useMagicMailIntl();
  const url = webhookUrlFor(provider, accountId);
  if (!url) {
    return (
      <Typography variant="pi" textColor="neutral600" tag="p">
        {t(
          'accountModal.webhook.urlAfterSave',
          'The webhook URL is shown here after the account is saved.'
        )}
      </Typography>
    );
  }
  return (
    <CopyRow
      label={t('accountModal.webhook.url', 'Webhook URL')}
      value={url}
      copyLabel={t('accountModal.webhook.copy', 'Copy webhook URL')}
      copied={t('accountModal.webhook.copied', 'Webhook URL copied')}
    />
  );
};

/**
 * "Check connection" for a saved Brevo or Amazon SES account: one read-only
 * request with the stored credentials, no email is sent.
 *
 * @param {{accountId: string|null}} props
 */
export const ConnectionCheck = ({ accountId }) => {
  const { t } = useMagicMailIntl();
  const { post } = useFetchClient();
  const [state, setState] = useState({ busy: false, result: null });

  if (!accountId) {
    return (
      <Typography variant="pi" textColor="neutral600" tag="p">
        {t(
          'accountModal.check.afterSave',
          'After saving, you can check the connection here without sending an email.'
        )}
      </Typography>
    );
  }

  const run = async () => {
    setState({ busy: true, result: null });
    try {
      const { data } = await post(`/magic-mail/accounts/${accountId}/check`, {});
      setState({ busy: false, result: data || null });
    } catch {
      setState({ busy: false, result: { ok: false, code: 'UNAVAILABLE' } });
    }
  };

  const result = state.result;
  const details = result?.details || {};
  return (
    <Flex direction="column" gap={2} alignItems="stretch">
      <Flex gap={2} wrap="wrap" alignItems="center">
        <Button variant="secondary" size="S" loading={state.busy} onClick={run}>
          {t('accountModal.check.button', 'Check connection')}
        </Button>
        <Typography variant="pi" textColor="neutral600">
          {t('accountModal.check.note', 'Uses the saved credentials. No email is sent.')}
        </Typography>
      </Flex>
      <div role="status" aria-live="polite">
        {result?.ok ? (
          <Typography variant="pi" textColor="success700" tag="p">
            {details.sandbox === true
              ? t(
                  'accountModal.check.okSandbox',
                  'Connected. The AWS account is in the SES sandbox: it can only send to verified addresses.'
                )
              : t('accountModal.check.ok', 'Connected. The credentials work.')}
          </Typography>
        ) : null}
        {result?.ok && details.hintCode ? (
          <Typography variant="pi" textColor="neutral800" tag="p">
            {providerHintMessage(t, details.hintCode, null)}
          </Typography>
        ) : null}
        {result && !result.ok ? (
          <Typography variant="pi" textColor="danger600" tag="p">
            {providerHintMessage(t, result.hintCode || result.code, result.hint) ||
              t('accountModal.check.failed', 'The connection check failed.')}
          </Typography>
        ) : null}
      </div>
    </Flex>
  );
};

/**
 * Brevo webhook token of a saved account: hidden until "Show token",
 * replaceable with a confirmation. The server returns it only to an admin
 * signed in to the browser and writes an audit line.
 *
 * @param {{accountId: string|null}} props
 */
const BrevoWebhookToken = ({ accountId }) => {
  const { t } = useMagicMailIntl();
  const { post } = useFetchClient();
  const { toggleNotification } = useNotification();
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState('');
  const [confirmRotate, setConfirmRotate] = useState(false);

  if (!accountId) {
    return (
      <Typography variant="pi" textColor="neutral600" tag="p">
        {t(
          'accountModal.brevo.tokenAfterSave',
          'Magic Mail creates a random webhook token when the account is saved. It is shown here afterwards.'
        )}
      </Typography>
    );
  }

  const request = async (action) => {
    setBusy(action);
    try {
      const { data } = await post(`/magic-mail/accounts/${accountId}/webhook-token`, { action });
      setToken(data?.data?.token || '');
      if (action === 'rotate') {
        toggleNotification({
          type: 'success',
          message: t(
            'accountModal.brevo.tokenRotated',
            'New webhook token created. Update it in Brevo now.'
          ),
        });
      }
      return true;
    } catch {
      toggleNotification({
        type: 'danger',
        message: t(
          'accountModal.brevo.tokenFailed',
          'The webhook token could not be loaded. Sign in to the admin panel with an account that may manage email accounts.'
        ),
      });
      return false;
    } finally {
      setBusy('');
    }
  };

  return (
    <Flex direction="column" gap={2} alignItems="stretch">
      {token ? (
        <CopyRow
          label={t('accountModal.brevo.token', 'Webhook token')}
          value={token}
          copyLabel={t('accountModal.brevo.copyToken', 'Copy webhook token')}
          copied={t('accountModal.brevo.tokenCopied', 'Webhook token copied')}
        />
      ) : null}
      <Flex gap={2} wrap="wrap">
        {!token ? (
          <Button
            variant="secondary"
            size="S"
            loading={busy === 'reveal'}
            disabled={Boolean(busy)}
            onClick={() => request('reveal')}
          >
            {t('accountModal.brevo.showToken', 'Show webhook token')}
          </Button>
        ) : null}
        <Button
          variant="tertiary"
          size="S"
          loading={busy === 'rotate'}
          disabled={Boolean(busy)}
          onClick={() => setConfirmRotate(true)}
        >
          {t('accountModal.brevo.rotateToken', 'Replace token')}
        </Button>
      </Flex>
      <ConfirmDialog
        isOpen={confirmRotate}
        onClose={() => setConfirmRotate(false)}
        title={t('accountModal.brevo.rotateTitle', 'Replace the webhook token?')}
        description={t(
          'accountModal.brevo.rotateBody',
          'Brevo webhooks that still send the old token are rejected until you paste the new token in Brevo. This can not be undone.'
        )}
        confirmLabel={t('accountModal.brevo.rotateConfirm', 'Replace token')}
        onConfirm={async () => {
          if (await request('rotate')) setConfirmRotate(false);
        }}
      />
    </Flex>
  );
};

/**
 * Credentials, webhook and setup guide of a Brevo account.
 *
 * @param {{form: Record<string, any>, onChange: Function, isEditMode: boolean,
 *   accountId: string|null, unreadableAlert: React.ReactNode}} props
 */
export const BrevoFields = ({ form, onChange, isEditMode, accountId, unreadableAlert }) => {
  const { t } = useMagicMailIntl();
  return (
    <>
      {unreadableAlert}
      <SecurityAlert title={t('accountModal.credentials.apiKeySecurityTitle', 'API key security')}>
        {t(
          'accountModal.credentials.apiKeySecurityBody',
          'Your API key is encrypted with AES-256-GCM before it is stored.'
        )}
      </SecurityAlert>
      <Flex direction="column" gap={4} style={{ width: '100%' }} alignItems="stretch">
        <SectionTitle tag="h3">
          <Key aria-hidden="true" />
          {t('accountModal.brevo.title', 'Brevo API configuration')}
        </SectionTitle>
        <SecretField
          name="apiKey"
          label={t('accountModal.brevo.apiKey', 'Brevo API key')}
          placeholder="xkeysib-..."
          hint={t(
            'accountModal.brevo.apiKeyHint',
            'In Brevo: SMTP & API, API keys, Generate a new API key. Use an API key, not an SMTP key. If Brevo blocks unknown IP addresses, authorise the IP address of this server.'
          )}
          value={form.apiKey}
          onChange={(value) => onChange('apiKey', value)}
          isEditMode={isEditMode}
        />
        <ConnectionCheck accountId={accountId} />

        <SectionTitle tag="h3">
          <Lock aria-hidden="true" />
          {t('accountModal.webhook.title', 'Bounce and complaint webhook (optional)')}
        </SectionTitle>
        <WebhookUrl provider="brevo" accountId={accountId} />
        <BrevoWebhookToken accountId={accountId} />
        <GuideBox padding={4} background="neutral100" hasRadius>
          <Typography variant="delta" tag="h4">
            {t('accountModal.brevo.webhookGuideTitle', 'Set up the webhook in Brevo')}
          </Typography>
          <GuideList>
            <li>
              {t(
                'accountModal.brevo.webhookStep1',
                'In Brevo: Transactional, Settings, Webhooks, Add a new webhook. Paste the webhook URL.'
              )}
            </li>
            <li>
              {t(
                'accountModal.brevo.webhookStep2',
                'Select Delivered, Hard bounce, Soft bounce, Invalid email, Deferred, Blocked, Spam and Unsubscribed. Add Opened and Clicked only when Magic Mail should count opens and clicks of Brevo templates.'
              )}
            </li>
            <li>
              {t(
                'accountModal.brevo.webhookStep3',
                'Choose token authentication (Bearer) and paste the webhook token. Requests without this token are rejected.'
              )}
            </li>
          </GuideList>
        </GuideBox>

        <StaticAlert
          variant="default"
          closeLabel={t('common.close', 'Close')}
          title={t('accountModal.brevo.resources', 'Brevo resources')}
          action={
            <Flex gap={3} wrap="wrap">
              <ExternalLink standalone href="https://app.brevo.com">
                {t('accountModal.guide.dashboard', 'Dashboard')}
              </ExternalLink>
              <ExternalLink standalone href="https://developers.brevo.com">
                {t('accountModal.guide.docs', 'Documentation')}
              </ExternalLink>
            </Flex>
          }
        >
          {t(
            'accountModal.brevo.resourcesBody',
            'The From address must be a verified sender or belong to an authenticated domain in Brevo. Brevo templates use {code1}: Magic Mail sends your data under params, so the key name becomes {code2}. Open and click tracking is an account setting in Brevo.',
            {
              code1: code('{{ params.name }}'),
              code2: code('params.name'),
            }
          )}
        </StaticAlert>
      </Flex>
    </>
  );
};

/**
 * Credentials, event destination and setup guide of an Amazon SES account.
 *
 * @param {{form: Record<string, any>, onChange: Function, isEditMode: boolean,
 *   accountId: string|null, unreadableAlert: React.ReactNode}} props
 */
export const SesFields = ({ form, onChange, isEditMode, accountId, unreadableAlert }) => {
  const { t } = useMagicMailIntl();
  const errors = validateCredentials('ses', form);
  const environment = form.sesCredentialSource === 'environment';
  const text = (field) => (event) => onChange(field, event.target.value);

  return (
    <>
      {unreadableAlert}
      <SecurityAlert title={t('accountModal.ses.securityTitle', 'Credential security')}>
        {t(
          'accountModal.ses.securityBody',
          'The secret access key is encrypted with AES-256-GCM before it is stored. Requests are signed (AWS Signature Version 4); the key itself is never sent.'
        )}
      </SecurityAlert>
      <Flex direction="column" gap={4} style={{ width: '100%' }} alignItems="stretch">
        <SectionTitle tag="h3">
          <Key aria-hidden="true" />
          {t('accountModal.ses.title', 'Amazon SES configuration')}
        </SectionTitle>

        <FullWidthField>
          <Field.Root
            name="sesRegion"
            required
            error={
              errors.sesRegion
                ? t(
                    'accountModal.ses.regionInvalid',
                    'Enter an AWS region code such as eu-west-1. China regions are not supported.'
                  )
                : undefined
            }
            hint={t(
              'accountModal.ses.regionHint',
              'The region where your sender identity is verified, for example eu-west-1 or us-east-1.'
            )}
          >
            <Field.Label>{t('accountModal.ses.region', 'AWS region')}</Field.Label>
            <TextInput
              placeholder="eu-west-1"
              autoComplete="off"
              value={form.sesRegion}
              onChange={text('sesRegion')}
            />
            <Field.Hint />
            <Field.Error />
          </Field.Root>
        </FullWidthField>

        <Box>
          <Typography
            variant="pi"
            fontWeight="bold"
            textColor="neutral800"
            tag="p"
            id="mm-ses-source"
          >
            {t('accountModal.ses.source', 'Credentials')}
          </Typography>
          <Radio.Group
            aria-labelledby="mm-ses-source"
            value={form.sesCredentialSource}
            onValueChange={(value) => onChange('sesCredentialSource', value)}
          >
            <Radio.Item value="keys">
              {t('accountModal.ses.sourceKeys', 'Access key of an IAM user')}
            </Radio.Item>
            <Radio.Item value="environment">
              {t(
                'accountModal.ses.sourceEnvironment',
                'Server environment variables (for example an IAM role)'
              )}
            </Radio.Item>
          </Radio.Group>
        </Box>

        {environment ? (
          <StaticAlert
            variant="default"
            closeLabel={t('common.close', 'Close')}
            title={t('accountModal.ses.environmentTitle', 'Credentials from the server')}
          >
            {t(
              'accountModal.ses.environmentBody',
              'Magic Mail reads {a}, {b} and, for temporary role credentials, {c} from the environment of the Strapi process at every request. Use this when your platform injects role credentials as environment variables. Magic Mail never queries the EC2 instance metadata or ECS credential endpoints.',
              {
                a: code('AWS_ACCESS_KEY_ID'),
                b: code('AWS_SECRET_ACCESS_KEY'),
                c: code('AWS_SESSION_TOKEN'),
              }
            )}
          </StaticAlert>
        ) : (
          <>
            <FullWidthField>
              <Field.Root
                name="sesAccessKeyId"
                required
                error={
                  errors.sesAccessKeyId
                    ? t(
                        'accountModal.ses.accessKeyIdInvalid',
                        'An access key ID has 16 to 128 letters and digits, for example AKIA followed by 16 characters.'
                      )
                    : undefined
                }
              >
                <Field.Label>{t('accountModal.ses.accessKeyId', 'Access key ID')}</Field.Label>
                <TextInput
                  placeholder="AKIA..."
                  autoComplete="off"
                  value={form.sesAccessKeyId}
                  onChange={text('sesAccessKeyId')}
                />
                <Field.Error />
              </Field.Root>
            </FullWidthField>
            <SecretField
              name="sesSecretAccessKey"
              label={t('accountModal.ses.secretAccessKey', 'Secret access key')}
              placeholder="wJalr..."
              hint={t(
                'accountModal.ses.secretHint',
                'Create the key in IAM for a user that may only send email: ses:SendEmail, ses:GetAccount, ses:ListEmailTemplates and ses:GetEmailTemplate.'
              )}
              value={form.sesSecretAccessKey}
              onChange={(value) => onChange('sesSecretAccessKey', value)}
              isEditMode={isEditMode}
            />
          </>
        )}

        <FullWidthField>
          <Field.Root
            name="sesConfigurationSet"
            error={
              errors.sesConfigurationSet
                ? t(
                    'accountModal.ses.configurationSetInvalid',
                    'Use up to 64 letters, digits, hyphens and underscores.'
                  )
                : undefined
            }
            hint={t(
              'accountModal.ses.configurationSetHint',
              'Optional. Needed for bounce, complaint and delivery events and for open and click tracking of SES templates.'
            )}
          >
            <Field.Label>{t('accountModal.ses.configurationSet', 'Configuration set')}</Field.Label>
            <TextInput
              placeholder="magic-mail-events"
              autoComplete="off"
              value={form.sesConfigurationSet}
              onChange={text('sesConfigurationSet')}
            />
            <Field.Hint />
            <Field.Error />
          </Field.Root>
        </FullWidthField>
        <ConnectionCheck accountId={accountId} />

        <SectionTitle tag="h3">
          <Lock aria-hidden="true" />
          {t('accountModal.webhook.title', 'Bounce and complaint webhook (optional)')}
        </SectionTitle>
        <FullWidthField>
          <Field.Root
            name="sesTopicArn"
            error={
              errors.sesTopicArn === 'partition'
                ? t(
                    'accountModal.ses.topicArnPartition',
                    'The topic must be in the same AWS partition as the region.'
                  )
                : errors.sesTopicArn
                  ? t(
                      'accountModal.ses.topicArnInvalid',
                      'Enter a standard SNS topic ARN such as arn:aws:sns:eu-west-1:123456789012:ses-events.'
                    )
                  : undefined
            }
            hint={t(
              'accountModal.ses.topicArnHint',
              'Only notifications from this SNS topic are accepted. Without it, the webhook rejects every request.'
            )}
          >
            <Field.Label>{t('accountModal.ses.topicArn', 'SNS topic ARN')}</Field.Label>
            <TextInput
              placeholder="arn:aws:sns:eu-west-1:123456789012:ses-events"
              autoComplete="off"
              value={form.sesTopicArn}
              onChange={text('sesTopicArn')}
            />
            <Field.Hint />
            <Field.Error />
          </Field.Root>
        </FullWidthField>
        <WebhookUrl provider="ses" accountId={accountId} />
        <GuideBox padding={4} background="neutral100" hasRadius>
          <Typography variant="delta" tag="h4">
            {t('accountModal.ses.guideTitle', 'Set up events in AWS')}
          </Typography>
          <GuideList>
            <li>
              {t(
                'accountModal.ses.step1',
                'Verify the From address or its domain in this region. In the SES sandbox, every recipient must be verified too.'
              )}
            </li>
            <li>
              {t(
                'accountModal.ses.step2',
                'Create a standard SNS topic in the same region and allow ses.amazonaws.com to publish to it.'
              )}
            </li>
            <li>
              {t(
                'accountModal.ses.step3',
                'In the configuration set, add an SNS event destination for Delivery, Bounce, Complaint, Reject, Rendering failure and Delivery delay (plus Open and Click to count them).'
              )}
            </li>
            <li>
              {t(
                'accountModal.ses.step4',
                'Paste the topic ARN above and save. Then create an HTTPS subscription for the webhook URL; Magic Mail confirms it automatically.'
              )}
            </li>
          </GuideList>
        </GuideBox>

        <StaticAlert
          variant="default"
          closeLabel={t('common.close', 'Close')}
          title={t('accountModal.ses.resources', 'Amazon SES resources')}
          action={
            <Flex gap={3} wrap="wrap">
              <ExternalLink standalone href="https://console.aws.amazon.com/ses/home">
                {t('accountModal.guide.dashboard', 'Dashboard')}
              </ExternalLink>
              <ExternalLink standalone href="https://docs.aws.amazon.com/ses/latest/dg/">
                {t('accountModal.guide.docs', 'Documentation')}
              </ExternalLink>
            </Flex>
          }
        >
          {t(
            'accountModal.ses.resourcesBody',
            'SES templates use the same {code1} variables as Magic Mail, so your data keys stay the same. Test sends to success@simulator.amazonses.com work in the sandbox.',
            { code1: code('{{name}}') }
          )}
        </StaticAlert>
      </Flex>
    </>
  );
};

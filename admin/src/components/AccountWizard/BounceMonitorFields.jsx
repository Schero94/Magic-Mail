import { useEffect, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Field,
  Flex,
  NumberInput,
  SingleSelect,
  SingleSelectOption,
  Switch,
  TextInput,
  Typography,
} from '@strapi/design-system';
import { useFetchClient, useNotification } from '@strapi/strapi/admin';
import { useMagicMailIntl } from '../../hooks/useMagicMailIntl';
import { useFormatters } from '../../hooks/useFormatters';
import { SecretField } from './CredentialsStep';
import { BOUNCE_MODES } from './wizardState';
import { SwitchCard } from './styles';

const LABEL_STYLE = { fontSize: '15px' };

/** Stable error codes returned by the bounce monitor endpoints. */
const ERROR_MESSAGES = Object.freeze({
  AUTH_FAILED: 'The mailbox rejected the login. Check the IMAP user and password.',
  TIMEOUT: 'The mailbox server did not answer in time.',
  CONNECTION_FAILED: 'The mailbox server could not be reached. Check host and port.',
  TLS_FAILED: 'The secure connection to the mailbox server failed.',
  FOLDER_NOT_FOUND: 'The folder does not exist in this mailbox.',
  IMAP_NOT_CONFIGURED: 'Enter the IMAP host and login first.',
  NEEDS_CONSENT: 'Read access is missing. Grant read access for bounce monitoring.',
  TOKEN_REJECTED: 'The provider rejected the access token. Reconnect the account.',
  RATE_LIMITED: 'The provider limits requests right now. Try again later.',
  NOT_FOUND: 'The mailbox was not found at the provider.',
  UNSUPPORTED: 'This provider reports bounces through webhooks.',
  POLL_FAILED: 'Reading the mailbox failed.',
});

const MODE_LABELS = Object.freeze({
  imap: 'IMAP',
  gmail: 'Gmail API (OAuth)',
  graph: 'Microsoft Graph (OAuth)',
});

const errorCodeOf = (error) => {
  const code = error?.response?.data?.error?.details?.code;
  return typeof code === 'string' && ERROR_MESSAGES[code] ? code : 'POLL_FAILED';
};

/**
 * Translated text for a bounce monitor error code.
 *
 * @param {Function} t
 * @param {string} code
 * @returns {string}
 */
export const bounceErrorText = (t, code) =>
  t(`accountModal.bounce.error.${code}`, ERROR_MESSAGES[code] || ERROR_MESSAGES.POLL_FAILED);

/**
 * Last-poll status of a saved account plus the Test and Check buttons.
 *
 * @param {{accountId: string, provider: string, onGrantRead?: () => void}} props
 */
const BounceStatus = ({ accountId, provider, onGrantRead }) => {
  const { t } = useMagicMailIntl();
  const { get, post } = useFetchClient();
  const { toggleNotification } = useNotification();
  const { formatDateTime } = useFormatters();
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState('');

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    get(`/magic-mail/accounts/${accountId}/bounce-monitor`)
      .then(({ data }) => {
        if (!cancelled) setStatus(data?.data || null);
      })
      .catch(() => {
        if (!cancelled) setStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, [accountId, get, reloadKey]);

  const run = async (action) => {
    setBusy(action);
    try {
      const { data } = await post(`/magic-mail/accounts/${accountId}/bounce-monitor/${action}`, {});
      if (action === 'test') {
        toggleNotification({
          type: 'success',
          message: t(
            'accountModal.bounce.testOk',
            'Connected. The mailbox currently holds {count} messages.',
            { count: data?.data?.messages ?? 0 }
          ),
        });
      } else {
        if (data?.data?.status) setStatus(data.data.status);
        toggleNotification({
          type: 'success',
          message: data?.data?.ran
            ? t(
                'accountModal.bounce.checkOk',
                'Mailbox checked: {found} new bounce reports in {scanned} messages.',
                { found: data.data.found ?? 0, scanned: data.data.scanned ?? 0 }
              )
            : t('accountModal.bounce.checkBusy', 'A check is already running. Try again shortly.'),
        });
      }
    } catch (error) {
      toggleNotification({ type: 'danger', message: bounceErrorText(t, errorCodeOf(error)) });
      if (action === 'check') setReloadKey((key) => key + 1);
    } finally {
      setBusy('');
    }
  };

  const needsRead =
    (provider === 'gmail-oauth' || provider === 'microsoft-oauth') &&
    status?.mode !== 'imap' &&
    status?.readAccess === false;

  return (
    <Flex direction="column" gap={3} alignItems="stretch">
      <Flex gap={2} wrap="wrap" alignItems="center">
        <Typography variant="pi" fontWeight="semiBold">
          {t('accountModal.bounce.lastPoll', 'Last check')}:
        </Typography>
        <Typography variant="pi" textColor="neutral600">
          {status?.lastPollAt
            ? formatDateTime(status.lastPollAt)
            : t('accountModal.bounce.never', 'Not checked yet')}
        </Typography>
        {status?.lastStatus === 'ok' ? (
          <Badge backgroundColor="success100" textColor="success700">
            {t('accountModal.bounce.statusOk', 'OK')}
          </Badge>
        ) : null}
        {status?.lastStatus && status.lastStatus !== 'ok' ? (
          <Badge backgroundColor="danger100" textColor="danger700">
            {t('accountModal.bounce.statusError', 'Error')}
          </Badge>
        ) : null}
      </Flex>
      {status?.lastErrorCode && status.lastStatus !== 'ok' ? (
        <Typography variant="pi" textColor="danger600">
          {bounceErrorText(t, status.lastErrorCode)}
        </Typography>
      ) : null}
      {status ? (
        <Typography variant="pi" textColor="neutral600">
          {t(
            'accountModal.bounce.totals',
            '{bounced, plural, one {# bounce} other {# bounces}} and {deferred, plural, one {# delay} other {# delays}} recorded so far.',
            {
              bounced: status.totalBounced || 0,
              deferred: status.totalDeferred || 0,
            }
          )}
        </Typography>
      ) : null}
      {needsRead ? (
        <Flex gap={2} wrap="wrap" alignItems="center">
          <Typography variant="pi" textColor="warning600">
            {t(
              'accountModal.bounce.readMissing',
              'This connection has no read access to the mailbox yet.'
            )}
          </Typography>
          {onGrantRead ? (
            <Button variant="secondary" size="S" onClick={onGrantRead}>
              {t('accountModal.bounce.grantRead', 'Grant read access for bounce monitoring')}
            </Button>
          ) : null}
        </Flex>
      ) : null}
      <Flex gap={2} wrap="wrap">
        <Button
          variant="secondary"
          size="S"
          loading={busy === 'test'}
          disabled={Boolean(busy)}
          onClick={() => run('test')}
        >
          {t('accountModal.bounce.test', 'Test connection')}
        </Button>
        <Button
          variant="tertiary"
          size="S"
          loading={busy === 'check'}
          disabled={Boolean(busy) || !status?.enabled}
          onClick={() => run('check')}
        >
          {t('accountModal.bounce.checkNow', 'Check now')}
        </Button>
      </Flex>
      <Typography variant="pi" textColor="neutral500">
        {t(
          'accountModal.bounce.savedHint',
          'Test and check use the saved settings. Save changes first.'
        )}
      </Typography>
    </Flex>
  );
};

/**
 * "Bounce monitoring" section of the account wizard. Reads bounce reports
 * (mailer-daemon DSNs) from the sending mailbox; SendGrid and Mailgun use
 * webhooks instead, so nothing is rendered for them.
 *
 * @param {{
 *   form: Record<string, any>,
 *   onChange: (field: string, value: unknown) => void,
 *   provider: string,
 *   accountId?: string|null,
 *   isEditMode?: boolean,
 *   onGrantRead?: () => void,
 * }} props
 */
export const BounceMonitorFields = ({
  form,
  onChange,
  provider,
  accountId,
  isEditMode,
  onGrantRead,
}) => {
  const { t } = useMagicMailIntl();
  const modes = BOUNCE_MODES[provider] || [];
  if (!modes.length) return null;
  const mode = modes.includes(form.bounceMode) ? form.bounceMode : modes[0];
  const imap = mode === 'imap';
  const ownLogin = !(provider === 'smtp' && form.imapUseSmtpLogin !== false);

  return (
    <SwitchCard
      padding={4}
      background="neutral100"
      hasRadius
      borderColor="neutral200"
      borderStyle="solid"
      borderWidth="1px"
    >
      <Flex direction="column" gap={4} alignItems="stretch">
        <Flex gap={4} alignItems="center" justifyContent="space-between">
          <Box style={{ flex: 1, minWidth: 0 }}>
            <Typography
              fontWeight="semiBold"
              marginBottom={1}
              style={{ display: 'block', ...LABEL_STYLE }}
            >
              {t('accountModal.bounce.title', 'Bounce monitoring')}
            </Typography>
            <Typography
              variant="pi"
              textColor="neutral600"
              style={{ display: 'block', lineHeight: '1.6' }}
            >
              {t(
                'accountModal.bounce.description',
                'Reads bounce reports such as "Address not found" from this mailbox and marks the matching emails as bounced. Only status codes are stored, never message content.'
              )}
            </Typography>
          </Box>
          <Box style={{ flexShrink: 0 }}>
            <Switch
              checked={form.bounceEnabled === true}
              onCheckedChange={(checked) => onChange('bounceEnabled', checked)}
              aria-label={t('accountModal.bounce.enable', 'Bounce monitoring')}
              onLabel={t('accountModal.switch.active', 'Active')}
              offLabel={t('accountModal.switch.inactive', 'Inactive')}
              visibleLabels={false}
            />
          </Box>
        </Flex>

        {form.bounceEnabled ? (
          <Flex direction="column" gap={4} alignItems="stretch">
            {modes.length > 1 ? (
              <Field.Root
                name="bounceMode"
                hint={t(
                  'accountModal.bounce.modeHint',
                  'The API mode needs read access to the mailbox. IMAP works with an app password.'
                )}
              >
                <Field.Label>{t('accountModal.bounce.mode', 'Read bounces via')}</Field.Label>
                <SingleSelect value={mode} onChange={(value) => onChange('bounceMode', value)}>
                  {modes.map((value) => (
                    <SingleSelectOption key={value} value={value}>
                      {t(`accountModal.bounce.mode.${value}`, MODE_LABELS[value])}
                    </SingleSelectOption>
                  ))}
                </SingleSelect>
                <Field.Hint />
              </Field.Root>
            ) : null}

            {imap ? (
              <>
                <Flex gap={4} wrap="wrap" alignItems="flex-start">
                  <Box style={{ flex: '2 1 220px', minWidth: 0 }}>
                    <Field.Root
                      name="imapHost"
                      hint={t(
                        'accountModal.bounce.hostHint',
                        'Leave empty to derive it from the SMTP host, for example imap.gmail.com.'
                      )}
                    >
                      <Field.Label>{t('accountModal.bounce.host', 'IMAP host')}</Field.Label>
                      <TextInput
                        value={form.imapHost}
                        placeholder="imap.example.com"
                        onChange={(e) => onChange('imapHost', e.target.value)}
                      />
                      <Field.Hint />
                    </Field.Root>
                  </Box>
                  <Box style={{ flex: '1 1 120px', minWidth: 0 }}>
                    <Field.Root name="imapPort">
                      <Field.Label>{t('accountModal.bounce.port', 'Port')}</Field.Label>
                      <NumberInput
                        value={form.imapPort}
                        onValueChange={(value) => onChange('imapPort', value)}
                        min={1}
                        max={65535}
                        step={1}
                      />
                    </Field.Root>
                  </Box>
                </Flex>
                <Flex gap={3} alignItems="center">
                  <Switch
                    checked={form.imapSecure !== false}
                    onCheckedChange={(checked) => onChange('imapSecure', checked)}
                    aria-label={t('accountModal.bounce.secure', 'Use TLS (port 993)')}
                    visibleLabels={false}
                  />
                  <Typography variant="omega">
                    {t('accountModal.bounce.secure', 'Use TLS (port 993)')}
                  </Typography>
                </Flex>
                {provider === 'smtp' ? (
                  <Flex gap={3} alignItems="center">
                    <Switch
                      checked={form.imapUseSmtpLogin !== false}
                      onCheckedChange={(checked) => onChange('imapUseSmtpLogin', checked)}
                      aria-label={t('accountModal.bounce.useSmtpLogin', 'Use the SMTP login')}
                      visibleLabels={false}
                    />
                    <Typography variant="omega">
                      {t('accountModal.bounce.useSmtpLogin', 'Use the SMTP login')}
                    </Typography>
                  </Flex>
                ) : null}
                {ownLogin ? (
                  <>
                    <Field.Root name="imapUser">
                      <Field.Label>{t('accountModal.bounce.user', 'IMAP user')}</Field.Label>
                      <TextInput
                        value={form.imapUser}
                        autoComplete="off"
                        onChange={(e) => onChange('imapUser', e.target.value)}
                      />
                    </Field.Root>
                    <SecretField
                      name="imapPass"
                      label={t('accountModal.bounce.pass', 'IMAP password or app password')}
                      value={form.imapPass}
                      hint={t(
                        'accountModal.bounce.passHint',
                        'For Google Workspace and Gmail, create an app password. It is stored encrypted.'
                      )}
                      onChange={(value) => onChange('imapPass', value)}
                      isEditMode={isEditMode}
                      required={false}
                    />
                  </>
                ) : null}
              </>
            ) : null}

            <Field.Root
              name="imapFolder"
              hint={t(
                'accountModal.bounce.folderHint',
                'Mailbox folder that receives the bounce reports. Usually INBOX.'
              )}
            >
              <Field.Label>{t('accountModal.bounce.folder', 'Folder')}</Field.Label>
              <TextInput
                value={form.imapFolder}
                placeholder="INBOX"
                onChange={(e) => onChange('imapFolder', e.target.value)}
              />
              <Field.Hint />
            </Field.Root>

            {imap ? (
              <Flex gap={3} alignItems="center">
                <Switch
                  checked={form.bounceMoveProcessed === true}
                  onCheckedChange={(checked) => onChange('bounceMoveProcessed', checked)}
                  aria-label={t(
                    'accountModal.bounce.move',
                    'Move processed bounce reports to "Magic Mail/Bounces"'
                  )}
                  visibleLabels={false}
                />
                <Typography variant="omega">
                  {t(
                    'accountModal.bounce.move',
                    'Move processed bounce reports to "Magic Mail/Bounces"'
                  )}
                </Typography>
              </Flex>
            ) : null}
          </Flex>
        ) : null}

        {!isEditMode && form.bounceEnabled && !imap && onGrantRead ? (
          <Flex gap={2} wrap="wrap" alignItems="center">
            <Typography variant="pi" textColor="neutral600">
              {t(
                'accountModal.bounce.grantReadNew',
                'Reading bounces via the provider API needs read access. Connect again with read access before saving.'
              )}
            </Typography>
            <Button variant="secondary" size="S" onClick={onGrantRead}>
              {t('accountModal.bounce.grantRead', 'Grant read access for bounce monitoring')}
            </Button>
          </Flex>
        ) : null}

        {isEditMode && accountId ? (
          <BounceStatus accountId={accountId} provider={provider} onGrantRead={onGrantRead} />
        ) : null}
      </Flex>
    </SwitchCard>
  );
};

export default BounceMonitorFields;

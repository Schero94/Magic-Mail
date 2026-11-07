import {
  Box,
  Button,
  Divider,
  Field,
  Flex,
  NumberInput,
  Switch,
  TextInput,
  Typography,
} from '@strapi/design-system';
import { Key, Lock, Server } from '@strapi/icons';
import { LockClosedIcon } from '@heroicons/react/24/outline';
import { useMagicMailIntl } from '../../hooks/useMagicMailIntl';
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard';
import {
  BulletList,
  CONNECT_BUTTON_COLORS,
  ConnectButton,
  ExternalAnchor,
  FormSection,
  FullWidthField,
  GuideBox,
  GuideList,
  InfoAlert,
  RedirectUriRow,
  RedirectUriValue,
  SectionTitle,
  StaticAlert,
  SwitchCard,
} from './styles';
import {
  OAUTH_API_PROVIDER,
  OAUTH_PROVIDER_NAMES,
  PORT_MAX,
  PORT_MIN,
  getRedirectUri,
  isIntegerInRange,
  isMaskedSecret,
} from './wizardState';

const bold = (chunks) => <strong>{chunks}</strong>;
const code = (chunks) => <code>{chunks}</code>;

const ExternalLink = ({ href, children, standalone = false }) => {
  const { t } = useMagicMailIntl();
  return (
    <ExternalAnchor href={href} target="_blank" rel="noopener noreferrer" $standalone={standalone}>
      {children}
      <span
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
        }}
      >
        {` (${t('accountModal.guide.newTab', 'opens in a new tab')})`}
      </span>
    </ExternalAnchor>
  );
};

const GuideStep = ({ number, children }) => (
  <li>
    {number ? <strong>{number}. </strong> : null}
    {children}
  </li>
);

/** Text input for a secret; explains how stored (masked) secrets are kept. */
const SecretField = ({ name, label, value, placeholder, hint, onChange, isEditMode }) => {
  const { t } = useMagicMailIntl();
  const masked = isEditMode && isMaskedSecret(value);
  return (
    <FullWidthField>
      <Field.Root
        hint={
          masked
            ? t(
                'accountModal.credentials.maskedHint',
                'A secret is stored. Leave this value unchanged to keep it, or enter a new one to replace it.'
              )
            : hint
        }
        required
        name={name}
      >
        <Field.Label>{label}</Field.Label>
        <TextInput
          type="password"
          autoComplete="new-password"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <Field.Hint />
      </Field.Root>
    </FullWidthField>
  );
};

const RedirectUri = ({ providerKey, serverRedirectUri }) => {
  const { t } = useMagicMailIntl();
  const copy = useCopyToClipboard();
  const uri = getRedirectUri(providerKey, {
    serverRedirectUri,
    backendURL: typeof window !== 'undefined' ? window.strapi?.backendURL : undefined,
    origin: typeof window !== 'undefined' ? window.location.origin : '',
  });

  return (
    <li>
      <RedirectUriRow>
        <RedirectUriValue>{uri}</RedirectUriValue>
        <Button
          variant="secondary"
          size="S"
          onClick={() =>
            copy(uri, { success: t('accountModal.redirectCopied', 'Redirect URI copied') })
          }
          aria-label={t('accountModal.guide.copyRedirect', 'Copy redirect URI')}
        >
          {t('accountModal.guide.copy', 'Copy')}
        </Button>
      </RedirectUriRow>
      <Typography variant="pi" textColor="neutral600" tag="p" style={{ marginTop: 4 }}>
        {t(
          'accountModal.guide.redirectHint',
          'The URI must exactly match the public URL of your Strapi server (server.url). Admin and API must be served from the same origin for the popup to report back.'
        )}
      </Typography>
    </li>
  );
};

const SecurityAlert = ({ title, children }) => {
  const { t } = useMagicMailIntl();
  return (
    <InfoAlert
      variant="success"
      title={title}
      marginBottom={4}
      closeLabel={t('common.close', 'Close')}
    >
      {children}
    </InfoAlert>
  );
};

/** Connect button, authorized state, or the edit-mode notice. */
const OAuthConnect = ({
  provider,
  form,
  isEditMode,
  credentialsUnreadable,
  isAuthorized,
  isStarting,
  onConnect,
}) => {
  const { t } = useMagicMailIntl();
  const providerName = OAUTH_PROVIDER_NAMES[provider];

  if (isEditMode) {
    if (isAuthorized) {
      return (
        <StaticAlert
          variant="success"
          closeLabel={t('common.close', 'Close')}
          title={t('accountModal.oauth.reconnectedTitle', 'New authorization received')}
        >
          {t(
            'accountModal.oauth.reconnectedBody',
            'Save the account to store the new {provider} authorization.',
            {
              provider: providerName,
            }
          )}
        </StaticAlert>
      );
    }
    return (
      <Box>
        <StaticAlert
          variant="default"
          closeLabel={t('common.close', 'Close')}
          title={t('accountModal.oauth.editTitle', 'Authorization is kept')}
          marginBottom={3}
        >
          {t(
            'accountModal.oauth.editBody',
            'Saving keeps the existing {provider} authorization. If sending fails because access was revoked or expired, reconnect with the same mailbox. To use a different mailbox or app, add a new account.',
            { provider: providerName }
          )}
        </StaticAlert>
        <ConnectButton
          type="button"
          $bg={CONNECT_BUTTON_COLORS[provider]}
          onClick={onConnect}
          disabled={isStarting || credentialsUnreadable}
          aria-busy={isStarting}
        >
          <LockClosedIcon aria-hidden="true" />
          {isStarting
            ? t('accountModal.oauth.connecting', 'Opening authorization window...')
            : t('accountModal.oauth.reconnect', 'Reconnect with {provider}', {
                provider: providerName,
              })}
        </ConnectButton>
      </Box>
    );
  }

  if (isAuthorized) {
    return (
      <StaticAlert
        variant="success"
        closeLabel={t('common.close', 'Close')}
        title={t('accountModal.oauth.authorizedTitle', 'Authorized')}
      >
        {t(
          'accountModal.oauth.authorizedBody',
          'Authorization with {provider} succeeded. Select "Continue" to configure the account settings.',
          {
            provider: providerName,
          }
        )}
      </StaticAlert>
    );
  }

  const missingTenant = provider === 'microsoft-oauth' && !form.microsoftTenantId.trim();
  const disabled =
    !form.oauthClientId.trim() || !form.oauthClientSecret.trim() || missingTenant || isStarting;

  return (
    <Box>
      <Typography variant="omega" textColor="neutral600" tag="p" marginBottom={3}>
        {t(
          'accountModal.oauth.connectIntro',
          'After entering the credentials above, connect the account with {provider}:',
          {
            provider: providerName,
          }
        )}
      </Typography>
      <ConnectButton
        type="button"
        $bg={CONNECT_BUTTON_COLORS[provider]}
        onClick={onConnect}
        disabled={disabled}
        aria-busy={isStarting}
      >
        <LockClosedIcon aria-hidden="true" />
        {isStarting
          ? t('accountModal.oauth.connecting', 'Opening authorization window...')
          : t('accountModal.oauth.connect', 'Connect with {provider}', { provider: providerName })}
      </ConnectButton>
    </Box>
  );
};

const ClientIdField = ({ name, label, placeholder, hint, value, onChange, locked }) => {
  const { t } = useMagicMailIntl();
  return (
    <FullWidthField>
      <Field.Root
        hint={
          locked
            ? t(
                'accountModal.oauth.lockedHint',
                'Bound to the existing authorization and cannot be changed. Add a new account to use a different app.'
              )
            : hint
        }
        required
        name={name}
      >
        <Field.Label>{label}</Field.Label>
        <TextInput
          placeholder={placeholder}
          value={value}
          disabled={locked}
          autoComplete="off"
          onChange={(e) => onChange(e.target.value)}
        />
        <Field.Hint />
      </Field.Root>
    </FullWidthField>
  );
};

/**
 * Step 3: provider credentials.
 *
 * @param {object} props
 * @param {string} props.provider
 * @param {Record<string, any>} props.form
 * @param {(field: string, value: unknown) => void} props.onChange
 * @param {boolean} props.isEditMode
 * @param {boolean} props.credentialsUnreadable
 * @param {boolean} props.isAuthorized
 * @param {boolean} props.isStarting
 * @param {() => void} props.onConnect
 * @param {Record<string, string>} props.serverRedirectUris
 */
export const CredentialsStep = ({
  provider,
  form,
  onChange,
  isEditMode,
  credentialsUnreadable,
  isAuthorized,
  isStarting,
  onConnect,
  serverRedirectUris = {},
}) => {
  const { t } = useMagicMailIntl();
  const set = (field) => (value) => onChange(field, value);
  const oauthLocked = isEditMode;
  const portInvalid = !isIntegerInRange(form.port, PORT_MIN, PORT_MAX);
  const providerKey = OAUTH_API_PROVIDER[provider];

  const unreadableAlert = credentialsUnreadable ? (
    <StaticAlert
      variant="danger"
      marginBottom={4}
      closeLabel={t('common.close', 'Close')}
      title={t(
        'accountModal.credentials.unreadableTitle',
        'Stored credentials cannot be decrypted'
      )}
    >
      {providerKey
        ? t(
            'accountModal.credentials.unreadableOAuth',
            'The encryption key changed since this account was saved, so its OAuth tokens are lost. Add the account again and delete this one. You can still save the other settings.'
          )
        : t(
            'accountModal.credentials.unreadableBody',
            'The encryption key changed since this account was saved. Re-enter all credentials below to restore the account.'
          )}
    </StaticAlert>
  ) : null;

  const oauthCommon = (children, guide) => (
    <>
      {unreadableAlert}
      <SecurityAlert title={t('accountModal.credentials.oauthSecurityTitle', 'OAuth 2.0 security')}>
        {t(
          'accountModal.credentials.oauthSecurityBody',
          'No mailbox password is stored. You authenticate directly with {provider}.',
          {
            provider: OAUTH_PROVIDER_NAMES[provider],
          }
        )}
      </SecurityAlert>
      <Flex direction="column" gap={4} style={{ width: '100%' }} alignItems="stretch">
        {children}
        <Divider />
        <OAuthConnect
          provider={provider}
          form={form}
          isEditMode={isEditMode}
          credentialsUnreadable={credentialsUnreadable}
          isAuthorized={isAuthorized}
          isStarting={isStarting}
          onConnect={onConnect}
        />
        <GuideBox padding={4} background="neutral100" hasRadius>
          <Typography
            fontWeight="semiBold"
            tag="h4"
            marginBottom={3}
            style={{ fontSize: '15px', display: 'block' }}
          >
            {t('accountModal.guide.title', 'Setup guide')}
          </Typography>
          <GuideList>{guide}</GuideList>
        </GuideBox>
      </Flex>
    </>
  );

  return (
    <FormSection>
      {provider === 'smtp' && (
        <>
          {unreadableAlert}
          <SecurityAlert title={t('accountModal.credentials.secureStorageTitle', 'Secure storage')}>
            {t(
              'accountModal.credentials.secureStorageBody',
              'All credentials are encrypted with AES-256-GCM before they are stored. No plain-text passwords are kept in the database.'
            )}
          </SecurityAlert>

          <Flex direction="column" gap={4} style={{ width: '100%' }} alignItems="stretch">
            <SectionTitle tag="h3">
              <Server aria-hidden="true" />
              {t('accountModal.smtp.connection', 'Server connection')}
            </SectionTitle>

            <FullWidthField>
              <Field.Root
                hint={t(
                  'accountModal.smtp.hostHint',
                  'The address of your mail server, for example smtp.gmail.com (Gmail), smtp-mail.outlook.com (Outlook) or smtp.sendgrid.net (SendGrid).'
                )}
                required
                name="host"
              >
                <Field.Label>{t('accountModal.smtp.host', 'SMTP host')}</Field.Label>
                <TextInput
                  placeholder="smtp.example.com"
                  value={form.host}
                  autoComplete="off"
                  onChange={(e) => onChange('host', e.target.value)}
                />
                <Field.Hint />
              </Field.Root>
            </FullWidthField>

            <FullWidthField>
              <Field.Root
                hint={t(
                  'accountModal.smtp.portHint',
                  'Standard ports: 587 (recommended, STARTTLS), 465 (SSL/TLS) or 25 (unencrypted, not recommended).'
                )}
                required
                name="port"
                error={
                  portInvalid
                    ? t('accountModal.smtp.portInvalid', 'Enter a port between 1 and 65535.')
                    : undefined
                }
              >
                <Field.Label>{t('accountModal.smtp.port', 'Port')}</Field.Label>
                <NumberInput
                  value={form.port}
                  onValueChange={set('port')}
                  min={PORT_MIN}
                  max={PORT_MAX}
                  step={1}
                />
                <Field.Error />
                <Field.Hint />
              </Field.Root>
            </FullWidthField>

            <Divider />

            <SectionTitle tag="h3">
              <Lock aria-hidden="true" />
              {t('accountModal.smtp.authentication', 'Authentication')}
            </SectionTitle>

            <FullWidthField>
              <Field.Root
                hint={t(
                  'accountModal.smtp.userHint',
                  'Usually the full email address. Some providers use only the part before the @.'
                )}
                required
                name="user"
              >
                <Field.Label>{t('accountModal.smtp.user', 'Username or email')}</Field.Label>
                <TextInput
                  placeholder="user@example.com"
                  value={form.user}
                  autoComplete="off"
                  onChange={(e) => onChange('user', e.target.value)}
                />
                <Field.Hint />
              </Field.Root>
            </FullWidthField>

            <SecretField
              name="pass"
              label={t('accountModal.smtp.password', 'Password or app password')}
              placeholder={t('accountModal.smtp.passwordPlaceholder', 'Enter the password')}
              hint={t(
                'accountModal.smtp.passwordHint',
                'For Gmail with 2-step verification, create an app password in your Google account (Security, 2-Step Verification, App passwords). Regular passwords do not work.'
              )}
              value={form.pass}
              onChange={set('pass')}
              isEditMode={isEditMode}
            />

            <SwitchCard
              padding={4}
              background="neutral100"
              hasRadius
              borderColor="neutral200"
              borderStyle="solid"
              borderWidth="1px"
            >
              <Flex gap={4} alignItems="center" justifyContent="space-between">
                <Flex
                  direction="column"
                  gap={1}
                  alignItems="flex-start"
                  style={{ flex: 1, minWidth: 0 }}
                >
                  <Typography fontWeight="semiBold" style={{ fontSize: '14px' }}>
                    {t('accountModal.smtp.secure', 'Use SSL/TLS encryption')}
                  </Typography>
                  <Typography
                    variant="pi"
                    textColor="neutral600"
                    style={{ fontSize: '13px', lineHeight: '1.5' }}
                  >
                    {form.secure
                      ? t(
                          'accountModal.smtp.secureOn',
                          'Use this for implicit SSL/TLS connections, typically on port 465.'
                        )
                      : t(
                          'accountModal.smtp.secureOff',
                          'Port 587 uses STARTTLS instead. Confirm that the server supports STARTTLS before sending.'
                        )}
                  </Typography>
                </Flex>
                <Box style={{ flexShrink: 0 }}>
                  <Switch
                    checked={form.secure}
                    onCheckedChange={(checked) => onChange('secure', checked)}
                    aria-label={t('accountModal.smtp.secureLabel', 'Use SSL/TLS encryption')}
                    onLabel={t('accountModal.switch.enabled', 'Enabled')}
                    offLabel={t('accountModal.switch.disabled', 'Disabled')}
                    visibleLabels={false}
                  />
                </Box>
              </Flex>
            </SwitchCard>
          </Flex>
        </>
      )}

      {provider === 'gmail-oauth' &&
        oauthCommon(
          <>
            <SectionTitle tag="h3">
              <Lock aria-hidden="true" />
              {t('accountModal.gmail.app', 'Google OAuth application')}
            </SectionTitle>
            <ClientIdField
              name="oauthClientId"
              label={t('accountModal.oauth.clientId', 'OAuth client ID')}
              placeholder="123456789-abc123xyz.apps.googleusercontent.com"
              hint={t(
                'accountModal.gmail.clientIdHint',
                'Found in Google Cloud Console under APIs & Services, Credentials. Ends with .apps.googleusercontent.com.'
              )}
              value={form.oauthClientId}
              onChange={set('oauthClientId')}
              locked={oauthLocked}
            />
            <SecretField
              name="oauthClientSecret"
              label={t('accountModal.oauth.clientSecret', 'OAuth client secret')}
              placeholder="GOCSPX-..."
              hint={t(
                'accountModal.gmail.clientSecretHint',
                'Found in the same OAuth client settings. Keep it secret and never commit it to a repository.'
              )}
              value={form.oauthClientSecret}
              onChange={set('oauthClientSecret')}
              isEditMode={isEditMode}
            />
          </>,
          <>
            <GuideStep number={1}>
              {t('accountModal.gmail.step1', 'Open {link}', {
                link: (
                  <ExternalLink key="l" href="https://console.cloud.google.com">
                    console.cloud.google.com
                  </ExternalLink>
                ),
              })}
            </GuideStep>
            <GuideStep number={2}>
              {t(
                'accountModal.gmail.step2',
                'Enable the Gmail API (search for it and select Enable).'
              )}
            </GuideStep>
            <GuideStep number={3}>
              {t('accountModal.gmail.step3', 'Create credentials of type OAuth client ID.')}
            </GuideStep>
            <GuideStep number={4}>
              {t('accountModal.guide.addRedirect', 'Add this redirect URI:')}
            </GuideStep>
            <RedirectUri providerKey="gmail" serverRedirectUri={serverRedirectUris.gmail} />
          </>
        )}

      {provider === 'microsoft-oauth' &&
        oauthCommon(
          <>
            <SectionTitle tag="h3">
              <Lock aria-hidden="true" />
              {t('accountModal.microsoft.app', 'Microsoft Azure application')}
            </SectionTitle>
            <ClientIdField
              name="microsoftTenantId"
              label={t('accountModal.microsoft.tenantId', 'Tenant (directory) ID')}
              placeholder="87654321-4321-4321-4321-987654321abc"
              hint={t(
                'accountModal.microsoft.tenantIdHint',
                'Found in Azure Portal under App registrations, your app, Overview (next to the application ID). A GUID, required for OAuth.'
              )}
              value={form.microsoftTenantId}
              onChange={set('microsoftTenantId')}
              locked={oauthLocked}
            />
            <ClientIdField
              name="oauthClientId"
              label={t('accountModal.microsoft.clientId', 'Application (client) ID')}
              placeholder="12345678-1234-1234-1234-123456789abc"
              hint={t(
                'accountModal.microsoft.clientIdHint',
                'Found in Azure Portal under App registrations, your app, Overview. A GUID.'
              )}
              value={form.oauthClientId}
              onChange={set('oauthClientId')}
              locked={oauthLocked}
            />
            <SecretField
              name="oauthClientSecret"
              label={t('accountModal.microsoft.clientSecret', 'Client secret value')}
              placeholder="abc~123XYZ..."
              hint={t(
                'accountModal.microsoft.clientSecretHint',
                'From Azure Portal under Certificates & secrets, Client secrets. Copy the value, not the secret ID, and keep it secret.'
              )}
              value={form.oauthClientSecret}
              onChange={set('oauthClientSecret')}
              isEditMode={isEditMode}
            />
          </>,
          <>
            <GuideStep number={1}>
              {t('accountModal.microsoft.step1', 'Open {link}', {
                link: (
                  <ExternalLink key="l" href="https://portal.azure.com">
                    portal.azure.com
                  </ExternalLink>
                ),
              })}
            </GuideStep>
            <GuideStep number={2}>
              {t(
                'accountModal.microsoft.step2',
                'Go to Microsoft Entra ID, App registrations, New registration.'
              )}
            </GuideStep>
            <GuideStep number={3}>
              {t(
                'accountModal.microsoft.step3',
                'Name the app (for example "MagicMail") and select "Accounts in this organizational directory only".'
              )}
            </GuideStep>
            <GuideStep>
              {t(
                'accountModal.microsoft.important',
                '<b>Important:</b> copy both the <b>Application (client) ID</b> and the <b>Directory (tenant) ID</b> from the Overview page.',
                { b: bold }
              )}
            </GuideStep>
            <GuideStep number={4}>
              {t('accountModal.guide.addRedirect', 'Add this redirect URI:')}
            </GuideStep>
            <RedirectUri providerKey="microsoft" serverRedirectUri={serverRedirectUris.microsoft} />
            <GuideStep number={5}>
              {t(
                'accountModal.microsoft.step5',
                'Under API permissions, add a permission: Microsoft Graph, Delegated permissions:'
              )}
              <BulletList>
                <li>
                  {t(
                    'accountModal.microsoft.scopeMailSend',
                    '<c>Mail.Send</c> - send email as the signed-in user',
                    { c: code }
                  )}
                </li>
                <li>
                  {t(
                    'accountModal.microsoft.scopeUserRead',
                    '<c>User.Read</c> - read the user profile (email address)',
                    { c: code }
                  )}
                </li>
                <li>
                  {t(
                    'accountModal.microsoft.scopeOffline',
                    '<c>offline_access</c> - keep access (refresh tokens)',
                    { c: code }
                  )}
                </li>
                <li>
                  {t('accountModal.microsoft.scopeOpenid', '<c>openid</c> - sign users in', {
                    c: code,
                  })}
                </li>
                <li>
                  {t(
                    'accountModal.microsoft.scopeEmail',
                    '<c>email</c> - view the user’s email address',
                    { c: code }
                  )}
                </li>
              </BulletList>
            </GuideStep>
            <GuideStep number={6}>
              {t(
                'accountModal.microsoft.step6',
                'Select "Grant admin consent" for your organization (required).'
              )}
            </GuideStep>
            <GuideStep number={7}>
              {t(
                'accountModal.microsoft.step7',
                'Under Certificates & secrets, create a new client secret.'
              )}
            </GuideStep>
            <GuideStep number={8}>
              {t(
                'accountModal.microsoft.step8',
                'Copy the <b>value</b> (not the secret ID) immediately. It is shown only once.',
                { b: bold }
              )}
            </GuideStep>
          </>
        )}

      {provider === 'yahoo-oauth' &&
        oauthCommon(
          <>
            <SectionTitle tag="h3">
              <Lock aria-hidden="true" />
              {t('accountModal.yahoo.app', 'Yahoo developer application')}
            </SectionTitle>
            <ClientIdField
              name="oauthClientId"
              label={t('accountModal.yahoo.clientId', 'Yahoo client ID')}
              placeholder="dj0yJmk9..."
              hint={t(
                'accountModal.yahoo.clientIdHint',
                'Found in the Yahoo developer console under your app, App information. Starts with "dj0y".'
              )}
              value={form.oauthClientId}
              onChange={set('oauthClientId')}
              locked={oauthLocked}
            />
            <SecretField
              name="oauthClientSecret"
              label={t('accountModal.yahoo.clientSecret', 'Yahoo client secret')}
              placeholder="abc123def456..."
              hint={t(
                'accountModal.yahoo.clientSecretHint',
                'Found in the same App information section. Keep it secret and never commit it to a repository.'
              )}
              value={form.oauthClientSecret}
              onChange={set('oauthClientSecret')}
              isEditMode={isEditMode}
            />
          </>,
          <>
            <GuideStep number={1}>
              {t('accountModal.yahoo.step1', 'Open {link}', {
                link: (
                  <ExternalLink key="l" href="https://developer.yahoo.com/apps/">
                    developer.yahoo.com/apps
                  </ExternalLink>
                ),
              })}
            </GuideStep>
            <GuideStep number={2}>
              {t('accountModal.yahoo.step2', 'Select "Create an App".')}
            </GuideStep>
            <GuideStep number={3}>
              {t('accountModal.yahoo.step3', 'Fill in the app details (name, description).')}
            </GuideStep>
            <GuideStep number={4}>
              {t('accountModal.guide.addRedirect', 'Add this redirect URI:')}
            </GuideStep>
            <RedirectUri providerKey="yahoo" serverRedirectUri={serverRedirectUris.yahoo} />
            <GuideStep number={5}>
              {t('accountModal.yahoo.step5', 'Under API permissions, enable:')}
              <BulletList>
                <li>
                  {t('accountModal.yahoo.scopeMail', '<c>Mail</c> - send and manage email', {
                    c: code,
                  })}
                </li>
                <li>
                  {t(
                    'accountModal.yahoo.scopeOpenid',
                    '<c>OpenID Connect</c> - user authentication',
                    { c: code }
                  )}
                </li>
              </BulletList>
            </GuideStep>
            <GuideStep number={6}>
              {t(
                'accountModal.yahoo.step6',
                'Note the client ID and client secret from the app settings.'
              )}
            </GuideStep>
          </>
        )}

      {(provider === 'sendgrid' || provider === 'mailgun') && (
        <>
          {unreadableAlert}
          <SecurityAlert
            title={t('accountModal.credentials.apiKeySecurityTitle', 'API key security')}
          >
            {t(
              'accountModal.credentials.apiKeySecurityBody',
              'Your API key is encrypted with AES-256-GCM before it is stored.'
            )}
          </SecurityAlert>

          <Flex direction="column" gap={4} style={{ width: '100%' }} alignItems="stretch">
            <SectionTitle tag="h3">
              <Key aria-hidden="true" />
              {provider === 'sendgrid'
                ? t('accountModal.sendgrid.title', 'SendGrid API configuration')
                : t('accountModal.mailgun.title', 'Mailgun API configuration')}
            </SectionTitle>

            {provider === 'mailgun' && (
              <FullWidthField>
                <Field.Root
                  hint={t(
                    'accountModal.mailgun.domainHint',
                    'Your verified Mailgun domain (for example mg.example.com) or a sandbox domain for testing.'
                  )}
                  required
                  name="mailgunDomain"
                >
                  <Field.Label>{t('accountModal.mailgun.domain', 'Mailgun domain')}</Field.Label>
                  <TextInput
                    placeholder="mg.example.com"
                    value={form.mailgunDomain}
                    autoComplete="off"
                    onChange={(e) => onChange('mailgunDomain', e.target.value)}
                  />
                  <Field.Hint />
                </Field.Root>
              </FullWidthField>
            )}

            <SecretField
              name="apiKey"
              label={
                provider === 'sendgrid'
                  ? t('accountModal.sendgrid.apiKey', 'SendGrid API key')
                  : t('accountModal.mailgun.apiKey', 'Mailgun API key')
              }
              placeholder={provider === 'sendgrid' ? 'SG.xxxxxxxxxxxxxxxx' : 'key-xxxxxxxxxxxxxxxx'}
              hint={
                provider === 'sendgrid'
                  ? t(
                      'accountModal.sendgrid.apiKeyHint',
                      'Found in the SendGrid dashboard under Settings, API Keys. Create a key with the "Mail Send" permission.'
                    )
                  : t(
                      'accountModal.mailgun.apiKeyHint',
                      'Found in the Mailgun dashboard under Settings, API Keys. Use the private API key, not the public validation key.'
                    )
              }
              value={form.apiKey}
              onChange={set('apiKey')}
              isEditMode={isEditMode}
            />

            <StaticAlert
              variant="default"
              closeLabel={t('common.close', 'Close')}
              title={
                provider === 'sendgrid'
                  ? t('accountModal.sendgrid.resources', 'SendGrid resources')
                  : t('accountModal.mailgun.resources', 'Mailgun resources')
              }
              action={
                <Flex gap={3} wrap="wrap">
                  <ExternalLink
                    standalone
                    href={
                      provider === 'sendgrid'
                        ? 'https://app.sendgrid.com'
                        : 'https://app.mailgun.com'
                    }
                  >
                    {t('accountModal.guide.dashboard', 'Dashboard')}
                  </ExternalLink>
                  <ExternalLink
                    standalone
                    href={
                      provider === 'sendgrid'
                        ? 'https://docs.sendgrid.com'
                        : 'https://documentation.mailgun.com'
                    }
                  >
                    {t('accountModal.guide.docs', 'Documentation')}
                  </ExternalLink>
                </Flex>
              }
            >
              {provider === 'sendgrid'
                ? t(
                    'accountModal.sendgrid.resourcesBody',
                    'API keys: Settings, API Keys, Create API Key. Required scope: Mail Send (full access).'
                  )
                : t(
                    'accountModal.mailgun.resourcesBody',
                    'API keys: Settings, API Security, Private API key. Domains: Sending, Domains (verify your domain or use the sandbox).'
                  )}
            </StaticAlert>
          </Flex>
        </>
      )}
    </FormSection>
  );
};

export default CredentialsStep;

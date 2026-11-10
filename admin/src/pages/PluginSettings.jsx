import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Box,
  Typography,
  Flex,
  Loader,
  NumberInput,
  SingleSelect,
  SingleSelectOption,
  Switch,
  TextInput,
  Field,
} from '@strapi/design-system';
import { Page, useFetchClient, useNotification } from '@strapi/strapi/admin';
import { useMagicMailRBAC } from '../hooks/useMagicMailRBAC';
import { useMagicMailIntl } from '../hooks/useMagicMailIntl';
import { useUnsavedChangesGuard } from '../hooks/useUnsavedChangesGuard';
import pluginPermissions from '../permissions';
import {
  ArrowPathIcon,
  ExclamationTriangleIcon,
  UserIcon,
  LinkIcon,
  EyeIcon,
  EnvelopeIcon,
  InboxStackIcon,
  ShieldExclamationIcon,
} from '@heroicons/react/24/outline';
import { SuppressionList } from '../components/SuppressionList';
import styled, { keyframes, css } from 'styled-components';
import { GradientButton, TertiaryButton } from '../components/StyledButtons';
import { PluginPageTitle } from '../components/shared/Headings';
import { UnsavedChangesDialog } from '../components/shared/UnsavedChangesDialog';
import { motionSafe } from '../components/shared/motion';
import { accent, color, fontSize } from '../utils/theme';
import {
  BOUNCE_INTERVAL_RANGE,
  QUEUE_MAX_ATTEMPTS_RANGE,
  SETTINGS_DEFAULTS,
  diffSettings,
  isInsecureRemoteUrl,
  normalizeSettings,
  validateSettings,
} from '../utils/settingsValidation';
import { apiErrorMessage } from '../utils/analyticsLogs';

// ================ ANIMATIONS ================
const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
`;

const mobile = '768px';

// ================ STYLED COMPONENTS ================
const PageContainer = styled(Box)`
  ${motionSafe(css`
    animation: ${fadeIn} 0.4s ease-out;
  `)}
  max-width: 900px;
  margin: 0 auto;
  padding: 40px 32px;

  @media screen and (max-width: ${mobile}) {
    padding: 24px 16px;
  }
`;

const PageHeader = styled(Flex)`
  margin-bottom: 32px;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
`;

const PageTitle = styled(Typography)`
  font-size: ${fontSize(6)};
  font-weight: 700;
  color: ${color('neutral800')};
  display: block;
  margin: 0;
`;

const PageSubtitle = styled(Typography)`
  font-size: ${fontSize(2)};
  color: ${color('neutral600')};
  display: block;
  margin: 0;
`;

const ActionBar = styled(Flex)`
  margin-bottom: 32px;
  padding: 16px 20px;
  background: ${color('neutral0')};
  border: 1px solid rgba(128, 128, 128, 0.2);
  border-radius: 8px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  flex-wrap: wrap;
  gap: 12px;
`;

const ActionButtons = styled(Flex)`
  flex-wrap: wrap;
  gap: 8px;
`;

const SettingsSection = styled(Box)`
  background: ${color('neutral0')};
  border: 1px solid rgba(128, 128, 128, 0.2);
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 24px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
`;

const SectionHeader = styled(Flex)`
  padding: 20px 24px;
  background: ${color('neutral100')};
  border-bottom: 1px solid rgba(128, 128, 128, 0.2);

  @media screen and (max-width: ${mobile}) {
    padding: 16px;
  }
`;

const SectionIcon = styled(Box)`
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 16px;
  background: ${(props) => props.$bgColor || 'rgba(14, 165, 233, 0.12)'};
  flex-shrink: 0;

  svg {
    width: 22px;
    height: 22px;
    color: ${(p) => (accent[p.$tone] ?? accent.primary)(p)};
  }
`;

const SectionContent = styled(Box)`
  padding: 24px;

  @media screen and (max-width: ${mobile}) {
    padding: 16px;
  }
`;

const SettingRow = styled(Flex)`
  padding: 16px 0;
  border-bottom: 1px solid rgba(128, 128, 128, 0.15);

  &:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }

  &:first-child {
    padding-top: 0;
  }
`;

const SettingInfo = styled(Flex)`
  flex: 1;
  min-width: 0;
  padding-right: 24px;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;

  @media screen and (max-width: ${mobile}) {
    padding-right: 12px;
  }
`;

const SettingLabel = styled(Typography)`
  font-size: ${fontSize(2)};
  font-weight: 600;
  color: ${color('neutral800')};
  display: block;
`;

const SettingDescription = styled(Typography)`
  font-size: ${fontSize(1)};
  color: ${color('neutral600')};
  line-height: 1.5;
  display: block;
`;

const SwitchWrapper = styled(Box)`
  flex-shrink: 0;
  display: flex;
  align-items: center;

  /* Touch screens: the DS switch (40x24) grows to a 48x32 target with the
     same proportions (as in the routing rule modal). */
  @media (max-width: 767px) {
    button[role='switch'] {
      width: 48px;
      height: 32px;
      border-radius: 16px;
    }

    button[role='switch'] > span {
      width: 24px;
      height: 24px;
    }
  }
`;

const LoaderContainer = styled(Flex)`
  min-height: 400px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 16px;
`;

const ErrorState = styled(Flex)`
  min-height: 320px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  text-align: center;
  padding: 32px 16px;
  background: ${color('neutral0')};
  border: 2px dashed rgba(128, 128, 128, 0.3);
  border-radius: 12px;

  /* Only the state icon; the Retry button keeps its neutral icon. */
  & > svg {
    width: 40px;
    height: 40px;
    color: ${accent.danger};
  }
`;

const InfoBox = styled(Box)`
  background: rgba(14, 165, 233, 0.08);
  border: 1px solid rgba(14, 165, 233, 0.3);
  border-radius: 8px;
  padding: 12px 16px;
  margin-top: 16px;
`;

const CodeSnippet = styled.code`
  background: #1e293b;
  color: #e2e8f0;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: ${fontSize(1)};
  font-family: 'Monaco', 'Menlo', monospace;
  overflow-wrap: anywhere;
`;

const ICON_18 = { width: 18, height: 18 };

/**
 * Translated message for a validation code from settingsValidation.js.
 * @param {Function} t
 * @param {string|undefined} code
 * @returns {string|undefined}
 */
const errorMessage = (t, code) => {
  switch (code) {
    case 'invalidUrl':
      return t(
        'settings.errors.invalidUrl',
        'Enter a valid URL, for example https://api.example.com'
      );
    case 'invalidProtocol':
      return t('settings.errors.invalidProtocol', 'This URL type is not allowed here');
    case 'invalidEmail':
      return t('settings.errors.invalidEmail', 'Enter a valid email address');
    case 'invalidText':
      return t('settings.errors.invalidText', 'Use a single line of at most 1000 characters');
    case 'invalidRange':
      return t('settings.errors.invalidRange', 'Enter a whole number from {min} to {max}', {
        min: QUEUE_MAX_ATTEMPTS_RANGE.min,
        max: QUEUE_MAX_ATTEMPTS_RANGE.max,
      });
    case 'invalidInterval':
      return t('settings.errors.invalidRange', 'Enter a whole number from {min} to {max}', {
        min: BOUNCE_INTERVAL_RANGE.min,
        max: BOUNCE_INTERVAL_RANGE.max,
      });
    default:
      return undefined;
  }
};

// ================ MAIN COMPONENT ================
const PluginSettingsContent = () => {
  const { canManage, isLoading: rbacLoading, error: rbacError } = useMagicMailRBAC();
  const { t } = useMagicMailIntl();
  const { get, put } = useFetchClient();
  const { toggleNotification } = useNotification();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [initialSettings, setInitialSettings] = useState(null);
  const [settings, setSettings] = useState(SETTINGS_DEFAULTS);
  const [saving, setSaving] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const changes = useMemo(
    () => (initialSettings ? diffSettings(initialSettings, settings) : {}),
    [initialSettings, settings]
  );
  const hasChanges = Object.keys(changes).length > 0;
  const errors = useMemo(() => validateSettings(settings), [settings]);
  const isValid = Object.keys(errors).length === 0;
  const guard = useUnsavedChangesGuard(hasChanges);

  /**
   * Loads plugin settings from the API on mount and after every
   * fetchSettings() (Retry, Refresh). The form is only shown after a
   * successful load, so stale defaults can never be saved over real values.
   * State is only set once the request settled; `ignore` drops stale answers.
   */
  const [settingsReloadKey, setSettingsReloadKey] = useState(0);
  useEffect(() => {
    let ignore = false;
    const load = async () => {
      try {
        const response = await get('/magic-mail/settings');
        if (ignore) return;
        const data = response.data?.data;
        if (!data || typeof data !== 'object') throw new Error('Empty settings response');
        const loaded = normalizeSettings(data);
        setInitialSettings(loaded);
        setSettings(loaded);
        setLoadError(null);
      } catch (err) {
        if (ignore) return;
        console.error('[MagicMail] Failed to fetch plugin settings');
        const message = apiErrorMessage(err) || t('settings.loadError', 'Failed to load settings');
        setLoadError(message);
        toggleNotification({ type: 'danger', message });
      } finally {
        if (!ignore) setLoading(false);
      }
    };
    load();
    return () => {
      ignore = true;
    };
  }, [get, t, toggleNotification, settingsReloadKey]);

  /** Reloads the settings (Retry, Refresh) and shows the loader meanwhile. */
  const fetchSettings = () => {
    setLoading(true);
    setSettingsReloadKey((key) => key + 1);
  };

  /**
   * Save the changed settings only.
   */
  const saveSettings = async () => {
    if (!canManage || !initialSettings || !hasChanges || !isValid) return;
    setSaving(true);
    try {
      const response = await put('/magic-mail/settings', changes);
      const saved = response?.data?.data
        ? normalizeSettings(response.data.data)
        : { ...settings, ...changes };
      if (!mounted.current) return;
      setInitialSettings(saved);
      setSettings(saved);
      toggleNotification({
        type: 'success',
        message: t('settings.saveSuccess', 'Settings saved'),
      });
    } catch (err) {
      console.error('[MagicMail] Failed to save plugin settings');
      toggleNotification({
        type: 'danger',
        message: apiErrorMessage(err) || t('settings.saveError', 'Failed to save settings'),
      });
    } finally {
      if (mounted.current) setSaving(false);
    }
  };

  /**
   * Handle setting change
   */
  const handleChange = (key, value) => {
    if (!canManage) return;
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const pageTitle = <PluginPageTitle>{t('settings.pageTitle', 'Plugin Settings')}</PluginPageTitle>;

  if (loading || rbacLoading) {
    return (
      <PageContainer>
        {pageTitle}
        <LoaderContainer>
          <Loader>{t('settings.loading', 'Loading settings...')}</Loader>
        </LoaderContainer>
      </PageContainer>
    );
  }

  const header = (
    <PageHeader>
      <PageTitle tag="h1">{t('settings.title', 'Plugin Settings')}</PageTitle>
      <PageSubtitle tag="p">
        {t(
          'settings.subtitle',
          'Configure email tracking, analytics, and default sender information'
        )}
      </PageSubtitle>
    </PageHeader>
  );

  if (loadError || !initialSettings) {
    return (
      <PageContainer>
        {pageTitle}
        {header}
        <ErrorState role="alert">
          <ExclamationTriangleIcon aria-hidden="true" />
          <Typography variant="delta" fontWeight="bold" tag="h2">
            {t('settings.loadErrorTitle', 'Settings could not be loaded')}
          </Typography>
          <Typography variant="omega" textColor="neutral600">
            {loadError || t('settings.loadError', 'Failed to load settings')}
          </Typography>
          <Typography variant="pi" textColor="neutral600">
            {t(
              'settings.loadErrorHint',
              'Saving is disabled until the current settings have been loaded.'
            )}
          </Typography>
          <TertiaryButton
            startIcon={<ArrowPathIcon style={ICON_18} aria-hidden="true" />}
            onClick={fetchSettings}
          >
            {t('settings.retry', 'Retry')}
          </TertiaryButton>
        </ErrorState>
      </PageContainer>
    );
  }

  const statusText = rbacError
    ? t(
        'common.permissions.loadError',
        'Your permissions could not be loaded. Reload the page to try again.'
      )
    : !canManage
      ? t(
          'settings.status.readOnly',
          'Read-only access. You need the MagicMail manage permission to change settings.'
        )
      : !isValid
        ? t('settings.status.invalid', 'Please correct the highlighted fields')
        : hasChanges
          ? t('settings.status.unsaved', 'You have unsaved changes')
          : t('settings.status.saved', 'All changes saved');

  const showTrackingUrl = settings.enableLinkTracking || Boolean(errors.trackingBaseUrl);
  const showUnsubscribeUrl = settings.enableUnsubscribeHeader || Boolean(errors.unsubscribeUrl);

  return (
    <PageContainer>
      {pageTitle}
      {header}

      {/* Action Bar */}
      <ActionBar justifyContent="space-between" alignItems="center">
        <Typography
          variant="omega"
          textColor={rbacError || (!isValid && canManage) ? 'danger600' : 'neutral600'}
          aria-live="polite"
        >
          {statusText}
        </Typography>
        <ActionButtons>
          <TertiaryButton
            startIcon={<ArrowPathIcon style={ICON_18} aria-hidden="true" />}
            onClick={() => guard.runGuarded(fetchSettings)}
            disabled={saving}
          >
            {t('settings.refresh', 'Refresh')}
          </TertiaryButton>
          {canManage && (
            <GradientButton
              onClick={saveSettings}
              loading={saving}
              disabled={!hasChanges || !canManage || !isValid}
            >
              {t('settings.save', 'Save Changes')}
            </GradientButton>
          )}
        </ActionButtons>
      </ActionBar>

      {/* Link Tracking Section */}
      <SettingsSection tag="section" aria-labelledby="mm-settings-link-tracking">
        <SectionHeader alignItems="center">
          <SectionIcon $bgColor="rgba(37, 99, 235, 0.15)" $tone="primary">
            <LinkIcon aria-hidden="true" />
          </SectionIcon>
          <Flex direction="column" alignItems="flex-start" gap={1}>
            <Typography variant="delta" fontWeight="bold" tag="h2" id="mm-settings-link-tracking">
              {t('settings.linkTracking.title', 'Link Tracking')}
            </Typography>
            <Typography variant="pi" textColor="neutral600">
              {t(
                'settings.linkTracking.subtitle',
                'Track when recipients click links in your emails'
              )}
            </Typography>
          </Flex>
        </SectionHeader>
        <SectionContent>
          <SettingRow alignItems="center">
            <SettingInfo>
              <SettingLabel>
                {t('settings.linkTracking.label', 'Enable Link Tracking')}
              </SettingLabel>
              <SettingDescription>
                {t(
                  'settings.linkTracking.description',
                  'Rewrite links in outgoing emails to measure click-through rates. Links with sensitive tokens are never rewritten.'
                )}
              </SettingDescription>
            </SettingInfo>
            <SwitchWrapper>
              <Switch
                checked={settings.enableLinkTracking}
                disabled={!canManage}
                onCheckedChange={(checked) => handleChange('enableLinkTracking', checked)}
                aria-label={t('settings.linkTracking.label', 'Enable Link Tracking')}
                onLabel={t('settings.switch.on', 'Enabled')}
                offLabel={t('settings.switch.off', 'Disabled')}
                visibleLabels={false}
              />
            </SwitchWrapper>
          </SettingRow>

          {showTrackingUrl && (
            <>
              <Box style={{ marginTop: '20px' }}>
                <Field.Root
                  name="trackingBaseUrl"
                  error={errorMessage(t, errors.trackingBaseUrl)}
                  hint={
                    isInsecureRemoteUrl(settings.trackingBaseUrl)
                      ? t(
                          'settings.trackingBaseUrl.httpWarning',
                          'This URL uses http. Use https in production so tracked links stay secure.'
                        )
                      : t(
                          'settings.trackingBaseUrl.hint',
                          'Public URL where your Strapi API is reachable. Leave empty to use the server URL.'
                        )
                  }
                >
                  <Field.Label>
                    {t('settings.trackingBaseUrl.label', 'Tracking Base URL')}
                  </Field.Label>
                  <TextInput
                    type="url"
                    inputMode="url"
                    autoComplete="url"
                    placeholder="https://api.example.com"
                    value={settings.trackingBaseUrl}
                    onChange={(e) => handleChange('trackingBaseUrl', e.target.value)}
                    disabled={!canManage}
                  />
                  <Field.Hint />
                  <Field.Error />
                </Field.Root>
              </Box>

              <InfoBox>
                <Typography
                  variant="pi"
                  textColor="primary700"
                  fontWeight="medium"
                  style={{ display: 'block' }}
                >
                  {t('settings.override.title', 'Per-Email Override')}
                </Typography>
                <Typography
                  variant="pi"
                  textColor="primary600"
                  style={{ marginTop: '4px', display: 'block' }}
                >
                  {t(
                    'settings.override.body',
                    'Disable tracking for sensitive emails (password resets, magic links) by passing {code} when sending.',
                    { code: <CodeSnippet key="code">skipLinkTracking: true</CodeSnippet> }
                  )}
                </Typography>
              </InfoBox>
            </>
          )}
        </SectionContent>
      </SettingsSection>

      {/* Open Tracking Section */}
      <SettingsSection tag="section" aria-labelledby="mm-settings-open-tracking">
        <SectionHeader alignItems="center">
          <SectionIcon $bgColor="rgba(34, 197, 94, 0.15)" $tone="success">
            <EyeIcon aria-hidden="true" />
          </SectionIcon>
          <Flex direction="column" alignItems="flex-start" gap={1}>
            <Typography variant="delta" fontWeight="bold" tag="h2" id="mm-settings-open-tracking">
              {t('settings.openTracking.title', 'Open Tracking')}
            </Typography>
            <Typography variant="pi" textColor="neutral600">
              {t('settings.openTracking.subtitle', 'Track when recipients open your emails')}
            </Typography>
          </Flex>
        </SectionHeader>
        <SectionContent>
          <SettingRow alignItems="center">
            <SettingInfo>
              <SettingLabel>
                {t('settings.openTracking.label', 'Enable Open Tracking')}
              </SettingLabel>
              <SettingDescription>
                {t(
                  'settings.openTracking.description',
                  'Add an invisible tracking pixel to emails to detect when they are opened. Some email clients block tracking pixels.'
                )}
              </SettingDescription>
            </SettingInfo>
            <SwitchWrapper>
              <Switch
                checked={settings.enableOpenTracking}
                disabled={!canManage}
                onCheckedChange={(checked) => handleChange('enableOpenTracking', checked)}
                aria-label={t('settings.openTracking.label', 'Enable Open Tracking')}
                onLabel={t('settings.switch.on', 'Enabled')}
                offLabel={t('settings.switch.off', 'Disabled')}
                visibleLabels={false}
              />
            </SwitchWrapper>
          </SettingRow>
        </SectionContent>
      </SettingsSection>

      {/* Unsubscribe Section */}
      <SettingsSection tag="section" aria-labelledby="mm-settings-unsubscribe">
        <SectionHeader alignItems="center">
          <SectionIcon $bgColor="rgba(245, 158, 11, 0.15)" $tone="warning">
            <EnvelopeIcon aria-hidden="true" />
          </SectionIcon>
          <Flex direction="column" alignItems="flex-start" gap={1}>
            <Typography variant="delta" fontWeight="bold" tag="h2" id="mm-settings-unsubscribe">
              {t('settings.unsubscribe.title', 'Unsubscribe Settings')}
            </Typography>
            <Typography variant="pi" textColor="neutral600">
              {t(
                'settings.unsubscribe.subtitle',
                'List-Unsubscribe headers for one-click unsubscribe'
              )}
            </Typography>
          </Flex>
        </SectionHeader>
        <SectionContent>
          <SettingRow alignItems="center">
            <SettingInfo>
              <SettingLabel>
                {t('settings.unsubscribe.label', 'Enable List-Unsubscribe Header')}
              </SettingLabel>
              <SettingDescription>
                {t(
                  'settings.unsubscribe.description',
                  'Add RFC 8058 unsubscribe headers to non-marketing emails too. Marketing emails always get them when an unsubscribe URL is known. This enables the Unsubscribe button in clients such as Gmail and Outlook.'
                )}
              </SettingDescription>
            </SettingInfo>
            <SwitchWrapper>
              <Switch
                checked={settings.enableUnsubscribeHeader}
                disabled={!canManage}
                onCheckedChange={(checked) => handleChange('enableUnsubscribeHeader', checked)}
                aria-label={t('settings.unsubscribe.label', 'Enable List-Unsubscribe Header')}
                onLabel={t('settings.switch.on', 'Enabled')}
                offLabel={t('settings.switch.off', 'Disabled')}
                visibleLabels={false}
              />
            </SwitchWrapper>
          </SettingRow>

          {showUnsubscribeUrl && (
            <Box style={{ marginTop: '20px' }}>
              <Field.Root
                name="unsubscribeUrl"
                error={errorMessage(t, errors.unsubscribeUrl)}
                hint={t(
                  'settings.unsubscribeUrl.hint',
                  'Default unsubscribe link (https, http or mailto) used when a send does not pass its own. Without a URL, no List-Unsubscribe header is added.'
                )}
              >
                <Field.Label>{t('settings.unsubscribeUrl.label', 'Unsubscribe URL')}</Field.Label>
                <TextInput
                  type="text"
                  inputMode="url"
                  placeholder="https://example.com/unsubscribe?email={{email}}"
                  value={settings.unsubscribeUrl}
                  onChange={(e) => handleChange('unsubscribeUrl', e.target.value)}
                  disabled={!canManage}
                />
                <Field.Hint />
                <Field.Error />
              </Field.Root>
            </Box>
          )}
        </SectionContent>
      </SettingsSection>

      {/* Default Sender Section */}
      <SettingsSection tag="section" aria-labelledby="mm-settings-sender">
        <SectionHeader alignItems="center">
          <SectionIcon $bgColor="rgba(147, 51, 234, 0.12)" $tone="secondary">
            <UserIcon aria-hidden="true" />
          </SectionIcon>
          <Flex direction="column" alignItems="flex-start" gap={1}>
            <Typography variant="delta" fontWeight="bold" tag="h2" id="mm-settings-sender">
              {t('settings.sender.title', 'Default Sender')}
            </Typography>
            <Typography variant="pi" textColor="neutral600">
              {t(
                'settings.sender.subtitle',
                'Fallback sender information when not specified per email'
              )}
            </Typography>
          </Flex>
        </SectionHeader>
        <SectionContent>
          <Flex direction="column" alignItems="stretch" gap={5}>
            <Field.Root
              name="defaultFromName"
              error={errorMessage(t, errors.defaultFromName)}
              hint={t('settings.fromName.hint', "The sender name shown in recipients' inboxes")}
            >
              <Field.Label>{t('settings.fromName.label', 'Default From Name')}</Field.Label>
              <TextInput
                autoComplete="organization"
                placeholder={t('settings.fromName.placeholder', 'Your Company')}
                value={settings.defaultFromName}
                onChange={(e) => handleChange('defaultFromName', e.target.value)}
                disabled={!canManage}
              />
              <Field.Hint />
              <Field.Error />
            </Field.Root>
            <Field.Root
              name="defaultFromEmail"
              error={errorMessage(t, errors.defaultFromEmail)}
              hint={t(
                'settings.fromEmail.hint',
                "Reference only. Emails are always sent from the selected account's address."
              )}
            >
              <Field.Label>{t('settings.fromEmail.label', 'Default From Email')}</Field.Label>
              <TextInput
                type="email"
                autoComplete="email"
                placeholder="noreply@example.com"
                value={settings.defaultFromEmail}
                onChange={(e) => handleChange('defaultFromEmail', e.target.value)}
                disabled={!canManage}
              />
              <Field.Hint />
              <Field.Error />
            </Field.Root>
          </Flex>
        </SectionContent>
      </SettingsSection>

      {/* Send queue (outbox) */}
      <SettingsSection tag="section" aria-labelledby="mm-settings-queue">
        <SectionHeader alignItems="center">
          <SectionIcon $bgColor="rgba(37, 99, 235, 0.15)" $tone="primary">
            <InboxStackIcon aria-hidden="true" />
          </SectionIcon>
          <Flex direction="column" alignItems="flex-start" gap={1}>
            <Typography variant="delta" fontWeight="bold" tag="h2" id="mm-settings-queue">
              {t('settings.queue.title', 'Retries and outbox')}
            </Typography>
            <Typography variant="pi" textColor="neutral600">
              {t(
                'settings.queue.subtitle',
                'Retry mails that could not be sent, and keep the rest for a decision'
              )}
            </Typography>
          </Flex>
        </SectionHeader>
        <SectionContent>
          <SettingRow alignItems="center">
            <SettingInfo>
              <SettingLabel>{t('settings.queue.capture.label', 'Queue failed sends')}</SettingLabel>
              <SettingDescription>
                {t(
                  'settings.queue.capture.description',
                  'When every account failed and no provider accepted the mail, it is stored in the outbox and retried later. The send then reports success with queued: true, so a caller with its own fallback (for example Magic Link) no longer runs it. Mails whose delivery is uncertain are never re-sent automatically.'
                )}
              </SettingDescription>
            </SettingInfo>
            <SwitchWrapper>
              <Switch
                checked={settings.queueFailedSends}
                disabled={!canManage}
                onCheckedChange={(checked) => handleChange('queueFailedSends', checked)}
                aria-label={t('settings.queue.capture.label', 'Queue failed sends')}
                onLabel={t('settings.switch.on', 'Enabled')}
                offLabel={t('settings.switch.off', 'Disabled')}
                visibleLabels={false}
              />
            </SwitchWrapper>
          </SettingRow>
          <SettingRow alignItems="flex-start" direction="column">
            <Field.Root
              name="queueMaxAttempts"
              width="100%"
              error={errorMessage(t, errors.queueMaxAttempts)}
              hint={t(
                'settings.queue.maxAttempts.hint',
                'Retries per mail after the first try ({min} to {max}). By default the waits are 1, 5 and 15 minutes.',
                { min: QUEUE_MAX_ATTEMPTS_RANGE.min, max: QUEUE_MAX_ATTEMPTS_RANGE.max }
              )}
            >
              <Field.Label>{t('settings.queue.maxAttempts.label', 'Retries per mail')}</Field.Label>
              <NumberInput
                value={settings.queueMaxAttempts}
                onValueChange={(value) => handleChange('queueMaxAttempts', value)}
                step={1}
                disabled={!canManage}
              />
              <Field.Hint />
              <Field.Error />
            </Field.Root>
          </SettingRow>
        </SectionContent>
      </SettingsSection>

      {/* Bounces and recipient checks */}
      <SettingsSection tag="section" aria-labelledby="mm-settings-bounces">
        <SectionHeader alignItems="center">
          <SectionIcon $bgColor="rgba(220, 38, 38, 0.12)" $tone="danger">
            <ShieldExclamationIcon aria-hidden="true" />
          </SectionIcon>
          <Flex direction="column" alignItems="flex-start" gap={1}>
            <Typography variant="delta" fontWeight="bold" tag="h2" id="mm-settings-bounces">
              {t('settings.bounces.title', 'Bounces and recipient checks')}
            </Typography>
            <Typography variant="pi" textColor="neutral600">
              {t(
                'settings.bounces.subtitle',
                'Catch undeliverable addresses before sending, and learn about bounces after sending'
              )}
            </Typography>
          </Flex>
        </SectionHeader>
        <SectionContent>
          <SettingRow alignItems="center">
            <SettingInfo>
              <SettingLabel>
                {t('settings.bounces.domains.label', 'Check recipient domains')}
              </SettingLabel>
              <SettingDescription>
                {t(
                  'settings.bounces.domains.description',
                  'Rejects well-known typo domains such as googelmail.com (with a suggestion) and reserved test domains such as .test or .invalid before sending.'
                )}
              </SettingDescription>
            </SettingInfo>
            <SwitchWrapper>
              <Switch
                checked={settings.checkRecipientDomains}
                disabled={!canManage}
                onCheckedChange={(checked) => handleChange('checkRecipientDomains', checked)}
                aria-label={t('settings.bounces.domains.label', 'Check recipient domains')}
                onLabel={t('settings.switch.on', 'Enabled')}
                offLabel={t('settings.switch.off', 'Disabled')}
                visibleLabels={false}
              />
            </SwitchWrapper>
          </SettingRow>
          <SettingRow alignItems="flex-start" direction="column">
            <Field.Root
              name="allowReservedRecipientDomains"
              width="100%"
              hint={t(
                'settings.bounces.reserved.hint',
                'Automatic allows test domains outside production (NODE_ENV) and rejects them in production.'
              )}
            >
              <Field.Label>
                {t('settings.bounces.reserved.label', 'Test domains (.test, .invalid, .example)')}
              </Field.Label>
              <SingleSelect
                value={
                  settings.allowReservedRecipientDomains === true
                    ? 'allow'
                    : settings.allowReservedRecipientDomains === false
                      ? 'reject'
                      : 'auto'
                }
                disabled={!canManage}
                onChange={(value) =>
                  handleChange(
                    'allowReservedRecipientDomains',
                    value === 'allow' ? true : value === 'reject' ? false : null
                  )
                }
              >
                <SingleSelectOption value="auto">
                  {t('settings.bounces.reserved.auto', 'Automatic')}
                </SingleSelectOption>
                <SingleSelectOption value="allow">
                  {t('settings.bounces.reserved.allow', 'Allow')}
                </SingleSelectOption>
                <SingleSelectOption value="reject">
                  {t('settings.bounces.reserved.reject', 'Reject')}
                </SingleSelectOption>
              </SingleSelect>
              <Field.Hint />
            </Field.Root>
          </SettingRow>
          <SettingRow alignItems="center">
            <SettingInfo>
              <SettingLabel>
                {t('settings.bounces.mx.label', 'Look up mail servers (MX)')}
              </SettingLabel>
              <SettingDescription>
                {t(
                  'settings.bounces.mx.description',
                  'Rejects recipient domains without a mail server. Needs DNS access; lookups time out after 3 seconds and are cached for an hour.'
                )}
              </SettingDescription>
            </SettingInfo>
            <SwitchWrapper>
              <Switch
                checked={settings.verifyRecipientMx}
                disabled={!canManage}
                onCheckedChange={(checked) => handleChange('verifyRecipientMx', checked)}
                aria-label={t('settings.bounces.mx.label', 'Look up mail servers (MX)')}
                onLabel={t('settings.switch.on', 'Enabled')}
                offLabel={t('settings.switch.off', 'Disabled')}
                visibleLabels={false}
              />
            </SwitchWrapper>
          </SettingRow>
          <SettingRow alignItems="center">
            <SettingInfo>
              <SettingLabel>
                {t('settings.bounces.suppress.label', 'Block hard-bounced recipients')}
              </SettingLabel>
              <SettingDescription>
                {t(
                  'settings.bounces.suppress.description',
                  'After a permanent bounce, further emails to that address are rejected until the entry is removed from the list below.'
                )}
              </SettingDescription>
            </SettingInfo>
            <SwitchWrapper>
              <Switch
                checked={settings.suppressHardBounces}
                disabled={!canManage}
                onCheckedChange={(checked) => handleChange('suppressHardBounces', checked)}
                aria-label={t('settings.bounces.suppress.label', 'Block hard-bounced recipients')}
                onLabel={t('settings.switch.on', 'Enabled')}
                offLabel={t('settings.switch.off', 'Disabled')}
                visibleLabels={false}
              />
            </SwitchWrapper>
          </SettingRow>
          <SettingRow alignItems="flex-start" direction="column">
            <Field.Root
              name="bounceMonitorIntervalMinutes"
              width="100%"
              error={errorMessage(t, errors.bounceMonitorIntervalMinutes)}
              hint={t(
                'settings.bounces.interval.hint',
                'How often mailboxes with bounce monitoring are read ({min} to {max} minutes). Turn monitoring on per account.',
                { min: BOUNCE_INTERVAL_RANGE.min, max: BOUNCE_INTERVAL_RANGE.max }
              )}
            >
              <Field.Label>
                {t('settings.bounces.interval.label', 'Bounce check interval (minutes)')}
              </Field.Label>
              <NumberInput
                value={settings.bounceMonitorIntervalMinutes}
                onValueChange={(value) => handleChange('bounceMonitorIntervalMinutes', value)}
                step={1}
                disabled={!canManage}
              />
              <Field.Hint />
              <Field.Error />
            </Field.Root>
          </SettingRow>
          <Box paddingTop={4}>
            <Typography variant="sigma" tag="h3" textColor="neutral600">
              {t('settings.bounces.list.title', 'Suppressed recipients')}
            </Typography>
            <Box paddingTop={3}>
              <SuppressionList canManage={canManage} />
            </Box>
          </Box>
        </SectionContent>
      </SettingsSection>

      <UnsavedChangesDialog guard={guard} />
    </PageContainer>
  );
};

const PluginSettingsPage = () => (
  <Page.Protect permissions={pluginPermissions.read}>
    {/* Page.Main renders <main id="main-content">: the landmark and the target
        of the admin's "Skip to content" link, as on the native settings pages. */}
    <Page.Main>
      <PluginSettingsContent />
    </Page.Main>
  </Page.Protect>
);

export default PluginSettingsPage;

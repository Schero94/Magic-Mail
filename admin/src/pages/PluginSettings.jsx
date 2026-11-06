import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Box,
  Typography,
  Flex,
  Loader,
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
} from '@heroicons/react/24/outline';
import styled, { keyframes, css } from 'styled-components';
import { GradientButton, TertiaryButton } from '../components/StyledButtons';
import { PluginPageTitle } from '../components/shared/Headings';
import { UnsavedChangesDialog } from '../components/shared/UnsavedChangesDialog';
import { motionSafe } from '../components/shared/motion';
import { accent, color, fontSize } from '../utils/theme';
import {
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
  ${motionSafe(css`animation: ${fadeIn} 0.4s ease-out;`)}
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
  font-size: 28px;
  font-weight: 700;
  color: ${color('neutral800')};
  display: block;
  margin: 0;
`;

const PageSubtitle = styled(Typography)`
  font-size: 14px;
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
  gap: 6px;

  @media screen and (max-width: ${mobile}) {
    padding-right: 12px;
  }
`;

const SettingLabel = styled(Typography)`
  font-size: 14px;
  font-weight: 600;
  color: ${color('neutral800')};
  display: block;
`;

const SettingDescription = styled(Typography)`
  font-size: 13px;
  color: ${color('neutral600')};
  line-height: 1.5;
  display: block;
`;

const SwitchWrapper = styled(Box)`
  flex-shrink: 0;
  display: flex;
  align-items: center;
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

  svg {
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
      return t('settings.errors.invalidUrl', 'Enter a valid URL, for example https://api.example.com');
    case 'invalidProtocol':
      return t('settings.errors.invalidProtocol', 'This URL type is not allowed here');
    case 'invalidEmail':
      return t('settings.errors.invalidEmail', 'Enter a valid email address');
    case 'invalidText':
      return t('settings.errors.invalidText', 'Use a single line of at most 1000 characters');
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
   * Fetch plugin settings from API. The form is only shown after a
   * successful load, so stale defaults can never be saved over real values.
   */
  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const response = await get('/magic-mail/settings');
      if (!mounted.current) return;
      const data = response.data?.data;
      if (!data || typeof data !== 'object') throw new Error('Empty settings response');
      const loaded = normalizeSettings(data);
      setInitialSettings(loaded);
      setSettings(loaded);
      setLoadError(null);
    } catch (err) {
      if (!mounted.current) return;
      console.error('[MagicMail] Failed to fetch plugin settings');
      const message = apiErrorMessage(err) || t('settings.loadError', 'Failed to load settings');
      setLoadError(message);
      toggleNotification({ type: 'danger', message });
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [get, t, toggleNotification]);

  /**
   * Save the changed settings only.
   */
  const saveSettings = async () => {
    if (!canManage || !initialSettings || !hasChanges || !isValid) return;
    setSaving(true);
    try {
      const response = await put('/magic-mail/settings', changes);
      const saved = response?.data?.data ? normalizeSettings(response.data.data) : { ...settings, ...changes };
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

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

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
        {t('settings.subtitle', 'Configure email tracking, analytics, and default sender information')}
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
            {t('settings.loadErrorHint', 'Saving is disabled until the current settings have been loaded.')}
          </Typography>
          <TertiaryButton startIcon={<ArrowPathIcon style={ICON_18} aria-hidden="true" />} onClick={fetchSettings}>
            {t('settings.retry', 'Retry')}
          </TertiaryButton>
        </ErrorState>
      </PageContainer>
    );
  }

  const statusText = rbacError
    ? t('common.permissions.loadError', 'Your permissions could not be loaded. Reload the page to try again.')
    : !canManage
      ? t('settings.status.readOnly', 'Read-only access. You need the MagicMail manage permission to change settings.')
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
              {t('settings.linkTracking.subtitle', 'Track when recipients click links in your emails')}
            </Typography>
          </Flex>
        </SectionHeader>
        <SectionContent>
          <SettingRow alignItems="center">
            <SettingInfo>
              <SettingLabel>{t('settings.linkTracking.label', 'Enable Link Tracking')}</SettingLabel>
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
                  <Field.Label>{t('settings.trackingBaseUrl.label', 'Tracking Base URL')}</Field.Label>
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
                <Typography variant="pi" textColor="primary700" fontWeight="medium" style={{ display: 'block' }}>
                  {t('settings.override.title', 'Per-Email Override')}
                </Typography>
                <Typography variant="pi" textColor="primary600" style={{ marginTop: '4px', display: 'block' }}>
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
              <SettingLabel>{t('settings.openTracking.label', 'Enable Open Tracking')}</SettingLabel>
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
              {t('settings.unsubscribe.subtitle', 'List-Unsubscribe headers for one-click unsubscribe')}
            </Typography>
          </Flex>
        </SectionHeader>
        <SectionContent>
          <SettingRow alignItems="center">
            <SettingInfo>
              <SettingLabel>{t('settings.unsubscribe.label', 'Enable List-Unsubscribe Header')}</SettingLabel>
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
              {t('settings.sender.subtitle', 'Fallback sender information when not specified per email')}
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
              hint={t('settings.fromEmail.hint', 'Must be a verified sender address')}
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

      <UnsavedChangesDialog guard={guard} />
    </PageContainer>
  );
};

const PluginSettingsPage = () => (
  <Page.Protect permissions={pluginPermissions.read}>
    <PluginSettingsContent />
  </Page.Protect>
);

export default PluginSettingsPage;

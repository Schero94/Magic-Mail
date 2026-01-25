import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Flex,
  Loader,
  Toggle,
  TextInput,
  Field,
} from '@strapi/design-system';
import { useFetchClient, useNotification } from '@strapi/strapi/admin';
import { 
  ArrowPathIcon,
  UserIcon,
  LinkIcon,
  EyeIcon,
  EnvelopeIcon,
} from '@heroicons/react/24/outline';
import styled, { keyframes, css } from 'styled-components';
import { GradientButton, TertiaryButton } from '../components/StyledButtons';

// ================ ANIMATIONS ================
const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
`;

// ================ STYLED COMPONENTS ================
const PageContainer = styled(Box)`
  ${css`animation: ${fadeIn} 0.4s ease-out;`}
  max-width: 900px;
  margin: 0 auto;
  padding: 40px 32px;
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
  color: ${props => props.theme.colors.neutral800};
  display: block;
`;

const PageSubtitle = styled(Typography)`
  font-size: 14px;
  color: ${props => props.theme.colors.neutral600};
  display: block;
`;

const ActionBar = styled(Flex)`
  margin-bottom: 32px;
  padding: 16px 20px;
  background: ${props => props.theme.colors.neutral0};
  border: 1px solid ${props => props.theme.colors.neutral200};
  border-radius: 8px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
`;

const SettingsSection = styled(Box)`
  background: ${props => props.theme.colors.neutral0};
  border: 1px solid ${props => props.theme.colors.neutral200};
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 24px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
`;

const SectionHeader = styled(Flex)`
  padding: 20px 24px;
  background: ${props => props.theme.colors.neutral100};
  border-bottom: 1px solid ${props => props.theme.colors.neutral200};
`;

const SectionIcon = styled(Box)`
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 16px;
  background: ${props => props.bgColor || '#E0F2FE'};
  flex-shrink: 0;
`;

const SectionContent = styled(Box)`
  padding: 24px;
`;

const SettingRow = styled(Flex)`
  padding: 16px 0;
  border-bottom: 1px solid ${props => props.theme.colors.neutral150};
  
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
  padding-right: 24px;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
`;

const SettingLabel = styled(Typography)`
  font-size: 14px;
  font-weight: 600;
  color: ${props => props.theme.colors.neutral800};
  display: block;
`;

const SettingDescription = styled(Typography)`
  font-size: 13px;
  color: ${props => props.theme.colors.neutral500};
  line-height: 1.5;
  display: block;
`;

const ToggleWrapper = styled(Box)`
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

const InfoBox = styled(Box)`
  background: #EFF6FF;
  border: 1px solid #BFDBFE;
  border-radius: 8px;
  padding: 12px 16px;
  margin-top: 16px;
`;

const CodeSnippet = styled.code`
  background: #1E293B;
  color: #E2E8F0;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-family: 'Monaco', 'Menlo', monospace;
`;

// ================ MAIN COMPONENT ================
const PluginSettingsPage = () => {
  const { get, put } = useFetchClient();
  const { toggleNotification } = useNotification();
  
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState({
    enableLinkTracking: true,
    enableOpenTracking: true,
    trackingBaseUrl: '',
    defaultFromName: '',
    defaultFromEmail: '',
    unsubscribeUrl: '',
    enableUnsubscribeHeader: true,
  });
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);

  /**
   * Fetch plugin settings from API
   */
  const fetchSettings = async () => {
    setLoading(true);
    try {
      const response = await get('/magic-mail/settings');
      if (response.data?.data) {
        setSettings({
          enableLinkTracking: response.data.data.enableLinkTracking ?? true,
          enableOpenTracking: response.data.data.enableOpenTracking ?? true,
          trackingBaseUrl: response.data.data.trackingBaseUrl || '',
          defaultFromName: response.data.data.defaultFromName || '',
          defaultFromEmail: response.data.data.defaultFromEmail || '',
          unsubscribeUrl: response.data.data.unsubscribeUrl || '',
          enableUnsubscribeHeader: response.data.data.enableUnsubscribeHeader ?? true,
        });
        setHasChanges(false);
      }
    } catch (err) {
      console.error('[MagicMail] Error fetching settings:', err);
      toggleNotification({
        type: 'danger',
        message: 'Failed to load settings',
      });
    } finally {
      setLoading(false);
    }
  };

  /**
   * Save plugin settings to API
   */
  const saveSettings = async () => {
    setSaving(true);
    try {
      await put('/magic-mail/settings', settings);
      toggleNotification({
        type: 'success',
        message: 'Settings saved successfully!',
      });
      setHasChanges(false);
    } catch (err) {
      console.error('[MagicMail] Error saving settings:', err);
      toggleNotification({
        type: 'danger',
        message: 'Failed to save settings',
      });
    } finally {
      setSaving(false);
    }
  };

  /**
   * Handle setting change
   */
  const handleChange = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  if (loading) {
    return (
      <PageContainer>
        <LoaderContainer>
          <Loader>Loading settings...</Loader>
        </LoaderContainer>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      {/* Header */}
      <PageHeader>
        <PageTitle>Plugin Settings</PageTitle>
        <PageSubtitle>Configure email tracking, analytics, and default sender information</PageSubtitle>
      </PageHeader>

      {/* Action Bar */}
      <ActionBar justifyContent="space-between" alignItems="center">
        <Typography variant="omega" textColor="neutral600">
          {hasChanges ? 'You have unsaved changes' : 'All changes saved'}
        </Typography>
        <Flex gap={2}>
          <TertiaryButton
            startIcon={<ArrowPathIcon style={{ width: 18, height: 18 }} />}
            onClick={fetchSettings}
          >
            Refresh
          </TertiaryButton>
          <GradientButton
            onClick={saveSettings}
            loading={saving}
            disabled={!hasChanges}
          >
            Save Changes
          </GradientButton>
        </Flex>
      </ActionBar>

      {/* Link Tracking Section */}
      <SettingsSection>
        <SectionHeader alignItems="center">
          <SectionIcon bgColor="#DBEAFE">
            <LinkIcon style={{ width: 22, height: 22, color: '#2563EB' }} />
          </SectionIcon>
          <Flex direction="column" alignItems="flex-start" gap={1}>
            <Typography variant="delta" fontWeight="bold">Link Tracking</Typography>
            <Typography variant="pi" textColor="neutral600">
              Track when recipients click links in your emails
            </Typography>
          </Flex>
        </SectionHeader>
        <SectionContent>
          <SettingRow alignItems="center">
            <SettingInfo>
              <SettingLabel>Enable Link Tracking</SettingLabel>
              <SettingDescription>
                Rewrite all links in outgoing emails to track click-through rates. 
                This helps measure email engagement and campaign effectiveness.
              </SettingDescription>
            </SettingInfo>
            <ToggleWrapper>
              <Toggle
                checked={settings.enableLinkTracking}
                onChange={(e) => handleChange('enableLinkTracking', e.target.checked)}
              />
            </ToggleWrapper>
          </SettingRow>
          
          {settings.enableLinkTracking && (
            <>
              <Box style={{ marginTop: '20px' }}>
                <Field.Root>
                  <Field.Label>Tracking Base URL</Field.Label>
                  <TextInput
                    placeholder="https://api.yoursite.com"
                    value={settings.trackingBaseUrl}
                    onChange={(e) => handleChange('trackingBaseUrl', e.target.value)}
                    style={{ marginTop: '8px' }}
                  />
                  <Field.Hint style={{ marginTop: '8px' }}>
                    The base URL for tracking links. Leave empty to use the server URL.
                    Must be the public URL where your Strapi API is accessible.
                  </Field.Hint>
                </Field.Root>
              </Box>
              
              <InfoBox>
                <Typography variant="pi" textColor="primary700" fontWeight="medium">
                  Per-Email Override
                </Typography>
                <Typography variant="pi" textColor="primary600" style={{ marginTop: '4px' }}>
                  Disable tracking for sensitive emails (password resets, magic links) by passing{' '}
                  <CodeSnippet>skipLinkTracking: true</CodeSnippet> when sending.
                </Typography>
              </InfoBox>
            </>
          )}
        </SectionContent>
      </SettingsSection>

      {/* Open Tracking Section */}
      <SettingsSection>
        <SectionHeader alignItems="center">
          <SectionIcon bgColor="#DCFCE7">
            <EyeIcon style={{ width: 22, height: 22, color: '#16A34A' }} />
          </SectionIcon>
          <Flex direction="column" alignItems="flex-start" gap={1}>
            <Typography variant="delta" fontWeight="bold">Open Tracking</Typography>
            <Typography variant="pi" textColor="neutral600">
              Track when recipients open your emails
            </Typography>
          </Flex>
        </SectionHeader>
        <SectionContent>
          <SettingRow alignItems="center">
            <SettingInfo>
              <SettingLabel>Enable Open Tracking</SettingLabel>
              <SettingDescription>
                Inject an invisible tracking pixel into emails to detect when they are opened. 
                Note: Some email clients block tracking pixels.
              </SettingDescription>
            </SettingInfo>
            <ToggleWrapper>
              <Toggle
                checked={settings.enableOpenTracking}
                onChange={(e) => handleChange('enableOpenTracking', e.target.checked)}
              />
            </ToggleWrapper>
          </SettingRow>
        </SectionContent>
      </SettingsSection>

      {/* Unsubscribe Section */}
      <SettingsSection>
        <SectionHeader alignItems="center">
          <SectionIcon bgColor="#FEF3C7">
            <EnvelopeIcon style={{ width: 22, height: 22, color: '#D97706' }} />
          </SectionIcon>
          <Flex direction="column" alignItems="flex-start" gap={1}>
            <Typography variant="delta" fontWeight="bold">Unsubscribe Settings</Typography>
            <Typography variant="pi" textColor="neutral600">
              GDPR-compliant List-Unsubscribe headers
            </Typography>
          </Flex>
        </SectionHeader>
        <SectionContent>
          <SettingRow alignItems="center">
            <SettingInfo>
              <SettingLabel>Enable List-Unsubscribe Header</SettingLabel>
              <SettingDescription>
                Add RFC 8058 compliant unsubscribe headers. This enables the "Unsubscribe" 
                button in email clients like Gmail and Outlook.
              </SettingDescription>
            </SettingInfo>
            <ToggleWrapper>
              <Toggle
                checked={settings.enableUnsubscribeHeader}
                onChange={(e) => handleChange('enableUnsubscribeHeader', e.target.checked)}
              />
            </ToggleWrapper>
          </SettingRow>
          
          {settings.enableUnsubscribeHeader && (
            <Box style={{ marginTop: '20px' }}>
              <Field.Root>
                <Field.Label>Unsubscribe URL</Field.Label>
                <TextInput
                  placeholder="https://yoursite.com/unsubscribe?email={{email}}"
                  value={settings.unsubscribeUrl}
                  onChange={(e) => handleChange('unsubscribeUrl', e.target.value)}
                  style={{ marginTop: '8px' }}
                />
                <Field.Hint style={{ marginTop: '8px' }}>
                  The URL where users are directed when clicking unsubscribe. 
                  Leave empty to disable the header.
                </Field.Hint>
              </Field.Root>
            </Box>
          )}
        </SectionContent>
      </SettingsSection>

      {/* Default Sender Section */}
      <SettingsSection>
        <SectionHeader alignItems="center">
          <SectionIcon bgColor="#F3E8FF">
            <UserIcon style={{ width: 22, height: 22, color: '#9333EA' }} />
          </SectionIcon>
          <Flex direction="column" alignItems="flex-start" gap={1}>
            <Typography variant="delta" fontWeight="bold">Default Sender</Typography>
            <Typography variant="pi" textColor="neutral600">
              Fallback sender information when not specified per email
            </Typography>
          </Flex>
        </SectionHeader>
        <SectionContent>
          <Box>
            <Field.Root style={{ marginBottom: '20px' }}>
              <Field.Label>Default From Name</Field.Label>
              <TextInput
                placeholder="Your Company"
                value={settings.defaultFromName}
                onChange={(e) => handleChange('defaultFromName', e.target.value)}
                style={{ marginTop: '8px' }}
              />
              <Field.Hint style={{ marginTop: '8px' }}>
                The sender name shown in recipients' inboxes
              </Field.Hint>
            </Field.Root>
            <Field.Root>
              <Field.Label>Default From Email</Field.Label>
              <TextInput
                placeholder="noreply@yourcompany.com"
                value={settings.defaultFromEmail}
                onChange={(e) => handleChange('defaultFromEmail', e.target.value)}
                style={{ marginTop: '8px' }}
              />
              <Field.Hint style={{ marginTop: '8px' }}>
                Must be a verified sender address
              </Field.Hint>
            </Field.Root>
          </Box>
        </SectionContent>
      </SettingsSection>
    </PageContainer>
  );
};

export default PluginSettingsPage;

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Badge,
  Flex,
  Alert,
  Loader,
  Accordion,
} from '@strapi/design-system';
import { useFetchClient, useNotification } from '@strapi/strapi/admin';
import { 
  ArrowPathIcon,
  UserIcon,
  ShieldCheckIcon,
  SparklesIcon,
  ChartBarIcon,
  DocumentDuplicateIcon,
  ArrowDownTrayIcon,
} from '@heroicons/react/24/outline';
import styled, { keyframes, css } from 'styled-components';
import { SecondaryButton, WhiteOutlineButton } from '../components/StyledButtons';

// ================ ANIMATIONS ================
const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
`;

const shimmer = keyframes`
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
`;

// ================ STYLED COMPONENTS ================
const Container = styled(Box)`
  ${css`animation: ${fadeIn} 0.5s;`}
  max-width: 1400px;
  margin: 0 auto;
`;

const StickySaveBar = styled(Box)`
  position: sticky;
  top: 0;
  z-index: 10;
  background: ${props => props.theme.colors.neutral0};
  border-bottom: 1px solid ${props => props.theme.colors.neutral200};
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
`;

const LicenseKeyBanner = styled(Box)`
  background: linear-gradient(135deg, #0EA5E9 0%, #A855F7 100%);
  border-radius: 12px;
  padding: 28px 32px;
  color: white;
  position: relative;
  overflow: hidden;
  box-shadow: 0 4px 20px rgba(14, 165, 233, 0.25);
  margin-bottom: 24px;
  
  &::after {
    content: '';
    position: absolute;
    top: -50%;
    right: -50%;
    width: 200%;
    height: 200%;
    background: linear-gradient(
      45deg,
      transparent,
      rgba(255, 255, 255, 0.08),
      transparent
    );
    ${css`animation: ${shimmer} 3s infinite;`}
    pointer-events: none;
    z-index: 0;
  }
  
  & > * {
    position: relative;
    z-index: 1;
  }
`;

const LoaderContainer = styled(Flex)`
  min-height: 400px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 16px;
`;


// ================ MAIN COMPONENT ================
const LicenseDetailsPage = () => {
  const { get } = useFetchClient();
  const { toggleNotification } = useNotification();
  const [loading, setLoading] = useState(true);
  const [licenseData, setLicenseData] = useState(null);
  const [error, setError] = useState(null);

  /**
   * Fetch license status from API
   */
  const fetchLicenseStatus = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await get('/magic-mail/license/status');
      setLicenseData(response.data);
    } catch (err) {
      console.error('[MagicMail] Error fetching license:', err);
      setError('Failed to load license information');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Copy license key to clipboard
   */
  const handleCopyLicenseKey = async () => {
    try {
      await navigator.clipboard.writeText(licenseData?.data?.licenseKey || '');
      toggleNotification({
        type: 'success',
        message: 'License key copied to clipboard!',
      });
    } catch (err) {
      toggleNotification({
        type: 'danger',
        message: 'Failed to copy license key',
      });
    }
  };

  /**
   * Download license key as text file
   */
  const handleDownloadLicenseKey = () => {
    try {
      const data = licenseData?.data || {};
      const licenseKey = data.licenseKey || '';
      const email = data.email || 'N/A';
      const firstName = data.firstName || '';
      const lastName = data.lastName || '';
      const fullName = `${firstName} ${lastName}`.trim() || 'N/A';
      
      const content = `MagicMail - Email Business Suite - License Key
===============================================

License Key: ${licenseKey}

License Holder Information:
----------------------------------------------
Name:        ${fullName}
Email:       ${email}

License Status:
----------------------------------------------
Status:      ${data.isActive ? 'ACTIVE' : 'INACTIVE'}
Expires:     ${data.expiresAt ? new Date(data.expiresAt).toLocaleDateString() : 'Never'}

Features:
----------------------------------------------
Premium:     ${data.features?.premium ? 'Enabled' : 'Disabled'}
Advanced:    ${data.features?.advanced ? 'Enabled' : 'Disabled'}
Enterprise:  ${data.features?.enterprise ? 'Enabled' : 'Disabled'}

===============================================
Generated:   ${new Date().toLocaleString()}
`;
      
      const blob = new Blob([content], { type: 'text/plain' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `magicmail-license-${licenseKey.substring(0, 8)}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toggleNotification({
        type: 'success',
        message: 'License key downloaded successfully!',
      });
    } catch (err) {
      toggleNotification({
        type: 'danger',
        message: 'Failed to download license key',
      });
    }
  };

  useEffect(() => {
    fetchLicenseStatus();
  }, []);

  if (loading) {
    return (
      <Container>
        <LoaderContainer>
          <Loader>Loading license information...</Loader>
        </LoaderContainer>
      </Container>
    );
  }

  if (error) {
    return (
      <Container>
        <Box padding={8}>
          <Alert variant="danger" title="Error" closeLabel="Close">
            {error}
          </Alert>
        </Box>
      </Container>
    );
  }

  const isValid = licenseData?.valid;
  const isDemo = licenseData?.demo;
  const data = licenseData?.data || {};

  return (
    <Container>
      {/* Sticky Header */}
      <StickySaveBar paddingTop={5} paddingBottom={5} paddingLeft={6} paddingRight={6}>
        <Flex justifyContent="space-between" alignItems="flex-start">
          <Flex direction="column" gap={1} alignItems="flex-start">
            <Typography variant="alpha" fontWeight="bold">
              License Management
            </Typography>
            <Typography variant="epsilon" textColor="neutral600">
              View your MagicMail plugin license
            </Typography>
          </Flex>
          <SecondaryButton
            startIcon={<ArrowPathIcon style={{ width: 18, height: 18 }} />}
            onClick={fetchLicenseStatus}
          >
            Refresh Status
          </SecondaryButton>
        </Flex>
      </StickySaveBar>

      {/* Content */}
      <Box paddingTop={6} paddingLeft={6} paddingRight={6} paddingBottom={10}>
        {/* Status Alert */}
        {isDemo ? (
          <Alert variant="warning" title="Demo Mode" closeLabel="Close">
            You're using the demo version. Create a license to unlock all features.
          </Alert>
        ) : isValid ? (
          <Alert variant="success" title="License Active" closeLabel="Close">
            Your license is active and all features are unlocked.
          </Alert>
        ) : (
          <Alert variant="danger" title="License Issue" closeLabel="Close">
            There's an issue with your license. Please check your license status.
          </Alert>
        )}

        {/* License Key */}
        {data.licenseKey && (
          <Box marginTop={6}>
            <LicenseKeyBanner>
              <Flex justifyContent="space-between" alignItems="flex-start">
                <Box style={{ flex: 1 }}>
                  <Typography variant="pi" style={{ color: 'rgba(255,255,255,0.8)', marginBottom: '12px', textTransform: 'uppercase', fontSize: '11px', letterSpacing: '0.5px', display: 'block' }}>
                    License Key
                  </Typography>
                  <Typography style={{ color: 'white', fontFamily: 'monospace', fontSize: '28px', fontWeight: 'bold', wordBreak: 'break-all', marginBottom: '16px' }}>
                    {data.licenseKey}
                  </Typography>
                  <Flex gap={2}>
                    <WhiteOutlineButton
                      onClick={handleCopyLicenseKey}
                      startIcon={<DocumentDuplicateIcon style={{ width: 16, height: 16 }} />}
                      size="S"
                    >
                      Copy Key
                    </WhiteOutlineButton>
                    <WhiteOutlineButton
                      onClick={handleDownloadLicenseKey}
                      startIcon={<ArrowDownTrayIcon style={{ width: 16, height: 16 }} />}
                      size="S"
                    >
                      Download as TXT
                    </WhiteOutlineButton>
                  </Flex>
                </Box>
                <Badge
                  backgroundColor={data.isActive ? "success100" : "danger100"}
                  textColor={data.isActive ? "success700" : "danger700"}
                  style={{ fontSize: '11px', fontWeight: '700', padding: '6px 12px', marginLeft: '16px', flexShrink: 0 }}
                >
                  {data.isActive ? 'ACTIVE' : 'INACTIVE'}
                </Badge>
              </Flex>
            </LicenseKeyBanner>
          </Box>
        )}

        {/* Details Section */}
        <Box marginTop={6}>
          <Accordion.Root defaultValue="account" collapsible>
            {/* Account Information */}
            <Accordion.Item value="account">
              <Accordion.Header>
                <Accordion.Trigger icon={() => <UserIcon style={{ width: 16, height: 16 }} />}>
                  Account Information
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Content>
                <Box padding={6}>
                  <Flex gap={8} wrap="wrap">
                    <Box style={{ flex: '1', minWidth: '200px' }}>
                      <Typography variant="sigma" textColor="neutral600" textTransform="uppercase" style={{ marginBottom: '8px', display: 'block' }}>
                        Email Address
                      </Typography>
                      <Typography variant="omega" fontWeight="semiBold">
                        {data.email || 'Not provided'}
                      </Typography>
                    </Box>
                    <Box style={{ flex: '1', minWidth: '200px' }}>
                      <Typography variant="sigma" textColor="neutral600" textTransform="uppercase" style={{ marginBottom: '8px', display: 'block' }}>
                        License Holder
                      </Typography>
                      <Typography variant="omega" fontWeight="semiBold">
                        {data.firstName && data.lastName 
                          ? `${data.firstName} ${data.lastName}`
                          : 'Not specified'
                        }
                      </Typography>
                    </Box>
                  </Flex>
                </Box>
              </Accordion.Content>
            </Accordion.Item>

            {/* License Details */}
            <Accordion.Item value="details">
              <Accordion.Header>
                <Accordion.Trigger icon={() => <ShieldCheckIcon style={{ width: 16, height: 16 }} />}>
                  License Details
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Content>
                <Box padding={6}>
                  <Flex gap={8} wrap="wrap">
                    <Box style={{ flex: '1', minWidth: '180px' }}>
                      <Typography variant="sigma" textColor="neutral600" textTransform="uppercase" style={{ marginBottom: '8px', display: 'block' }}>
                        {data.isExpired ? 'Expired On' : 'Expires On'}
                      </Typography>
                      <Typography variant="omega" fontWeight="semiBold">
                        {data.expiresAt 
                          ? new Date(data.expiresAt).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                            })
                          : 'Never'}
                      </Typography>
                    </Box>
                    <Box style={{ flex: '1', minWidth: '180px' }}>
                      <Typography variant="sigma" textColor="neutral600" textTransform="uppercase" style={{ marginBottom: '8px', display: 'block' }}>
                        Device Name
                      </Typography>
                      <Typography variant="omega" fontWeight="semiBold">
                        {data.deviceName || 'Unknown'}
                      </Typography>
                    </Box>
                    <Box style={{ flex: '1', minWidth: '180px' }}>
                      <Typography variant="sigma" textColor="neutral600" textTransform="uppercase" style={{ marginBottom: '8px', display: 'block' }}>
                        IP Address
                      </Typography>
                      <Typography variant="omega" fontWeight="semiBold">
                        {data.ipAddress || 'Not detected'}
                      </Typography>
                    </Box>
                  </Flex>
                </Box>
              </Accordion.Content>
            </Accordion.Item>

            {/* Features */}
            <Accordion.Item value="features">
              <Accordion.Header>
                <Accordion.Trigger icon={() => <SparklesIcon style={{ width: 16, height: 16 }} />}>
                  Features & Capabilities
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Content>
                <Box padding={6}>
                  {/* Feature Tier Badges */}
                  <Flex gap={3} style={{ marginBottom: '32px' }}>
                    <Badge
                      backgroundColor={data.features?.premium ? "success100" : "neutral100"}
                      textColor={data.features?.premium ? "success700" : "neutral600"}
                      style={{ fontSize: '13px', fontWeight: '700', padding: '8px 16px' }}
                    >
                      {data.features?.premium ? '[OK]' : '[X]'} PREMIUM
                    </Badge>
                    <Badge
                      backgroundColor={data.features?.advanced ? "primary100" : "neutral100"}
                      textColor={data.features?.advanced ? "primary700" : "neutral600"}
                      style={{ fontSize: '13px', fontWeight: '700', padding: '8px 16px' }}
                    >
                      {data.features?.advanced ? '[OK]' : '[X]'} ADVANCED
                    </Badge>
                    <Badge
                      backgroundColor={data.features?.enterprise ? "secondary100" : "neutral100"}
                      textColor={data.features?.enterprise ? "secondary700" : "neutral600"}
                      style={{ fontSize: '13px', fontWeight: '700', padding: '8px 16px' }}
                    >
                      {data.features?.enterprise ? '[OK]' : '[X]'} ENTERPRISE
                    </Badge>
                  </Flex>
                  
                  {/* Premium Features */}
                  {data.features?.premium && (
                    <Box marginBottom={5} padding={5} background="success50" hasRadius>
                      <Typography variant="delta" fontWeight="bold" textColor="success700" style={{ marginBottom: '16px' }}>
                        Premium Features Active
                      </Typography>
                      <Flex direction="column" gap={2}>
                        <Typography variant="omega" textColor="success700">[OK] Gmail OAuth 2.0</Typography>
                        <Typography variant="omega" textColor="success700">[OK] Microsoft 365 OAuth</Typography>
                        <Typography variant="omega" textColor="success700">[OK] Smart Routing Rules</Typography>
                        <Typography variant="omega" textColor="success700">[OK] Email Analytics</Typography>
                      </Flex>
                    </Box>
                  )}
                  
                  {/* Advanced Features */}
                  {data.features?.advanced && (
                    <Box marginBottom={5} padding={5} background="primary50" hasRadius>
                      <Typography variant="delta" fontWeight="bold" textColor="primary700" style={{ marginBottom: '16px' }}>
                        Advanced Features Active
                      </Typography>
                      <Flex direction="column" gap={2}>
                        <Typography variant="omega" textColor="primary700">[OK] DKIM Signing</Typography>
                        <Typography variant="omega" textColor="primary700">[OK] Email Designer</Typography>
                        <Typography variant="omega" textColor="primary700">[OK] List-Unsubscribe Headers</Typography>
                      </Flex>
                    </Box>
                  )}
                  
                  {/* Enterprise Features */}
                  {data.features?.enterprise && (
                    <Box padding={5} background="secondary50" hasRadius>
                      <Typography variant="delta" fontWeight="bold" textColor="secondary700" style={{ marginBottom: '16px' }}>
                        Enterprise Features Active
                      </Typography>
                      <Flex direction="column" gap={2}>
                        <Typography variant="omega" textColor="secondary700">[OK] Multi-tenant Management</Typography>
                        <Typography variant="omega" textColor="secondary700">[OK] Compliance Reports</Typography>
                        <Typography variant="omega" textColor="secondary700">[OK] Priority Support</Typography>
                      </Flex>
                    </Box>
                  )}
                </Box>
              </Accordion.Content>
            </Accordion.Item>

            {/* System Status */}
            <Accordion.Item value="status">
              <Accordion.Header>
                <Accordion.Trigger icon={() => <ChartBarIcon style={{ width: 16, height: 16 }} />}>
                  System Status
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Content>
                <Box padding={6}>
                  <Flex gap={8} wrap="wrap">
                    <Box style={{ flex: '1', minWidth: '150px' }}>
                      <Typography variant="sigma" textColor="neutral600" textTransform="uppercase" style={{ marginBottom: '8px', display: 'block' }}>
                        License Status
                      </Typography>
                      <Typography variant="omega" fontWeight="semiBold">
                        {data.isActive ? 'Active' : 'Inactive'}
                      </Typography>
                    </Box>
                    <Box style={{ flex: '1', minWidth: '150px' }}>
                      <Typography variant="sigma" textColor="neutral600" textTransform="uppercase" style={{ marginBottom: '8px', display: 'block' }}>
                        Connection
                      </Typography>
                      <Typography variant="omega" fontWeight="semiBold">
                        {data.isOnline ? 'Online' : 'Offline'}
                      </Typography>
                    </Box>
                    <Box style={{ flex: '1', minWidth: '150px' }}>
                      <Typography variant="sigma" textColor="neutral600" textTransform="uppercase" style={{ marginBottom: '8px', display: 'block' }}>
                        Last Sync
                      </Typography>
                      <Typography variant="omega" fontWeight="semiBold">
                        {data.lastPingAt 
                          ? new Date(data.lastPingAt).toLocaleTimeString()
                          : 'Never'}
                      </Typography>
                    </Box>
                    <Box style={{ flex: '1', minWidth: '150px' }}>
                      <Typography variant="sigma" textColor="neutral600" textTransform="uppercase" style={{ marginBottom: '8px', display: 'block' }}>
                        Device Limit
                      </Typography>
                      <Typography variant="omega" fontWeight="semiBold">
                        {data.currentDevices || 0} / {data.maxDevices || 1}
                      </Typography>
                    </Box>
                  </Flex>
                </Box>
              </Accordion.Content>
            </Accordion.Item>
          </Accordion.Root>
        </Box>
      </Box>
    </Container>
  );
};

export default LicenseDetailsPage;

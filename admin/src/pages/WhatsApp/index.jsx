import React, { useState, useEffect, useCallback } from 'react';
import styled, { keyframes, css } from 'styled-components';
import {
  Box,
  Flex,
  Typography,
  Loader,
  Badge,
  Divider,
} from '@strapi/design-system';
import { useFetchClient, useNotification } from '@strapi/strapi/admin';
import { Check, Cross, ArrowRight, ArrowLeft, Play, ArrowClockwise } from '@strapi/icons';
import { GradientButton, SecondaryButton, TertiaryButton, DangerButton } from '../../components/StyledButtons';
import { theme } from '../../utils/theme';

// ============= ANIMATIONS =============
const fadeIn = keyframes`
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

const pulse = keyframes`
  0%, 100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.05);
  }
`;

const spin = keyframes`
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
`;

// ============= COLORS =============
const colors = {
  whatsapp: '#25D366',
  whatsappDark: '#128C7E',
  whatsappLight: '#DCF8C6',
  primary: '#4945ff',
  primaryLight: '#f0f0ff',
  success: '#5cb176',
  successLight: '#eafaf1',
  danger: '#d02b20',
  dangerLight: '#fcecea',
  neutral: '#8e8ea9',
  neutralLight: '#f6f6f9',
  white: '#ffffff',
  border: '#dcdce4',
  text: '#32324d',
  textLight: '#666687',
};

// ============= STYLED COMPONENTS =============
const PageContainer = styled(Box)`
  padding: 40px;
  max-width: 900px;
  margin: 0 auto;
  animation: ${fadeIn} 0.4s ease;
`;

const HeaderSection = styled(Box)`
  text-align: center;
  margin-bottom: 48px;
`;

const WhatsAppLogo = styled.div`
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: linear-gradient(135deg, ${colors.whatsapp}, ${colors.whatsappDark});
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 24px;
  box-shadow: 0 8px 32px ${colors.whatsapp}40;
`;

const PhoneIcon = styled.div`
  width: 40px;
  height: 40px;
  color: white;
  font-size: 32px;
`;

const StepperContainer = styled(Box)`
  display: flex;
  align-items: flex-start;
  justify-content: center;
  gap: 0;
  margin-bottom: 48px;
  position: relative;
  padding: 0 40px;
`;

const StepWrapper = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  
  &:not(:last-child)::after {
    content: '';
    position: absolute;
    top: 28px;
    left: 50%;
    width: 100%;
    height: 3px;
    background: ${props => props.$completed ? colors.success : colors.neutralLight};
    transition: all 0.4s ease;
    z-index: 0;
  }
`;

const StepDot = styled.div`
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: ${props => 
    props.$active ? colors.whatsapp : 
    props.$completed ? colors.success : 
    colors.white
  };
  color: ${props => 
    props.$active || props.$completed ? colors.white : colors.textLight
  };
  border: 4px solid ${props =>
    props.$active ? colors.whatsapp :
    props.$completed ? colors.success :
    colors.border
  };
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 18px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  z-index: 1;
  cursor: ${props => props.$completed ? 'pointer' : 'default'};
  box-shadow: ${props => 
    props.$active ? `0 4px 16px ${colors.whatsapp}40, 0 0 0 8px ${colors.whatsappLight}` :
    props.$completed ? `0 4px 12px ${colors.success}30` :
    '0 2px 8px rgba(0,0,0,0.08)'
  };
  
  ${props => props.$active && css`
    animation: ${pulse} 2s infinite;
  `}
  
  &:hover {
    transform: ${props => props.$completed ? 'scale(1.1)' : props.$active ? 'scale(1.05)' : 'scale(1)'};
  }
`;

const StepLabel = styled(Typography)`
  margin-top: 12px;
  font-size: 13px;
  color: ${props => props.$active ? colors.whatsapp : props.$completed ? colors.success : colors.textLight};
  white-space: nowrap;
  font-weight: ${props => props.$active ? 600 : 500};
  text-align: center;
  transition: all 0.3s ease;
`;

const ContentCard = styled(Box)`
  background: ${colors.white};
  border: 1px solid ${colors.border};
  border-radius: 16px;
  padding: 32px;
  margin-bottom: 24px;
  animation: ${fadeIn} 0.4s ease;
  box-shadow: 0 4px 24px rgba(0,0,0,0.06);
`;

const QRCodeContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32px;
  background: ${colors.neutralLight};
  border-radius: 16px;
  margin: 24px 0;
`;

const QRImage = styled.img`
  width: 280px;
  height: 280px;
  border-radius: 12px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.1);
`;

const StatusBadge = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 20px;
  font-weight: 600;
  font-size: 14px;
  background: ${props => {
    switch (props.$status) {
      case 'connected': return colors.successLight;
      case 'connecting': return colors.primaryLight;
      case 'qr_pending': return colors.whatsappLight;
      case 'disconnected': return colors.neutralLight;
      default: return colors.neutralLight;
    }
  }};
  color: ${props => {
    switch (props.$status) {
      case 'connected': return colors.success;
      case 'connecting': return colors.primary;
      case 'qr_pending': return colors.whatsappDark;
      case 'disconnected': return colors.neutral;
      default: return colors.neutral;
    }
  }};
`;

const SpinningLoader = styled.div`
  width: 20px;
  height: 20px;
  border: 2px solid ${colors.primary}40;
  border-top-color: ${colors.primary};
  border-radius: 50%;
  animation: ${spin} 1s linear infinite;
`;

const ConnectedCard = styled(Box)`
  background: linear-gradient(135deg, ${colors.successLight}, ${colors.whatsappLight});
  border: 2px solid ${colors.success};
  border-radius: 16px;
  padding: 32px;
  text-align: center;
`;

const InfoBox = styled(Box)`
  background: linear-gradient(135deg, ${theme.colors.primary[50]} 0%, ${colors.whatsappLight} 100%);
  border: 1px solid ${theme.colors.primary[200]};
  border-radius: 12px;
  padding: 24px;
  margin: 20px 0;
`;

const TestSection = styled(Box)`
  background: linear-gradient(135deg, ${colors.whatsappLight} 0%, #E8F5E9 100%);
  border: 1px solid ${colors.whatsapp}40;
  border-radius: 16px;
  padding: 24px;
  margin-top: 24px;
`;

const WhatsAppInput = styled.input`
  width: 100%;
  padding: 14px 16px;
  border: 2px solid ${props => props.theme.colors.neutral200};
  border-radius: 12px;
  font-size: 15px;
  background: white;
  color: ${props => props.theme.colors.neutral800};
  transition: all 0.2s ease;
  box-sizing: border-box;
  
  &:focus {
    outline: none;
    border-color: ${colors.whatsapp};
    box-shadow: 0 0 0 3px ${colors.whatsapp}20;
  }
  
  &::placeholder {
    color: ${props => props.theme.colors.neutral400};
  }
`;

const WhatsAppTextarea = styled.textarea`
  width: 100%;
  padding: 14px 16px;
  border: 2px solid ${props => props.theme.colors.neutral200};
  border-radius: 12px;
  font-size: 15px;
  background: white;
  color: ${props => props.theme.colors.neutral800};
  transition: all 0.2s ease;
  box-sizing: border-box;
  resize: vertical;
  min-height: 80px;
  font-family: inherit;
  
  &:focus {
    outline: none;
    border-color: ${colors.whatsapp};
    box-shadow: 0 0 0 3px ${colors.whatsapp}20;
  }
  
  &::placeholder {
    color: ${props => props.theme.colors.neutral400};
  }
`;

const InputLabel = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: ${colors.whatsappDark};
  margin-bottom: 8px;
`;

const InputHint = styled.span`
  font-size: 12px;
  color: ${props => props.theme.colors.neutral500};
  margin-top: 6px;
  display: block;
`;

const PhoneSymbol = styled.span`
  font-size: 16px;
  font-weight: 700;
`;

const MessageSymbol = styled.span`
  font-size: 16px;
`;

const UseCaseCard = styled(Box)`
  background: linear-gradient(135deg, ${colors.whatsappLight}, ${theme.colors.primary[50]});
  border: 2px solid ${colors.whatsapp};
  border-radius: 16px;
  padding: 24px;
  margin-bottom: 32px;
`;

const ButtonRow = styled(Flex)`
  margin-top: 32px;
  padding-top: 24px;
  border-top: 1px solid ${props => props.theme.colors.neutral200};
`;

const AlertBox = styled(Box)`
  background: ${theme.colors.primary[50]};
  border: 1px solid ${theme.colors.primary[200]};
  border-radius: 12px;
  padding: 16px 20px;
  margin-top: 20px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
`;

const AlertIcon = styled.div`
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: ${theme.colors.primary[500]};
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: bold;
  flex-shrink: 0;
`;

const SuccessBox = styled(Box)`
  background: ${theme.colors.success[50]};
  border: 1px solid ${theme.colors.success[200]};
  border-radius: 12px;
  padding: 16px 20px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
`;

const SuccessIcon = styled.div`
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: ${theme.colors.success[500]};
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`;

const WhatsAppButton = styled(GradientButton)`
  && {
    background: linear-gradient(135deg, ${colors.whatsapp} 0%, ${colors.whatsappDark} 100%) !important;
    
    &:hover:not(:disabled) {
      background: linear-gradient(135deg, ${colors.whatsappDark} 0%, ${colors.whatsapp} 100%) !important;
    }
  }
`;

const NotInstalledCard = styled(Box)`
  background: linear-gradient(135deg, #FEF3C7, #FEE2E2);
  border: 2px solid #F59E0B;
  border-radius: 16px;
  padding: 32px;
  text-align: center;
`;

// ============= COMPONENT =============
const WhatsAppPage = () => {
  const { get, post } = useFetchClient();
  const { toggleNotification } = useNotification();
  
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [isAvailable, setIsAvailable] = useState(false);
  const [status, setStatus] = useState({
    status: 'disconnected',
    qrCode: null,
    isConnected: false,
    session: null,
  });
  
  const [testPhone, setTestPhone] = useState('');
  const [testMessage, setTestMessage] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  
  const stepTitles = ['Check Installation', 'Connect WhatsApp', 'Scan QR Code', 'Ready to Use'];

  /**
   * Check if WhatsApp/Baileys is available
   */
  const checkAvailability = useCallback(async () => {
    try {
      const { data } = await get('/magic-mail/whatsapp/available');
      setIsAvailable(data.data.available);
      return data.data.available;
    } catch (error) {
      console.error('[MagicMail WhatsApp] Error checking availability:', error);
      setIsAvailable(false);
      return false;
    }
  }, [get]);

  /**
   * Fetch current WhatsApp status
   */
  const fetchStatus = useCallback(async () => {
    try {
      const { data } = await get('/magic-mail/whatsapp/status');
      setStatus(data.data);
      
      // Auto-advance steps based on status
      if (data.data.isConnected) {
        setCurrentStep(4);
      } else if (data.data.qrCode) {
        setCurrentStep(3);
      } else if (isAvailable) {
        setCurrentStep(2);
      }
      
      return data.data;
    } catch (error) {
      console.error('[MagicMail WhatsApp] Error fetching status:', error);
      return null;
    }
  }, [get, isAvailable]);

  /**
   * Initial load
   */
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      const available = await checkAvailability();
      if (available) {
        await fetchStatus();
      }
      setLoading(false);
    };
    init();
  }, [checkAvailability, fetchStatus]);

  /**
   * Poll for status updates when connecting
   */
  useEffect(() => {
    let pollInterval;
    
    if (connecting || status.status === 'connecting' || status.status === 'qr_pending') {
      pollInterval = setInterval(async () => {
        const newStatus = await fetchStatus();
        if (newStatus?.isConnected) {
          setConnecting(false);
          setCurrentStep(4);
          toggleNotification({
            type: 'success',
            message: '[SUCCESS] WhatsApp connected successfully!',
          });
        }
      }, 2000);
    }
    
    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [connecting, status.status, fetchStatus, toggleNotification]);

  /**
   * Start WhatsApp connection
   */
  const handleConnect = async () => {
    setConnecting(true);
    try {
      const { data } = await post('/magic-mail/whatsapp/connect', {});
      
      if (data.data.qrCode) {
        setStatus(prev => ({ ...prev, qrCode: data.data.qrCode, status: 'qr_pending' }));
        setCurrentStep(3);
      } else if (data.data.status === 'connected') {
        setStatus(prev => ({ ...prev, isConnected: true, status: 'connected' }));
        setCurrentStep(4);
        toggleNotification({
          type: 'success',
          message: '[SUCCESS] WhatsApp already connected!',
        });
      }
    } catch (error) {
      toggleNotification({
        type: 'danger',
        message: '[ERROR] Failed to connect: ' + (error.response?.data?.error?.message || error.message),
      });
      setConnecting(false);
    }
  };

  /**
   * Disconnect WhatsApp
   */
  const handleDisconnect = async () => {
    try {
      await post('/magic-mail/whatsapp/disconnect', {});
      setStatus({
        status: 'disconnected',
        qrCode: null,
        isConnected: false,
        session: null,
      });
      setCurrentStep(2);
      toggleNotification({
        type: 'success',
        message: '[SUCCESS] WhatsApp disconnected',
      });
    } catch (error) {
      toggleNotification({
        type: 'danger',
        message: '[ERROR] Failed to disconnect',
      });
    }
  };

  /**
   * Send test message
   */
  const handleSendTest = async () => {
    if (!testPhone) {
      toggleNotification({
        type: 'warning',
        message: 'Please enter a phone number',
      });
      return;
    }
    
    setSendingTest(true);
    try {
      const { data } = await post('/magic-mail/whatsapp/send-test', {
        phoneNumber: testPhone,
        message: testMessage || undefined,
      });
      
      if (data.success) {
        toggleNotification({
          type: 'success',
          message: '[SUCCESS] Test message sent!',
        });
        setTestPhone('');
        setTestMessage('');
      } else {
        toggleNotification({
          type: 'danger',
          message: '[ERROR] ' + (data.data.error || 'Failed to send message'),
        });
      }
    } catch (error) {
      toggleNotification({
        type: 'danger',
        message: '[ERROR] ' + (error.response?.data?.error?.message || error.message),
      });
    } finally {
      setSendingTest(false);
    }
  };

  /**
   * Render status badge
   */
  const renderStatusBadge = () => {
    const statusText = {
      connected: 'Connected',
      connecting: 'Connecting...',
      qr_pending: 'Waiting for QR Scan',
      disconnected: 'Disconnected',
    };
    
    return (
      <StatusBadge $status={status.status}>
        {status.status === 'connecting' && <SpinningLoader />}
        {status.status === 'connected' && <Check />}
        {statusText[status.status] || 'Unknown'}
      </StatusBadge>
    );
  };

  // Show loader while initializing
  if (loading) {
    return (
      <PageContainer>
        <Flex justifyContent="center" alignItems="center" style={{ minHeight: '400px' }}>
          <Loader />
        </Flex>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      {/* Header */}
      <HeaderSection>
        <WhatsAppLogo>
          <PhoneIcon>
            <svg viewBox="0 0 24 24" fill="currentColor" width="40" height="40">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
          </PhoneIcon>
        </WhatsAppLogo>
        <Typography variant="alpha" fontWeight="bold" style={{ display: 'block', marginBottom: '8px' }}>
          WhatsApp Integration
        </Typography>
        <Typography variant="epsilon" textColor="neutral600" style={{ display: 'block' }}>
          Send messages via WhatsApp - completely free!
        </Typography>
        <Box marginTop={3}>
          {renderStatusBadge()}
        </Box>
      </HeaderSection>

      {/* Stepper */}
      <StepperContainer>
        {[1, 2, 3, 4].map((step) => (
          <StepWrapper 
            key={step} 
            $completed={currentStep > step}
          >
            <StepDot 
              $active={currentStep === step} 
              $completed={currentStep > step}
              onClick={() => currentStep > step && setCurrentStep(step)}
            >
              {currentStep > step ? <Check /> : step}
            </StepDot>
            <StepLabel 
              $active={currentStep === step}
              $completed={currentStep > step}
            >
              {stepTitles[step - 1]}
            </StepLabel>
          </StepWrapper>
        ))}
      </StepperContainer>

      {/* Use Case Information */}
      <UseCaseCard>
        <Typography variant="delta" fontWeight="bold" style={{ display: 'block', marginBottom: '12px' }}>
          What can you do with WhatsApp?
        </Typography>
        <Typography variant="omega" textColor="neutral700" style={{ display: 'block', marginBottom: '16px' }}>
          WhatsApp integration provides free messaging as an alternative or backup to email delivery.
        </Typography>
        
        <Flex direction="column" gap={3}>
          <Box padding={3} background="neutral0" hasRadius style={{ border: `1px solid ${colors.border}` }}>
            <Typography variant="pi" fontWeight="bold" style={{ display: 'block', marginBottom: '4px' }}>
              1. FALLBACK-KANAL
            </Typography>
            <Typography variant="pi" textColor="neutral600" style={{ display: 'block' }}>
              Wenn alle Email-Accounts fehlschlagen, wird die Nachricht automatisch via WhatsApp zugestellt.
            </Typography>
          </Box>
          
          <Box padding={3} background="neutral0" hasRadius style={{ border: `1px solid ${colors.border}` }}>
            <Typography variant="pi" fontWeight="bold" style={{ display: 'block', marginBottom: '4px' }}>
              2. ADMIN-BENACHRICHTIGUNGEN
            </Typography>
            <Typography variant="pi" textColor="neutral600" style={{ display: 'block' }}>
              Bei Email-Bounces, Quota-Limits oder Account-Fehlern wird der Admin via WhatsApp benachrichtigt.
            </Typography>
          </Box>
          
          <Box padding={3} background="neutral0" hasRadius style={{ border: `1px solid ${colors.border}` }}>
            <Typography variant="pi" fontWeight="bold" style={{ display: 'block', marginBottom: '4px' }}>
              3. ROUTING-INTEGRATION
            </Typography>
            <Typography variant="pi" textColor="neutral600" style={{ display: 'block' }}>
              In Routing-Regeln kann WhatsApp als Fallback-Kanal definiert werden (Routing Rules Tab).
            </Typography>
          </Box>
        </Flex>
      </UseCaseCard>

      {/* Step 1: Check Installation */}
      {currentStep === 1 && (
        <ContentCard>
          <Typography variant="beta" fontWeight="bold" style={{ display: 'block', marginBottom: '8px' }}>
            Check Installation
          </Typography>
          <Typography variant="omega" textColor="neutral600" style={{ display: 'block', marginBottom: '24px' }}>
            First, we need to verify that the required dependencies are installed.
          </Typography>

          {isAvailable ? (
            <SuccessBox>
              <SuccessIcon>
                <Check style={{ width: 14, height: 14 }} />
              </SuccessIcon>
              <Box>
                <Typography variant="omega" fontWeight="semiBold" style={{ display: 'block', marginBottom: '4px', color: theme.colors.success[700] }}>
                  Dependencies Installed
                </Typography>
                <Typography variant="pi" textColor="neutral600">
                  Baileys library is installed and ready to use. You can proceed to connect your WhatsApp account.
                </Typography>
              </Box>
            </SuccessBox>
          ) : (
            <NotInstalledCard>
              <Typography variant="beta" fontWeight="bold" style={{ display: 'block', marginBottom: '12px', color: colors.danger }}>
                [WARNING] Dependencies Not Installed
              </Typography>
              <Typography variant="omega" textColor="neutral600" style={{ display: 'block', marginBottom: '16px' }}>
                The WhatsApp integration requires additional dependencies. Please install them:
              </Typography>
              <Box 
                padding={4} 
                background="neutral0" 
                hasRadius 
                style={{ 
                  fontFamily: 'monospace', 
                  fontSize: '14px',
                  border: `1px solid ${colors.border}`,
                  marginBottom: '16px'
                }}
              >
                npm install baileys pino qrcode
              </Box>
              <Typography variant="pi" textColor="neutral600">
                After installing, restart your Strapi server and refresh this page.
              </Typography>
            </NotInstalledCard>
          )}

          <ButtonRow justifyContent="flex-end" gap={3}>
            <SecondaryButton
              onClick={() => {
                checkAvailability();
              }}
              startIcon={<ArrowClockwise />}
            >
              Refresh
            </SecondaryButton>
            <GradientButton
              onClick={() => setCurrentStep(2)}
              disabled={!isAvailable}
              endIcon={<ArrowRight />}
            >
              Continue
            </GradientButton>
          </ButtonRow>
        </ContentCard>
      )}

      {/* Step 2: Connect WhatsApp */}
      {currentStep === 2 && (
        <ContentCard>
          <Typography variant="beta" fontWeight="bold" style={{ display: 'block', marginBottom: '8px' }}>
            Connect Your WhatsApp
          </Typography>
          <Typography variant="omega" textColor="neutral600" style={{ display: 'block', marginBottom: '24px' }}>
            Click the button below to start the connection process. A QR code will be generated for you to scan.
          </Typography>

          <InfoBox>
            <Typography variant="delta" fontWeight="bold" style={{ display: 'block', marginBottom: '16px', color: theme.colors.primary[700] }}>
              How it works
            </Typography>
            <Flex direction="column" gap={3}>
              <Typography variant="omega" textColor="neutral700">
                1. Click "Connect WhatsApp" to generate a QR code
              </Typography>
              <Typography variant="omega" textColor="neutral700">
                2. Open WhatsApp on your phone
              </Typography>
              <Typography variant="omega" textColor="neutral700">
                3. Go to Settings - Linked Devices - Link a Device
              </Typography>
              <Typography variant="omega" textColor="neutral700">
                4. Scan the QR code with your phone
              </Typography>
            </Flex>
          </InfoBox>

          <AlertBox>
            <AlertIcon>i</AlertIcon>
            <Box>
              <Typography variant="omega" fontWeight="semiBold" style={{ display: 'block', marginBottom: '4px' }}>
                Session Persistence
              </Typography>
              <Typography variant="pi" textColor="neutral600">
                Your WhatsApp session will be saved. You won't need to scan the QR code again unless you manually disconnect or your session expires.
              </Typography>
            </Box>
          </AlertBox>

          <ButtonRow justifyContent="space-between">
            <TertiaryButton
              onClick={() => setCurrentStep(1)}
              startIcon={<ArrowLeft />}
            >
              Back
            </TertiaryButton>
            <WhatsAppButton
              onClick={handleConnect}
              loading={connecting}
              startIcon={<Play />}
            >
              Connect WhatsApp
            </WhatsAppButton>
          </ButtonRow>
        </ContentCard>
      )}

      {/* Step 3: Scan QR Code */}
      {currentStep === 3 && (
        <ContentCard>
          <Typography variant="beta" fontWeight="bold" style={{ display: 'block', marginBottom: '8px' }}>
            Scan QR Code
          </Typography>
          <Typography variant="omega" textColor="neutral600" style={{ display: 'block', marginBottom: '24px' }}>
            Open WhatsApp on your phone and scan this QR code to connect.
          </Typography>

          <QRCodeContainer>
            {status.qrCode ? (
              <>
                <QRImage src={status.qrCode} alt="WhatsApp QR Code" />
                <Typography variant="pi" textColor="neutral600" style={{ marginTop: '16px' }}>
                  QR code expires in 60 seconds. If it expires, click "Refresh QR".
                </Typography>
              </>
            ) : (
              <Flex direction="column" alignItems="center" gap={3}>
                <SpinningLoader style={{ width: '40px', height: '40px' }} />
                <Typography variant="omega">Generating QR code...</Typography>
              </Flex>
            )}
          </QRCodeContainer>

          <InfoBox>
            <Typography variant="delta" fontWeight="bold" style={{ display: 'block', marginBottom: '16px', color: theme.colors.primary[700] }}>
              Instructions
            </Typography>
            <Flex direction="column" gap={2}>
              <Typography variant="omega" textColor="neutral700">
                1. Open WhatsApp on your phone
              </Typography>
              <Typography variant="omega" textColor="neutral700">
                2. Tap Menu or Settings
              </Typography>
              <Typography variant="omega" textColor="neutral700">
                3. Select "Linked Devices"
              </Typography>
              <Typography variant="omega" textColor="neutral700">
                4. Tap "Link a Device"
              </Typography>
              <Typography variant="omega" textColor="neutral700">
                5. Point your phone camera at this QR code
              </Typography>
            </Flex>
          </InfoBox>

          <ButtonRow justifyContent="space-between">
            <TertiaryButton
              onClick={() => setCurrentStep(2)}
              startIcon={<ArrowLeft />}
            >
              Back
            </TertiaryButton>
            <SecondaryButton
              onClick={handleConnect}
              startIcon={<ArrowClockwise />}
            >
              Refresh QR
            </SecondaryButton>
          </ButtonRow>
        </ContentCard>
      )}

      {/* Step 4: Connected / Ready to Use */}
      {currentStep === 4 && (
        <>
          <ConnectedCard>
            <Box marginBottom={4}>
              <Check style={{ width: '48px', height: '48px', color: colors.success }} />
            </Box>
            <Typography variant="alpha" fontWeight="bold" style={{ display: 'block', marginBottom: '8px' }}>
              WhatsApp Connected
            </Typography>
            {status.session && (
              <Typography variant="omega" textColor="neutral600" style={{ display: 'block' }}>
                Connected as: {status.session.phoneNumber} {status.session.name && `(${status.session.name})`}
              </Typography>
            )}
          </ConnectedCard>

          <ContentCard style={{ marginTop: '24px' }}>
            <Typography variant="beta" fontWeight="bold" style={{ display: 'block', marginBottom: '8px' }}>
              Send Test Message
            </Typography>
            <Typography variant="omega" textColor="neutral600" style={{ display: 'block', marginBottom: '24px' }}>
              Test your WhatsApp connection by sending a message.
            </Typography>

            <TestSection>
              <Box style={{ marginBottom: '20px' }}>
                <InputLabel>
                  <PhoneSymbol>+</PhoneSymbol>
                  Phone Number
                </InputLabel>
                <WhatsAppInput
                  placeholder="49123456789"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                />
                <InputHint>Enter with country code, without + (e.g., 49 for Germany, 1 for USA)</InputHint>
              </Box>
              
              <Box style={{ marginBottom: '24px' }}>
                <InputLabel>
                  <MessageSymbol>@</MessageSymbol>
                  Message (optional)
                </InputLabel>
                <WhatsAppTextarea
                  placeholder="Type your message here... or leave empty for default test message"
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  rows={3}
                />
              </Box>
              
              <WhatsAppButton
                onClick={handleSendTest}
                loading={sendingTest}
                disabled={!testPhone}
                style={{ width: '100%' }}
              >
                Send Test Message
              </WhatsAppButton>
            </TestSection>

            <Divider style={{ margin: '24px 0' }} />

            <Typography variant="beta" fontWeight="bold" style={{ display: 'block', marginBottom: '8px' }}>
              Using WhatsApp in Your Code
            </Typography>
            <Typography variant="omega" textColor="neutral600" style={{ display: 'block', marginBottom: '16px' }}>
              Use the WhatsApp service programmatically in your Strapi code.
            </Typography>
            <Box 
              padding={4} 
              background="neutral100" 
              hasRadius 
              style={{ 
                fontFamily: 'monospace', 
                fontSize: '13px',
                lineHeight: '1.6',
                overflow: 'auto',
              }}
            >
              <pre style={{ margin: 0 }}>
{`// Send a message via WhatsApp
const whatsapp = strapi.plugin('magic-mail').service('whatsapp');

// Send simple message
await whatsapp.sendMessage('49123456789', 'Hello from MagicMail!');

// Send template message
await whatsapp.sendTemplateMessage('49123456789', 'welcome', {
  name: 'John',
  company: 'ACME Corp',
});`}
              </pre>
            </Box>

            <ButtonRow justifyContent="space-between" alignItems="center">
              <DangerButton
                onClick={handleDisconnect}
                startIcon={<Cross />}
              >
                Disconnect WhatsApp
              </DangerButton>
              <Badge backgroundColor="success600" textColor="neutral0" style={{ padding: '8px 16px', fontSize: '13px' }}>
                FREE - No API costs!
              </Badge>
            </ButtonRow>
          </ContentCard>
        </>
      )}
    </PageContainer>
  );
};

export default WhatsAppPage;


import React, { useState } from 'react';
import styled, { keyframes, css } from 'styled-components';
import {
  Modal,
  Typography,
  Box,
  Flex,
  Button,
  Field,
  TextInput,
  Textarea,
  NumberInput,
  Toggle,
  Alert,
  Divider,
  Badge,
} from '@strapi/design-system';
import { useFetchClient, useNotification } from '@strapi/strapi/admin';
import { Mail, Server, Key, ArrowRight, ArrowLeft, Check, Lock, Cloud, Cog, Star } from '@strapi/icons';
import { GradientButton, SecondaryButton, TertiaryButton } from './StyledButtons';

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

const slideIn = keyframes`
  from {
    transform: translateX(-20px);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
`;

// ============= COLORS =============
const colors = {
  primary: '#4945ff',      // Strapi Primary Blue
  primaryLight: 'rgba(73, 69, 255, 0.06)', // Light Blue Background
  success: '#5cb176',      // Green for completed
  successLight: 'rgba(92, 177, 118, 0.12)', // Light green background
  neutral: '#8e8ea9',      // Gray
  neutralLight: 'rgba(142, 142, 169, 0.08)', // Light gray
  white: 'var(--colors-neutral0, #ffffff)',
  border: 'rgba(128, 128, 128, 0.2)',
  text: 'var(--colors-neutral800, #32324d)',
  textLight: 'var(--colors-neutral600, #666687)',
};

// ============= STYLED COMPONENTS =============
const StepHeader = styled(Box)`
  padding-bottom: 24px;
  margin-bottom: 32px;
  position: relative;
  animation: ${fadeIn} 0.4s ease;
  
  &::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: -24px;
    right: -24px;
    height: 1px;
    background: linear-gradient(90deg, transparent, ${colors.border}, transparent);
  }
`;

const StepTitle = styled(Typography)`
  color: ${colors.text};
  font-size: 24px;
  font-weight: 600;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 12px;
`;

const StepSubtitle = styled(Typography)`
  color: ${colors.textLight};
  font-size: 14px;
  line-height: 1.5;
`;

const StepperContainer = styled(Box)`
  display: flex;
  align-items: flex-start;
  justify-content: center;
  gap: 0;
  margin-bottom: 48px;
  margin-top: 8px;
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
    props.$active ? colors.primary : 
    props.$completed ? colors.success : 
    props.theme.colors.neutral0
  };
  color: ${props => 
    props.$active || props.$completed ? '#ffffff' : colors.textLight
  };
  border: 4px solid ${props =>
    props.$active ? colors.primary :
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
    props.$active ? `0 4px 16px ${colors.primary}40, 0 0 0 8px ${colors.primaryLight}` :
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
  color: ${props => props.$active ? colors.primary : props.$completed ? colors.success : colors.textLight};
  white-space: nowrap;
  font-weight: ${props => props.$active ? 600 : 500};
  text-align: center;
  transition: all 0.3s ease;
`;

const ProvidersGrid = styled(Box)`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
  margin-bottom: 24px;
  animation: ${slideIn} 0.5s ease;
  max-width: 800px;
  margin-left: auto;
  margin-right: auto;
`;

const ProviderCard = styled(Box)`
  background: ${props => props.$selected ? colors.successLight : props.theme.colors.neutral0};
  border: 2px solid ${props => props.$selected ? colors.success : colors.border};
  border-radius: 12px;
  padding: 24px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  text-align: center;
  aspect-ratio: 1;
  min-height: 180px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  position: relative;
  overflow: hidden;
  
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(135deg, transparent, rgba(73, 69, 255, 0.05));
    opacity: 0;
    transition: opacity 0.3s;
  }
  
  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 24px rgba(73, 69, 255, 0.12);
    border-color: ${props => props.$selected ? colors.success : colors.primary};
    
    &::before {
      opacity: 1;
    }
  }
  
  ${props => props.$selected && `
    &::after {
      content: '✓';
      position: absolute;
      top: 8px;
      right: 8px;
      width: 24px;
      height: 24px;
      background: ${colors.success};
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: bold;
    }
  `}
`;

const ProviderIcon = styled.div`
  width: 56px;
  height: 56px;
  border-radius: ${props => props.$round ? '50%' : '12px'};
  background: ${props => props.$bgColor || colors.primaryLight};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: ${props => props.$fontSize || '24px'};
  font-weight: bold;
  color: ${props => props.$color || colors.primary};
  box-shadow: 0 4px 12px ${props => props.$shadowColor || 'rgba(73, 69, 255, 0.15)'};
`;

const ProviderName = styled(Typography)`
  font-weight: 600;
  font-size: 15px;
  color: ${colors.text};
  margin: 0;
`;

const ProviderTagline = styled(Typography)`
  font-size: 12px;
  color: ${colors.textLight};
  margin: 0;
`;

const InfoAlert = styled(Alert)`
  background: ${colors.primaryLight};
  border: 1px solid ${colors.primary}33;
  animation: ${fadeIn} 0.4s ease;
  
  svg {
    color: ${colors.primary};
  }
`;

const FormSection = styled(Box)`
  animation: ${slideIn} 0.4s ease;
  width: 100%;
  max-width: 100%;
`;

const FullWidthField = styled(Box)`
  width: 100%;
  
  & > * {
    width: 100%;
  }
  
  input, textarea {
    width: 100% !important;
  }
`;

const SectionTitle = styled(Typography)`
  color: ${colors.text};
  font-weight: 600;
  font-size: 16px;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const PrimaryToggleBox = styled(Box)`
  background: linear-gradient(135deg, ${colors.primaryLight}, ${colors.successLight});
  border: 2px solid ${colors.primary}33;
  border-radius: 12px;
  padding: 20px;
  transition: all 0.3s;
  
  &:hover {
    border-color: ${colors.primary}66;
    box-shadow: 0 4px 12px rgba(73, 69, 255, 0.1);
  }
`;

// ============= COMPONENT =============
const AddAccountModal = ({ isOpen, onClose, onAccountAdded, editAccount = null }) => {
  const { post, get, put } = useFetchClient();
  const { toggleNotification } = useNotification();
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [provider, setProvider] = useState('');
  const [oauthCode, setOauthCode] = useState(null);
  const [oauthState, setOauthState] = useState(null);
  const isEditMode = !!editAccount;
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    fromEmail: '',
    fromName: '',
    replyTo: '',
    isActive: true,
    isPrimary: false,
    priority: 5,
    dailyLimit: 500,
    hourlyLimit: 50,
    host: '',
    port: 587,
    user: '',
    pass: '',
    secure: false,
    apiKey: '',
    oauthClientId: '',
    oauthClientSecret: '',
  });

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Populate form when editing - fetch decrypted data
  React.useEffect(() => {
    const loadAccountData = async () => {
      if (isEditMode && editAccount && isOpen) {
        try {
          // Fetch account with decrypted config
          const { data } = await get(`/magic-mail/accounts/${editAccount.id}`);
          const accountData = data.data;
          
          setProvider(accountData.provider);
          setCurrentStep(2); // Skip provider selection in edit mode
          setFormData({
            name: accountData.name || '',
            description: accountData.description || '',
            fromEmail: accountData.fromEmail || '',
            fromName: accountData.fromName || '',
            replyTo: accountData.replyTo || '',
            isActive: accountData.isActive !== undefined ? accountData.isActive : true,
            isPrimary: accountData.isPrimary || false,
            priority: accountData.priority || 5,
            dailyLimit: accountData.dailyLimit || 500,
            hourlyLimit: accountData.hourlyLimit || 50,
            host: accountData.config?.host || '',
            port: accountData.config?.port || 587,
            user: accountData.config?.user || '',
            pass: accountData.config?.pass || '', // Now populated from decrypted data
            secure: accountData.config?.secure || false,
            apiKey: accountData.config?.apiKey || '', // Now populated from decrypted data
            mailgunDomain: accountData.config?.domain || '',
            microsoftTenantId: accountData.config?.tenantId || '',
            oauthClientId: accountData.config?.clientId || '',
            oauthClientSecret: accountData.config?.clientSecret || '', // Now populated from decrypted data
          });
        } catch (err) {
          console.error('[magic-mail] Error loading account:', err);
          toggleNotification({
            type: 'danger',
            message: 'Failed to load account data',
          });
        }
      } else if (!isEditMode) {
        setCurrentStep(1);
        setProvider('');
        setFormData({
          name: '',
          description: '',
          fromEmail: '',
          fromName: '',
          replyTo: '',
          isActive: true,
          isPrimary: false,
          priority: 5,
          dailyLimit: 500,
          hourlyLimit: 50,
          host: '',
          port: 587,
          user: '',
          pass: '',
          secure: false,
          apiKey: '',
          mailgunDomain: '',
          microsoftTenantId: '',
          oauthClientId: '',
          oauthClientSecret: '',
        });
      }
    };
    
    loadAccountData();
  }, [isEditMode, editAccount, isOpen]);

  // Check for OAuth callback parameters (from URL or postMessage)
  React.useEffect(() => {
    // Check URL params (fallback)
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('oauth_code');
    const state = urlParams.get('oauth_state');
    
    if (code && state) {
      setOauthCode(code);
      setOauthState(state);
      
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
      
      toggleNotification({
        type: 'success',
        message: '✅ Gmail OAuth authorized! Please complete the account setup.',
      });
    }

    // Listen for postMessage from OAuth popup
    const handleMessage = (event) => {
      if (event.origin !== window.location.origin) return;
      
      if (event.data.type === 'gmail-oauth-success') {
        setOauthCode(event.data.code);
        setOauthState(event.data.state);
        
        toggleNotification({
          type: 'success',
          message: '✅ Gmail OAuth authorized! Please complete the account setup.',
        });
      }
      
      if (event.data.type === 'microsoft-oauth-success') {
        setOauthCode(event.data.code);
        setOauthState(event.data.state);
        
        toggleNotification({
          type: 'success',
          message: '✅ Microsoft OAuth authorized! Please complete the account setup.',
        });
      }
      
      if (event.data.type === 'yahoo-oauth-success') {
        setOauthCode(event.data.code);
        setOauthState(event.data.state);
        
        toggleNotification({
          type: 'success',
          message: '✅ Yahoo Mail OAuth authorized! Please complete the account setup.',
        });
      }
    };

    window.addEventListener('message', handleMessage);
    
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  const startGmailOAuth = async () => {
    if (!formData.oauthClientId) {
      toggleNotification({
        type: 'warning',
        message: 'Please enter your OAuth Client ID first',
      });
      return;
    }

    try {
      const { data } = await get(`/magic-mail/oauth/gmail/auth?clientId=${encodeURIComponent(formData.oauthClientId)}`);
      
      if (data.authUrl) {
        // Open OAuth in popup window
        const width = 600;
        const height = 700;
        const left = (window.screen.width - width) / 2;
        const top = (window.screen.height - height) / 2;
        
        const popup = window.open(
          data.authUrl,
          'gmail-oauth',
          `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,location=no,status=no`
        );

        // Listen for OAuth callback
        const checkPopup = setInterval(() => {
          try {
            if (popup.closed) {
              clearInterval(checkPopup);
              
              // Check if we got OAuth code from URL
              const urlParams = new URLSearchParams(window.location.search);
              const code = urlParams.get('oauth_code');
              
              if (!code) {
                toggleNotification({
                  type: 'info',
                  message: 'OAuth window closed. Please try again if not completed.',
                });
              }
            }
          } catch (err) {
            // Cross-origin error is expected
          }
        }, 500);

        toggleNotification({
          type: 'info',
          message: '🔐 Please authorize in the popup window...',
        });
      }
    } catch (err) {
      toggleNotification({
        type: 'danger',
        message: 'Failed to start OAuth flow',
      });
    }
  };

  const startMicrosoftOAuth = async () => {
    if (!formData.microsoftTenantId) {
      toggleNotification({
        type: 'warning',
        message: 'Please enter your Tenant (Directory) ID first',
      });
      return;
    }
    
    if (!formData.oauthClientId) {
      toggleNotification({
        type: 'warning',
        message: 'Please enter your Application (Client) ID',
      });
      return;
    }

    try {
      const { data } = await get(`/magic-mail/oauth/microsoft/auth?clientId=${encodeURIComponent(formData.oauthClientId)}&tenantId=${encodeURIComponent(formData.microsoftTenantId)}`);
      
      if (data.authUrl) {
        // Open OAuth in popup window
        const width = 600;
        const height = 700;
        const left = (window.screen.width - width) / 2;
        const top = (window.screen.height - height) / 2;
        
        const popup = window.open(
          data.authUrl,
          'microsoft-oauth',
          `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,location=no,status=no`
        );

        // Listen for OAuth callback
        const checkPopup = setInterval(() => {
          try {
            if (popup.closed) {
              clearInterval(checkPopup);
              
              // Check if we got OAuth code from URL
              const urlParams = new URLSearchParams(window.location.search);
              const code = urlParams.get('oauth_code');
              
              if (!code) {
                toggleNotification({
                  type: 'info',
                  message: 'OAuth window closed. Please try again if not completed.',
                });
              }
            }
          } catch (err) {
            // Cross-origin error is expected
          }
        }, 500);

        toggleNotification({
          type: 'info',
          message: '🔐 Please authorize in the popup window...',
        });
      }
    } catch (err) {
      toggleNotification({
        type: 'danger',
        message: 'Failed to start Microsoft OAuth flow',
      });
    }
  };

  const startYahooOAuth = async () => {
    if (!formData.oauthClientId) {
      toggleNotification({
        type: 'warning',
        message: 'Please enter your Yahoo Client ID first',
      });
      return;
    }

    try {
      const { data } = await get(`/magic-mail/oauth/yahoo/auth?clientId=${encodeURIComponent(formData.oauthClientId)}`);
      
      if (data.authUrl) {
        // Open OAuth in popup window
        const width = 600;
        const height = 700;
        const left = (window.screen.width - width) / 2;
        const top = (window.screen.height - height) / 2;
        
        const popup = window.open(
          data.authUrl,
          'yahoo-oauth',
          `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,location=no,status=no`
        );

        // Listen for OAuth callback
        const checkPopup = setInterval(() => {
          try {
            if (popup.closed) {
              clearInterval(checkPopup);
              
              // Check if we got OAuth code from URL
              const urlParams = new URLSearchParams(window.location.search);
              const code = urlParams.get('oauth_code');
              
              if (!code) {
                toggleNotification({
                  type: 'info',
                  message: 'OAuth window closed. Please try again if not completed.',
                });
              }
            }
          } catch (err) {
            // Cross-origin error is expected
          }
        }, 500);

        toggleNotification({
          type: 'info',
          message: '🔐 Please authorize in the popup window...',
        });
      }
    } catch (err) {
      toggleNotification({
        type: 'danger',
        message: 'Failed to start Yahoo OAuth flow',
      });
    }
  };

  const canProceed = () => {
    if (currentStep === 1) return provider !== '';
    if (currentStep === 2) {
      // For OAuth providers, fromEmail comes from provider, so only name is required
      if (provider === 'gmail-oauth' || provider === 'microsoft-oauth' || provider === 'yahoo-oauth') return formData.name;
      return formData.name && formData.fromEmail;
    }
    if (currentStep === 3) {
      if (provider === 'smtp') {
        // Password is required (we show the decrypted one in edit mode)
        return formData.host && formData.user && formData.pass;
      }
      if (provider === 'gmail-oauth' || provider === 'yahoo-oauth') {
        // In edit mode with existing credentials, they're pre-filled
        if (isEditMode && formData.oauthClientId && formData.oauthClientSecret) {
          return true;
        }
        // Only allow proceed if successfully connected (has oauthCode)
        return !!oauthCode;
      }
      if (provider === 'microsoft-oauth') {
        // In edit mode with existing credentials, they're pre-filled
        if (isEditMode && formData.oauthClientId && formData.oauthClientSecret && formData.microsoftTenantId) {
          return true;
        }
        // Only allow proceed if successfully connected (has oauthCode)
        return !!oauthCode;
      }
      if (provider === 'sendgrid') {
        // API key is required
        return !!formData.apiKey;
      }
      if (provider === 'mailgun') {
        // API key AND domain are required
        return !!formData.apiKey && !!formData.mailgunDomain;
      }
    }
    return true;
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      let config = {};

      // OAuth providers with full OAuth flow (only for creation, not edit)
      if (!isEditMode && (provider === 'gmail-oauth' || provider === 'microsoft-oauth' || provider === 'yahoo-oauth') && oauthCode && oauthState) {
        // Use OAuth endpoint to exchange code for tokens and create account
        const accountDetails = {
          name: formData.name,
          description: formData.description,
          fromEmail: 'oauth@placeholder.com', // Will be replaced by provider email
          fromName: formData.fromName,
          replyTo: formData.replyTo,
          isPrimary: formData.isPrimary,
          priority: formData.priority,
          dailyLimit: formData.dailyLimit,
          hourlyLimit: formData.hourlyLimit,
          config: provider === 'microsoft-oauth' ? {
            clientId: formData.oauthClientId,
            clientSecret: formData.oauthClientSecret,
            tenantId: formData.microsoftTenantId,
          } : {
            clientId: formData.oauthClientId,
            clientSecret: formData.oauthClientSecret,
          },
        };

        const providerMap = {
          'gmail-oauth': 'gmail',
          'microsoft-oauth': 'microsoft',
          'yahoo-oauth': 'yahoo',
        };

        await post('/magic-mail/oauth/create-account', {
          provider: providerMap[provider],
          code: oauthCode,
          state: oauthState,
          accountDetails,
        });

        const providerNames = {
          'gmail-oauth': 'Gmail',
          'microsoft-oauth': 'Microsoft',
          'yahoo-oauth': 'Yahoo Mail',
        };

        toggleNotification({
          type: 'success',
          message: `✅ ${formData.name} created successfully with ${providerNames[provider]} OAuth!`,
        });

        onAccountAdded();
        onClose();
        setCurrentStep(1);
        setOauthCode(null);
        setOauthState(null);
        return;
      }

      // Prepare config based on provider
      if (provider === 'smtp') {
        config = {
          host: formData.host,
          port: formData.port,
          user: formData.user,
          pass: formData.pass, // Now always available (decrypted in edit mode)
          secure: formData.secure,
        };
      } else if (provider === 'sendgrid') {
        config = { 
          apiKey: formData.apiKey // Now always available (decrypted in edit mode)
        };
      } else if (provider === 'mailgun') {
        config = { 
          apiKey: formData.apiKey, // Now always available (decrypted in edit mode)
          domain: formData.mailgunDomain,
        };
      } else if (provider === 'gmail-oauth' || provider === 'yahoo-oauth') {
        config = {
          clientId: formData.oauthClientId,
          clientSecret: formData.oauthClientSecret, // Now always available (decrypted in edit mode)
        };
      } else if (provider === 'microsoft-oauth') {
        config = {
          clientId: formData.oauthClientId,
          clientSecret: formData.oauthClientSecret, // Now always available (decrypted in edit mode)
          tenantId: formData.microsoftTenantId,
        };
      }

      const payload = {
        name: formData.name,
        description: formData.description,
        provider,
        config,
        fromEmail: formData.fromEmail,
        fromName: formData.fromName,
        replyTo: formData.replyTo,
        isActive: formData.isActive,
        isPrimary: formData.isPrimary,
        priority: formData.priority,
        dailyLimit: formData.dailyLimit,
        hourlyLimit: formData.hourlyLimit,
      };

      if (isEditMode) {
        // Update existing account
        await put(`/magic-mail/accounts/${editAccount.id}`, payload);
        toggleNotification({
          type: 'success',
          message: `✅ ${formData.name} updated successfully!`,
        });
      } else {
        // Create new account
        await post('/magic-mail/accounts', payload);
        toggleNotification({
          type: 'success',
          message: `✅ ${formData.name} created successfully!`,
        });
      }

      onAccountAdded();
      onClose();
      setCurrentStep(1);
    } catch (err) {
      toggleNotification({
        type: 'danger',
        message: err.response?.data?.error?.message || `Failed to ${isEditMode ? 'update' : 'create'} account`,
      });
    } finally {
      setLoading(false);
    }
  };

  const getProviderLabel = () => {
    switch(provider) {
      case 'gmail-oauth': return 'Gmail OAuth';
      case 'microsoft-oauth': return 'Microsoft OAuth';
      case 'yahoo-oauth': return 'Yahoo Mail OAuth';
      case 'smtp': return 'SMTP';
      case 'sendgrid': return 'SendGrid';
      case 'mailgun': return 'Mailgun';
      default: return '';
    }
  };

  const stepTitles = ['Provider', 'Details', 'Credentials', 'Settings'];

  return (
    <Modal.Root open={isOpen} onOpenChange={onClose}>
      <Modal.Content size="XL">
        <Modal.Header>
          <Typography variant="beta">
            <Star style={{ marginRight: 8 }} />
            {isEditMode ? 'Edit Email Account' : 'Add Email Account'}
          </Typography>
        </Modal.Header>

        <Modal.Body>
          <Flex direction="column" gap={0}>
            
            {/* Header */}
            <StepHeader>
              <StepTitle>
                {currentStep === 1 && <Mail />}
                {currentStep === 2 && <Server />}
                {currentStep === 3 && <Lock />}
                {currentStep === 4 && <Cog />}
                {currentStep === 1 && 'Choose Email Provider'}
                {currentStep === 2 && 'Account Details'}
                {currentStep === 3 && 'Authentication'}
                {currentStep === 4 && 'Configuration'}
              </StepTitle>
              <StepSubtitle>
                {currentStep === 1 && 'Select your preferred email service provider'}
                {currentStep === 2 && 'Configure how emails will appear to recipients'}
                {currentStep === 3 && `Enter your ${getProviderLabel()} credentials securely`}
                {currentStep === 4 && 'Set rate limits and priority for this account'}
              </StepSubtitle>
            </StepHeader>

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

            {/* Step 1: Choose Provider */}
            {currentStep === 1 && (
              <Box>
                <ProvidersGrid>
                  <ProviderCard 
                    $selected={provider === 'gmail-oauth'}
                    onClick={() => setProvider('gmail-oauth')}
                  >
                    <ProviderIcon 
                      $round 
                      $bgColor="#4285F433" 
                      $color="#4285F4"
                      $shadowColor="rgba(66, 133, 244, 0.2)"
                    >
                      G
                    </ProviderIcon>
                    <ProviderName>Gmail OAuth</ProviderName>
                  </ProviderCard>

                  <ProviderCard 
                    $selected={provider === 'microsoft-oauth'}
                    onClick={() => setProvider('microsoft-oauth')}
                  >
                    <ProviderIcon 
                      $round 
                      $bgColor="#00A4EF33" 
                      $color="#00A4EF"
                      $shadowColor="rgba(0, 164, 239, 0.2)"
                    >
                      M
                    </ProviderIcon>
                    <ProviderName>Microsoft OAuth</ProviderName>
                  </ProviderCard>

                  <ProviderCard 
                    $selected={provider === 'yahoo-oauth'}
                    onClick={() => setProvider('yahoo-oauth')}
                  >
                    <ProviderIcon 
                      $round 
                      $bgColor="#6001D233" 
                      $color="#6001D2"
                      $shadowColor="rgba(96, 1, 210, 0.2)"
                    >
                      Y
                    </ProviderIcon>
                    <ProviderName>Yahoo Mail OAuth</ProviderName>
                  </ProviderCard>

                  <ProviderCard 
                    $selected={provider === 'smtp'}
                    onClick={() => setProvider('smtp')}
                  >
                    <ProviderIcon>
                      <Server style={{ width: 28, height: 28 }} />
                    </ProviderIcon>
                    <ProviderName>SMTP</ProviderName>
                  </ProviderCard>

                  <ProviderCard 
                    $selected={provider === 'sendgrid'}
                    onClick={() => setProvider('sendgrid')}
                  >
                    <ProviderIcon $bgColor="#1E90FF22" $color="#1E90FF" $shadowColor="rgba(30, 144, 255, 0.2)">
                      <Cloud style={{ width: 28, height: 28 }} />
                    </ProviderIcon>
                    <ProviderName>SendGrid</ProviderName>
                  </ProviderCard>

                  <ProviderCard 
                    $selected={provider === 'mailgun'}
                    onClick={() => setProvider('mailgun')}
                  >
                    <ProviderIcon $bgColor="#FF6B6B22" $color="#FF6B6B" $shadowColor="rgba(255, 107, 107, 0.2)">
                      <Mail style={{ width: 28, height: 28 }} />
                    </ProviderIcon>
                    <ProviderName>Mailgun</ProviderName>
                  </ProviderCard>
                </ProvidersGrid>
              </Box>
            )}

            {/* Step 2: Name Your Account */}
            {currentStep === 2 && (
              <FormSection>
                <Flex direction="column" gap={4} style={{ width: '100%' }}>
                  <FullWidthField>
                    <Field.Root required>
                      <Field.Label>Account Name</Field.Label>
                      <TextInput
                        placeholder="e.g., Company Gmail, Marketing SendGrid, Transactional Emails"
                        value={formData.name}
                        onChange={(e) => handleChange('name', e.target.value)}
                      />
                      <Field.Hint>Give this email account a unique, descriptive name so you can easily identify it later</Field.Hint>
                    </Field.Root>
                  </FullWidthField>
                  
                  {provider === 'gmail-oauth' ? (
                    <Alert variant="default" title="📧 Email Address">
                      <Typography variant="pi">
                        Your Gmail address will be automatically retrieved from Google after OAuth authorization.
                        You don't need to enter it manually.
                      </Typography>
                    </Alert>
                  ) : (
                    <FullWidthField>
                      <Field.Root required>
                        <Field.Label>From Email Address</Field.Label>
                        <TextInput
                          placeholder="noreply@company.com"
                          type="email"
                          value={formData.fromEmail}
                          onChange={(e) => handleChange('fromEmail', e.target.value)}
                        />
                        <Field.Hint>The email address that will appear as the sender. Recipients will see this in their inbox</Field.Hint>
                      </Field.Root>
                    </FullWidthField>
                  )}
                  
                  <FullWidthField>
                    <Field.Root>
                      <Field.Label>From Display Name</Field.Label>
                      <TextInput
                        placeholder="Company Name"
                        value={formData.fromName}
                        onChange={(e) => handleChange('fromName', e.target.value)}
                      />
                      <Field.Hint>The friendly name shown next to the email address (e.g., 'ACME Corp' instead of just 'noreply@acme.com')</Field.Hint>
                    </Field.Root>
                  </FullWidthField>
                  
                  <FullWidthField>
                    <Field.Root>
                      <Field.Label>Reply-To Email Address</Field.Label>
                      <TextInput
                        placeholder="support@company.com"
                        type="email"
                        value={formData.replyTo}
                        onChange={(e) => handleChange('replyTo', e.target.value)}
                      />
                      <Field.Hint>When recipients hit 'Reply', their response will go to this address. Leave empty to use the From Email</Field.Hint>
                    </Field.Root>
                  </FullWidthField>
                  
                  <FullWidthField>
                    <Field.Root>
                      <Field.Label>Account Description</Field.Label>
                      <Textarea
                        placeholder="What is this account used for? (e.g., 'Marketing campaigns', 'Order confirmations', 'Password resets')"
                        value={formData.description}
                        onChange={(e) => handleChange('description', e.target.value)}
                      />
                      <Field.Hint>Add notes about this account's purpose, usage limits, or any special configuration. Only visible to admins</Field.Hint>
                    </Field.Root>
                  </FullWidthField>
                </Flex>
              </FormSection>
            )}

            {/* Step 3: Credentials */}
            {currentStep === 3 && (
              <FormSection>
                {provider === 'smtp' && (
                  <>
                    <InfoAlert variant="success" title="🔒 Secure Storage" marginBottom={4}>
                      All credentials are encrypted with AES-256-GCM before storage. No plain text passwords in the database.
                    </InfoAlert>
                    
                    <Flex direction="column" gap={4} style={{ width: '100%' }}>
                      <SectionTitle>
                        <Server />
                        Server Connection
                      </SectionTitle>
                      
                      <FullWidthField>
                        <Field.Root required>
                          <Field.Label>SMTP Host Server</Field.Label>
                          <TextInput
                            placeholder="smtp.gmail.com"
                            value={formData.host}
                            onChange={(e) => handleChange('host', e.target.value)}
                          />
                          <Field.Hint>The address of your email server. Common examples: smtp.gmail.com (Gmail), smtp-mail.outlook.com (Outlook), smtp.sendgrid.net (SendGrid)</Field.Hint>
                        </Field.Root>
                      </FullWidthField>
                      
                      <FullWidthField>
                        <Field.Root required>
                          <Field.Label>Port Number</Field.Label>
                          <NumberInput
                            value={formData.port}
                            onValueChange={(value) => handleChange('port', value)}
                          />
                          <Field.Hint>Standard ports: 587 (recommended - STARTTLS), 465 (SSL/TLS), or 25 (unencrypted - not recommended)</Field.Hint>
                        </Field.Root>
                      </FullWidthField>
                      
                      <Divider />
                      
                      <SectionTitle>
                        <Lock />
                        Authentication Credentials
                      </SectionTitle>
                      
                      <FullWidthField>
                        <Field.Root required>
                          <Field.Label>Username / Email</Field.Label>
                          <TextInput
                            placeholder="your-email@gmail.com"
                            value={formData.user}
                            onChange={(e) => handleChange('user', e.target.value)}
                          />
                          <Field.Hint>Usually your full email address. Some providers may use just the username part before the @</Field.Hint>
                        </Field.Root>
                      </FullWidthField>
                      
                      <FullWidthField>
                        <Field.Root required>
                          <Field.Label>Password / App Password</Field.Label>
                          <TextInput
                            type="password"
                            placeholder="Enter your password"
                            value={formData.pass}
                            onChange={(e) => handleChange('pass', e.target.value)}
                          />
                          <Field.Hint>For Gmail: Create an App Password in Google Account → Security → 2-Step Verification → App passwords. Regular passwords won't work with 2FA enabled</Field.Hint>
                        </Field.Root>
                      </FullWidthField>
                      
                      <Box
                        padding={4}
                        background={formData.secure ? 'rgba(34, 197, 94, 0.15)' : 'rgba(245, 158, 11, 0.15)'}
                        hasRadius
                        style={{
                          border: formData.secure ? '2px solid var(--colors-success600, #22C55E)' : '2px solid var(--colors-warning600, #F59E0B)',
                          borderRadius: '8px',
                          transition: 'all 0.2s ease',
                        }}
                      >
                        <Flex gap={3} alignItems="center">
                          <Toggle
                            checked={formData.secure}
                            onChange={() => handleChange('secure', !formData.secure)}
                          />
                          <Flex direction="column" gap={1} style={{ flex: 1 }}>
                            <Flex alignItems="center" gap={2}>
                              <Typography fontWeight="semiBold" style={{ fontSize: '14px' }}>
                                {formData.secure ? '🔒' : '⚠️'} Use SSL/TLS Encryption
                              </Typography>
                              <Badge 
                                backgroundColor={formData.secure ? 'success600' : 'warning600'} 
                                textColor="neutral0" 
                                size="S"
                              >
                                {formData.secure ? 'ENABLED' : 'DISABLED'}
                              </Badge>
                            </Flex>
                            <Typography variant="pi" textColor="neutral600" style={{ fontSize: '13px', lineHeight: '1.5' }}>
                              {formData.secure 
                                ? 'SSL/TLS enabled - Use this for port 465' 
                                : 'SSL/TLS disabled - Port 587 will use STARTTLS instead'
                              }
                            </Typography>
                          </Flex>
                        </Flex>
                      </Box>
                    </Flex>
                  </>
                )}

                {provider === 'gmail-oauth' && (
                  <>
                    <InfoAlert variant="success" title="🔒 OAuth 2.0 Security" marginBottom={4}>
                      No passwords stored. Users authenticate directly with Google for maximum security.
                    </InfoAlert>
                    
                    <Flex direction="column" gap={4} style={{ width: '100%' }}>
                      <SectionTitle>
                        <Lock />
                        Google OAuth Application
                      </SectionTitle>
                      
                      <FullWidthField>
                        <Field.Root required>
                          <Field.Label>OAuth Client ID</Field.Label>
                          <TextInput
                            placeholder="123456789-abc123xyz.apps.googleusercontent.com"
                            value={formData.oauthClientId}
                            onChange={(e) => handleChange('oauthClientId', e.target.value)}
                          />
                          <Field.Hint>Found in Google Cloud Console → APIs & Services → Credentials. Looks like a long string ending in .apps.googleusercontent.com</Field.Hint>
                        </Field.Root>
                      </FullWidthField>
                      
                      <FullWidthField>
                        <Field.Root required>
                          <Field.Label>OAuth Client Secret</Field.Label>
                          <TextInput
                            type="password"
                            placeholder="GOCSPX-abcdefghijklmnop"
                            value={formData.oauthClientSecret}
                            onChange={(e) => handleChange('oauthClientSecret', e.target.value)}
                          />
                          <Field.Hint>Keep this secret! Found in the same OAuth 2.0 Client ID settings. Never share or commit to git</Field.Hint>
                        </Field.Root>
                      </FullWidthField>

                      <Divider />

                      {oauthCode ? (
                        <Alert variant="success" title="✅ OAuth Authorized!">
                          <Typography variant="pi">
                            You've successfully authorized with Google! Click "Continue" to proceed to settings.
                          </Typography>
                        </Alert>
                      ) : (
                        <Box>
                          <Typography variant="omega" textColor="neutral600" marginBottom={3}>
                            After entering your credentials above, click the button below to connect with Gmail:
                          </Typography>
                          <Button 
                            onClick={startGmailOAuth}
                            variant="secondary"
                            size="L"
                            disabled={!formData.oauthClientId}
                            style={{
                              width: '100%',
                              background: '#4285F4',
                              color: 'white',
                              fontWeight: 600,
                            }}
                          >
                            🔐 Connect with Google
                          </Button>
                        </Box>
                      )}
                      
                      <Box 
                        padding={4} 
                        background="neutral100" 
                        hasRadius
                        style={{ 
                          border: `1px solid ${colors.border}`,
                          borderRadius: '8px'
                        }}
                      >
                        <Typography 
                          fontWeight="semiBold" 
                          marginBottom={3}
                          style={{ fontSize: '15px' }}
                        >
                          📋 Setup Guide
                        </Typography>
                        
                        <Flex direction="column" gap={2} style={{ fontSize: '14px', lineHeight: '1.6' }}>
                          <Box>
                            <strong>1.</strong> Go to <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" style={{ color: colors.primary, textDecoration: 'underline' }}>console.cloud.google.com</a>
                          </Box>
                          
                          <Box>
                            <strong>2.</strong> Enable Gmail API (search and click Enable)
                          </Box>
                          
                          <Box>
                            <strong>3.</strong> Create Credentials → OAuth Client ID
                          </Box>
                          
                          <Box>
                            <strong>4.</strong> Add this redirect URI:
                          </Box>
                          
                          <Flex gap={2} alignItems="center">
                            <Box
                              padding={2}
                              background="neutral0"
                              hasRadius
                              style={{ 
                                flex: 1,
                                fontFamily: 'monospace',
                                fontSize: '13px',
                                wordBreak: 'break-all',
                                border: `1px solid ${colors.border}`
                              }}
                            >
                              {window.location.origin}/magic-mail/oauth/gmail/callback
                            </Box>
                            <Button
                              variant="secondary"
                              size="S"
                              onClick={() => {
                                navigator.clipboard.writeText(`${window.location.origin}/magic-mail/oauth/gmail/callback`);
                                toggleNotification({
                                  type: 'success',
                                  message: 'Redirect URI copied to clipboard!',
                                });
                              }}
                            >
                              Copy
                            </Button>
                          </Flex>
                        </Flex>
                      </Box>
                    </Flex>
                  </>
                )}

                {provider === 'microsoft-oauth' && (
                  <>
                    <InfoAlert variant="success" title="🔒 OAuth 2.0 Security" marginBottom={4}>
                      No passwords stored. Users authenticate directly with Microsoft for maximum security.
                    </InfoAlert>
                    
                    <Flex direction="column" gap={4} style={{ width: '100%' }}>
                      <SectionTitle>
                        <Lock />
                        Microsoft Azure Application
                      </SectionTitle>
                      
                      <FullWidthField>
                        <Field.Root required>
                          <Field.Label>Tenant (Directory) ID</Field.Label>
                          <TextInput
                            placeholder="87654321-4321-4321-4321-987654321abc"
                            value={formData.microsoftTenantId}
                            onChange={(e) => handleChange('microsoftTenantId', e.target.value)}
                          />
                          <Field.Hint>Found in Azure Portal → App Registrations → Your App → Overview (next to Application ID). Also a GUID format. Required for OAuth!</Field.Hint>
                        </Field.Root>
                      </FullWidthField>

                      <FullWidthField>
                        <Field.Root required>
                          <Field.Label>Application (Client) ID</Field.Label>
                          <TextInput
                            placeholder="12345678-1234-1234-1234-123456789abc"
                            value={formData.oauthClientId}
                            onChange={(e) => handleChange('oauthClientId', e.target.value)}
                          />
                          <Field.Hint>Found in Azure Portal → App Registrations → Your App → Overview. It's a GUID format.</Field.Hint>
                        </Field.Root>
                      </FullWidthField>
                      
                      <FullWidthField>
                        <Field.Root required>
                          <Field.Label>Client Secret Value</Field.Label>
                          <TextInput
                            type="password"
                            placeholder="abc~123XYZ..."
                            value={formData.oauthClientSecret}
                            onChange={(e) => handleChange('oauthClientSecret', e.target.value)}
                          />
                          <Field.Hint>From Azure Portal → Certificates & secrets → Client secrets. Copy the VALUE, not the Secret ID. Keep this secret!</Field.Hint>
                        </Field.Root>
                      </FullWidthField>

                      <Divider />

                      {oauthCode ? (
                        <Alert variant="success" title="✅ OAuth Authorized!">
                          <Typography variant="pi">
                            You've successfully authorized with Microsoft! Click "Continue" to proceed to settings.
                          </Typography>
                        </Alert>
                      ) : (
                        <Box>
                          <Typography variant="omega" textColor="neutral600" marginBottom={3}>
                            After entering your credentials above, click the button below to connect with Microsoft:
                          </Typography>
                          <Button 
                            onClick={startMicrosoftOAuth}
                            variant="secondary"
                            size="L"
                            disabled={!formData.oauthClientId}
                            style={{
                              width: '100%',
                              background: '#00A4EF',
                              color: 'white',
                              fontWeight: 600,
                            }}
                          >
                            🔐 Connect with Microsoft
                          </Button>
                        </Box>
                      )}
                      
                      <Box 
                        padding={4} 
                        background="neutral100" 
                        hasRadius
                        style={{ 
                          border: `1px solid ${colors.border}`,
                          borderRadius: '8px'
                        }}
                      >
                        <Typography 
                          fontWeight="semiBold" 
                          marginBottom={3}
                          style={{ fontSize: '15px' }}
                        >
                          📋 Setup Guide
                        </Typography>
                        
                        <Flex direction="column" gap={2} style={{ fontSize: '14px', lineHeight: '1.6' }}>
                          <Box>
                            <strong>1.</strong> Go to <a href="https://portal.azure.com" target="_blank" rel="noopener noreferrer" style={{ color: colors.primary, textDecoration: 'underline' }}>portal.azure.com</a>
                          </Box>
                          
                          <Box>
                            <strong>2.</strong> Navigate to Azure Active Directory → App registrations → New registration
                          </Box>
                          
                          <Box>
                            <strong>3.</strong> Name your app (e.g., "MagicMail") and select "Accounts in this organizational directory only"
                          </Box>
                          
                          <Box>
                            <strong>Important:</strong> Copy both <strong>Application (client) ID</strong> AND <strong>Directory (tenant) ID</strong> from the Overview page!
                          </Box>
                          
                          <Box>
                            <strong>4.</strong> Add this redirect URI:
                          </Box>
                          
                          <Flex gap={2} alignItems="center">
                            <Box
                              padding={2}
                              background="neutral0"
                              hasRadius
                              style={{ 
                                flex: 1,
                                fontFamily: 'monospace',
                                fontSize: '13px',
                                wordBreak: 'break-all',
                                color: colors.textSecondary,
                                border: `1px solid ${colors.border}`,
                              }}
                            >
                              {`${window.location.origin}/magic-mail/oauth/microsoft/callback`}
                            </Box>
                            <Button
                              variant="secondary"
                              size="S"
                              onClick={() => {
                                navigator.clipboard.writeText(`${window.location.origin}/magic-mail/oauth/microsoft/callback`);
                                toggleNotification({
                                  type: 'success',
                                  message: 'Redirect URI copied to clipboard!',
                                });
                              }}
                            >
                              Copy
                            </Button>
                          </Flex>

                          <Box>
                            <strong>5.</strong> Under API permissions → Add a permission → Microsoft Graph → Delegated permissions:
                          </Box>
                          
                          <Box style={{ marginLeft: '20px', marginTop: '8px' }}>
                            • <code>Mail.Send</code> - Send emails as the signed-in user<br/>
                            • <code>User.Read</code> - Read user profile (email address)<br/>
                            • <code>offline_access</code> - Maintain access to data (refresh tokens)<br/>
                            • <code>openid</code> - Sign users in<br/>
                            • <code>email</code> - View users' email address
                          </Box>

                          <Box>
                            <strong>6.</strong> Click "Grant admin consent" for your organization (Required!)
                          </Box>

                          <Box>
                            <strong>7.</strong> Under Certificates & secrets → Client secrets → New client secret
                          </Box>
                          
                          <Box>
                            <strong>8.</strong> Copy the <strong>Value</strong> (not Secret ID) immediately - it won't be shown again
                          </Box>
                        </Flex>
                      </Box>
                    </Flex>
                  </>
                )}

                {provider === 'yahoo-oauth' && (
                  <>
                    <InfoAlert variant="success" title="🔒 OAuth 2.0 Security" marginBottom={4}>
                      No passwords stored. Users authenticate directly with Yahoo for maximum security.
                    </InfoAlert>
                    
                    <Flex direction="column" gap={4} style={{ width: '100%' }}>
                      <SectionTitle>
                        <Lock />
                        Yahoo Developer Application
                      </SectionTitle>
                      
                      <FullWidthField>
                        <Field.Root required>
                          <Field.Label>Yahoo Client ID</Field.Label>
                          <TextInput
                            placeholder="dj0yJmk9..."
                            value={formData.oauthClientId}
                            onChange={(e) => handleChange('oauthClientId', e.target.value)}
                          />
                          <Field.Hint>Found in Yahoo Developer Console → Your App → App Information. Starts with "dj0y..."</Field.Hint>
                        </Field.Root>
                      </FullWidthField>
                      
                      <FullWidthField>
                        <Field.Root required>
                          <Field.Label>Yahoo Client Secret</Field.Label>
                          <TextInput
                            type="password"
                            placeholder="abc123def456..."
                            value={formData.oauthClientSecret}
                            onChange={(e) => handleChange('oauthClientSecret', e.target.value)}
                          />
                          <Field.Hint>Keep this secret! Found in the same App Information section. Never share or commit to git.</Field.Hint>
                        </Field.Root>
                      </FullWidthField>

                      <Divider />

                      {oauthCode ? (
                        <Alert variant="success" title="✅ OAuth Authorized!">
                          <Typography variant="pi">
                            You've successfully authorized with Yahoo Mail! Click "Continue" to proceed to settings.
                          </Typography>
                        </Alert>
                      ) : (
                        <Box>
                          <Typography variant="omega" textColor="neutral600" marginBottom={3}>
                            After entering your credentials above, click the button below to connect with Yahoo:
                          </Typography>
                          <Button 
                            onClick={startYahooOAuth}
                            variant="secondary"
                            size="L"
                            disabled={!formData.oauthClientId}
                            style={{
                              width: '100%',
                              background: '#6001D2',
                              color: 'white',
                              fontWeight: 600,
                            }}
                          >
                            🔐 Connect with Yahoo
                          </Button>
                        </Box>
                      )}
                      
                      <Box 
                        padding={4} 
                        background="neutral100" 
                        hasRadius
                        style={{ 
                          border: `1px solid ${colors.border}`,
                          borderRadius: '8px'
                        }}
                      >
                        <Typography 
                          fontWeight="semiBold" 
                          marginBottom={3}
                          style={{ fontSize: '15px' }}
                        >
                          📋 Setup Guide
                        </Typography>
                        
                        <Flex direction="column" gap={2} style={{ fontSize: '14px', lineHeight: '1.6' }}>
                          <Box>
                            <strong>1.</strong> Go to <a href="https://developer.yahoo.com/apps/" target="_blank" rel="noopener noreferrer" style={{ color: colors.primary, textDecoration: 'underline' }}>developer.yahoo.com/apps</a>
                          </Box>
                          
                          <Box>
                            <strong>2.</strong> Click "Create an App"
                          </Box>
                          
                          <Box>
                            <strong>3.</strong> Fill in app details (name, description)
                          </Box>
                          
                          <Box>
                            <strong>4.</strong> Add this redirect URI:
                          </Box>
                          
                          <Flex gap={2} alignItems="center">
                            <Box
                              padding={2}
                              background="neutral0"
                              hasRadius
                              style={{ 
                                flex: 1,
                                fontFamily: 'monospace',
                                fontSize: '13px',
                                wordBreak: 'break-all',
                                color: colors.textSecondary,
                                border: `1px solid ${colors.border}`,
                              }}
                            >
                              {`${window.location.origin}/magic-mail/oauth/yahoo/callback`}
                            </Box>
                            <Button
                              variant="secondary"
                              size="S"
                              onClick={() => {
                                navigator.clipboard.writeText(`${window.location.origin}/magic-mail/oauth/yahoo/callback`);
                                toggleNotification({
                                  type: 'success',
                                  message: 'Redirect URI copied to clipboard!',
                                });
                              }}
                            >
                              Copy
                            </Button>
                          </Flex>

                          <Box>
                            <strong>5.</strong> Under API Permissions, enable:
                          </Box>
                          
                          <Box style={{ marginLeft: '20px' }}>
                            • <code>Mail</code> - Send and manage emails<br/>
                            • <code>OpenID Connect</code> - User authentication
                          </Box>

                          <Box>
                            <strong>6.</strong> Note your Client ID and Client Secret from the app settings
                          </Box>
                        </Flex>
                      </Box>
                    </Flex>
                  </>
                )}

                {provider === 'sendgrid' && (
                  <>
                    <InfoAlert variant="success" title="🔒 API Key Security" marginBottom={4}>
                      Your API key will be encrypted with AES-256-GCM before storage.
                    </InfoAlert>
                    
                    <Flex direction="column" gap={4} style={{ width: '100%' }}>
                      <SectionTitle>
                        <Key />
                        SendGrid API Configuration
                      </SectionTitle>
                      
                      <FullWidthField>
                        <Field.Root required>
                          <Field.Label>SendGrid API Key</Field.Label>
                          <TextInput
                            type="password"
                            placeholder="SG.xxxxxxxxxxxxxxxxxxxxxx"
                            value={formData.apiKey}
                            onChange={(e) => handleChange('apiKey', e.target.value)}
                          />
                          <Field.Hint>
                            Found in SendGrid Dashboard → Settings → API Keys. Create a new key with "Mail Send" permission
                          </Field.Hint>
                        </Field.Root>
                      </FullWidthField>
                      
                      <Alert variant="default" title="📖 SendGrid Resources">
                        <Typography variant="pi">
                          <strong>Dashboard:</strong> <a href="https://app.sendgrid.com" target="_blank" rel="noopener noreferrer" style={{color: 'var(--colors-primary600, #0284c7)'}}>app.sendgrid.com</a><br/>
                          <strong>API Keys:</strong> Settings → API Keys → Create API Key<br/>
                          <strong>Required Scope:</strong> Mail Send (Full Access)<br/>
                          <strong>Docs:</strong> <a href="https://docs.sendgrid.com" target="_blank" rel="noopener noreferrer" style={{color: 'var(--colors-primary600, #0284c7)'}}>docs.sendgrid.com</a>
                        </Typography>
                      </Alert>
                    </Flex>
                  </>
                )}

                {provider === 'mailgun' && (
                  <>
                    <InfoAlert variant="success" title="🔒 API Key Security" marginBottom={4}>
                      Your API key will be encrypted with AES-256-GCM before storage.
                    </InfoAlert>
                    
                    <Flex direction="column" gap={4} style={{ width: '100%' }}>
                      <SectionTitle>
                        <Key />
                        Mailgun API Configuration
                      </SectionTitle>
                      
                      <FullWidthField>
                        <Field.Root required>
                          <Field.Label>Mailgun Domain</Field.Label>
                          <TextInput
                            placeholder="mg.yourdomain.com or sandbox-xxx.mailgun.org"
                            value={formData.mailgunDomain}
                            onChange={(e) => handleChange('mailgunDomain', e.target.value)}
                          />
                          <Field.Hint>
                            Your verified Mailgun domain (e.g., mg.yourdomain.com) or sandbox domain for testing
                          </Field.Hint>
                        </Field.Root>
                      </FullWidthField>
                      
                      <FullWidthField>
                        <Field.Root required>
                          <Field.Label>Mailgun API Key</Field.Label>
                          <TextInput
                            type="password"
                            placeholder="key-xxxxxxxxxxxxxxxxxxxxxxxx"
                            value={formData.apiKey}
                            onChange={(e) => handleChange('apiKey', e.target.value)}
                          />
                          <Field.Hint>
                            Found in Mailgun Dashboard → Settings → API Keys. Use your Private API key, not the Public Validation key
                          </Field.Hint>
                        </Field.Root>
                      </FullWidthField>
                      
                      <Alert variant="default" title="📖 Mailgun Resources">
                        <Typography variant="pi">
                          <strong>Dashboard:</strong> <a href="https://app.mailgun.com" target="_blank" rel="noopener noreferrer" style={{color: 'var(--colors-primary600, #0284c7)'}}>app.mailgun.com</a><br/>
                          <strong>API Keys:</strong> Settings → API Security → Private API Key<br/>
                          <strong>Domains:</strong> Sending → Domains (verify your domain or use sandbox)<br/>
                          <strong>Docs:</strong> <a href="https://documentation.mailgun.com" target="_blank" rel="noopener noreferrer" style={{color: 'var(--colors-primary600, #0284c7)'}}>documentation.mailgun.com</a>
                        </Typography>
                      </Alert>
                    </Flex>
                  </>
                )}
              </FormSection>
            )}

            {/* Step 4: Limits & Finalize */}
            {currentStep === 4 && (
              <FormSection>
                <Flex direction="column" gap={5} style={{ width: '100%' }}>
                  
                  {/* Daily Limit */}
                  <Box>
                    <Typography fontWeight="semiBold" marginBottom={2} style={{ fontSize: '15px' }}>
                      Daily Email Limit
                    </Typography>
                    <NumberInput
                      value={formData.dailyLimit}
                      onValueChange={(value) => handleChange('dailyLimit', value)}
                    />
                    <Typography variant="pi" textColor="neutral600" marginTop={2} style={{ fontSize: '13px', lineHeight: '1.5' }}>
                      Maximum number of emails this account can send per day. Set to 0 for unlimited.
                    </Typography>
                  </Box>

                  {/* Hourly Limit */}
                  <Box>
                    <Typography fontWeight="semiBold" marginBottom={2} style={{ fontSize: '15px' }}>
                      Hourly Email Limit
                    </Typography>
                    <NumberInput
                      value={formData.hourlyLimit}
                      onValueChange={(value) => handleChange('hourlyLimit', value)}
                    />
                    <Typography variant="pi" textColor="neutral600" marginTop={2} style={{ fontSize: '13px', lineHeight: '1.5' }}>
                      Maximum number of emails this account can send per hour. Set to 0 for unlimited.
                    </Typography>
                  </Box>

                  {/* Priority */}
                  <Box>
                    <Typography fontWeight="semiBold" marginBottom={2} style={{ fontSize: '15px' }}>
                      Account Priority
                    </Typography>
                    <NumberInput
                      value={formData.priority}
                      onValueChange={(value) => handleChange('priority', value)}
                      min={1}
                      max={10}
                    />
                    <Typography variant="pi" textColor="neutral600" marginTop={2} style={{ fontSize: '13px', lineHeight: '1.5' }}>
                      When routing emails, accounts with higher priority (1-10) are preferred. Use 10 for your most reliable account.
                    </Typography>
                  </Box>
                  
                  <Divider />
                  
                  {/* Account Active Toggle */}
                  <Box 
                    padding={4} 
                    background={formData.isActive ? 'rgba(34, 197, 94, 0.15)' : 'rgba(220, 38, 38, 0.12)'}
                    hasRadius
                    style={{ 
                      border: formData.isActive ? '2px solid var(--colors-success600, #22C55E)' : '2px solid var(--colors-danger600, #EF4444)',
                      borderRadius: '8px',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <Flex gap={3} alignItems="flex-start">
                      <Box style={{ paddingTop: '2px' }}>
                        <Toggle
                          checked={formData.isActive}
                          onChange={() => handleChange('isActive', !formData.isActive)}
                        />
                      </Box>
                      <Box style={{ flex: 1 }}>
                        <Flex alignItems="center" gap={2} marginBottom={1}>
                          <Typography fontWeight="semiBold" style={{ fontSize: '15px' }}>
                            {formData.isActive ? '✅' : '❌'} Account Active
                          </Typography>
                          {formData.isActive ? (
                            <Badge backgroundColor="success600" textColor="neutral0" size="S">
                              ENABLED
                            </Badge>
                          ) : (
                            <Badge backgroundColor="danger600" textColor="neutral0" size="S">
                              DISABLED
                            </Badge>
                          )}
                        </Flex>
                        <Typography variant="pi" textColor="neutral600" style={{ lineHeight: '1.6' }}>
                          {formData.isActive 
                            ? 'This account is enabled and can send emails. Disable it to prevent sending without deleting the account.'
                            : 'This account is disabled and will not send any emails. Enable it to start sending again.'
                          }
                        </Typography>
                      </Box>
                    </Flex>
                  </Box>

                  {/* Primary Account Toggle */}
                  <Box 
                    padding={4} 
                    background={formData.isPrimary ? 'rgba(245, 158, 11, 0.15)' : 'neutral100'}
                    hasRadius
                    style={{ 
                      border: formData.isPrimary ? '2px solid var(--colors-warning600, #F59E0B)' : `1px solid ${colors.border}`,
                      borderRadius: '8px',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <Flex gap={3} alignItems="flex-start">
                      <Box style={{ paddingTop: '2px' }}>
                        <Toggle
                          checked={formData.isPrimary}
                          onChange={() => handleChange('isPrimary', !formData.isPrimary)}
                        />
                      </Box>
                      <Box style={{ flex: 1 }}>
                        <Flex alignItems="center" gap={2} marginBottom={1}>
                          <Typography fontWeight="semiBold" style={{ fontSize: '15px' }}>
                            ⭐ Set as Primary Account
                          </Typography>
                          {formData.isPrimary && (
                            <Badge backgroundColor="warning600" textColor="neutral0" size="S">
                              PRIMARY
                            </Badge>
                          )}
                        </Flex>
                        <Typography variant="pi" textColor="neutral600" style={{ lineHeight: '1.6' }}>
                          This account will be used by default when sending emails if no specific account is selected. Only one account can be primary at a time.
                        </Typography>
                      </Box>
                    </Flex>
                  </Box>
                  
                </Flex>
              </FormSection>
            )}

          </Flex>
        </Modal.Body>

        <Modal.Footer>
          <Flex justifyContent="space-between" style={{ width: '100%' }}>
            <div>
              {currentStep > 1 && (
                <TertiaryButton 
                  startIcon={<ArrowLeft />}
                  onClick={() => setCurrentStep(currentStep - 1)}
                >
                  Back
                </TertiaryButton>
              )}
            </div>
            <Flex gap={2}>
              <TertiaryButton onClick={onClose}>
                Cancel
              </TertiaryButton>
              {currentStep < 4 ? (
                <GradientButton 
                  endIcon={<ArrowRight />}
                  onClick={() => setCurrentStep(currentStep + 1)}
                  disabled={!canProceed()}
                >
                  Continue
                </GradientButton>
              ) : (
                <GradientButton 
                  onClick={handleSubmit} 
                  loading={loading}
                  disabled={!canProceed()}
                  startIcon={<Check />}
                >
                  {isEditMode ? 'Update Account' : 'Create Account'}
                </GradientButton>
              )}
            </Flex>
          </Flex>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
};

export default AddAccountModal;
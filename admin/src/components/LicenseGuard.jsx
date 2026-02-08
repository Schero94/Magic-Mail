import { useState, useEffect } from 'react';
import styled, { keyframes } from 'styled-components';
import {
  Typography,
  Box,
  Flex,
  Button,
  TextInput,
  Loader,
} from '@strapi/design-system';
import { useFetchClient, useNotification } from '@strapi/strapi/admin';
import { CheckIcon, KeyIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useNavigate } from 'react-router-dom';
import { useAuthRefresh } from '../hooks/useAuthRefresh';

// Animations
const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

const slideUp = keyframes`
  from { 
    opacity: 0;
    transform: translateY(30px);
  }
  to { 
    opacity: 1;
    transform: translateY(0);
  }
`;

// Styled Components
const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(4, 28, 47, 0.85);
  backdrop-filter: blur(8px);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: ${fadeIn} 0.3s ease-out;
  padding: 20px;
`;

const ModalContent = styled(Box)`
  background: ${(p) => p.theme.colors.neutral0};
  border-radius: 16px;
  width: 100%;
  max-width: 580px;
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.3);
  animation: ${slideUp} 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
`;

const GradientHeader = styled(Box)`
  background: linear-gradient(135deg, #4945ff 0%, #7c3aed 100%);
  padding: 32px 40px;
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: -50%;
    right: -50%;
    width: 200%;
    height: 200%;
    background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);
  }
`;

const IconWrapper = styled.div`
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 16px;
  backdrop-filter: blur(10px);
  border: 2px solid rgba(255, 255, 255, 0.3);

  svg {
    width: 36px;
    height: 36px;
    color: white;
  }
`;

const CloseButton = styled.button`
  position: absolute;
  top: 16px;
  right: 16px;
  background: rgba(255, 255, 255, 0.2);
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  z-index: 10;
  
  svg {
    width: 20px;
    height: 20px;
    color: white;
  }

  &:hover {
    background: rgba(255, 255, 255, 0.3);
    transform: scale(1.1);
  }

  &:active {
    transform: scale(0.95);
  }
`;

const GradientButton = styled(Button)`
  && {
    background: linear-gradient(135deg, #4945ff 0%, #7c3aed 100%);
    color: white;
    font-weight: 600;
    border: none;
    box-shadow: 0 4px 12px rgba(73, 69, 255, 0.4);
    padding: 12px 24px;
    min-height: 44px;
    
    &:hover:not(:disabled) {
      background: linear-gradient(135deg, #4338ca 0%, #6d28d9 100%);
      box-shadow: 0 6px 16px rgba(73, 69, 255, 0.5);
    }
    
    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }
`;

const SecondaryStyledButton = styled(Button)`
  && {
    background: rgba(73, 69, 255, 0.06);
    color: #4945ff;
    font-weight: 600;
    border: 2px solid #4945ff;
    padding: 12px 24px;
    min-height: 44px;
    
    &:hover:not(:disabled) {
      background: rgba(73, 69, 255, 0.12);
    }
  }
`;

const ToggleButton = styled.button`
  background: none;
  border: none;
  color: #4945ff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  padding: 8px 0;
  text-decoration: underline;
  transition: color 0.2s;
  
  &:hover {
    color: #7c3aed;
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const InfoBox = styled(Box)`
  background: rgba(73, 69, 255, 0.06);
  border: 2px solid rgba(73, 69, 255, 0.3);
  border-radius: 8px;
  padding: 16px;
  width: 100%;
`;

const SuccessBox = styled(Box)`
  background: rgba(34, 197, 94, 0.06);
  border: 2px solid rgba(34, 197, 94, 0.3);
  border-radius: 8px;
  padding: 20px;
  text-align: center;
`;

const InfoText = styled(Typography)`
  font-size: 13px;
  line-height: 1.6;
  color: ${(p) => p.theme.colors.neutral800};
`;

const LicenseGuard = ({ children }) => {
  const { get, post } = useFetchClient();
  const { toggleNotification } = useNotification();
  const navigate = useNavigate();
  useAuthRefresh(); // Initialize token auto-refresh

  const [isChecking, setIsChecking] = useState(true);
  const [needsLicense, setNeedsLicense] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [useExistingKey, setUseExistingKey] = useState(false);
  const [useAutoCreate, setUseAutoCreate] = useState(true);
  const [existingLicenseKey, setExistingLicenseKey] = useState('');
  const [existingEmail, setExistingEmail] = useState('');
  const [adminUser, setAdminUser] = useState(null);

  useEffect(() => {
    checkLicenseStatus();
    fetchAdminUser();
  }, []);

  const fetchAdminUser = async () => {
    try {
      const response = await get('/admin/users/me');
      const userData = response.data?.data || response.data;
      if (userData) {
        setAdminUser(userData);
      }
    } catch (error) {
      console.debug('[MagicMail] Could not fetch admin user');
    }
  };

  const checkLicenseStatus = async () => {
    setIsChecking(true);
    try {
      const response = await get('/magic-mail/license/status');
      
      if (response.data.valid) {
        setNeedsLicense(false);
      } else {
        setNeedsLicense(true);
      }
    } catch (error) {
      console.error('[MagicMail] License check error:', error);
      setNeedsLicense(true);
    } finally {
      setIsChecking(false);
    }
  };

  const handleAutoCreateLicense = async (e) => {
    e.preventDefault();
    setIsCreating(true);
    
    try {
      const response = await post('/magic-mail/license/auto-create', {});
      
      if (response.data && response.data.success) {
        toggleNotification({
          type: 'success',
          message: '✅ License created! Reloading...',
        });
        
        setNeedsLicense(false);
        
        setTimeout(() => {
          window.location.reload();
        }, 500);
      } else {
        throw new Error('Failed to auto-create license');
      }
    } catch (error) {
      console.error('[MagicMail] Error:', error);
      toggleNotification({
        type: 'danger',
        message: 'Failed to create license. Try manual entry.',
      });
      setIsCreating(false);
      setUseAutoCreate(false);
    }
  };

  const handleValidateExistingKey = async (e) => {
    e.preventDefault();
    
    if (!existingLicenseKey.trim() || !existingEmail.trim()) {
      toggleNotification({
        type: 'warning',
        message: 'Please enter both license key and email address',
      });
      return;
    }

    setIsCreating(true);
    
    try {
      const response = await post('/magic-mail/license/store-key', {
        licenseKey: existingLicenseKey.trim(),
        email: existingEmail.trim(),
      });

      if (response.data && response.data.success) {
        toggleNotification({
          type: 'success',
          message: '✅ License activated! Reloading...',
        });
        
        setNeedsLicense(false);
        
        setTimeout(() => {
          window.location.reload();
        }, 500);
      } else {
        throw new Error('Invalid license');
      }
    } catch (error) {
      toggleNotification({
        type: 'danger',
        message: 'Invalid license key or email address',
      });
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    navigate('/content-manager');
  };

  if (isChecking) {
    return (
      <Box padding={8} style={{ textAlign: 'center' }}>
        <Loader>Checking license...</Loader>
      </Box>
    );
  }

  if (needsLicense) {
    return (
      <ModalOverlay>
        <ModalContent>
          <GradientHeader>
            <CloseButton onClick={handleClose} type="button">
              <XMarkIcon />
            </CloseButton>
            <IconWrapper>
              <KeyIcon />
            </IconWrapper>
            <Box style={{ textAlign: 'center', position: 'relative' }}>
              <Typography
                variant="alpha"
                style={{
                  color: 'white',
                  fontSize: '24px',
                  fontWeight: '700',
                  marginBottom: '12px',
                  display: 'block',
                }}
              >
                🔐 Activate MagicMail
              </Typography>
              <Typography
                variant="epsilon"
                style={{
                  color: 'rgba(255, 255, 255, 0.9)',
                  fontSize: '14px',
                  display: 'block',
                }}
              >
                {useExistingKey ? 'Enter your existing license key' : 'Create a license to start using the plugin'}
              </Typography>
            </Box>
          </GradientHeader>

          <form onSubmit={useExistingKey ? handleValidateExistingKey : handleAutoCreateLicense}>
            <Box padding={6} paddingLeft={8} paddingRight={8}>
              <Flex direction="column" gap={5} style={{ width: '100%' }}>
                <Box style={{ textAlign: 'center', width: '100%' }}>
                  <ToggleButton 
                    type="button"
                    onClick={() => setUseExistingKey(!useExistingKey)}
                    disabled={isCreating}
                  >
                    {useExistingKey ? '← Create new license' : 'Have a license key? →'}
                  </ToggleButton>
                </Box>

                <InfoBox>
                  <InfoText variant="omega">
                    {useExistingKey 
                      ? 'Enter your email and license key to activate.'
                      : adminUser && adminUser.email
                      ? `Click "Activate" to auto-create a license with your account (${adminUser.email})`
                      : 'Click "Activate" to auto-create a license with your admin account'
                    }
                  </InfoText>
                </InfoBox>

                {useExistingKey ? (
                  // Existing License Key Input
                  <>
                    <Box style={{ width: '100%' }}>
                      <Typography
                        variant="pi"
                        fontWeight="bold"
                        style={{ marginBottom: '8px', display: 'block' }}
                      >
                        Email Address *
                      </Typography>
                      <TextInput
                        placeholder="admin@example.com"
                        type="email"
                        value={existingEmail}
                        onChange={(e) => setExistingEmail(e.target.value)}
                        required
                        disabled={isCreating}
                      />
                      <Typography variant="omega" textColor="neutral600" style={{ fontSize: '11px', marginTop: '4px' }}>
                        Enter the email address associated with this license
                      </Typography>
                    </Box>

                    <Box style={{ width: '100%' }}>
                      <Typography
                        variant="pi"
                        fontWeight="bold"
                        style={{ marginBottom: '8px', display: 'block' }}
                      >
                        License Key *
                      </Typography>
                      <TextInput
                        placeholder="MAGIC-MAIL-XXXX-XXXX-XXXX"
                        value={existingLicenseKey}
                        onChange={(e) => setExistingLicenseKey(e.target.value)}
                        required
                        disabled={isCreating}
                      />
                      <Typography variant="omega" textColor="neutral600" style={{ fontSize: '11px', marginTop: '4px' }}>
                        Enter the license key
                      </Typography>
                    </Box>
                  </>
                ) : adminUser ? (
                  // Auto-create mode - Show user info
                  <SuccessBox>
                    <Typography variant="omega" fontWeight="bold" style={{ marginBottom: '12px', display: 'block' }}>
                      Ready to activate with your account:
                    </Typography>
                    <Typography variant="pi" style={{ marginBottom: '4px', display: 'block' }}>
                      {adminUser.firstname || 'Admin'} {adminUser.lastname || 'User'}
                    </Typography>
                    <Typography variant="pi" textColor="neutral600">
                      {adminUser.email || 'Loading...'}
                    </Typography>
                  </SuccessBox>
                ) : (
                  <Box padding={4} background="neutral100" hasRadius style={{ textAlign: 'center' }}>
                    <Loader small />
                    <Typography variant="pi" marginTop={2}>Loading admin user data...</Typography>
                  </Box>
                )}

                <Flex gap={3} justifyContent="center" style={{ marginTop: '16px' }}>
                  {useExistingKey ? (
                    <GradientButton
                      type="submit"
                      size="L"
                      startIcon={<CheckIcon style={{ width: 20, height: 20 }} />}
                      loading={isCreating}
                      disabled={isCreating || !existingLicenseKey.trim() || !existingEmail.trim()}
                    >
                      Validate License
                    </GradientButton>
                  ) : (
                    <GradientButton
                      type="submit"
                      size="L"
                      startIcon={<CheckIcon style={{ width: 20, height: 20 }} />}
                      loading={isCreating}
                      disabled={isCreating || !adminUser}
                    >
                      Activate License
                    </GradientButton>
                  )}
                </Flex>
              </Flex>
            </Box>
          </form>
        </ModalContent>
      </ModalOverlay>
    );
  }

  return <>{children}</>;
};

export default LicenseGuard;


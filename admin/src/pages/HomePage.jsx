import { useState, useEffect } from 'react';
import { useFetchClient, useNotification } from '@strapi/strapi/admin';
import { useAuthRefresh } from '../hooks/useAuthRefresh';
import styled, { keyframes, css } from 'styled-components';
import { theme } from '../utils/theme';
import {
  Box,
  Button,
  Flex,
  Typography,
  Loader,
  Badge,
  SingleSelect,
  SingleSelectOption,
  Modal,
  Field,
  TextInput,
} from '@strapi/design-system';
import { Table, Thead, Tbody, Tr, Th, Td } from '@strapi/design-system';
import {
  CheckIcon,
  EnvelopeIcon,
  ServerIcon,
  SparklesIcon,
  TrashIcon,
  PlayIcon,
  PlusIcon,
  MagnifyingGlassIcon,
  PencilIcon,
} from '@heroicons/react/24/outline';
import AddAccountModal from '../components/AddAccountModal';
import { 
  GradientButton, 
  SecondaryButton, 
  TertiaryButton,
  IconButton, 
  IconButtonDanger, 
  IconButtonPrimary,
  CTAButton,
} from '../components/StyledButtons';

// ================ ANIMATIONS ================
const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
`;

const shimmer = keyframes`
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
`;

const float = keyframes`
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-5px); }
`;

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
`;

const FloatingEmoji = styled.div`
  position: absolute;
  bottom: 40px;
  right: 40px;
  font-size: 72px;
  opacity: 0.08;
  ${css`animation: ${float} 4s ease-in-out infinite;`}
`;

// ================ RESPONSIVE BREAKPOINTS ================
const breakpoints = {
  mobile: '768px',
  tablet: '1024px',
};

// ================ STYLED COMPONENTS ================
const Container = styled(Box)`
  ${css`animation: ${fadeIn} ${theme.transitions.slow};`}
  min-height: 100vh;
  max-width: 1440px;
  margin: 0 auto;
  padding: ${theme.spacing.xl} ${theme.spacing.lg} 0;
  
  @media screen and (max-width: ${breakpoints.mobile}) {
    padding: 16px 12px 0;
  }
`;

const Header = styled(Box)`
  background: linear-gradient(135deg, 
    ${'var(--colors-primary600, #0284C7)'} 0%, 
    var(--colors-secondary600, #7C3AED) 100%
  );
  border-radius: ${theme.borderRadius.xl};
  padding: ${theme.spacing.xl} ${theme.spacing['2xl']};
  margin-bottom: ${theme.spacing.xl};
  position: relative;
  overflow: hidden;
  box-shadow: ${theme.shadows.xl};
  
  @media screen and (max-width: ${breakpoints.mobile}) {
    padding: 24px 20px;
    border-radius: 12px;
  }
  
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 200%;
    height: 100%;
    background: linear-gradient(
      90deg, 
      transparent, 
      rgba(255, 255, 255, 0.15), 
      transparent
    );
    ${css`animation: ${shimmer} 3s infinite;`}
  }
  
  &::after {
    content: '';
    position: absolute;
    top: 0;
    right: 0;
    width: 100%;
    height: 100%;
    background-image: radial-gradient(circle at 20% 80%, transparent 50%, rgba(255, 255, 255, 0.1) 50%);
    background-size: 15px 15px;
    opacity: 0.3;
  }
`;

const HeaderContent = styled(Flex)`
  position: relative;
  z-index: 1;
`;

const Title = styled(Typography)`
  color: white;
  font-size: 2rem;
  font-weight: 700;
  letter-spacing: -0.025em;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
  
  svg {
    width: 28px;
    height: 28px;
    ${css`animation: ${float} 3s ease-in-out infinite;`}
  }
  
  @media screen and (max-width: ${breakpoints.mobile}) {
    font-size: 1.5rem;
    
    svg {
      width: 22px;
      height: 22px;
    }
  }
`;

const Subtitle = styled(Typography)`
  color: rgba(255, 255, 255, 0.95);
  font-size: 0.95rem;
  font-weight: 400;
  margin-top: ${theme.spacing.xs};
  letter-spacing: 0.01em;
  
  @media screen and (max-width: ${breakpoints.mobile}) {
    font-size: 0.85rem;
  }
`;

const StatsGrid = styled.div`
  margin-bottom: ${theme.spacing.xl};
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: ${theme.spacing.lg};
  justify-content: center;
  max-width: 1200px;
  margin-left: auto;
  margin-right: auto;
  
  @media screen and (max-width: ${breakpoints.mobile}) {
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
    margin-bottom: 24px;
  }
`;

const StatCard = styled(Box)`
  background: var(--colors-neutral0, white);
  border-radius: ${theme.borderRadius.lg};
  padding: 28px ${theme.spacing.lg};
  position: relative;
  overflow: hidden;
  transition: all ${theme.transitions.normal};
  ${css`animation: ${fadeIn} ${theme.transitions.slow} backwards;`}
  animation-delay: ${props => props.$delay || '0s'};
  box-shadow: ${theme.shadows.sm};
  border: 1px solid rgba(128, 128, 128, 0.2);
  min-width: 200px;
  flex: 1;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  
  @media screen and (max-width: ${breakpoints.mobile}) {
    min-width: unset;
    padding: 20px 12px;
    
    &:hover {
      transform: none;
    }
  }
  
  &:hover {
    transform: translateY(-6px);
    box-shadow: ${theme.shadows.xl};
    border-color: ${props => props.$color || 'var(--colors-primary600, #0EA5E9)'};
    
    .stat-icon {
      transform: scale(1.15) rotate(5deg);
    }
    
    .stat-value {
      transform: scale(1.08);
      color: ${props => props.$color || 'var(--colors-primary600, #0284C7)'};
    }
  }
`;

const StatIcon = styled(Box)`
  width: 68px;
  height: 68px;
  border-radius: ${theme.borderRadius.lg};
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${props => props.$bg || 'rgba(2, 132, 199, 0.12)'};
  transition: all ${theme.transitions.normal};
  margin: 0 auto 20px;
  box-shadow: ${theme.shadows.sm};
  
  svg {
    width: 34px;
    height: 34px;
    color: ${props => props.$color || 'var(--colors-primary600, #0284C7)'};
  }
  
  @media screen and (max-width: ${breakpoints.mobile}) {
    width: 48px;
    height: 48px;
    margin-bottom: 12px;
    
    svg {
      width: 24px;
      height: 24px;
    }
  }
`;

const StatValue = styled(Typography)`
  font-size: 2.75rem;
  font-weight: 700;
  color: var(--colors-neutral800);
  line-height: 1;
  margin-bottom: 10px;
  transition: all ${theme.transitions.normal};
  text-align: center;
  
  @media screen and (max-width: ${breakpoints.mobile}) {
    font-size: 2rem;
    margin-bottom: 6px;
  }
`;

const StatLabel = styled(Typography)`
  font-size: 0.95rem;
  color: var(--colors-neutral600);
  font-weight: 500;
  letter-spacing: 0.025em;
  text-align: center;
  
  @media screen and (max-width: ${breakpoints.mobile}) {
    font-size: 0.8rem;
  }
`;

const AccountsContainer = styled(Box)`
  margin-top: ${theme.spacing.xl};
`;

const EmptyState = styled(Box)`
  background: var(--colors-neutral0, white);
  border-radius: ${theme.borderRadius.xl};
  border: 2px dashed rgba(128, 128, 128, 0.3);
  padding: 80px 32px;
  text-align: center;
  position: relative;
  overflow: hidden;
  min-height: 400px;
  display: flex;
  align-items: center;
  justify-content: center;
  
  /* Background Gradient */
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(135deg, ${'rgba(2, 132, 199, 0.06)'} 0%, rgba(168, 85, 247, 0.06) 100%);
    opacity: 0.3;
    z-index: 0;
  }
`;

const OnlineBadge = styled.div`
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: ${props => props.$active ? 'var(--colors-success600, #22C55E)' : 'rgba(128, 128, 128, 0.4)'};
  display: inline-block;
  margin-right: 8px;
  ${css`animation: ${props => props.$active ? pulse : 'none'} 2s ease-in-out infinite;`}
`;

const StyledTable = styled(Table)`
  thead {
    background: var(--colors-neutral100);
    border-bottom: 2px solid rgba(128, 128, 128, 0.2);
    
    th {
      font-weight: 600;
      color: var(--colors-neutral800);
      font-size: 0.875rem;
      text-transform: uppercase;
      letter-spacing: 0.025em;
      padding: ${theme.spacing.lg} ${theme.spacing.lg};
    }
  }
  
  tbody tr {
    transition: all ${theme.transitions.fast};
    border-bottom: 1px solid rgba(128, 128, 128, 0.15);
    
    &:last-child {
      border-bottom: none;
    }
    
    &:hover {
      background: rgba(2, 132, 199, 0.12);
    }
    
    td {
      padding: ${theme.spacing.lg} ${theme.spacing.lg};
      color: var(--colors-neutral800);
      vertical-align: middle;
    }
  }
`;

const FilterBar = styled(Flex)`
  background: var(--colors-neutral0, white);
  padding: ${theme.spacing.md} ${theme.spacing.lg};
  border-radius: ${theme.borderRadius.lg};
  margin-bottom: ${theme.spacing.lg};
  box-shadow: ${theme.shadows.sm};
  border: 1px solid rgba(128, 128, 128, 0.2);
  gap: ${theme.spacing.md};
  align-items: center;
`;

const SearchInputWrapper = styled.div`
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
`;

const SearchIcon = styled(MagnifyingGlassIcon)`
  position: absolute;
  left: 12px;
  width: 16px;
  height: 16px;
  color: var(--colors-neutral600);
  pointer-events: none;
`;

const StyledSearchInput = styled.input`
  width: 100%;
  padding: 10px 12px 10px 40px;
  border: 1px solid rgba(128, 128, 128, 0.2);
  border-radius: ${theme.borderRadius.md};
  font-size: 0.875rem;
  transition: all ${theme.transitions.fast};
  background: var(--colors-neutral0, white);
  color: var(--colors-neutral800);
  
  &:focus {
    outline: none;
    border-color: ${'var(--colors-primary600, #0EA5E9)'};
    box-shadow: 0 0 0 2px ${'rgba(2, 132, 199, 0.12)'};
  }
  
  &::placeholder {
    color: var(--colors-neutral500);
  }
`;

// ================ MODAL STYLED COMPONENTS ================
const StyledModalContent = styled(Modal.Content)`
  && {
    border-radius: 16px;
    overflow: hidden;
    max-width: 560px;
    width: 90vw;
  }
`;

const StyledModalHeader = styled(Modal.Header)`
  && {
    background: linear-gradient(135deg, ${'var(--colors-primary600, #0EA5E9)'} 0%, var(--colors-secondary600, #A855F7) 100%);
    padding: 24px 28px;
    border-bottom: none;
    
    h2 {
      color: white;
      font-size: 1.25rem;
      font-weight: 700;
    }
    
    button {
      color: white !important;
      opacity: 0.9;
      background: rgba(255, 255, 255, 0.15) !important;
      border-radius: 8px;
      
      &:hover {
        opacity: 1;
        background: rgba(255, 255, 255, 0.25) !important;
      }
      
      svg {
        fill: white !important;
        color: white !important;
        path { fill: white !important; }
      }
    }
  }
`;

const StyledModalBody = styled(Modal.Body)`
  && {
    padding: 24px 28px;
    background: var(--colors-neutral0, white);
    width: 100%;
    box-sizing: border-box;
  }
`;

const StyledModalFooter = styled(Modal.Footer)`
  && {
    padding: 20px 28px;
    border-top: 1px solid rgba(128, 128, 128, 0.2);
    background: var(--colors-neutral100);
  }
`;

const AccountInfoCard = styled(Box)`
  background: linear-gradient(135deg, ${'rgba(2, 132, 199, 0.06)'} 0%, rgba(168, 85, 247, 0.06) 100%);
  border: 1px solid ${'rgba(2, 132, 199, 0.2)'};
  border-radius: 12px;
  padding: 16px 20px;
  text-align: center;
  width: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
`;

const TestOptionCard = styled(Box)`
  padding: 16px 20px;
  border: 2px solid ${props => props.$selected ? 'var(--colors-primary600, #0EA5E9)' : 'rgba(128, 128, 128, 0.2)'};
  border-radius: 12px;
  cursor: pointer;
  transition: all ${theme.transitions.fast};
  background: ${props => props.$selected ? 'rgba(2, 132, 199, 0.06)' : 'var(--colors-neutral0, white)'};
  
  &:hover {
    border-color: ${'rgba(2, 132, 199, 0.4)'};
    background: ${'rgba(2, 132, 199, 0.06)'};
  }
`;

const ModalFieldLabel = styled(Typography)`
  font-size: 13px;
  font-weight: 600;
  color: var(--colors-neutral700);
  margin-bottom: 8px;
  display: block;
`;

const ModalHint = styled(Typography)`
  font-size: 12px;
  color: var(--colors-neutral500);
  margin-top: 6px;
`;

const StyledModalSelect = styled.select`
  width: 100%;
  padding: 12px 14px;
  border: 1px solid rgba(128, 128, 128, 0.2);
  border-radius: 8px;
  font-size: 14px;
  background: var(--colors-neutral0, white);
  color: var(--colors-neutral800);
  cursor: pointer;
  transition: all ${theme.transitions.fast};
  box-sizing: border-box;
  
  &:focus {
    outline: none;
    border-color: ${'var(--colors-primary600, #0EA5E9)'};
    box-shadow: 0 0 0 3px ${'rgba(2, 132, 199, 0.12)'};
  }
`;

const StyledModalInput = styled.input`
  width: 100%;
  padding: 12px 14px;
  border: 1px solid rgba(128, 128, 128, 0.2);
  border-radius: 8px;
  font-size: 14px;
  background: var(--colors-neutral0, white);
  color: var(--colors-neutral800);
  transition: all ${theme.transitions.fast};
  box-sizing: border-box;
  
  &:focus {
    outline: none;
    border-color: ${'var(--colors-primary600, #0EA5E9)'};
    box-shadow: 0 0 0 3px ${'rgba(2, 132, 199, 0.12)'};
  }
  
  &::placeholder {
    color: rgba(128, 128, 128, 0.4);
  }
`;

const HomePage = () => {
  useAuthRefresh(); // Initialize token auto-refresh
  const { get, post, del } = useFetchClient();
  const { toggleNotification } = useNotification();
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [testingAccount, setTestingAccount] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterProvider, setFilterProvider] = useState('all');

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const { data } = await get('/magic-mail/accounts');
      setAccounts(data.data || []);
    } catch (err) {
      console.error('[magic-mail] Error fetching accounts:', err);
      toggleNotification({
        type: 'danger',
        message: 'Failed to load email accounts',
      });
    } finally {
      setLoading(false);
    }
  };

  const testAccount = async (accountId, accountName, testEmail, testOptions = {}) => {
    toggleNotification({
      type: 'info',
      message: `Testing ${accountName}...`,
    });

    try {
      const { data } = await post(`/magic-mail/accounts/${accountId}/test`, {
        testEmail: testEmail,
        priority: testOptions.priority || 'normal',
        type: testOptions.type || 'transactional',
        unsubscribeUrl: testOptions.unsubscribeUrl || null,
      });
      
      toggleNotification({
        type: data.success ? 'success' : 'danger',
        message: data.message,
      });
    } catch (err) {
      toggleNotification({
        type: 'danger',
        message: 'Test email failed',
      });
    }
  };

  const deleteAccount = async (accountId, accountName) => {
    if (!confirm(`Delete "${accountName}"?`)) return;

    try {
      await del(`/magic-mail/accounts/${accountId}`);
      toggleNotification({
        type: 'success',
        message: 'Account deleted successfully',
      });
      fetchAccounts();
    } catch (err) {
      toggleNotification({
        type: 'danger',
        message: 'Failed to delete account',
      });
    }
  };

  if (loading) {
    return (
      <Flex justifyContent="center" alignItems="center" style={{ minHeight: '400px' }}>
        <Loader>Loading MagicMail...</Loader>
      </Flex>
    );
  }

  const totalSentToday = accounts.reduce((sum, acc) => sum + (acc.emailsSentToday || 0), 0);
  const totalSent = accounts.reduce((sum, acc) => sum + (acc.totalEmailsSent || 0), 0);
  const activeAccounts = accounts.filter(a => a.isActive).length;

  // Filter and search logic
  const filteredAccounts = accounts.filter(account => {
    const matchesSearch = 
      account.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      account.fromEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (account.provider || '').toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = 
      filterStatus === 'all' || 
      (filterStatus === 'active' && account.isActive) ||
      (filterStatus === 'inactive' && !account.isActive) ||
      (filterStatus === 'primary' && account.isPrimary);
    
    const matchesProvider = 
      filterProvider === 'all' || 
      account.provider === filterProvider;
    
    return matchesSearch && matchesStatus && matchesProvider;
  });

  const uniqueProviders = [...new Set(accounts.map(a => a.provider))].filter(Boolean);

  return (
    <Container>
      {/* Hero Header */}
      <Header>
        <HeaderContent justifyContent="space-between" alignItems="center">
          <Flex direction="column" alignItems="flex-start" gap={2}>
            <Title>
              <EnvelopeIcon />
              MagicMail - Email Business Suite
            </Title>
            <Subtitle>
              Multi-account email management with smart routing and OAuth support
            </Subtitle>
          </Flex>
        </HeaderContent>
      </Header>

      {/* Quick Stats */}
      <StatsGrid>
        <StatCard $delay="0.1s" $color={'var(--colors-primary600, #0284C7)'}>
          <StatIcon className="stat-icon" $bg={'rgba(2, 132, 199, 0.12)'} $color={'var(--colors-primary600, #0284C7)'}>
            <EnvelopeIcon />
          </StatIcon>
          <StatValue className="stat-value">{totalSentToday}</StatValue>
          <StatLabel>Emails Today</StatLabel>
        </StatCard>

        <StatCard $delay="0.2s" $color={'var(--colors-success600, #16A34A)'}>
          <StatIcon className="stat-icon" $bg={'rgba(22, 163, 74, 0.12)'} $color={'var(--colors-success600, #16A34A)'}>
            <ServerIcon />
          </StatIcon>
          <StatValue className="stat-value">{totalSent}</StatValue>
          <StatLabel>Total Sent</StatLabel>
        </StatCard>

        <StatCard $delay="0.3s" $color={'var(--colors-warning600, #D97706)'}>
          <StatIcon className="stat-icon" $bg={'rgba(234, 179, 8, 0.12)'} $color={'var(--colors-warning600, #D97706)'}>
            <SparklesIcon />
          </StatIcon>
          <StatValue className="stat-value">{activeAccounts} / {accounts.length}</StatValue>
          <StatLabel>Active Accounts</StatLabel>
        </StatCard>
      </StatsGrid>

      {/* Account List or Empty State */}
      {accounts.length === 0 ? (
        <EmptyState>
          {/* Floating Emoji */}
          <FloatingEmoji>
            ✉️
          </FloatingEmoji>
          
          <Flex direction="column" alignItems="center" gap={6} style={{ position: 'relative', zIndex: 1 }}>
            <Box
              style={{
                width: '120px',
                height: '120px',
                borderRadius: '50%',
                background: `linear-gradient(135deg, ${'rgba(2, 132, 199, 0.12)'} 0%, rgba(168, 85, 247, 0.12) 100%)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: theme.shadows.xl,
              }}
            >
              <EnvelopeIcon style={{ width: '60px', height: '60px', color: 'var(--colors-primary600, #0284C7)' }} />
            </Box>
            
            <Typography 
              variant="alpha" 
              textColor="neutral800"
              style={{ 
                fontSize: '1.75rem',
                fontWeight: '700',
                marginBottom: '8px',
              }}
            >
              No Email Accounts Yet
            </Typography>
            
            <Typography 
              variant="omega" 
              textColor="neutral600"
              style={{
                fontSize: '1rem',
                maxWidth: '500px',
                lineHeight: '1.6',
              }}
            >
              Add your first email account to start sending emails through MagicMail's multi-account routing system
            </Typography>
            
            <CTAButton 
              startIcon={<PlusIcon style={{ width: 20, height: 20 }} />} 
              onClick={() => setShowAddModal(true)}
            >
              Add First Account
            </CTAButton>
          </Flex>
        </EmptyState>
      ) : (
        <AccountsContainer>
          <Box style={{ marginBottom: theme.spacing.md }}>
            <Flex justifyContent="space-between" alignItems="center" marginBottom={4}>
              <Typography variant="delta" textColor="neutral700" style={{ fontSize: '1.5rem', fontWeight: 600 }}>
                📧 Email Accounts
              </Typography>
              <GradientButton startIcon={<PlusIcon style={{ width: 16, height: 16 }} />} onClick={() => setShowAddModal(true)}>
                Add Account
              </GradientButton>
            </Flex>
          </Box>

          {/* Filter Bar */}
          <FilterBar>
            {/* Search Input */}
            <SearchInputWrapper>
              <SearchIcon />
              <StyledSearchInput
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, email, or provider..."
                type="text"
              />
            </SearchInputWrapper>
            
            {/* Status Filter */}
            <Box style={{ minWidth: '160px' }}>
              <SingleSelect
                value={filterStatus}
                onChange={setFilterStatus}
                placeholder="Status"
                size="S"
              >
                <SingleSelectOption value="all">All Accounts</SingleSelectOption>
                <SingleSelectOption value="active">✅ Active</SingleSelectOption>
                <SingleSelectOption value="inactive">❌ Inactive</SingleSelectOption>
                <SingleSelectOption value="primary">⭐ Primary</SingleSelectOption>
              </SingleSelect>
            </Box>

            {/* Provider Filter */}
            <Box style={{ minWidth: '160px' }}>
              <SingleSelect
                value={filterProvider}
                onChange={setFilterProvider}
                placeholder="Provider"
                size="S"
              >
                <SingleSelectOption value="all">All Providers</SingleSelectOption>
                {uniqueProviders.map(provider => (
                  <SingleSelectOption key={provider} value={provider}>
                    {provider}
                  </SingleSelectOption>
                ))}
              </SingleSelect>
            </Box>
          </FilterBar>

          {/* Accounts Table */}
          {filteredAccounts.length > 0 ? (
            <Box>
              <StyledTable>
                <Thead>
                  <Tr>
                    <Th>Status</Th>
                    <Th>Account</Th>
                    <Th>Provider</Th>
                    <Th title="Routing Priority (higher = preferred)">Priority</Th>
                    <Th>Usage Today</Th>
                    <Th>Total Sent</Th>
                    <Th>Last Used</Th>
                    <Th>Actions</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {filteredAccounts.map((account) => {
                    const usagePercent = account.dailyLimit > 0 
                      ? Math.round((account.emailsSentToday / account.dailyLimit) * 100)
                      : 0;
                    const isNearLimit = usagePercent > 80;

                    return (
                      <Tr key={account.id}>
                        {/* Status */}
                        <Td>
                          <Flex alignItems="center" gap={2}>
                            <OnlineBadge $active={account.isActive} />
                            {account.isActive ? (
                              <Badge backgroundColor="success600" textColor="neutral0" size="S">
                                Active
                              </Badge>
                            ) : (
                              <Badge backgroundColor="neutral600" textColor="neutral0" size="S">
                                Inactive
                              </Badge>
                            )}
                          </Flex>
                        </Td>

                        {/* Account */}
                        <Td>
                          <Flex direction="column" alignItems="flex-start" gap={1}>
                            <Flex alignItems="center" gap={2}>
                              <Typography fontWeight="semiBold">
                                {account.name}
                              </Typography>
                              {account.isPrimary && (
                                <Badge backgroundColor="warning600" textColor="neutral0" size="S">
                                  ⭐ Primary
                                </Badge>
                              )}
                            </Flex>
                            <Typography variant="pi" textColor="neutral600">
                              {account.fromEmail}
                            </Typography>
                          </Flex>
                        </Td>

                        {/* Provider */}
                        <Td>
                          <Badge size="S">
                            <ServerIcon style={{ width: 12, height: 12, marginRight: 4 }} />
                            {account.provider}
                          </Badge>
                        </Td>

                        {/* Priority */}
                        <Td>
                          <Badge size="S" variant="secondary">
                            {account.priority}/10
                          </Badge>
                        </Td>

                        {/* Usage Today */}
                        <Td>
                          <Flex direction="column" alignItems="flex-start" gap={1}>
                            <Typography fontWeight="semiBold">
                              {account.emailsSentToday || 0}
                              {account.dailyLimit > 0 && (
                                <Typography variant="pi" textColor="neutral500" as="span">
                                  {' '}/ {account.dailyLimit}
                                </Typography>
                              )}
                            </Typography>
                            {account.dailyLimit > 0 && (
                              <Box style={{ width: '100%', minWidth: '80px' }}>
                                <Box
                                  background="neutral100"
                                  style={{
                                    width: '100%',
                                    height: '6px',
                                    borderRadius: '999px',
                                    overflow: 'hidden',
                                  }}
                                >
                                  <Box
                                    style={{
                                      width: `${Math.min(usagePercent, 100)}%`,
                                      height: '100%',
                                      background: isNearLimit 
                                        ? 'var(--colors-danger600, #DC2626)'
                                        : 'var(--colors-success600, #16A34A)',
                                      borderRadius: '999px',
                                    }}
                                  />
                                </Box>
                              </Box>
                            )}
                          </Flex>
                        </Td>

                        {/* Total Sent */}
                        <Td>
                          <Typography fontWeight="semiBold">
                            {(account.totalEmailsSent || 0).toLocaleString()}
                          </Typography>
                        </Td>

                        {/* Last Used */}
                        <Td>
                          {account.lastUsed ? (
                            <Typography variant="pi" textColor="neutral600">
                              {new Date(account.lastUsed).toLocaleString('de-DE', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </Typography>
                          ) : (
                            <Typography variant="pi" textColor="neutral500">
                              Never
                            </Typography>
                          )}
                        </Td>

                        {/* Actions */}
                        <Td>
                          <Flex gap={2}>
                            <IconButton
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingAccount(account);
                              }}
                              aria-label="Edit Account"
                            >
                              <PencilIcon />
                            </IconButton>
                            <IconButtonPrimary
                              onClick={(e) => {
                                e.stopPropagation();
                                setTestingAccount(account);
                              }}
                              aria-label="Test Account"
                            >
                              <PlayIcon />
                            </IconButtonPrimary>
                            <IconButtonDanger
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteAccount(account.id, account.name);
                              }}
                              aria-label="Delete Account"
                            >
                              <TrashIcon />
                            </IconButtonDanger>
                          </Flex>
                        </Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </StyledTable>
            </Box>
          ) : (
            <Box padding={8} style={{ textAlign: 'center' }}>
              <Typography variant="beta" textColor="neutral600">
                No accounts found matching your filters
              </Typography>
            </Box>
          )}
        </AccountsContainer>
      )}

      {/* Add Account Modal */}
      <AddAccountModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAccountAdded={fetchAccounts}
      />

      {/* Edit Account Modal */}
      <AddAccountModal
        isOpen={!!editingAccount}
        onClose={() => setEditingAccount(null)}
        onAccountAdded={() => {
          fetchAccounts();
          setEditingAccount(null);
        }}
        editAccount={editingAccount}
      />

      {/* Test Email Modal */}
      {testingAccount && (
        <TestEmailModal
          account={testingAccount}
          onClose={() => setTestingAccount(null)}
          onTest={(email, testOptions) => {
            testAccount(testingAccount.id, testingAccount.name, email, testOptions);
            setTestingAccount(null);
          }}
        />
      )}
    </Container>
  );
};

// Test Email Modal Component
const TestEmailModal = ({ account, onClose, onTest }) => {
  const { post } = useFetchClient();
  const { toggleNotification } = useNotification();
  const [testEmail, setTestEmail] = useState('');
  const [priority, setPriority] = useState('normal');
  const [emailType, setEmailType] = useState('transactional');
  const [unsubscribeUrl, setUnsubscribeUrl] = useState('');
  const [testingStrapiService, setTestingStrapiService] = useState(false);

  const testStrapiService = async () => {
    setTestingStrapiService(true);
    try {
      const { data } = await post('/magic-mail/test-strapi-service', {
        testEmail,
        accountName: account.name, // Force this specific account!
      });

      if (data.success) {
        toggleNotification({
          type: 'success',
          message: `✅ Strapi Email Service Test: Email sent via ${account.name}!`,
        });
        onClose();
      } else {
        toggleNotification({
          type: 'warning',
          message: data.message || 'Test completed with warnings',
        });
      }
    } catch (err) {
      toggleNotification({
        type: 'danger',
        message: 'Strapi Email Service test failed',
      });
    } finally {
      setTestingStrapiService(false);
    }
  };

  // Prevent event bubbling to avoid triggering dashboard search
  const handleInputChange = (e) => {
    e.stopPropagation();
    setTestEmail(e.target.value);
  };

  const handleKeyDown = (e) => {
    e.stopPropagation();
  };

  const [testMode, setTestMode] = useState('strapi'); // 'direct' or 'strapi'

  return (
    <Modal.Root open={true} onOpenChange={onClose}>
      <StyledModalContent>
        <StyledModalHeader>
          <Modal.Title>Test Email Account</Modal.Title>
        </StyledModalHeader>

        <StyledModalBody>
          {/* Account Info Card */}
          <AccountInfoCard>
            <Typography variant="pi" style={{ color: 'var(--colors-primary600, #0284C7)', fontWeight: 500 }}>
              Testing Account
            </Typography>
            <Typography variant="beta" textColor="neutral800" style={{ fontSize: '1.125rem', fontWeight: 700, marginTop: '4px' }}>
              {account.name}
            </Typography>
            <Typography variant="pi" textColor="neutral600" style={{ marginTop: '2px' }}>
              {account.fromEmail}
            </Typography>
          </AccountInfoCard>

          {/* Recipient Email */}
          <Box style={{ marginTop: '20px' }}>
            <ModalFieldLabel>Recipient Email *</ModalFieldLabel>
            <StyledModalInput
              placeholder="test@example.com"
              value={testEmail}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onClick={(e) => e.stopPropagation()}
              type="email"
              autoFocus
            />
          </Box>

          {/* Test Mode Selection */}
          <Box style={{ marginTop: '20px' }}>
            <ModalFieldLabel>Test Mode</ModalFieldLabel>
            <TestOptionCard 
              $selected={testMode === 'direct'}
              onClick={() => setTestMode('direct')}
              style={{ marginBottom: '10px' }}
            >
              <Flex alignItems="center" gap={3}>
                <PlayIcon style={{ width: 20, height: 20, color: testMode === 'direct' ? 'var(--colors-primary600, #0284C7)' : 'var(--colors-neutral600)', flexShrink: 0 }} />
                <Box style={{ flex: 1 }}>
                  <Typography fontWeight="semiBold" style={{ fontSize: '14px', color: testMode === 'direct' ? 'var(--colors-primary600, #075985)' : 'var(--colors-neutral800)' }}>
                    Direct Test
                  </Typography>
                  <Typography variant="pi" textColor="neutral500" style={{ fontSize: '12px' }}>
                    Send directly through this account
                  </Typography>
                </Box>
              </Flex>
            </TestOptionCard>

            <TestOptionCard 
              $selected={testMode === 'strapi'}
              onClick={() => setTestMode('strapi')}
            >
              <Flex alignItems="center" gap={3}>
                <SparklesIcon style={{ width: 20, height: 20, color: testMode === 'strapi' ? 'var(--colors-primary600, #0284C7)' : 'var(--colors-neutral600)', flexShrink: 0 }} />
                <Box style={{ flex: 1 }}>
                  <Typography fontWeight="semiBold" style={{ fontSize: '14px', color: testMode === 'strapi' ? 'var(--colors-primary600, #075985)' : 'var(--colors-neutral800)' }}>
                    Strapi Service Test
                  </Typography>
                  <Typography variant="pi" textColor="neutral500" style={{ fontSize: '12px' }}>
                    Verify MagicMail intercepts Strapi's email service
                  </Typography>
                </Box>
              </Flex>
            </TestOptionCard>
          </Box>

          {/* Advanced Options (only for Direct Test) */}
          {testMode === 'direct' && (
            <Box style={{ marginTop: '20px', padding: '16px', background: 'var(--colors-neutral100, #F9FAFB)', borderRadius: '12px' }}>
              <ModalFieldLabel style={{ marginBottom: '16px', fontSize: '14px' }}>Advanced Options</ModalFieldLabel>
              
              <Box style={{ marginBottom: '12px' }}>
                <ModalFieldLabel>Priority</ModalFieldLabel>
                <StyledModalSelect
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                >
                  <option value="normal">Normal</option>
                  <option value="high">High Priority</option>
                </StyledModalSelect>
              </Box>

              <Box style={{ marginBottom: emailType === 'marketing' ? '12px' : '0' }}>
                <ModalFieldLabel>Email Type</ModalFieldLabel>
                <StyledModalSelect
                  value={emailType}
                  onChange={(e) => setEmailType(e.target.value)}
                >
                  <option value="transactional">Transactional</option>
                  <option value="marketing">Marketing</option>
                  <option value="notification">Notification</option>
                </StyledModalSelect>
              </Box>

              {emailType === 'marketing' && (
                <Box>
                  <ModalFieldLabel>Unsubscribe URL *</ModalFieldLabel>
                  <StyledModalInput
                    placeholder="https://yoursite.com/unsubscribe"
                    value={unsubscribeUrl}
                    onChange={(e) => setUnsubscribeUrl(e.target.value)}
                  />
                  <ModalHint>Required for GDPR/CAN-SPAM compliance</ModalHint>
                </Box>
              )}
            </Box>
          )}
        </StyledModalBody>

        <StyledModalFooter>
          <Flex justifyContent="space-between" style={{ width: '100%' }}>
            <TertiaryButton onClick={onClose}>
              Cancel
            </TertiaryButton>
            {testMode === 'direct' ? (
              <GradientButton
                onClick={() => onTest(testEmail, { priority, type: emailType, unsubscribeUrl })}
                disabled={!testEmail || !testEmail.includes('@') || (emailType === 'marketing' && !unsubscribeUrl)}
                startIcon={<PlayIcon style={{ width: 16, height: 16 }} />}
              >
                Send Test Email
              </GradientButton>
            ) : (
              <GradientButton
                onClick={testStrapiService}
                disabled={!testEmail || !testEmail.includes('@')}
                loading={testingStrapiService}
                startIcon={<SparklesIcon style={{ width: 16, height: 16 }} />}
              >
                Test Strapi Service
              </GradientButton>
            )}
          </Flex>
        </StyledModalFooter>
      </StyledModalContent>
    </Modal.Root>
  );
};

export default HomePage;

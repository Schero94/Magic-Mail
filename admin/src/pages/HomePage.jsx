import { useState, useEffect } from 'react';
import { useFetchClient, useNotification } from '@strapi/strapi/admin';
import { useAuthRefresh } from '../hooks/useAuthRefresh';
import styled, { keyframes, css } from 'styled-components';
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

// ================ THEME (Exact copy from magic-sessionmanager) ================
const theme = {
  colors: {
    primary: {
      50: '#F0F9FF',
      100: '#E0F2FE',
      500: '#0EA5E9',
      600: '#0284C7',
      700: '#0369A1',
    },
    secondary: {
      500: '#A855F7',
      600: '#9333EA',
    },
    success: {
      100: '#DCFCE7',
      500: '#22C55E',
      600: '#16A34A',
      700: '#15803D',
    },
    warning: {
      100: '#FEF3C7',
      500: '#F59E0B',
      600: '#D97706',
    },
    danger: {
      100: '#FEE2E2',
      500: '#EF4444',
      600: '#DC2626',
    },
    neutral: {
      0: '#FFFFFF',
      50: '#F9FAFB',
      100: '#F3F4F6',
      200: '#E5E7EB',
      600: '#4B5563',
      700: '#374151',
      800: '#1F2937',
    }
  },
  shadows: {
    sm: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
    xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
  },
  transitions: {
    fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
    normal: '300ms cubic-bezier(0.4, 0, 0.2, 1)',
    slow: '500ms cubic-bezier(0.4, 0, 0.2, 1)',
  },
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
    '2xl': '48px',
  },
  borderRadius: {
    md: '8px',
    lg: '12px',
    xl: '16px',
  }
};

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
    ${theme.colors.primary[600]} 0%, 
    ${theme.colors.secondary[600]} 100%
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
  color: ${theme.colors.neutral[0]};
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
  background: ${theme.colors.neutral[0]};
  border-radius: ${theme.borderRadius.lg};
  padding: 28px ${theme.spacing.lg};
  position: relative;
  overflow: hidden;
  transition: all ${theme.transitions.normal};
  ${css`animation: ${fadeIn} ${theme.transitions.slow} backwards;`}
  animation-delay: ${props => props.$delay || '0s'};
  box-shadow: ${theme.shadows.sm};
  border: 1px solid ${theme.colors.neutral[200]};
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
    border-color: ${props => props.$color || theme.colors.primary[500]};
    
    .stat-icon {
      transform: scale(1.15) rotate(5deg);
    }
    
    .stat-value {
      transform: scale(1.08);
      color: ${props => props.$color || theme.colors.primary[600]};
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
  background: ${props => props.$bg || theme.colors.primary[100]};
  transition: all ${theme.transitions.normal};
  margin: 0 auto 20px;
  box-shadow: ${theme.shadows.sm};
  
  svg {
    width: 34px;
    height: 34px;
    color: ${props => props.$color || theme.colors.primary[600]};
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
  color: ${theme.colors.neutral[800]};
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
  color: ${theme.colors.neutral[600]};
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
  background: ${theme.colors.neutral[0]};
  border-radius: ${theme.borderRadius.xl};
  border: 2px dashed ${theme.colors.neutral[200]};
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
    background: linear-gradient(135deg, ${theme.colors.primary[50]} 0%, ${theme.colors.secondary[50]} 100%);
    opacity: 0.3;
    z-index: 0;
  }
`;

const OnlineBadge = styled.div`
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: ${props => props.$active ? theme.colors.success[500] : theme.colors.neutral[400]};
  display: inline-block;
  margin-right: 8px;
  ${css`animation: ${props => props.$active ? pulse : 'none'} 2s ease-in-out infinite;`}
`;

const StyledTable = styled(Table)`
  thead {
    background: ${theme.colors.neutral[50]};
    border-bottom: 2px solid ${theme.colors.neutral[200]};
    
    th {
      font-weight: 600;
      color: ${theme.colors.neutral[700]};
      font-size: 0.875rem;
      text-transform: uppercase;
      letter-spacing: 0.025em;
      padding: ${theme.spacing.lg} ${theme.spacing.lg};
    }
  }
  
  tbody tr {
    transition: all ${theme.transitions.fast};
    border-bottom: 1px solid ${theme.colors.neutral[100]};
    
    &:last-child {
      border-bottom: none;
    }
    
    &:hover {
      background: ${theme.colors.neutral[50]};
    }
    
    td {
      padding: ${theme.spacing.lg} ${theme.spacing.lg};
      color: ${theme.colors.neutral[700]};
      vertical-align: middle;
    }
  }
`;

const FilterBar = styled(Flex)`
  background: ${theme.colors.neutral[0]};
  padding: ${theme.spacing.md} ${theme.spacing.lg};
  border-radius: ${theme.borderRadius.lg};
  margin-bottom: ${theme.spacing.lg};
  box-shadow: ${theme.shadows.sm};
  border: 1px solid ${theme.colors.neutral[200]};
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
  color: ${theme.colors.neutral[600]};
  pointer-events: none;
`;

const StyledSearchInput = styled.input`
  width: 100%;
  padding: 10px 12px 10px 40px;
  border: 1px solid ${theme.colors.neutral[200]};
  border-radius: ${theme.borderRadius.md};
  font-size: 0.875rem;
  transition: all ${theme.transitions.fast};
  
  &:focus {
    outline: none;
    border-color: ${theme.colors.primary[500]};
    box-shadow: 0 0 0 2px ${theme.colors.primary[100]};
  }
  
  &::placeholder {
    color: ${theme.colors.neutral[600]};
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
        <StatCard $delay="0.1s" $color={theme.colors.primary[600]}>
          <StatIcon className="stat-icon" $bg={theme.colors.primary[100]} $color={theme.colors.primary[600]}>
            <EnvelopeIcon />
          </StatIcon>
          <StatValue className="stat-value">{totalSentToday}</StatValue>
          <StatLabel>Emails Today</StatLabel>
        </StatCard>

        <StatCard $delay="0.2s" $color={theme.colors.success[600]}>
          <StatIcon className="stat-icon" $bg={theme.colors.success[100]} $color={theme.colors.success[600]}>
            <ServerIcon />
          </StatIcon>
          <StatValue className="stat-value">{totalSent}</StatValue>
          <StatLabel>Total Sent</StatLabel>
        </StatCard>

        <StatCard $delay="0.3s" $color={theme.colors.warning[600]}>
          <StatIcon className="stat-icon" $bg={theme.colors.warning[100]} $color={theme.colors.warning[600]}>
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
                background: `linear-gradient(135deg, ${theme.colors.primary[100]} 0%, ${theme.colors.secondary[100]} 100%)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: theme.shadows.xl,
              }}
            >
              <EnvelopeIcon style={{ width: '60px', height: '60px', color: theme.colors.primary[600] }} />
            </Box>
            
            <Typography 
              variant="alpha" 
              style={{ 
                fontSize: '1.75rem',
                fontWeight: '700',
                color: theme.colors.neutral[800],
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
            
            <Button 
              startIcon={<PlusIcon style={{ width: 20, height: 20 }} />} 
              onClick={() => setShowAddModal(true)}
              size="L"
            >
              Add First Account
            </Button>
          </Flex>
        </EmptyState>
      ) : (
        <AccountsContainer>
          <Box style={{ marginBottom: theme.spacing.md }}>
            <Flex justifyContent="space-between" alignItems="center" marginBottom={4}>
              <Typography variant="delta" style={{ fontSize: '1.5rem', fontWeight: 600, color: theme.colors.neutral[700] }}>
                📧 Email Accounts
              </Typography>
              <Button startIcon={<PlusIcon style={{ width: 16, height: 16 }} />} onClick={() => setShowAddModal(true)}>
                Add Account
              </Button>
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
                                  style={{
                                    width: '100%',
                                    height: '6px',
                                    background: theme.colors.neutral[100],
                                    borderRadius: '999px',
                                    overflow: 'hidden',
                                  }}
                                >
                                  <Box
                                    style={{
                                      width: `${Math.min(usagePercent, 100)}%`,
                                      height: '100%',
                                      background: isNearLimit 
                                        ? theme.colors.danger[600]
                                        : theme.colors.success[600],
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
                            <Button
                              variant="secondary"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingAccount(account);
                              }}
                              size="S"
                              aria-label="Edit Account"
                            >
                              <PencilIcon style={{ width: 16, height: 16 }} />
                            </Button>
                            <Button
                              variant="secondary"
                              onClick={(e) => {
                                e.stopPropagation();
                                setTestingAccount(account);
                              }}
                              size="S"
                              aria-label="Test Account"
                            >
                              <PlayIcon style={{ width: 16, height: 16 }} />
                            </Button>
                            <Button
                              variant="danger-light"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteAccount(account.id, account.name);
                              }}
                              size="S"
                              aria-label="Delete Account"
                            >
                              <TrashIcon style={{ width: 16, height: 16 }} />
                            </Button>
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

  return (
    <Modal.Root open={true} onOpenChange={onClose}>
      <Modal.Content size="L">
        <Modal.Header>
          <Typography variant="beta">
            <PlayIcon style={{ marginRight: 8, width: 20, height: 20 }} />
            Test Email Account
          </Typography>
        </Modal.Header>

        <Modal.Body>
          <Flex direction="column" gap={6} style={{ width: '100%' }}>
            {/* Account Info */}
            <Box
              padding={4}
              background="neutral100"
              hasRadius
              style={{
                borderRadius: '8px',
                width: '100%',
              }}
            >
              <Flex direction="column" gap={2} style={{ width: '100%' }}>
                <Typography fontWeight="semiBold" style={{ fontSize: '14px', color: '#4B5563' }}>
                  Testing Account
                </Typography>
                <Typography variant="beta" style={{ fontSize: '18px', fontWeight: 600 }}>
                  {account.name}
                </Typography>
                <Typography variant="pi" textColor="neutral600" style={{ fontSize: '14px' }}>
                  {account.fromEmail}
                </Typography>
              </Flex>
            </Box>

            {/* Email Input */}
            <Field.Root required style={{ width: '100%' }}>
              <Field.Label style={{ fontSize: '14px' }}>Recipient Email Address</Field.Label>
              <TextInput
                placeholder="recipient@example.com"
                value={testEmail}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onClick={(e) => e.stopPropagation()}
                onFocus={(e) => e.stopPropagation()}
                onBlur={(e) => e.stopPropagation()}
                type="email"
                autoFocus
                autoComplete="off"
                name="test-email-recipient"
                style={{ width: '100%', fontSize: '14px' }}
              />
              <Field.Hint style={{ fontSize: '13px' }}>
                Enter the email address where you want to receive the test email
              </Field.Hint>
            </Field.Root>

            {/* Test Configuration */}
            <Box style={{ width: '100%' }}>
              <Typography fontWeight="semiBold" marginBottom={3} style={{ fontSize: '14px', color: '#4B5563' }}>
                Email Configuration
              </Typography>
              
              <Flex direction="column" gap={3} style={{ width: '100%' }}>
                {/* Priority */}
                <Field.Root style={{ width: '100%' }}>
                  <Field.Label style={{ fontSize: '14px' }}>Priority</Field.Label>
                  <SingleSelect
                    value={priority}
                    onChange={setPriority}
                    style={{ width: '100%' }}
                  >
                    <SingleSelectOption value="normal">Normal Priority</SingleSelectOption>
                    <SingleSelectOption value="high">High Priority</SingleSelectOption>
                  </SingleSelect>
                  <Field.Hint style={{ fontSize: '13px' }}>
                    High priority adds X-Priority and Importance headers
                  </Field.Hint>
                </Field.Root>

                {/* Email Type */}
                <Field.Root style={{ width: '100%' }}>
                  <Field.Label style={{ fontSize: '14px' }}>Email Type</Field.Label>
                  <SingleSelect
                    value={emailType}
                    onChange={setEmailType}
                    style={{ width: '100%' }}
                  >
                    <SingleSelectOption value="transactional">Transactional</SingleSelectOption>
                    <SingleSelectOption value="marketing">Marketing</SingleSelectOption>
                    <SingleSelectOption value="notification">Notification</SingleSelectOption>
                  </SingleSelect>
                  <Field.Hint style={{ fontSize: '13px' }}>
                    Marketing emails automatically include List-Unsubscribe headers
                  </Field.Hint>
                </Field.Root>

                {/* Unsubscribe URL (nur für Marketing) */}
                {emailType === 'marketing' && (
                  <Field.Root style={{ width: '100%' }}>
                    <Field.Label style={{ fontSize: '14px' }}>Unsubscribe URL (Required for Marketing)</Field.Label>
                    <TextInput
                      placeholder="https://yoursite.com/unsubscribe"
                      value={unsubscribeUrl}
                      onChange={(e) => {
                        e.stopPropagation();
                        setUnsubscribeUrl(e.target.value);
                      }}
                      style={{ width: '100%', fontSize: '14px' }}
                    />
                    <Field.Hint style={{ fontSize: '13px' }}>
                      Required for GDPR/CAN-SPAM compliance. Adds List-Unsubscribe header.
                    </Field.Hint>
                  </Field.Root>
                )}
              </Flex>
            </Box>

            {/* Test Options */}
            <Box style={{ width: '100%' }}>
              <Typography fontWeight="semiBold" marginBottom={3} style={{ fontSize: '14px', color: '#4B5563' }}>
                Test Options
              </Typography>
              
              <Flex direction="column" gap={3} style={{ width: '100%' }}>
                {/* Direct Test */}
                <Box
                  padding={4}
                  background="neutral0"
                  hasRadius
                  style={{
                    border: '2px solid #E5E7EB',
                    borderRadius: '8px',
                    width: '100%',
                  }}
                >
                  <Flex direction="column" gap={2}>
                    <Flex alignItems="center" gap={2}>
                      <PlayIcon style={{ width: 18, height: 18, color: '#0EA5E9', flexShrink: 0 }} />
                      <Typography fontWeight="semiBold" style={{ fontSize: '14px' }}>
                        Direct Test
                      </Typography>
                    </Flex>
                    <Typography variant="pi" textColor="neutral600" style={{ fontSize: '13px', lineHeight: '1.5' }}>
                      Send test email directly through this specific account
                    </Typography>
                  </Flex>
                </Box>

                {/* Strapi Service Test */}
                <Box
                  padding={4}
                  background="primary50"
                  hasRadius
                  style={{
                    border: '2px solid #0EA5E9',
                    borderRadius: '8px',
                    width: '100%',
                  }}
                >
                  <Flex direction="column" gap={2}>
                    <Flex alignItems="center" gap={2}>
                      <SparklesIcon style={{ width: 18, height: 18, color: '#0369A1', flexShrink: 0 }} />
                      <Typography fontWeight="semiBold" style={{ fontSize: '14px', color: '#0369A1' }}>
                        Strapi Email Service Test
                      </Typography>
                    </Flex>
                    <Typography variant="pi" textColor="neutral600" style={{ fontSize: '13px', lineHeight: '1.5' }}>
                      Test if MagicMail intercepts Strapi's native email service via THIS account ({account.name})
                    </Typography>
                    <Typography variant="pi" textColor="neutral600" style={{ fontSize: '13px', lineHeight: '1.5' }}>
                      <strong style={{ color: '#0369A1' }}>Use this to verify Email Designer compatibility</strong>
                    </Typography>
                  </Flex>
                </Box>
              </Flex>
            </Box>
          </Flex>
        </Modal.Body>

        <Modal.Footer>
          <Flex justifyContent="space-between" gap={2} style={{ width: '100%' }}>
            <Button onClick={onClose} variant="tertiary">
              Cancel
            </Button>
            <Flex gap={2}>
              <Button
                onClick={() => onTest(testEmail, { priority, type: emailType, unsubscribeUrl })}
                disabled={!testEmail || !testEmail.includes('@') || (emailType === 'marketing' && !unsubscribeUrl)}
                startIcon={<PlayIcon style={{ width: 16, height: 16 }} />}
                variant="secondary"
              >
                Test Direct
              </Button>
              <Button
                onClick={testStrapiService}
                disabled={!testEmail || !testEmail.includes('@')}
                loading={testingStrapiService}
                startIcon={<SparklesIcon style={{ width: 16, height: 16 }} />}
              >
                Test Strapi Service
              </Button>
            </Flex>
          </Flex>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
};

export default HomePage;

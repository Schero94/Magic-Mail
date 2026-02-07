import { useState, useEffect } from 'react';
import { useFetchClient, useNotification } from '@strapi/strapi/admin';
import { useAuthRefresh } from '../hooks/useAuthRefresh';
import styled, { keyframes, css } from 'styled-components';
import {
  Box,
  Flex,
  Typography,
  Loader,
  Badge,
  Modal,
  Field,
  TextInput,
  Textarea,
  NumberInput,
  Toggle,
  SingleSelect,
  SingleSelectOption,
} from '@strapi/design-system';
import { Table, Thead, Tbody, Tr, Th, Td } from '@strapi/design-system';
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  CheckIcon,
  Cog6ToothIcon,
  SparklesIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import { 
  GradientButton, 
  TertiaryButton, 
  CTAButton,
  IconButton,
  IconButtonDanger,
} from '../components/StyledButtons';

// ================ THEME (Exact copy from Email Accounts) ================
const theme = {
  colors: {
    primary: {
      50: 'rgba(14, 165, 233, 0.06)',
      100: 'rgba(14, 165, 233, 0.12)',
      500: '#0EA5E9',
      600: '#0284C7',
      700: '#0369A1',
    },
    secondary: {
      50: 'rgba(168, 85, 247, 0.06)',
      100: 'rgba(168, 85, 247, 0.1)',
      500: '#A855F7',
      600: '#9333EA',
    },
    success: {
      100: 'rgba(34, 197, 94, 0.15)',
      500: '#22C55E',
      600: '#16A34A',
      700: '#15803D',
    },
    warning: {
      100: 'rgba(245, 158, 11, 0.15)',
      500: '#F59E0B',
      600: '#D97706',
    },
    danger: {
      100: 'rgba(220, 38, 38, 0.12)',
      500: '#EF4444',
      600: '#DC2626',
    },
    neutral: {
      0: 'var(--colors-neutral0, #FFFFFF)',
      50: 'var(--colors-neutral100, #F9FAFB)',
      100: 'rgba(128, 128, 128, 0.1)',
      200: 'rgba(128, 128, 128, 0.2)',
      600: 'var(--colors-neutral600, #4B5563)',
      700: 'var(--colors-neutral800, #374151)',
      800: 'var(--colors-neutral900, #1F2937)',
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
    var(--colors-secondary600, #7C3AED) 0%, 
    ${'var(--colors-primary600, #0284C7)'} 100%
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

const RulesContainer = styled(Box)`
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
    background: linear-gradient(135deg, rgba(168, 85, 247, 0.06) 0%, ${'rgba(2, 132, 199, 0.06)'} 100%);
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
  
  &:focus {
    outline: none;
    border-color: ${'var(--colors-primary600, #0EA5E9)'};
    box-shadow: 0 0 0 2px ${'rgba(2, 132, 199, 0.12)'};
  }
  
  &::placeholder {
    color: var(--colors-neutral500);
  }
`;

const RoutingRulesPage = () => {
  useAuthRefresh(); // Initialize token auto-refresh
  const { get, post, put, del } = useFetchClient();
  const { toggleNotification } = useNotification();
  const [loading, setLoading] = useState(true);
  const [rules, setRules] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterMatchType, setFilterMatchType] = useState('all');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [rulesRes, accountsRes] = await Promise.all([
        get('/magic-mail/routing-rules'),
        get('/magic-mail/accounts'),
      ]);
      setRules(rulesRes.data.data || []);
      setAccounts(accountsRes.data.data || []);
    } catch (err) {
      console.error('[magic-mail] Error fetching data:', err);
      toggleNotification({
        type: 'danger',
        message: 'Failed to load routing rules',
      });
    } finally {
      setLoading(false);
    }
  };

  const deleteRule = async (ruleId, ruleName) => {
    if (!confirm(`Delete routing rule "${ruleName}"?`)) return;

    try {
      await del(`/magic-mail/routing-rules/${ruleId}`);
      toggleNotification({
        type: 'success',
        message: 'Routing rule deleted successfully',
      });
      fetchData();
    } catch (err) {
      toggleNotification({
        type: 'danger',
        message: 'Failed to delete routing rule',
      });
    }
  };

  if (loading) {
    return (
      <Flex justifyContent="center" alignItems="center" style={{ minHeight: '400px' }}>
        <Loader>Loading Routing Rules...</Loader>
      </Flex>
    );
  }

  // Calculate stats
  const totalRules = rules.length;
  const activeRules = rules.filter(r => r.isActive).length;
  const highPriorityRules = rules.filter(r => r.priority >= 5).length;

  // Filter and search logic
  const filteredRules = rules.filter(rule => {
    const matchesSearch = 
      rule.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (rule.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      rule.matchValue.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (rule.accountName || '').toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = 
      filterStatus === 'all' || 
      (filterStatus === 'active' && rule.isActive) ||
      (filterStatus === 'inactive' && !rule.isActive);
    
    const matchesType = 
      filterMatchType === 'all' || 
      rule.matchType === filterMatchType;
    
    return matchesSearch && matchesStatus && matchesType;
  });

  const uniqueMatchTypes = [...new Set(rules.map(r => r.matchType))].filter(Boolean);

  return (
    <Container>
      {/* Hero Header */}
      <Header>
        <HeaderContent justifyContent="space-between" alignItems="center">
          <Flex direction="column" alignItems="flex-start" gap={2}>
            <Title>
              <FunnelIcon />
              Email Routing Rules
            </Title>
            <Subtitle>
              Define intelligent routing rules to send emails through specific accounts based on conditions
            </Subtitle>
          </Flex>
        </HeaderContent>
      </Header>

      {/* Quick Stats */}
      <StatsGrid>
        <StatCard $delay="0.1s" $color={'var(--colors-secondary600, #7C3AED)'}>
          <StatIcon className="stat-icon" $bg={'rgba(168, 85, 247, 0.12)'} $color={'var(--colors-secondary600, #7C3AED)'}>
            <FunnelIcon />
          </StatIcon>
          <StatValue className="stat-value">{totalRules}</StatValue>
          <StatLabel>Total Rules</StatLabel>
        </StatCard>

        <StatCard $delay="0.2s" $color={'var(--colors-success600, #16A34A)'}>
          <StatIcon className="stat-icon" $bg={'rgba(22, 163, 74, 0.12)'} $color={'var(--colors-success600, #16A34A)'}>
            <CheckIcon />
          </StatIcon>
          <StatValue className="stat-value">{activeRules}</StatValue>
          <StatLabel>Active Rules</StatLabel>
        </StatCard>

        <StatCard $delay="0.3s" $color={'var(--colors-warning600, #D97706)'}>
          <StatIcon className="stat-icon" $bg={'rgba(234, 179, 8, 0.12)'} $color={'var(--colors-warning600, #D97706)'}>
            <SparklesIcon />
          </StatIcon>
          <StatValue className="stat-value">{highPriorityRules}</StatValue>
          <StatLabel>High Priority</StatLabel>
        </StatCard>
      </StatsGrid>

      {/* Rules List or Empty State */}
      {rules.length === 0 ? (
        <EmptyState>
          {/* Floating Emoji */}
          <FloatingEmoji>
            🎯
          </FloatingEmoji>
          
          <Flex direction="column" alignItems="center" gap={6} style={{ position: 'relative', zIndex: 1 }}>
            <Box
              style={{
                width: '120px',
                height: '120px',
                borderRadius: '50%',
                background: `linear-gradient(135deg, rgba(168, 85, 247, 0.12) 0%, ${'rgba(2, 132, 199, 0.12)'} 100%)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: theme.shadows.xl,
              }}
            >
              <FunnelIcon style={{ width: '60px', height: '60px', color: 'var(--colors-secondary600, #7C3AED)' }} />
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
              No Routing Rules Yet
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
              Create your first routing rule to intelligently route emails based on type, recipient, subject, or custom conditions
            </Typography>
            
            <CTAButton 
              startIcon={<PlusIcon style={{ width: 20, height: 20 }} />} 
              onClick={() => setShowModal(true)}
            >
              Create First Rule
            </CTAButton>
          </Flex>
        </EmptyState>
      ) : (
        <RulesContainer>
          <Box style={{ marginBottom: theme.spacing.md }}>
            <Flex justifyContent="space-between" alignItems="center" marginBottom={4}>
              <Typography variant="delta" textColor="neutral700" style={{ fontSize: '1.5rem', fontWeight: 600 }}>
                🎯 Routing Rules
              </Typography>
              <GradientButton startIcon={<PlusIcon style={{ width: 16, height: 16 }} />} onClick={() => setShowModal(true)}>
                Create Rule
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
                placeholder="Search by name, description, or value..."
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
                <SingleSelectOption value="all">All Rules</SingleSelectOption>
                <SingleSelectOption value="active">✅ Active</SingleSelectOption>
                <SingleSelectOption value="inactive">❌ Inactive</SingleSelectOption>
              </SingleSelect>
            </Box>

            {/* Match Type Filter */}
            <Box style={{ minWidth: '160px' }}>
              <SingleSelect
                value={filterMatchType}
                onChange={setFilterMatchType}
                placeholder="Match Type"
                size="S"
              >
                <SingleSelectOption value="all">All Types</SingleSelectOption>
                {uniqueMatchTypes.map(type => (
                  <SingleSelectOption key={type} value={type}>
                    {type}
                  </SingleSelectOption>
                ))}
              </SingleSelect>
            </Box>
          </FilterBar>

          {/* Rules Table */}
          {filteredRules.length > 0 ? (
            <Box>
              <StyledTable>
                <Thead>
                  <Tr>
                    <Th>Status</Th>
                    <Th>Rule Name</Th>
                    <Th>Match Type</Th>
                    <Th>Match Value</Th>
                    <Th>Target Account</Th>
                    <Th>Priority</Th>
                    <Th>Actions</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {filteredRules.map((rule) => (
                    <Tr key={rule.id}>
                      {/* Status */}
                      <Td>
                        <Flex alignItems="center" gap={2}>
                          <OnlineBadge $active={rule.isActive} />
                          {rule.isActive ? (
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

                      {/* Name */}
                      <Td>
                        <Flex direction="column" alignItems="flex-start" gap={1}>
                          <Typography fontWeight="semiBold">
                            {rule.name}
                          </Typography>
                          {rule.description && (
                            <Typography variant="pi" textColor="neutral600">
                              {rule.description}
                            </Typography>
                          )}
                        </Flex>
                      </Td>

                      {/* Match Type */}
                      <Td>
                        <Badge size="S" variant="secondary">
                          {rule.matchType === 'emailType' && '📧 Email Type'}
                          {rule.matchType === 'recipient' && '👤 Recipient'}
                          {rule.matchType === 'subject' && '📝 Subject'}
                          {rule.matchType === 'template' && '🎨 Template'}
                          {rule.matchType === 'custom' && '⚙️ Custom'}
                        </Badge>
                      </Td>

                      {/* Match Value */}
                      <Td>
                        <Typography variant="pi" style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                          {rule.matchValue}
                        </Typography>
                      </Td>

                      {/* Target Account */}
                      <Td>
                        <Flex direction="column" alignItems="flex-start" gap={1}>
                          <Typography fontWeight="semiBold">
                            {rule.accountName}
                          </Typography>
                          {rule.fallbackAccountName && (
                            <Typography variant="pi" textColor="neutral600">
                              Fallback: {rule.fallbackAccountName}
                            </Typography>
                          )}
                          {rule.whatsappFallback && (
                            <Badge backgroundColor="success100" textColor="success700" size="S">
                              + WhatsApp
                            </Badge>
                          )}
                        </Flex>
                      </Td>

                      {/* Priority */}
                      <Td>
                        <Badge 
                          size="S" 
                          variant="secondary"
                          backgroundColor={rule.priority >= 5 ? 'warning100' : 'neutral100'}
                          textColor={rule.priority >= 5 ? 'warning700' : 'neutral700'}
                        >
                          {rule.priority >= 5 && '⭐ '}
                          {rule.priority}
                        </Badge>
                      </Td>

                      {/* Actions */}
                      <Td>
                        <Flex gap={2}>
                          <IconButton
                            onClick={() => setEditingRule(rule)}
                            aria-label="Edit Rule"
                          >
                            <PencilIcon />
                          </IconButton>
                          <IconButtonDanger
                            onClick={() => deleteRule(rule.id, rule.name)}
                            aria-label="Delete Rule"
                          >
                            <TrashIcon />
                          </IconButtonDanger>
                        </Flex>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </StyledTable>
            </Box>
          ) : (
            <Box padding={8} style={{ textAlign: 'center' }}>
              <Typography variant="beta" textColor="neutral600">
                No rules found matching your filters
              </Typography>
            </Box>
          )}
        </RulesContainer>
      )}

      {/* Create/Edit Modal */}
      {(showModal || editingRule) && (
        <RuleModal
          rule={editingRule}
          accounts={accounts}
          onClose={() => {
            setShowModal(false);
            setEditingRule(null);
          }}
          onSave={fetchData}
        />
      )}
    </Container>
  );
};

// ================ RULE MODAL COMPONENT ================
const RuleModal = ({ rule, accounts, onClose, onSave }) => {
  const { post, put } = useFetchClient();
  const { toggleNotification } = useNotification();
  const [loading, setLoading] = useState(false);
  const isEditMode = !!rule;

  const [formData, setFormData] = useState({
    name: rule?.name || '',
    description: rule?.description || '',
    isActive: rule?.isActive !== undefined ? rule.isActive : true,
    priority: rule?.priority || 1,
    matchType: rule?.matchType || 'emailType',
    matchValue: rule?.matchValue || '',
    accountName: rule?.accountName || '',
    fallbackAccountName: rule?.fallbackAccountName || '',
    whatsappFallback: rule?.whatsappFallback || false,
  });

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      if (isEditMode) {
        await put(`/magic-mail/routing-rules/${rule.id}`, formData);
        toggleNotification({
          type: 'success',
          message: 'Routing rule updated successfully',
        });
      } else {
        await post('/magic-mail/routing-rules', formData);
        toggleNotification({
          type: 'success',
          message: 'Routing rule created successfully',
        });
      }
      onSave();
      onClose();
    } catch (err) {
      toggleNotification({
        type: 'danger',
        message: err.response?.data?.error?.message || `Failed to ${isEditMode ? 'update' : 'create'} routing rule`,
      });
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = formData.name && formData.matchType && formData.matchValue && formData.accountName;

  const getMatchTypeHelp = () => {
    switch (formData.matchType) {
      case 'emailType':
        return 'Match based on email type (e.g., "transactional", "marketing", "notification")';
      case 'recipient':
        return 'Match if recipient email contains this value (e.g., "@vip-customers.com")';
      case 'subject':
        return 'Match if subject line contains this value (e.g., "Invoice", "Password Reset")';
      case 'template':
        return 'Match if email uses this template name (exact match)';
      case 'custom':
        return 'Match based on custom field value passed in emailData.customField';
      default:
        return '';
    }
  };

  return (
    <Modal.Root open={true} onOpenChange={onClose}>
      <Modal.Content size="L">
        <Modal.Header>
          <Typography variant="beta">
            <Cog6ToothIcon style={{ marginRight: 8, width: 24, height: 24 }} />
            {isEditMode ? 'Edit Routing Rule' : 'Create Routing Rule'}
          </Typography>
        </Modal.Header>

        <Modal.Body>
          <Box style={{ width: '100%' }}>
            <Flex direction="column" gap={6} style={{ width: '100%' }}>
              
              {/* Rule Name */}
              <Field.Root required style={{ width: '100%' }}>
                <Field.Label>Rule Name</Field.Label>
                <TextInput
                  placeholder="Marketing emails via SendGrid"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  style={{ width: '100%' }}
                />
                <Field.Hint>
                  A descriptive name for this routing rule
                </Field.Hint>
              </Field.Root>

              {/* Description */}
              <Field.Root style={{ width: '100%' }}>
                <Field.Label>Description (Optional)</Field.Label>
                <Textarea
                  placeholder="Route all marketing emails through SendGrid for better deliverability..."
                  value={formData.description}
                  onChange={(e) => handleChange('description', e.target.value)}
                  rows={3}
                  style={{ width: '100%' }}
                />
              </Field.Root>

              {/* Match Type */}
              <Field.Root required style={{ width: '100%' }}>
                <Field.Label>Match Type</Field.Label>
                <SingleSelect
                  value={formData.matchType}
                  onChange={(value) => handleChange('matchType', value)}
                  style={{ width: '100%' }}
                >
                  <SingleSelectOption value="emailType">📧 Email Type</SingleSelectOption>
                  <SingleSelectOption value="recipient">👤 Recipient</SingleSelectOption>
                  <SingleSelectOption value="subject">📝 Subject</SingleSelectOption>
                  <SingleSelectOption value="template">🎨 Template</SingleSelectOption>
                  <SingleSelectOption value="custom">⚙️ Custom Field</SingleSelectOption>
                </SingleSelect>
                <Field.Hint>
                  {getMatchTypeHelp()}
                </Field.Hint>
              </Field.Root>

              {/* Match Value */}
              <Field.Root required style={{ width: '100%' }}>
                <Field.Label>Match Value</Field.Label>
                <TextInput
                  placeholder={
                    formData.matchType === 'emailType' ? 'marketing' :
                    formData.matchType === 'recipient' ? '@vip-customers.com' :
                    formData.matchType === 'subject' ? 'Invoice' :
                    formData.matchType === 'template' ? 'welcome-email' :
                    'custom-value'
                  }
                  value={formData.matchValue}
                  onChange={(e) => handleChange('matchValue', e.target.value)}
                  style={{ width: '100%' }}
                />
                <Field.Hint>
                  The value to match against. Case-insensitive for recipient and subject.
                </Field.Hint>
              </Field.Root>

              {/* Target Account */}
              <Field.Root required style={{ width: '100%' }}>
                <Field.Label>Target Account</Field.Label>
                <SingleSelect
                  value={formData.accountName}
                  onChange={(value) => handleChange('accountName', value)}
                  style={{ width: '100%' }}
                >
                  <SingleSelectOption value="">Select account...</SingleSelectOption>
                  {accounts.filter(a => a.isActive).map(account => (
                    <SingleSelectOption key={account.name} value={account.name}>
                      {account.name} ({account.provider})
                    </SingleSelectOption>
                  ))}
                </SingleSelect>
                <Field.Hint>
                  The email account to use when this rule matches
                </Field.Hint>
              </Field.Root>

              {/* Fallback Account */}
              <Field.Root style={{ width: '100%' }}>
                <Field.Label>Fallback Account (Optional)</Field.Label>
                <SingleSelect
                  value={formData.fallbackAccountName}
                  onChange={(value) => handleChange('fallbackAccountName', value)}
                  style={{ width: '100%' }}
                >
                  <SingleSelectOption value="">No fallback</SingleSelectOption>
                  {accounts.filter(a => a.isActive && a.name !== formData.accountName).map(account => (
                    <SingleSelectOption key={account.name} value={account.name}>
                      {account.name} ({account.provider})
                    </SingleSelectOption>
                  ))}
                </SingleSelect>
                <Field.Hint>
                  Use this account if the target account is unavailable or rate-limited
                </Field.Hint>
              </Field.Root>

              {/* WhatsApp Fallback */}
              <Box 
                padding={4} 
                background={formData.whatsappFallback ? 'rgba(22, 163, 74, 0.12)' : 'var(--colors-neutral100)'}
                hasRadius
                style={{ 
                  width: '100%',
                  border: formData.whatsappFallback ? `2px solid ${'var(--colors-success600, #16A34A)'}` : `1px solid ${'rgba(128, 128, 128, 0.2)'}`,
                  borderRadius: theme.borderRadius.md,
                  transition: 'all 0.2s ease'
                }}
              >
                <Flex gap={3} alignItems="center">
                  <Toggle
                    checked={formData.whatsappFallback}
                    onChange={() => handleChange('whatsappFallback', !formData.whatsappFallback)}
                  />
                  <Box style={{ flex: 1 }}>
                    <Flex alignItems="center" gap={2}>
                      <Typography fontWeight="semiBold">
                        WhatsApp Fallback
                      </Typography>
                      {formData.whatsappFallback && (
                        <Badge backgroundColor="success600" textColor="neutral0" size="S">
                          ENABLED
                        </Badge>
                      )}
                    </Flex>
                    <Typography variant="pi" textColor="neutral600" marginTop={1}>
                      {formData.whatsappFallback 
                        ? 'If ALL email accounts fail, message will be sent via WhatsApp (requires connected WhatsApp & phone number in email data)'
                        : 'Enable to use WhatsApp as last-resort fallback when email delivery fails'
                      }
                    </Typography>
                  </Box>
                </Flex>
              </Box>

              {/* Priority */}
              <Field.Root style={{ width: '100%' }}>
                <Field.Label>Rule Priority</Field.Label>
                <NumberInput
                  value={formData.priority}
                  onValueChange={(value) => handleChange('priority', value)}
                  min={1}
                  max={10}
                  style={{ width: '100%' }}
                />
                <Field.Hint>
                  Higher priority rules are evaluated first (1-10). Use high priority for more specific rules.
                </Field.Hint>
              </Field.Root>

              {/* Active Toggle */}
              <Box 
                padding={4} 
                background={formData.isActive ? 'rgba(22, 163, 74, 0.12)' : 'rgba(220, 38, 38, 0.12)'}
                hasRadius
                style={{ 
                  width: '100%',
                  border: formData.isActive ? `2px solid ${'var(--colors-success600, #16A34A)'}` : `2px solid ${'var(--colors-danger600, #DC2626)'}`,
                  borderRadius: theme.borderRadius.md,
                  transition: 'all 0.2s ease'
                }}
              >
                <Flex gap={3} alignItems="center">
                  <Toggle
                    checked={formData.isActive}
                    onChange={() => handleChange('isActive', !formData.isActive)}
                  />
                  <Box style={{ flex: 1 }}>
                    <Flex alignItems="center" gap={2}>
                      <Typography fontWeight="semiBold">
                        {formData.isActive ? '✅ Rule Active' : '❌ Rule Inactive'}
                      </Typography>
                      <Badge 
                        backgroundColor={formData.isActive ? 'success600' : 'danger600'} 
                        textColor="neutral0" 
                        size="S"
                      >
                        {formData.isActive ? 'ENABLED' : 'DISABLED'}
                      </Badge>
                    </Flex>
                    <Typography variant="pi" textColor="neutral600" marginTop={1}>
                      {formData.isActive 
                        ? 'This rule is active and will be used for email routing'
                        : 'This rule is disabled and will be ignored'
                      }
                    </Typography>
                  </Box>
                </Flex>
              </Box>

            </Flex>
          </Box>
        </Modal.Body>

        <Modal.Footer>
          <Flex justifyContent="flex-end" gap={2} style={{ width: '100%' }}>
            <TertiaryButton onClick={onClose}>
              Cancel
            </TertiaryButton>
            <GradientButton
              onClick={handleSubmit}
              loading={loading}
              disabled={!canSubmit}
              startIcon={<CheckIcon style={{ width: 16, height: 16 }} />}
            >
              {isEditMode ? 'Update Rule' : 'Create Rule'}
            </GradientButton>
          </Flex>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
};

export default RoutingRulesPage;


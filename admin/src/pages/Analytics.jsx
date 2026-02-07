import { useState, useEffect } from 'react';
import { useFetchClient, useNotification } from '@strapi/strapi/admin';
import { useAuthRefresh } from '../hooks/useAuthRefresh';
import { useLicense } from '../hooks/useLicense';
import styled, { keyframes, css } from 'styled-components';
import {
  Box,
  Flex,
  Typography,
  Loader,
  TextInput,
  Tabs,
  Modal,
} from '@strapi/design-system';
import { Table, Thead, Tbody, Tr, Th, Td } from '@strapi/design-system';
import {
  ChartBarIcon,
  EnvelopeIcon,
  EnvelopeOpenIcon,
  CursorArrowRaysIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  MagnifyingGlassIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { GradientButton, TertiaryButton, DangerButton } from '../components/StyledButtons';

// ================ THEME (kopiert von TemplateList) ================
const theme = {
  colors: {
    primary: { 50: 'rgba(14, 165, 233, 0.06)', 100: 'rgba(14, 165, 233, 0.12)', 500: '#0EA5E9', 600: '#0284C7', 700: '#0369A1' },
    secondary: { 50: 'rgba(168, 85, 247, 0.06)', 100: 'rgba(168, 85, 247, 0.1)', 500: '#A855F7', 600: '#9333EA' },
    success: { 100: 'rgba(34, 197, 94, 0.15)', 500: '#22C55E', 600: '#16A34A', 700: '#15803D' },
    warning: { 100: 'rgba(245, 158, 11, 0.15)', 500: '#F59E0B', 600: '#D97706' },
    danger: { 100: 'rgba(220, 38, 38, 0.12)', 500: '#EF4444', 600: '#DC2626' },
    neutral: { 0: 'var(--colors-neutral0, #FFFFFF)', 50: 'var(--colors-neutral100, #F9FAFB)', 100: 'rgba(128, 128, 128, 0.1)', 200: 'rgba(128, 128, 128, 0.2)', 600: 'var(--colors-neutral600, #4B5563)', 700: 'var(--colors-neutral800, #374151)', 800: 'var(--colors-neutral900, #1F2937)' }
  },
  shadows: {
    sm: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
    xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
  },
  transitions: { fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)', normal: '300ms cubic-bezier(0.4, 0, 0.2, 1)', slow: '500ms cubic-bezier(0.4, 0, 0.2, 1)' },
  spacing: { xs: '4px', sm: '8px', md: '16px', lg: '24px', xl: '32px', '2xl': '48px' },
  borderRadius: { md: '8px', lg: '12px', xl: '16px' }
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

// ================ RESPONSIVE BREAKPOINTS ================
const breakpoints = {
  mobile: '768px',
  tablet: '1024px',
};

// ================ STYLED COMPONENTS (kopiert von TemplateList) ================
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
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.15), transparent);
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
  margin-bottom: ${theme.spacing.md};
  background: ${props => props.$bg || 'rgba(2, 132, 199, 0.12)'};
  transition: all ${theme.transitions.normal};
  
  svg {
    width: 32px;
    height: 32px;
    color: ${props => props.$color || 'var(--colors-primary600, #0284C7)'};
  }
  
  @media screen and (max-width: ${breakpoints.mobile}) {
    width: 56px;
    height: 56px;
    margin-bottom: 12px;
    
    svg {
      width: 26px;
      height: 26px;
    }
  }
`;

const StatValue = styled(Typography)`
  font-size: 2.25rem;
  font-weight: 700;
  color: var(--colors-neutral800);
  transition: all ${theme.transitions.normal};
  line-height: 1;
  margin-bottom: ${theme.spacing.xs};
  
  @media screen and (max-width: ${breakpoints.mobile}) {
    font-size: 1.75rem;
  }
`;

const StatLabel = styled(Typography)`
  font-size: 0.875rem;
  color: var(--colors-neutral600);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  
  @media screen and (max-width: ${breakpoints.mobile}) {
    font-size: 0.75rem;
  }
`;

const FilterBar = styled(Box)`
  background: var(--colors-neutral0, white);
  border-radius: ${theme.borderRadius.lg};
  padding: ${theme.spacing.lg} ${theme.spacing.xl};
  margin-bottom: ${theme.spacing.lg};
  box-shadow: ${theme.shadows.sm};
  border: 1px solid rgba(128, 128, 128, 0.2);
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

const TableContainer = styled(Box)`
  background: var(--colors-neutral0, white);
  border-radius: ${theme.borderRadius.lg};
  box-shadow: ${theme.shadows.md};
  border: 1px solid rgba(128, 128, 128, 0.2);
  overflow: hidden;
  margin-bottom: ${theme.spacing.xl};
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

const EmptyContent = styled.div`
  position: relative;
  z-index: 1;
  max-width: 600px;
  margin: 0 auto;
`;

const EmptyIcon = styled.div`
  width: 120px;
  height: 120px;
  margin: 0 auto ${theme.spacing.lg};
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(168, 85, 247, 0.12) 0%, ${'rgba(2, 132, 199, 0.12)'} 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: ${theme.shadows.xl};
  
  svg {
    width: 60px;
    height: 60px;
    color: ${'var(--colors-primary600, #0284C7)'};
  }
`;

const Analytics = () => {
  useAuthRefresh();
  const { get, del } = useFetchClient();
  const { toggleNotification } = useNotification();
  const { hasFeature } = useLicense();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [emailLogs, setEmailLogs] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const hasBasicAnalytics = hasFeature('email-logging');

  useEffect(() => {
    if (hasBasicAnalytics) {
      fetchAnalytics();
      fetchEmailLogs();
    } else {
      setLoading(false);
    }
  }, [hasBasicAnalytics]);

  const fetchAnalytics = async () => {
    try {
      const response = await get('/magic-mail/analytics/stats');
      console.log('[DEBUG] Analytics response:', response);
      console.log('[DEBUG] Stats data:', response.data);
      
      // Handle the response structure - API returns { success: true, data: {...} }
      const statsData = response.data?.data || response.data || {};
      console.log('[DEBUG] Stats to set:', statsData);
      
      setStats(statsData);
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
      console.error('Error details:', error.response?.data);
    }
  };

  const fetchEmailLogs = async () => {
    setLoading(true);
    try {
      const response = await get('/magic-mail/analytics/emails?_limit=50&_sort=sentAt:DESC');
      setEmailLogs(response.data?.data || []);
    } catch (error) {
      console.error('Failed to fetch email logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleClearAll = async () => {
    setIsDeleting(true);
    try {
      const response = await del('/magic-mail/analytics/emails');
      
      toggleNotification({
        type: 'success',
        message: response.data?.message || 'All email logs cleared successfully',
      });
      
      // Refresh data
      await fetchAnalytics();
      await fetchEmailLogs();
      setShowClearDialog(false);
    } catch (error) {
      console.error('Failed to clear email logs:', error);
      toggleNotification({
        type: 'danger',
        message: 'Failed to clear email logs',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const filteredLogs = emailLogs.filter(log => 
    log.recipient?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.subject?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.templateName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!hasBasicAnalytics) {
    return (
      <Container>
        <Header>
          <HeaderContent justifyContent="center" alignItems="center">
            <div style={{ textAlign: 'center' }}>
              <Title variant="alpha">
                <ChartBarIcon />
                Email Analytics
              </Title>
              <Subtitle variant="epsilon">
                Upgrade to Premium to unlock detailed email analytics and tracking
              </Subtitle>
            </div>
          </HeaderContent>
        </Header>

        <EmptyState>
          <EmptyContent>
            <EmptyIcon>
              <ChartBarIcon />
            </EmptyIcon>
            <Typography variant="delta" fontWeight="bold" style={{ marginBottom: '12px', display: 'block' }}>
              Analytics Available in Premium
            </Typography>
            <Typography variant="omega" textColor="neutral600" style={{ marginBottom: '32px', lineHeight: '1.6', display: 'block' }}>
              Upgrade to Premium to unlock email analytics, tracking, open rates, click rates, and detailed reports about your email campaigns.
            </Typography>
            <GradientButton
              onClick={() => window.location.href = '/admin/settings/magic-mail/upgrade'}
            >
              View Upgrade Plans
            </GradientButton>
          </EmptyContent>
        </EmptyState>
      </Container>
    );
  }

  if (loading) {
    return (
      <Container>
        <Flex justifyContent="center" alignItems="center" style={{ minHeight: '400px' }}>
          <Loader>Loading analytics...</Loader>
        </Flex>
      </Container>
    );
  }

  return (
    <Container>
      <Header>
        <HeaderContent justifyContent="flex-start" alignItems="center">
          <div>
            <Title variant="alpha">
              <ChartBarIcon />
              Email Analytics
            </Title>
            <Subtitle variant="epsilon">
              Track your email performance and engagement
            </Subtitle>
          </div>
        </HeaderContent>
      </Header>

      {/* Stats Cards */}
      <StatsGrid>
        <StatCard $delay="0.1s" $color={'var(--colors-primary600, #0EA5E9)'}>
          <StatIcon className="stat-icon" $bg={'rgba(2, 132, 199, 0.12)'} $color={'var(--colors-primary600, #0284C7)'}>
            <EnvelopeIcon />
          </StatIcon>
          <StatValue className="stat-value">{stats?.totalSent || 0}</StatValue>
          <StatLabel>Total Sent</StatLabel>
        </StatCard>

        <StatCard $delay="0.2s" $color={'var(--colors-success600, #22C55E)'}>
          <StatIcon className="stat-icon" $bg={'rgba(22, 163, 74, 0.12)'} $color={'var(--colors-success600, #16A34A)'}>
            <EnvelopeOpenIcon />
          </StatIcon>
          <StatValue className="stat-value">{stats?.totalOpened || 0}</StatValue>
          <StatLabel>Opened</StatLabel>
        </StatCard>

        <StatCard $delay="0.3s" $color={'var(--colors-primary600, #0EA5E9)'}>
          <StatIcon className="stat-icon" $bg={'rgba(2, 132, 199, 0.12)'} $color={'var(--colors-primary600, #0284C7)'}>
            <CursorArrowRaysIcon />
          </StatIcon>
          <StatValue className="stat-value">{stats?.totalClicked || 0}</StatValue>
          <StatLabel>Clicked</StatLabel>
        </StatCard>

        <StatCard $delay="0.4s" $color={'var(--colors-danger600, #EF4444)'}>
          <StatIcon className="stat-icon" $bg={'rgba(220, 38, 38, 0.12)'} $color={'var(--colors-danger600, #DC2626)'}>
            <ExclamationTriangleIcon />
          </StatIcon>
          <StatValue className="stat-value">{stats?.totalBounced || 0}</StatValue>
          <StatLabel>Bounced</StatLabel>
        </StatCard>
      </StatsGrid>

      {/* Filter Bar */}
      <FilterBar>
        <Flex justifyContent="space-between" alignItems="center">
          <Typography variant="omega" fontWeight="semiBold" textColor="neutral700">
            Recent Emails ({filteredLogs.length})
          </Typography>
          <Flex gap={2}>
            <TextInput
              placeholder="Search emails..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              startAction={<MagnifyingGlassIcon style={{ width: 16, height: 16 }} />}
              style={{ maxWidth: '300px' }}
            />
            {emailLogs.length > 0 && (
              <DangerButton
                startIcon={<TrashIcon style={{ width: 16, height: 16 }} />}
                onClick={() => setShowClearDialog(true)}
                disabled={isDeleting}
              >
                Clear All
              </DangerButton>
            )}
          </Flex>
        </Flex>
      </FilterBar>

      {/* Email Logs Table */}
      {filteredLogs.length === 0 ? (
        <EmptyState>
          <EmptyContent>
            <EmptyIcon>
              <EnvelopeIcon />
            </EmptyIcon>
            <Typography variant="delta" fontWeight="bold" style={{ marginBottom: '12px', display: 'block' }}>
              {searchTerm ? 'No emails found' : 'No emails sent yet'}
            </Typography>
            <Typography variant="omega" textColor="neutral600" style={{ lineHeight: '1.6', display: 'block' }}>
              {searchTerm 
                ? 'Try adjusting your search terms'
                : 'Send your first email to see analytics and tracking information here!'}
            </Typography>
          </EmptyContent>
        </EmptyState>
      ) : (
        <TableContainer>
          <Box style={{ overflowX: 'auto' }}>
            <StyledTable colCount={6} rowCount={filteredLogs.length}>
              <Thead>
                <Tr>
                  <Th><Typography variant="sigma">Recipient</Typography></Th>
                  <Th><Typography variant="sigma">Subject</Typography></Th>
                  <Th><Typography variant="sigma">Template</Typography></Th>
                  <Th><Typography variant="sigma">Sent At</Typography></Th>
                  <Th><Typography variant="sigma">Opened</Typography></Th>
                  <Th><Typography variant="sigma">Clicked</Typography></Th>
                </Tr>
              </Thead>
              <Tbody>
                {filteredLogs.map((log) => (
                  <Tr key={log.id}>
                    <Td>
                      <Typography variant="omega" fontWeight="semiBold">
                        {log.recipient}
                      </Typography>
                      {log.recipientName && (
                        <Typography variant="pi" textColor="neutral600">
                          {log.recipientName}
                        </Typography>
                      )}
                    </Td>
                    <Td>
                      <Typography variant="omega">{log.subject || '-'}</Typography>
                    </Td>
                    <Td>
                      <Typography variant="omega" textColor="neutral600">
                        {log.templateName || '-'}
                      </Typography>
                    </Td>
                    <Td>
                      <Typography variant="pi" textColor="neutral600">
                        {formatDate(log.sentAt)}
                      </Typography>
                    </Td>
                    <Td>
                      {log.openCount > 0 ? (
                        <Flex alignItems="center" gap={2}>
                          <CheckCircleIcon style={{ width: 16, height: 16, color: 'var(--colors-success600, #16A34A)' }} />
                          <Typography variant="pi" fontWeight="semiBold" style={{ color: 'var(--colors-success600, #16A34A)' }}>
                            {log.openCount} {log.openCount === 1 ? 'time' : 'times'}
                          </Typography>
                        </Flex>
                      ) : (
                        <Flex alignItems="center" gap={1}>
                          <XCircleIcon style={{ width: 16, height: 16, color: 'var(--colors-neutral500)' }} />
                          <Typography variant="pi" textColor="neutral600">
                            No
                          </Typography>
                        </Flex>
                      )}
                    </Td>
                    <Td>
                      {log.clickCount > 0 ? (
                        <Flex alignItems="center" gap={2}>
                          <CheckCircleIcon style={{ width: 16, height: 16, color: 'var(--colors-primary600, #0284C7)' }} />
                          <Typography variant="pi" fontWeight="semiBold" style={{ color: 'var(--colors-primary600, #0284C7)' }}>
                            {log.clickCount} {log.clickCount === 1 ? 'time' : 'times'}
                          </Typography>
                        </Flex>
                      ) : (
                        <Flex alignItems="center" gap={1}>
                          <XCircleIcon style={{ width: 16, height: 16, color: 'var(--colors-neutral500)' }} />
                          <Typography variant="pi" textColor="neutral600">
                            No
                          </Typography>
                        </Flex>
                      )}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </StyledTable>
          </Box>
        </TableContainer>
      )}

      {/* Clear All Confirmation Dialog */}
      <Modal.Root open={showClearDialog} onOpenChange={setShowClearDialog}>
        <Modal.Content>
          <Modal.Header>
            <Typography variant="beta" fontWeight="bold">
              Clear All Email Logs?
            </Typography>
          </Modal.Header>
          <Modal.Body>
            <Flex direction="column" gap={4}>
              <Typography>
                Are you sure you want to delete all email logs? This action cannot be undone.
              </Typography>
              <Typography variant="pi" textColor="neutral600">
                This will permanently delete {emailLogs.length} email log(s) and all associated tracking data.
              </Typography>
            </Flex>
          </Modal.Body>
          <Modal.Footer>
            <Flex justifyContent="flex-end" gap={2}>
              <TertiaryButton
                onClick={() => setShowClearDialog(false)}
                disabled={isDeleting}
              >
                Cancel
              </TertiaryButton>
              <DangerButton
                onClick={handleClearAll}
                loading={isDeleting}
                startIcon={<TrashIcon style={{ width: 16, height: 16 }} />}
              >
                Delete All
              </DangerButton>
            </Flex>
          </Modal.Footer>
        </Modal.Content>
      </Modal.Root>
    </Container>
  );
};

export default Analytics;

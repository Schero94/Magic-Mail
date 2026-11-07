import { useState, useEffect, useRef } from 'react';
import { useFetchClient, useNotification } from '@strapi/strapi/admin';
import { useMagicMailRBAC } from '../hooks/useMagicMailRBAC';
import { useMagicMailIntl } from '../hooks/useMagicMailIntl';
import { useFormatters } from '../hooks/useFormatters';
import styled, { keyframes, css } from 'styled-components';
import {
  Box,
  Button,
  Flex,
  Loader,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  Typography,
} from '@strapi/design-system';
import { Mail, Trash } from '@strapi/icons';
import {
  ArrowPathIcon,
  ChartBarIcon,
  EnvelopeIcon,
  EnvelopeOpenIcon,
  CursorArrowRaysIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { TertiaryButton } from '../components/StyledButtons';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import { SectionHeading } from '../components/shared/Headings';
import { SearchField } from '../components/shared/SearchField';
import {
  Avatar,
  DataTable,
  EmptyState,
  FilterActions,
  FilterBar,
  FilterSearch,
  LoadErrorState,
  StatusBadge,
  StyledTable,
  TablePagination,
} from '../components/shared/table';
import { motionSafe, reducedMotion } from '../components/shared/motion';
import { accent, brand, color, fontSize, theme } from '../utils/theme';
import {
  LOGS_PAGE_SIZE,
  apiErrorMessage,
  buildEmailLogsUrl,
  clampPage,
  clearAllEmailLogsInBatches,
  normalizeSearch,
} from '../utils/analyticsLogs';

/**
 * Presents a stored delivery state with a neutral fallback for legacy logs.
 * The English label doubles as the default message of its translation key.
 *
 * @param {'pending'|'sent'|'failed'|null|undefined} deliveryStatus
 * @param {string|null|undefined} deliveredAt Provider acceptance time for legacy log rows.
 * @returns {{label: string, tone: 'danger'|'warning'|'success'|null}}
 *   `tone` is an accent colour (readable in light and dark mode); null = neutral text.
 */
const getDeliveryStatusPresentation = (deliveryStatus, deliveredAt) => {
  if (deliveryStatus === 'failed') return { label: 'Failed', tone: 'danger' };
  if (deliveryStatus === 'pending') return { label: 'Pending', tone: 'warning' };
  if (!deliveryStatus && !deliveredAt) return { label: 'Unverified', tone: null };
  return { label: 'Sent', tone: 'success' };
};

const DELIVERY_LABEL_KEYS = {
  Failed: 'analytics.delivery.failed',
  Pending: 'analytics.delivery.pending',
  Unverified: 'analytics.delivery.unverified',
  Sent: 'analytics.delivery.sent',
};

const SEARCH_DEBOUNCE_MS = 300;
const ICON_16 = { width: 16, height: 16 };

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
};

/** Accent colour of a stat card or counter (text, icon and hover border). */
const toneColor = (p) => (accent[p.$tone] ?? accent.primary)(p);

// ================ STYLED COMPONENTS ================
const Container = styled(Box)`
  ${motionSafe(css`
    animation: ${fadeIn} ${theme.transitions.slow};
  `)}
  min-height: 100vh;
  max-width: 1440px;
  margin: 0 auto;
  padding: ${theme.spacing.xl} ${theme.spacing.lg} 0;

  @media screen and (max-width: ${breakpoints.mobile}) {
    padding: 16px 12px 0;
  }
`;

const Header = styled(Box)`
  /* Solid fallback under the gradient: white text stays >= 4.5:1 on both stops. */
  background-color: ${brand.primary};
  background-image: linear-gradient(135deg, ${brand.secondary} 0%, ${brand.primary} 100%);
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
    ${motionSafe(css`
      animation: ${shimmer} 3s infinite;
    `)}
  }

  &::after {
    content: '';
    position: absolute;
    top: 0;
    right: 0;
    width: 100%;
    height: 100%;
    background-image: radial-gradient(
      circle at 20% 80%,
      transparent 50%,
      rgba(255, 255, 255, 0.1) 50%
    );
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
  font-size: ${fontSize(5)};
  font-weight: 700;
  letter-spacing: -0.025em;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
  margin: 0;

  svg {
    width: 28px;
    height: 28px;
    flex-shrink: 0;
    ${motionSafe(css`
      animation: ${float} 3s ease-in-out infinite;
    `)}
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
  font-size: ${fontSize(2)};
  font-weight: 400;
  margin: ${theme.spacing.xs} 0 0;
  letter-spacing: 0.01em;
  display: block;
`;

const StatsGrid = styled.div`
  margin-bottom: ${theme.spacing.xl};
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: ${theme.spacing.lg};

  @media screen and (max-width: ${breakpoints.mobile}) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    margin-bottom: 24px;
  }
`;

const StatCard = styled(Box)`
  background: ${color('neutral0')};
  border-radius: ${theme.borderRadius.lg};
  padding: ${theme.spacing.lg};
  position: relative;
  overflow: hidden;
  transition: all ${theme.transitions.normal};
  ${motionSafe(css`
    animation: ${fadeIn} ${theme.transitions.slow} backwards;
  `)}
  animation-delay: ${(props) => props.$delay || '0s'};
  box-shadow: ${theme.shadows.sm};
  border: 1px solid rgba(128, 128, 128, 0.2);
  min-width: 0;
  flex: 1;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;

  @media screen and (max-width: ${breakpoints.mobile}) {
    padding: 20px 12px;

    &:hover {
      transform: none;
    }
  }

  &:hover {
    transform: translateY(-6px);
    box-shadow: ${theme.shadows.xl};
    border-color: ${toneColor};

    .stat-icon {
      transform: scale(1.15) rotate(5deg);
    }

    .stat-value {
      transform: scale(1.08);
      color: ${toneColor};
    }
  }

  ${reducedMotion}

  @media (prefers-reduced-motion: reduce) {
    &:hover .stat-icon,
    &:hover .stat-value {
      transform: none;
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
  background: ${(props) => props.$bg || 'rgba(2, 132, 199, 0.12)'};
  transition: all ${theme.transitions.normal};

  svg {
    width: 32px;
    height: 32px;
    color: ${toneColor};
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

  ${reducedMotion}
`;

const StatValue = styled(Typography)`
  font-size: 2.25rem;
  font-weight: 700;
  color: ${color('neutral800')};
  transition: all ${theme.transitions.normal};
  line-height: 1;
  margin: 0 0 ${theme.spacing.xs};
  display: block;

  @media screen and (max-width: ${breakpoints.mobile}) {
    font-size: 1.75rem;
  }

  ${reducedMotion}
`;

const StatLabel = styled(Typography)`
  font-size: ${fontSize(2)};
  color: ${color('neutral600')};
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0;
  display: block;
  overflow-wrap: anywhere;

  @media screen and (max-width: ${breakpoints.mobile}) {
    font-size: ${fontSize(1)};
  }
`;

const StatsNotice = styled(Flex)`
  /* Sits one grid gap (24px, 12px on mobile) below the stat cards. */
  margin: -${theme.spacing.sm} 0 ${theme.spacing.xl};

  @media screen and (max-width: ${breakpoints.mobile}) {
    margin: -12px 0 24px;
  }

  padding: 12px 16px;
  border-radius: ${theme.borderRadius.md};
  border: 1px solid rgba(220, 38, 38, 0.3);
  background: rgba(220, 38, 38, 0.08);
  flex-wrap: wrap;
  gap: ${theme.spacing.sm};

  /* Only the warning icon; the Retry button keeps its neutral icon. */
  & > div:first-child > svg {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    color: ${accent.danger};
  }
`;

/** Heading of the email log list (and the permissions notice) above the filter bar. */
const SectionHeaderRow = styled(Flex)`
  flex-direction: column;
  align-items: flex-start;
  gap: ${theme.spacing.sm};
  margin-bottom: ${theme.spacing.md};
`;

const CountCell = styled(Flex)`
  white-space: nowrap;

  svg {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    color: ${(p) => (p.$tone ? toneColor(p) : color('neutral500')(p))};
  }
`;

const ToneText = styled(Typography)`
  && {
    color: ${toneColor};
  }
`;

const Analytics = () => {
  const { canManage, isLoading: rbacLoading, error: rbacError } = useMagicMailRBAC();
  const { t } = useMagicMailIntl();
  const { formatDateTime, formatNumber } = useFormatters();
  const { get, del } = useFetchClient();
  const { toggleNotification } = useNotification();

  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState(false);
  const [emailLogs, setEmailLogs] = useState([]);
  const [logsError, setLogsError] = useState(null);
  const [pagination, setPagination] = useState(null);
  const [totalLogs, setTotalLogs] = useState(null);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [statsReloadKey, setStatsReloadKey] = useState(0);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // A lost manage permission closes the purge dialog for good (adjusted while
  // rendering, not in an effect).
  if (!canManage && showClearDialog) setShowClearDialog(false);

  // The logs are loading until the request for the current page, search term
  // and reload counter has settled; the first settle ends the initial loader.
  const logsQueryKey = JSON.stringify([page, searchTerm, reloadKey]);
  const [settledLogsKey, setSettledLogsKey] = useState(null);
  const logsLoading = settledLogsKey !== logsQueryKey;
  const initialLoading = settledLogsKey === null;

  // Debounced server-side search; a new term always starts at page 1.
  useEffect(() => {
    const next = normalizeSearch(searchInput);
    if (next === searchTerm) return undefined;
    const handle = setTimeout(() => {
      setSearchTerm(next);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [searchInput, searchTerm]);

  useEffect(() => {
    let ignore = false;
    const loadStats = async () => {
      try {
        const response = await get('/magic-mail/analytics/stats');
        if (ignore) return;
        // The API returns { success: true, data: {...} }.
        setStats(response.data?.data || response.data || {});
        setStatsError(false);
      } catch {
        if (ignore) return;
        console.error('[MagicMail] Failed to fetch analytics');
        setStats(null);
        setStatsError(true);
      }
    };
    loadStats();
    return () => {
      ignore = true;
    };
  }, [get, statsReloadKey]);

  useEffect(() => {
    // `ignore` drops the answer of a request that a newer page, search term or
    // reload (logsQueryKey) has replaced.
    let ignore = false;
    const loadLogs = async () => {
      try {
        const response = await get(
          buildEmailLogsUrl({ page, pageSize: LOGS_PAGE_SIZE, search: searchTerm })
        );
        if (ignore) return;
        const rows = response.data?.data || [];
        const nextPagination = response.data?.pagination || null;
        setEmailLogs(rows);
        setPagination(nextPagination);
        setLogsError(null);
        if (!searchTerm) setTotalLogs(nextPagination?.total ?? rows.length);
        const clamped = clampPage(page, nextPagination?.pageCount);
        if (clamped !== page) setPage(clamped);
      } catch (error) {
        if (ignore) return;
        console.error('[MagicMail] Failed to fetch email logs');
        const message =
          apiErrorMessage(error) || t('analytics.logs.loadError', 'Failed to load email logs');
        setEmailLogs([]);
        setPagination(null);
        setLogsError(message);
        toggleNotification({ type: 'danger', message });
      } finally {
        if (!ignore) setSettledLogsKey(logsQueryKey);
      }
    };
    loadLogs();
    return () => {
      ignore = true;
    };
  }, [get, page, searchTerm, logsQueryKey, t, toggleNotification]);

  // Clear All removes its own button once the emptied list has loaded; focus
  // then moves to the search field instead of falling back to <body>.
  const searchRef = useRef(null);
  const refocusAfterClear = useRef(false);
  useEffect(() => {
    if (!refocusAfterClear.current || logsLoading) return;
    refocusAfterClear.current = false;
    const active = document.activeElement;
    if (!active || active === document.body) searchRef.current?.focus();
  }, [logsLoading]);

  const reloadStats = () => setStatsReloadKey((key) => key + 1);
  const reloadLogs = () => setReloadKey((key) => key + 1);

  const handleClearAll = async () => {
    if (!canManage) return;

    setIsDeleting(true);
    try {
      const { deletedCount, complete } = await clearAllEmailLogsInBatches(del);
      toggleNotification({
        type: complete ? 'success' : 'warning',
        message: !complete
          ? t(
              'analytics.clear.partial',
              '{count, plural, one {# email log deleted} other {# email logs deleted}}. Some logs remain. Run Clear All again to continue.',
              { count: deletedCount }
            )
          : deletedCount === 0
            ? t('analytics.clear.none', 'No email logs to delete')
            : t(
                'analytics.clear.success',
                '{count, plural, one {# email log deleted} other {# email logs deleted}}',
                { count: deletedCount }
              ),
      });
      refocusAfterClear.current = true;
      setShowClearDialog(false);
    } catch (error) {
      console.error('[MagicMail] Failed to clear email logs');
      toggleNotification({
        type: 'danger',
        message: apiErrorMessage(error) || t('analytics.clear.error', 'Failed to clear email logs'),
      });
    } finally {
      setIsDeleting(false);
      setPage(1);
      reloadStats();
      reloadLogs();
    }
  };

  if (initialLoading) {
    return (
      <Container>
        <Flex justifyContent="center" alignItems="center" style={{ minHeight: '400px' }}>
          <Loader>{t('analytics.loading', 'Loading analytics...')}</Loader>
        </Flex>
      </Container>
    );
  }

  const statValue = (value) => (statsError ? '-' : formatNumber(value ?? 0, undefined, '0'));
  const total = pagination?.total ?? emailLogs.length;
  const pageCount = Math.max(1, pagination?.pageCount ?? 1);
  const currentPage = pagination?.page ?? page;
  const hasAnyLogs = (totalLogs ?? total) > 0;
  const statCards = [
    {
      key: 'sent',
      tone: 'primary',
      bg: 'rgba(2, 132, 199, 0.12)',
      Icon: EnvelopeIcon,
      value: stats?.totalSent,
      label: t('analytics.stats.totalSent', 'Total sent'),
    },
    {
      key: 'opened',
      tone: 'success',
      bg: 'rgba(22, 163, 74, 0.12)',
      Icon: EnvelopeOpenIcon,
      value: stats?.totalOpened,
      label: t('analytics.stats.opened', 'Opened'),
    },
    {
      key: 'clicked',
      tone: 'primary',
      bg: 'rgba(2, 132, 199, 0.12)',
      Icon: CursorArrowRaysIcon,
      value: stats?.totalClicked,
      label: t('analytics.stats.clicked', 'Clicked'),
    },
    {
      key: 'bounced',
      tone: 'danger',
      bg: 'rgba(220, 38, 38, 0.12)',
      Icon: ExclamationTriangleIcon,
      value: stats?.totalBounced,
      label: t('analytics.stats.bounced', 'Bounced'),
    },
  ];

  const renderCount = (count, tone) =>
    count > 0 ? (
      <CountCell alignItems="center" gap={2} $tone={tone}>
        <CheckCircleIcon aria-hidden="true" />
        <ToneText variant="pi" fontWeight="semiBold" $tone={tone}>
          {t('analytics.table.times', '{count, plural, one {# time} other {# times}}', { count })}
        </ToneText>
      </CountCell>
    ) : (
      <CountCell alignItems="center" gap={2}>
        <XCircleIcon aria-hidden="true" />
        <Typography variant="pi" textColor="neutral600">
          {t('analytics.table.no', 'No')}
        </Typography>
      </CountCell>
    );

  const columnLabels = {
    recipient: t('analytics.table.recipient', 'Recipient'),
    subject: t('analytics.table.subject', 'Subject'),
    deliveryStatus: t('analytics.table.deliveryStatus', 'Delivery Status'),
    template: t('analytics.table.template', 'Template'),
    attemptedAt: t('analytics.table.attemptedAt', 'Attempted At'),
    opened: t('analytics.table.opened', 'Opened'),
    clicked: t('analytics.table.clicked', 'Clicked'),
  };

  const renderRecipient = (log) => (
    <Flex alignItems="center" gap={2} style={{ minWidth: 0 }}>
      <Avatar $background={brand.gradient} aria-hidden="true">
        <Mail />
      </Avatar>
      <Flex direction="column" alignItems="flex-start" style={{ minWidth: 0, maxWidth: '100%' }}>
        <Typography
          variant="omega"
          fontWeight="semiBold"
          textColor="neutral800"
          ellipsis
          title={log.recipient || undefined}
          style={{ maxWidth: '100%' }}
        >
          {log.recipient}
        </Typography>
        {log.recipientName && (
          <Typography
            variant="pi"
            textColor="neutral600"
            ellipsis
            title={log.recipientName}
            style={{ maxWidth: '100%' }}
          >
            {log.recipientName}
          </Typography>
        )}
      </Flex>
    </Flex>
  );

  const renderDelivery = (log) => {
    const delivery = getDeliveryStatusPresentation(log.deliveryStatus, log.deliveredAt);
    return (
      <StatusBadge $tone={delivery.tone ?? 'neutral'}>
        {t(DELIVERY_LABEL_KEYS[delivery.label], delivery.label)}
      </StatusBadge>
    );
  };

  return (
    <Container>
      <Header>
        <HeaderContent justifyContent="flex-start" alignItems="center">
          <div>
            <Title variant="alpha" tag="h1">
              <ChartBarIcon aria-hidden="true" />
              {t('analytics.title', 'Email Analytics')}
            </Title>
            <Subtitle variant="epsilon" tag="p">
              {t('analytics.subtitle', 'Track your email performance and engagement')}
            </Subtitle>
          </div>
        </HeaderContent>
      </Header>

      {/* Stats Cards */}
      <StatsGrid role="group" aria-label={t('analytics.stats.label', 'Email statistics')}>
        {statCards.map(({ key, tone, bg, Icon, value, label }, index) => (
          <StatCard key={key} $delay={`${(index + 1) / 10}s`} $tone={tone}>
            <StatIcon className="stat-icon" $bg={bg} $tone={tone}>
              <Icon aria-hidden="true" />
            </StatIcon>
            <StatValue className="stat-value" tag="p">
              {statValue(value)}
            </StatValue>
            <StatLabel tag="p">{label}</StatLabel>
          </StatCard>
        ))}
      </StatsGrid>

      {statsError && (
        <StatsNotice role="alert" alignItems="center" justifyContent="space-between">
          <Flex alignItems="center" gap={2}>
            <ExclamationTriangleIcon aria-hidden="true" />
            <Typography variant="omega" textColor="neutral800">
              {t(
                'analytics.stats.loadError',
                'Statistics could not be loaded. The counters above are unknown, not zero.'
              )}
            </Typography>
          </Flex>
          <TertiaryButton
            startIcon={<ArrowPathIcon style={ICON_16} aria-hidden="true" />}
            onClick={reloadStats}
          >
            {t('analytics.retry', 'Retry')}
          </TertiaryButton>
        </StatsNotice>
      )}

      {/* Email logs: section heading, filter bar and the shared table layer */}
      <SectionHeaderRow>
        <SectionHeading>
          {logsError
            ? t('analytics.logs.headingUnknown', 'Recent emails')
            : searchTerm
              ? t('analytics.logs.headingFiltered', 'Matching emails ({count})', {
                  count: formatNumber(total, undefined, '0'),
                })
              : t('analytics.logs.heading', 'Recent emails ({count})', {
                  count: formatNumber(total, undefined, '0'),
                })}
        </SectionHeading>
        {rbacError && !rbacLoading && (
          <Typography variant="pi" textColor="danger600" role="alert">
            {t(
              'common.permissions.loadError',
              'Your permissions could not be loaded. Reload the page to try again.'
            )}
          </Typography>
        )}
      </SectionHeaderRow>

      <FilterBar>
        <FilterSearch>
          <SearchField
            label={t('analytics.search.label', 'Search email logs')}
            ref={searchRef}
            placeholder={t('analytics.search.placeholder', 'Search by recipient or subject...')}
            value={searchInput}
            onChange={setSearchInput}
          />
        </FilterSearch>
        {canManage && hasAnyLogs && (
          <FilterActions>
            <Button
              variant="danger-light"
              size="L"
              startIcon={<Trash aria-hidden="true" />}
              onClick={() => setShowClearDialog(true)}
              disabled={isDeleting}
            >
              {t('analytics.clear.button', 'Clear All')}
            </Button>
          </FilterActions>
        )}
      </FilterBar>

      <DataTable
        aria-label={t('analytics.logs.listLabel', 'Email logs')}
        aria-busy={logsLoading ? 'true' : undefined}
      >
        {logsError ? (
          <LoadErrorState
            message={t('analytics.logs.errorTitle', "Couldn't load email logs")}
            description={logsError}
            onRetry={reloadLogs}
            isRetrying={logsLoading}
          />
        ) : emailLogs.length === 0 ? (
          <EmptyState
            icon={Mail}
            title={
              searchTerm
                ? t('analytics.empty.searchTitle', 'No emails found')
                : t('analytics.empty.title', 'No emails sent yet')
            }
            description={
              searchTerm
                ? t('analytics.empty.searchBody', 'Try adjusting your search terms')
                : t(
                    'analytics.empty.body',
                    'Send your first email to see analytics and tracking information here.'
                  )
            }
          />
        ) : (
          <>
            <StyledTable colCount={7} rowCount={emailLogs.length + 1}>
              <Thead>
                <Tr>
                  <Th>{columnLabels.recipient}</Th>
                  <Th>{columnLabels.subject}</Th>
                  <Th>{columnLabels.deliveryStatus}</Th>
                  <Th>{columnLabels.template}</Th>
                  <Th>{columnLabels.attemptedAt}</Th>
                  <Th>{columnLabels.opened}</Th>
                  <Th>{columnLabels.clicked}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {emailLogs.map((log) => (
                  <Tr key={log.id}>
                    <Td className="cell-wrap" data-label={columnLabels.recipient}>
                      {renderRecipient(log)}
                    </Td>
                    <Td className="cell-wrap" data-label={columnLabels.subject}>
                      <Typography variant="omega">{log.subject || '-'}</Typography>
                    </Td>
                    <Td data-label={columnLabels.deliveryStatus}>{renderDelivery(log)}</Td>
                    <Td className="cell-wrap" data-label={columnLabels.template}>
                      <Typography variant="omega" textColor="neutral600">
                        {log.templateName || '-'}
                      </Typography>
                    </Td>
                    <Td className="cell-date" data-label={columnLabels.attemptedAt}>
                      <Typography variant="pi" textColor="neutral800">
                        {formatDateTime(log.sentAt)}
                      </Typography>
                    </Td>
                    <Td data-label={columnLabels.opened}>
                      {renderCount(log.openCount, 'success')}
                    </Td>
                    <Td data-label={columnLabels.clicked}>
                      {renderCount(log.clickCount, 'primary')}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </StyledTable>
            <TablePagination
              page={currentPage}
              pageCount={pageCount}
              total={total}
              pageSize={LOGS_PAGE_SIZE}
              onChange={setPage}
              label={t('analytics.pagination.label', 'Email log pages')}
            />
          </>
        )}
      </DataTable>

      {/* Clear All Confirmation Dialog */}
      <ConfirmDialog
        isOpen={canManage && showClearDialog}
        onClose={() => setShowClearDialog(false)}
        onConfirm={handleClearAll}
        isLoading={isDeleting}
        title={t('analytics.clear.title', 'Clear all email logs?')}
        description={t(
          'analytics.clear.body',
          'Are you sure you want to delete all email logs? This action cannot be undone.'
        )}
        confirmLabel={t('analytics.clear.confirm', 'Delete All')}
        confirmIcon={<TrashIcon style={ICON_16} aria-hidden="true" />}
      >
        {totalLogs !== null
          ? t(
              'analytics.clear.count',
              'This will permanently delete {count, plural, one {# email log} other {# email logs}} and all associated tracking data.',
              { count: totalLogs }
            )
          : t(
              'analytics.clear.countUnknown',
              'This will permanently delete every email log and all associated tracking data.'
            )}
      </ConfirmDialog>
    </Container>
  );
};

export default Analytics;

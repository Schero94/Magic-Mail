import { useState, useEffect, useRef } from 'react';
import { useFetchClient, useNotification } from '@strapi/strapi/admin';
import { useMagicMailRBAC } from '../hooks/useMagicMailRBAC';
import { useMagicMailIntl } from '../hooks/useMagicMailIntl';
import { useFormatters } from '../hooks/useFormatters';
import styled, { keyframes, css } from 'styled-components';
import { Box, Flex, Typography, Loader } from '@strapi/design-system';
import { Table, Thead, Tbody, Tr, Th, Td } from '@strapi/design-system';
import {
  ArrowPathIcon,
  ChartBarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EnvelopeIcon,
  EnvelopeOpenIcon,
  CursorArrowRaysIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { TertiaryButton, DangerButton } from '../components/StyledButtons';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import { SearchField } from '../components/shared/SearchField';
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
  small: '480px',
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

const FilterBar = styled(Box)`
  background: ${color('neutral0')};
  border-radius: ${theme.borderRadius.lg};
  padding: ${theme.spacing.lg} ${theme.spacing.xl};
  margin-bottom: ${theme.spacing.lg};
  box-shadow: ${theme.shadows.sm};
  border: 1px solid rgba(128, 128, 128, 0.2);

  @media screen and (max-width: ${breakpoints.mobile}) {
    padding: ${theme.spacing.md};
  }
`;

const FilterRow = styled(Flex)`
  flex-wrap: wrap;
  gap: ${theme.spacing.md};
`;

const FilterControls = styled(Flex)`
  flex: 1 1 320px;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: ${theme.spacing.sm};
  min-width: 0;

  /* Clear All matches the height of the search field beside it (42px, and
     48px below 768px where DS inputs grow). */
  && > button {
    min-height: 42px;
  }

  @media screen and (max-width: ${breakpoints.mobile}) {
    flex-basis: 100%;
  }

  /* Same breakpoint as the shared SearchField height change. */
  @media screen and (max-width: 767px) {
    && > button {
      min-height: 48px;
    }
  }

  @media screen and (max-width: ${breakpoints.small}) {
    && > * {
      flex: 1 1 100%;
    }
  }
`;

const SearchBox = styled.div`
  flex: 0 1 300px;
  min-width: 0;
  display: flex;

  /* Phones and small tablets: the search uses the full row next to Clear All. */
  @media screen and (max-width: ${breakpoints.mobile}) {
    flex: 1 1 200px;
  }
`;

const StyledTable = styled(Table)`
  thead {
    background: ${color('neutral100')};
    border-bottom: 2px solid rgba(128, 128, 128, 0.2);

    th {
      font-weight: 600;
      color: ${color('neutral800')};
      font-size: ${fontSize(1)};
      text-transform: uppercase;
      letter-spacing: 0.025em;
      padding: ${theme.spacing.lg} ${theme.spacing.md};
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

    /* Cells wrap (the DS table sets nowrap), so the table fits without
       sideways scrolling down to 1024px; status and counters stay on one line. */
    td {
      padding: ${theme.spacing.lg} ${theme.spacing.md};
      color: ${color('neutral800')};
      vertical-align: middle;
      white-space: normal;
    }

    td.wrap-cell {
      min-width: 160px;
      overflow-wrap: anywhere;
    }

    td.nowrap-cell {
      white-space: nowrap;
    }

    td.template-cell {
      min-width: 96px;
    }

    ${reducedMotion}
  }
`;

const TableContainer = styled(Box)`
  background: ${color('neutral0')};
  border-radius: ${theme.borderRadius.lg};
  box-shadow: ${theme.shadows.md};
  border: 1px solid rgba(128, 128, 128, 0.2);
  overflow: hidden;
  margin-bottom: ${theme.spacing.xl};
  transition: opacity ${theme.transitions.fast};

  &[aria-busy='true'] {
    opacity: 0.6;
  }

  ${reducedMotion}
`;

const TableScroller = styled(Box)`
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;

  @media screen and (max-width: ${breakpoints.mobile}) {
    display: none;
  }
`;

/** Phones and small tablets: one list entry per email instead of a seven-column table. */
const LogList = styled.ul`
  display: none;
  list-style: none;
  margin: 0;
  padding: 0;

  @media screen and (max-width: ${breakpoints.mobile}) {
    display: block;
  }
`;

const LogItem = styled.li`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.md};
  min-width: 0;
  overflow-wrap: anywhere;

  & + & {
    border-top: 1px solid rgba(128, 128, 128, 0.15);
  }
`;

/** Keeps the delivery status on one line beside a long recipient address. */
const StatusSlot = styled.span`
  flex-shrink: 0;
  white-space: nowrap;
  overflow-wrap: normal;
`;

const LogFacts = styled.dl`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: ${theme.spacing.sm} ${theme.spacing.md};
  margin: 0;

  dt {
    font-size: ${fontSize(1)};
    font-weight: 600;
    letter-spacing: 0.025em;
    text-transform: uppercase;
    color: ${color('neutral600')};
    margin-bottom: ${theme.spacing.xs};
  }

  dd {
    margin: 0;
    color: ${color('neutral800')};
  }
`;

const PaginationBar = styled.nav`
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.md} ${theme.spacing.lg};
  border-top: 1px solid rgba(128, 128, 128, 0.15);

  /* Same 16px inset as the mobile log entries above it. */
  @media screen and (max-width: ${breakpoints.mobile}) {
    padding: ${theme.spacing.md};
  }
`;

const EmptyState = styled(Box)`
  background: ${color('neutral0')};
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

  @media screen and (max-width: ${breakpoints.mobile}) {
    padding: 48px 16px;
    min-height: 300px;
  }

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(135deg, rgba(168, 85, 247, 0.06) 0%, rgba(2, 132, 199, 0.06) 100%);
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
  background: linear-gradient(135deg, rgba(168, 85, 247, 0.12) 0%, rgba(2, 132, 199, 0.12) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: ${theme.shadows.xl};

  svg {
    width: 60px;
    height: 60px;
    color: ${(p) => (p.$danger ? accent.danger(p) : accent.primary(p))};
  }
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
      label: t('analytics.stats.totalSent', 'Total Sent'),
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
    <>
      <Typography variant="omega" fontWeight="semiBold" style={{ display: 'block' }}>
        {log.recipient}
      </Typography>
      {log.recipientName && (
        <Typography variant="pi" textColor="neutral600" style={{ display: 'block' }}>
          {log.recipientName}
        </Typography>
      )}
    </>
  );

  const renderDelivery = (log) => {
    const delivery = getDeliveryStatusPresentation(log.deliveryStatus, log.deliveredAt);
    const label = t(DELIVERY_LABEL_KEYS[delivery.label], delivery.label);
    return delivery.tone ? (
      <ToneText variant="pi" fontWeight="semiBold" $tone={delivery.tone}>
        {label}
      </ToneText>
    ) : (
      <Typography variant="pi" fontWeight="semiBold" textColor="neutral600">
        {label}
      </Typography>
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

      {/* Filter Bar */}
      <FilterBar>
        <FilterRow justifyContent="space-between" alignItems="center">
          <Typography variant="omega" fontWeight="semiBold" textColor="neutral700" tag="h2">
            {logsError
              ? t('analytics.logs.headingUnknown', 'Recent emails')
              : searchTerm
                ? t('analytics.logs.headingFiltered', 'Matching emails ({count})', {
                    count: formatNumber(total, undefined, '0'),
                  })
                : t('analytics.logs.heading', 'Recent emails ({count})', {
                    count: formatNumber(total, undefined, '0'),
                  })}
          </Typography>
          <FilterControls alignItems="center">
            <SearchBox>
              <SearchField
                label={t('analytics.search.label', 'Search email logs')}
                ref={searchRef}
                placeholder={t('analytics.search.placeholder', 'Search by recipient or subject...')}
                value={searchInput}
                onChange={setSearchInput}
              />
            </SearchBox>
            {canManage && hasAnyLogs && (
              <DangerButton
                startIcon={<TrashIcon style={ICON_16} aria-hidden="true" />}
                onClick={() => setShowClearDialog(true)}
                disabled={isDeleting}
              >
                {t('analytics.clear.button', 'Clear All')}
              </DangerButton>
            )}
          </FilterControls>
        </FilterRow>
        {rbacError && !rbacLoading && (
          <Box paddingTop={3}>
            <Typography variant="pi" textColor="danger600">
              {t(
                'common.permissions.loadError',
                'Your permissions could not be loaded. Reload the page to try again.'
              )}
            </Typography>
          </Box>
        )}
      </FilterBar>

      {/* Email Logs Table */}
      {logsError ? (
        <EmptyState role="alert">
          <EmptyContent>
            <EmptyIcon $danger>
              <ExclamationTriangleIcon aria-hidden="true" />
            </EmptyIcon>
            <Typography
              variant="delta"
              fontWeight="bold"
              tag="h2"
              style={{ marginBottom: '12px', display: 'block' }}
            >
              {t('analytics.logs.errorTitle', "Couldn't load email logs")}
            </Typography>
            <Typography
              variant="omega"
              textColor="neutral600"
              style={{ lineHeight: '1.6', display: 'block' }}
            >
              {logsError}
            </Typography>
            <Flex justifyContent="center" paddingTop={5}>
              <TertiaryButton
                startIcon={<ArrowPathIcon style={ICON_16} aria-hidden="true" />}
                onClick={reloadLogs}
                loading={logsLoading}
              >
                {t('analytics.retry', 'Retry')}
              </TertiaryButton>
            </Flex>
          </EmptyContent>
        </EmptyState>
      ) : emailLogs.length === 0 ? (
        <EmptyState aria-busy={logsLoading} aria-live="polite">
          <EmptyContent>
            <EmptyIcon>
              <EnvelopeIcon aria-hidden="true" />
            </EmptyIcon>
            <Typography
              variant="delta"
              fontWeight="bold"
              tag="h2"
              style={{ marginBottom: '12px', display: 'block' }}
            >
              {searchTerm
                ? t('analytics.empty.searchTitle', 'No emails found')
                : t('analytics.empty.title', 'No emails sent yet')}
            </Typography>
            <Typography
              variant="omega"
              textColor="neutral600"
              style={{ lineHeight: '1.6', display: 'block' }}
            >
              {searchTerm
                ? t('analytics.empty.searchBody', 'Try adjusting your search terms')
                : t(
                    'analytics.empty.body',
                    'Send your first email to see analytics and tracking information here.'
                  )}
            </Typography>
          </EmptyContent>
        </EmptyState>
      ) : (
        <TableContainer aria-busy={logsLoading}>
          <TableScroller>
            <StyledTable colCount={7} rowCount={emailLogs.length + 1}>
              <Thead>
                <Tr>
                  <Th>
                    <Typography variant="sigma">{columnLabels.recipient}</Typography>
                  </Th>
                  <Th>
                    <Typography variant="sigma">{columnLabels.subject}</Typography>
                  </Th>
                  <Th>
                    <Typography variant="sigma">{columnLabels.deliveryStatus}</Typography>
                  </Th>
                  <Th>
                    <Typography variant="sigma">{columnLabels.template}</Typography>
                  </Th>
                  <Th>
                    <Typography variant="sigma">{columnLabels.attemptedAt}</Typography>
                  </Th>
                  <Th>
                    <Typography variant="sigma">{columnLabels.opened}</Typography>
                  </Th>
                  <Th>
                    <Typography variant="sigma">{columnLabels.clicked}</Typography>
                  </Th>
                </Tr>
              </Thead>
              <Tbody>
                {emailLogs.map((log) => (
                  <Tr key={log.id}>
                    <Td className="wrap-cell">{renderRecipient(log)}</Td>
                    <Td className="wrap-cell">
                      <Typography variant="omega">{log.subject || '-'}</Typography>
                    </Td>
                    <Td className="nowrap-cell">{renderDelivery(log)}</Td>
                    <Td className="template-cell">
                      <Typography variant="omega" textColor="neutral600">
                        {log.templateName || '-'}
                      </Typography>
                    </Td>
                    <Td className="nowrap-cell">
                      <Typography variant="pi" textColor="neutral600">
                        {formatDateTime(log.sentAt)}
                      </Typography>
                    </Td>
                    <Td>{renderCount(log.openCount, 'success')}</Td>
                    <Td>{renderCount(log.clickCount, 'primary')}</Td>
                  </Tr>
                ))}
              </Tbody>
            </StyledTable>
          </TableScroller>
          <LogList aria-label={t('analytics.logs.listLabel', 'Email logs')}>
            {emailLogs.map((log) => (
              <LogItem key={log.id}>
                <Flex justifyContent="space-between" alignItems="flex-start" gap={3}>
                  <Box minWidth={0}>{renderRecipient(log)}</Box>
                  <StatusSlot>{renderDelivery(log)}</StatusSlot>
                </Flex>
                <Typography variant="omega">{log.subject || '-'}</Typography>
                <LogFacts>
                  <div>
                    <dt>{columnLabels.template}</dt>
                    <dd>
                      <Typography variant="pi">{log.templateName || '-'}</Typography>
                    </dd>
                  </div>
                  <div>
                    <dt>{columnLabels.attemptedAt}</dt>
                    <dd>
                      <Typography variant="pi">{formatDateTime(log.sentAt)}</Typography>
                    </dd>
                  </div>
                  <div>
                    <dt>{columnLabels.opened}</dt>
                    <dd>{renderCount(log.openCount, 'success')}</dd>
                  </div>
                  <div>
                    <dt>{columnLabels.clicked}</dt>
                    <dd>{renderCount(log.clickCount, 'primary')}</dd>
                  </div>
                </LogFacts>
              </LogItem>
            ))}
          </LogList>
          {pageCount > 1 && (
            <PaginationBar aria-label={t('analytics.pagination.label', 'Email log pages')}>
              <Typography variant="pi" textColor="neutral600" aria-live="polite">
                {t('analytics.pagination.status', 'Page {page} of {pageCount}', {
                  page: formatNumber(currentPage, undefined, '1'),
                  pageCount: formatNumber(pageCount, undefined, '1'),
                })}
              </Typography>
              <Flex gap={2} wrap="wrap">
                <TertiaryButton
                  startIcon={<ChevronLeftIcon style={ICON_16} aria-hidden="true" />}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1 || logsLoading}
                >
                  {t('analytics.pagination.previous', 'Previous')}
                </TertiaryButton>
                <TertiaryButton
                  endIcon={<ChevronRightIcon style={ICON_16} aria-hidden="true" />}
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  disabled={currentPage >= pageCount || logsLoading}
                >
                  {t('analytics.pagination.next', 'Next')}
                </TertiaryButton>
              </Flex>
            </PaginationBar>
          )}
        </TableContainer>
      )}

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

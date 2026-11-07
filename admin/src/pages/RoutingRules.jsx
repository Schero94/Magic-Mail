import { useEffect, useMemo, useState } from 'react';
import { useFetchClient, useNotification } from '@strapi/strapi/admin';
import {
  Box,
  Flex,
  Typography,
  Loader,
  Badge,
  SingleSelect,
  SingleSelectOption,
} from '@strapi/design-system';
import { Thead, Tbody, Tr, Th, Td, VisuallyHidden } from '@strapi/design-system';
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  CheckIcon,
  SparklesIcon,
  FunnelIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import {
  GradientButton,
  TertiaryButton,
  CTAButton,
  IconButton,
  IconButtonDanger,
} from '../components/StyledButtons';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import { SectionHeading } from '../components/shared/Headings';
import { SearchField } from '../components/shared/SearchField';
import { useMagicMailRBAC } from '../hooks/useMagicMailRBAC';
import { useMagicMailIntl } from '../hooks/useMagicMailIntl';
import { useFormatters } from '../hooks/useFormatters';
import { RuleModal } from './Routing/RuleModal';
import {
  Container,
  EmptyIconCircle,
  EmptyState,
  EmptyText,
  EmptyTitle,
  FilterBar,
  FilterSlot,
  FloatingIcon,
  Header,
  HeaderContent,
  MatchValue,
  OnlineBadge,
  RuleCard,
  RuleCardDetails,
  RuleCardList,
  RulesContainer,
  SearchSlot,
  SectionBar,
  StatCard,
  StatIcon,
  StatLabel,
  StatsGrid,
  StatValue,
  StyledTable,
  Subtitle,
  TableScroll,
  Title,
  WarningText,
} from './Routing/styles';
import {
  HIGH_PRIORITY_THRESHOLD,
  MATCH_TYPES,
  filterRules,
  getAccountStatus,
  getMatchTypeLabel,
  hasBrokenAccountReference,
  sortRulesByEvaluationOrder,
} from './Routing/ruleUtils';

/**
 * The DS table cell prevents the default of every key when it holds several
 * buttons (its grid navigation), which blocks native Enter/Space activation
 * and Tab. Those keys stay with the buttons; arrow keys still move the grid.
 */
const NATIVE_BUTTON_KEYS = new Set(['Enter', ' ', 'Tab']);
const keepNativeButtonKeys = (event) => {
  if (NATIVE_BUTTON_KEYS.has(event.key)) event.stopPropagation();
};

/** Focus target after a dialog closes whose opener is gone (deleted row). */
const getFocusFallback = () =>
  [...document.querySelectorAll('[data-mm-focus-fallback]')].find(
    (element) => element.getClientRects().length > 0
  );

const getRuleKey = (rule) => rule.documentId || rule.id;

const RoutingRulesPage = () => {
  const { canManage, isLoading: permissionsLoading, error: permissionsError } = useMagicMailRBAC();
  const { get, del } = useFetchClient();
  const { toggleNotification } = useNotification();
  const { t } = useMagicMailIntl();
  const { formatNumber } = useFormatters();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [accountsError, setAccountsError] = useState(false);
  const [rules, setRules] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterMatchType, setFilterMatchType] = useState('all');
  const [reloadKey, setReloadKey] = useState(0);

  // Loads the rules and accounts on mount and after every reloadData(); state
  // is only set once both requests settled, and `ignore` drops the answer after
  // unmount or a newer reload.
  useEffect(() => {
    let ignore = false;
    const load = async () => {
      // allSettled: a failing accounts call must not hide existing rules.
      const [rulesResult, accountsResult] = await Promise.allSettled([
        get('/magic-mail/routing-rules'),
        get('/magic-mail/accounts'),
      ]);
      if (ignore) return;

      if (rulesResult.status === 'fulfilled') {
        setRules(Array.isArray(rulesResult.value?.data?.data) ? rulesResult.value.data.data : []);
        setLoadError(false);
      } else {
        console.error('[magic-mail] Failed to load routing rules');
        setLoadError(true);
        toggleNotification({
          type: 'danger',
          message: t('routing.notify.loadFailed', 'Routing rules could not be loaded.'),
        });
      }

      if (accountsResult.status === 'fulfilled') {
        setAccounts(
          Array.isArray(accountsResult.value?.data?.data) ? accountsResult.value.data.data : []
        );
        setAccountsError(false);
      } else {
        console.error('[magic-mail] Failed to load email accounts for routing');
        setAccounts([]);
        setAccountsError(true);
      }
      setLoading(false);
    };
    load();
    return () => {
      ignore = true;
    };
  }, [get, toggleNotification, t, reloadKey]);

  /** Reloads rules and accounts (Retry, after a save or a delete). */
  const reloadData = () => {
    setLoading(true);
    setReloadKey((key) => key + 1);
  };

  const deleteRule = async (rule) => {
    if (!canManage) return;
    try {
      await del(`/magic-mail/routing-rules/${rule.documentId || rule.id}`);
      toggleNotification({
        type: 'success',
        message: t('routing.notify.deleted', 'Routing rule "{name}" deleted', { name: rule.name }),
      });
      setPendingDelete(null);
      reloadData();
    } catch {
      toggleNotification({
        type: 'danger',
        message: t('routing.notify.deleteFailed', 'The routing rule could not be deleted.'),
      });
    }
  };

  // Rules are listed in the order the email router evaluates them.
  const orderedRules = useMemo(() => sortRulesByEvaluationOrder(rules), [rules]);
  const filteredRules = useMemo(
    () =>
      filterRules(orderedRules, {
        search: searchQuery,
        status: filterStatus,
        matchType: filterMatchType,
      }),
    [orderedRules, searchQuery, filterStatus, filterMatchType]
  );
  const brokenCount = useMemo(
    () =>
      accountsError ? 0 : rules.filter((rule) => hasBrokenAccountReference(rule, accounts)).length,
    [rules, accounts, accountsError]
  );

  if (permissionsLoading || (loading && rules.length === 0 && !loadError)) {
    // Inside Container so the panel keeps its full height and background.
    return (
      <Container>
        <Flex justifyContent="center" alignItems="center" style={{ minHeight: '400px' }}>
          <Loader>{t('routing.loading', 'Loading routing rules...')}</Loader>
        </Flex>
      </Container>
    );
  }

  const totalRules = rules.length;
  const activeRules = rules.filter((r) => r.isActive).length;
  const highPriorityRules = rules.filter(
    (r) => Number(r.priority) >= HIGH_PRIORITY_THRESHOLD
  ).length;
  const hasFilters = searchQuery !== '' || filterStatus !== 'all' || filterMatchType !== 'all';
  const canEditRules = canManage && !accountsError;
  const knownMatchTypes = [
    ...MATCH_TYPES,
    ...[...new Set(rules.map((r) => r.matchType))].filter(
      (type) => type && !MATCH_TYPES.includes(type)
    ),
  ];

  const resetFilters = () => {
    setSearchQuery('');
    setFilterStatus('all');
    setFilterMatchType('all');
  };

  const renderAccountWarning = (name, { fallback = false } = {}) => {
    if (accountsError) return null;
    const status = getAccountStatus(name, accounts);
    if (status === 'active' || (status === 'none' && fallback)) return null;
    const message =
      status === 'inactive'
        ? t('routing.table.accountInactive', 'Account inactive')
        : status === 'none'
          ? t('routing.table.accountNotSet', 'No account set')
          : t('routing.table.accountMissing', 'Account not found');
    return (
      <WarningText variant="pi" fontWeight="semiBold">
        <ExclamationTriangleIcon aria-hidden="true" />
        {message}
      </WarningText>
    );
  };

  const renderStatus = (rule) => (
    <Flex alignItems="center" gap={2} shrink={0}>
      <OnlineBadge $active={rule.isActive} aria-hidden="true" />
      <Badge variant={rule.isActive ? 'success' : 'neutral'} size="S">
        {rule.isActive
          ? t('routing.status.active', 'Active')
          : t('routing.status.inactive', 'Inactive')}
      </Badge>
    </Flex>
  );

  const renderName = (rule, headingTag) => (
    <Flex direction="column" alignItems="flex-start" gap={1} style={{ minWidth: 0 }}>
      <Typography fontWeight="semiBold" tag={headingTag}>
        {rule.name}
      </Typography>
      {rule.description && (
        <Typography variant="pi" textColor="neutral600">
          {rule.description}
        </Typography>
      )}
    </Flex>
  );

  const renderMatchType = (rule) => (
    <Badge size="S" variant="secondary">
      {getMatchTypeLabel(rule.matchType, t)}
    </Badge>
  );

  const renderAccount = (rule) => (
    <Flex direction="column" alignItems="flex-start" gap={1}>
      <Typography fontWeight="semiBold">{rule.accountName}</Typography>
      {renderAccountWarning(rule.accountName)}
      {rule.fallbackAccountName && (
        <Typography variant="pi" textColor="neutral600">
          {t('routing.table.fallback', 'Fallback: {account}', {
            account: rule.fallbackAccountName,
          })}
        </Typography>
      )}
      {rule.fallbackAccountName &&
        renderAccountWarning(rule.fallbackAccountName, { fallback: true })}
    </Flex>
  );

  const renderPriority = (rule) => {
    const isHigh = Number(rule.priority) >= HIGH_PRIORITY_THRESHOLD;
    return (
      <Badge size="S" variant={isHigh ? 'warning' : 'neutral'}>
        <Flex tag="span" alignItems="center" gap={1}>
          {isHigh && <SparklesIcon aria-hidden="true" style={{ width: 12, height: 12 }} />}
          {formatNumber(rule.priority)}
          {isHigh && (
            <VisuallyHidden>{t('routing.table.highPriority', 'High priority')}</VisuallyHidden>
          )}
        </Flex>
      </Badge>
    );
  };

  const renderActions = (rule) => (
    <>
      <IconButton
        onClick={() => setEditingRule(rule)}
        disabled={!canEditRules}
        aria-label={t('routing.actions.edit', 'Edit rule "{name}"', {
          name: rule.name,
        })}
      >
        <PencilIcon aria-hidden="true" />
      </IconButton>
      <IconButtonDanger
        onClick={() => setPendingDelete(rule)}
        aria-label={t('routing.actions.delete', 'Delete rule "{name}"', {
          name: rule.name,
        })}
      >
        <TrashIcon aria-hidden="true" />
      </IconButtonDanger>
    </>
  );

  const renderBody = () => {
    if (permissionsError) {
      return (
        <EmptyState role="alert">
          <Flex
            direction="column"
            alignItems="center"
            gap={4}
            style={{ position: 'relative', zIndex: 1 }}
          >
            <EmptyIconCircle $tone="danger" aria-hidden="true">
              <ExclamationTriangleIcon />
            </EmptyIconCircle>
            <EmptyText variant="omega" textColor="neutral600">
              {t(
                'common.permissions.loadError',
                'Your permissions could not be loaded. Reload the page to try again.'
              )}
            </EmptyText>
          </Flex>
        </EmptyState>
      );
    }

    if (loadError) {
      return (
        <EmptyState role="alert">
          <Flex
            direction="column"
            alignItems="center"
            gap={6}
            style={{ position: 'relative', zIndex: 1 }}
          >
            <EmptyIconCircle $tone="danger" aria-hidden="true">
              <ExclamationTriangleIcon />
            </EmptyIconCircle>
            <EmptyTitle variant="alpha" tag="h2" textColor="neutral800">
              {t('routing.error.title', 'Routing rules could not be loaded')}
            </EmptyTitle>
            <EmptyText variant="omega" textColor="neutral600">
              {t(
                'routing.error.description',
                'Check your connection and permissions, then try again.'
              )}
            </EmptyText>
            <GradientButton
              onClick={reloadData}
              loading={loading}
              startIcon={<ArrowPathIcon style={{ width: 16, height: 16 }} aria-hidden="true" />}
            >
              {t('routing.error.retry', 'Retry')}
            </GradientButton>
          </Flex>
        </EmptyState>
      );
    }

    if (rules.length === 0) {
      return (
        <EmptyState>
          <FloatingIcon aria-hidden="true">
            <FunnelIcon />
          </FloatingIcon>

          <Flex
            direction="column"
            alignItems="center"
            gap={6}
            style={{ position: 'relative', zIndex: 1 }}
          >
            <EmptyIconCircle aria-hidden="true">
              <FunnelIcon />
            </EmptyIconCircle>

            <EmptyTitle variant="alpha" tag="h2" textColor="neutral800">
              {t('routing.empty.title', 'No Routing Rules Yet')}
            </EmptyTitle>

            <EmptyText variant="omega" textColor="neutral600">
              {canManage
                ? t(
                    'routing.empty.descriptionManage',
                    'Create your first routing rule to route emails based on type, recipient, subject, template, or a custom field.'
                  )
                : t('routing.empty.descriptionReadOnly', 'No routing rules have been set up yet.')}
            </EmptyText>

            {canManage && (
              <CTAButton
                startIcon={<PlusIcon style={{ width: 20, height: 20 }} aria-hidden="true" />}
                onClick={() => setShowModal(true)}
                data-mm-focus-fallback
                disabled={!canEditRules}
              >
                {t('routing.empty.cta', 'Create First Rule')}
              </CTAButton>
            )}
          </Flex>
        </EmptyState>
      );
    }

    return (
      <RulesContainer>
        <Box marginBottom={4}>
          <SectionBar justifyContent="space-between" alignItems="center">
            <SectionHeading>{t('routing.section.title', 'Routing Rules')}</SectionHeading>
            {canManage && (
              <GradientButton
                startIcon={<PlusIcon style={{ width: 16, height: 16 }} aria-hidden="true" />}
                onClick={() => setShowModal(true)}
                disabled={!canEditRules}
                data-mm-focus-fallback
              >
                {t('routing.actions.create', 'Create Rule')}
              </GradientButton>
            )}
          </SectionBar>
          <Typography variant="pi" tag="p" textColor="neutral600" marginTop={2}>
            {t(
              'routing.section.orderHint',
              'Rules are listed in evaluation order: the highest priority is checked first, and the first matching rule wins.'
            )}
          </Typography>
        </Box>

        {(accountsError || brokenCount > 0) && (
          <Box
            marginBottom={4}
            padding={4}
            hasRadius
            background="warning100"
            borderColor="warning200"
            borderStyle="solid"
            borderWidth="1px"
            role="status"
          >
            <Flex gap={3} alignItems="center" wrap="wrap" justifyContent="space-between">
              <WarningText variant="omega">
                <ExclamationTriangleIcon aria-hidden="true" />
                {accountsError
                  ? t(
                      'routing.accountsError',
                      'Email accounts could not be loaded, so rules cannot be created or edited right now.'
                    )
                  : t(
                      'routing.brokenRules',
                      '{count, plural, one {# rule uses} other {# rules use}} a missing or inactive account. Edit these rules so matching emails go through the intended account.',
                      { count: brokenCount }
                    )}
              </WarningText>
              {accountsError && (
                <TertiaryButton
                  onClick={reloadData}
                  loading={loading}
                  startIcon={<ArrowPathIcon style={{ width: 16, height: 16 }} aria-hidden="true" />}
                >
                  {t('routing.error.retry', 'Retry')}
                </TertiaryButton>
              )}
            </Flex>
          </Box>
        )}

        {/* Filter Bar */}
        <FilterBar>
          <SearchSlot>
            <SearchField
              label={t('routing.search.label', 'Search routing rules')}
              placeholder={t(
                'routing.search.placeholder',
                'Search by name, description, value, or account...'
              )}
              value={searchQuery}
              onChange={setSearchQuery}
            />
          </SearchSlot>

          <FilterSlot>
            <SingleSelect
              aria-label={t('routing.filters.status', 'Filter by status')}
              value={filterStatus}
              onChange={(value) => setFilterStatus(String(value))}
              size="S"
            >
              <SingleSelectOption value="all">
                {t('routing.filters.allStatuses', 'All Rules')}
              </SingleSelectOption>
              <SingleSelectOption value="active">
                {t('routing.status.active', 'Active')}
              </SingleSelectOption>
              <SingleSelectOption value="inactive">
                {t('routing.status.inactive', 'Inactive')}
              </SingleSelectOption>
            </SingleSelect>
          </FilterSlot>

          <FilterSlot>
            <SingleSelect
              aria-label={t('routing.filters.matchType', 'Filter by match type')}
              value={filterMatchType}
              onChange={(value) => setFilterMatchType(String(value))}
              size="S"
            >
              <SingleSelectOption value="all">
                {t('routing.filters.allTypes', 'All Types')}
              </SingleSelectOption>
              {knownMatchTypes.map((type) => (
                <SingleSelectOption key={type} value={type}>
                  {getMatchTypeLabel(type, t)}
                </SingleSelectOption>
              ))}
            </SingleSelect>
          </FilterSlot>
        </FilterBar>

        {/* Rules Table */}
        {filteredRules.length > 0 ? (
          <>
            <TableScroll
              role="region"
              aria-label={t('routing.table.label', 'Routing rules in evaluation order')}
            >
              <StyledTable colCount={canManage ? 7 : 6} rowCount={filteredRules.length + 1}>
                <Thead>
                  <Tr>
                    <Th>{t('routing.table.status', 'Status')}</Th>
                    <Th>{t('routing.table.name', 'Rule Name')}</Th>
                    <Th>{t('routing.table.matchType', 'Match Type')}</Th>
                    <Th>{t('routing.table.matchValue', 'Match Value')}</Th>
                    <Th>{t('routing.table.account', 'Target Account')}</Th>
                    <Th>{t('routing.table.priority', 'Priority')}</Th>
                    {canManage && (
                      <Th className="actions-cell">{t('routing.table.actions', 'Actions')}</Th>
                    )}
                  </Tr>
                </Thead>
                <Tbody>
                  {filteredRules.map((rule) => (
                    <Tr key={getRuleKey(rule)}>
                      <Td>{renderStatus(rule)}</Td>
                      <Td className="wrap-cell name-cell">{renderName(rule)}</Td>
                      <Td className="type-cell">{renderMatchType(rule)}</Td>
                      <Td className="wrap-cell">
                        <MatchValue variant="pi">{rule.matchValue}</MatchValue>
                      </Td>
                      <Td className="wrap-cell">{renderAccount(rule)}</Td>
                      <Td>{renderPriority(rule)}</Td>
                      {canManage && (
                        <Td className="actions-cell">
                          <Flex gap={2} onKeyDown={keepNativeButtonKeys}>
                            {renderActions(rule)}
                          </Flex>
                        </Td>
                      )}
                    </Tr>
                  ))}
                </Tbody>
              </StyledTable>
            </TableScroll>

            {/* Phones and small tablets: one card per rule, in evaluation order,
                instead of a seven-column table that scrolls sideways. */}
            <RuleCardList
              aria-label={t('routing.table.label', 'Routing rules in evaluation order')}
            >
              {filteredRules.map((rule) => (
                <RuleCard key={getRuleKey(rule)}>
                  <Flex justifyContent="space-between" alignItems="flex-start" gap={3}>
                    {renderName(rule, 'h3')}
                    {renderStatus(rule)}
                  </Flex>
                  <RuleCardDetails>
                    <div>
                      <dt>{t('routing.table.matchType', 'Match Type')}</dt>
                      <dd>{renderMatchType(rule)}</dd>
                    </div>
                    <div>
                      <dt>{t('routing.table.priority', 'Priority')}</dt>
                      <dd>{renderPriority(rule)}</dd>
                    </div>
                    <div>
                      <dt>{t('routing.table.matchValue', 'Match Value')}</dt>
                      <dd>
                        <MatchValue variant="pi">{rule.matchValue}</MatchValue>
                      </dd>
                    </div>
                    <div>
                      <dt>{t('routing.table.account', 'Target Account')}</dt>
                      <dd>{renderAccount(rule)}</dd>
                    </div>
                  </RuleCardDetails>
                  {canManage && <Flex gap={2}>{renderActions(rule)}</Flex>}
                </RuleCard>
              ))}
            </RuleCardList>
          </>
        ) : (
          <Box padding={8} style={{ textAlign: 'center' }}>
            <Flex direction="column" alignItems="center" gap={4}>
              <Typography variant="beta" tag="p" textColor="neutral600">
                {t('routing.filters.noResults', 'No rules found matching your filters')}
              </Typography>
              {hasFilters && (
                <TertiaryButton onClick={resetFilters}>
                  {t('routing.filters.reset', 'Reset filters')}
                </TertiaryButton>
              )}
            </Flex>
          </Box>
        )}
      </RulesContainer>
    );
  };

  return (
    <Container>
      {/* Hero Header */}
      <Header>
        <HeaderContent justifyContent="space-between" alignItems="center">
          <Flex direction="column" alignItems="flex-start" gap={2}>
            <Title tag="h1">
              <FunnelIcon aria-hidden="true" />
              {t('routing.title', 'Email Routing Rules')}
            </Title>
            <Subtitle tag="p">
              {t(
                'routing.subtitle',
                'Define routing rules to send emails through specific accounts based on conditions'
              )}
            </Subtitle>
          </Flex>
        </HeaderContent>
      </Header>

      {/* Quick Stats */}
      {!loadError && !permissionsError && (
        <StatsGrid>
          <StatCard $delay="0.1s" $tone="secondary">
            <StatIcon
              className="stat-icon"
              $bg="rgba(168, 85, 247, 0.12)"
              $tone="secondary"
              aria-hidden="true"
            >
              <FunnelIcon />
            </StatIcon>
            <StatValue className="stat-value">{formatNumber(totalRules)}</StatValue>
            <StatLabel>{t('routing.stats.total', 'Total rules')}</StatLabel>
          </StatCard>

          <StatCard $delay="0.2s" $tone="success">
            <StatIcon
              className="stat-icon"
              $bg="rgba(22, 163, 74, 0.12)"
              $tone="success"
              aria-hidden="true"
            >
              <CheckIcon />
            </StatIcon>
            <StatValue className="stat-value">{formatNumber(activeRules)}</StatValue>
            <StatLabel>{t('routing.stats.active', 'Active rules')}</StatLabel>
          </StatCard>

          <StatCard $delay="0.3s" $tone="warning">
            <StatIcon
              className="stat-icon"
              $bg="rgba(234, 179, 8, 0.12)"
              $tone="warning"
              aria-hidden="true"
            >
              <SparklesIcon />
            </StatIcon>
            <StatValue className="stat-value">{formatNumber(highPriorityRules)}</StatValue>
            <StatLabel>
              {t('routing.stats.highPriority', 'High priority ({threshold}+)', {
                threshold: HIGH_PRIORITY_THRESHOLD,
              })}
            </StatLabel>
          </StatCard>
        </StatsGrid>
      )}

      {renderBody()}

      {/* Create/Edit Modal */}
      {canEditRules && (showModal || editingRule) && (
        <RuleModal
          rule={editingRule}
          accounts={accounts}
          canManage={canManage}
          onClose={() => {
            setShowModal(false);
            setEditingRule(null);
          }}
          onSave={reloadData}
        />
      )}

      <ConfirmDialog
        isOpen={canManage && pendingDelete !== null}
        title={t('routing.delete.title', 'Delete routing rule?')}
        description={t('routing.delete.body', 'Delete "{name}"? This cannot be undone.', {
          name: pendingDelete?.name,
        })}
        confirmLabel={t('common.delete', 'Delete')}
        confirmIcon={<TrashIcon style={{ width: 16, height: 16 }} aria-hidden="true" />}
        onConfirm={() => deleteRule(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        getReturnFocusFallback={getFocusFallback}
      >
        {t(
          'routing.delete.hint',
          'Emails that matched this rule will be routed by the remaining rules instead.'
        )}
      </ConfirmDialog>
    </Container>
  );
};

export default RoutingRulesPage;

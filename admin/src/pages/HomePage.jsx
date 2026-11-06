import { useEffect, useState } from 'react';
import { useFetchClient, useNotification } from '@strapi/strapi/admin';
import { useMagicMailRBAC } from '../hooks/useMagicMailRBAC';
import { useMagicMailIntl } from '../hooks/useMagicMailIntl';
import { useFormatters } from '../hooks/useFormatters';
import {
  Badge,
  Box,
  Flex,
  Loader,
  SingleSelect,
  SingleSelectOption,
  Typography,
} from '@strapi/design-system';
import { Tbody, Td, Th, Thead, Tr } from '@strapi/design-system';
import {
  EnvelopeIcon,
  ExclamationTriangleIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  ServerIcon,
  SparklesIcon,
  StarIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import AddAccountModal from '../components/AddAccountModal';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import { SectionHeading } from '../components/shared/Headings';
import { SearchField } from '../components/shared/SearchField';
import {
  CTAButton,
  GradientButton,
  IconButton,
  IconButtonDanger,
  IconButtonPrimary,
  TertiaryButton,
} from '../components/StyledButtons';
import { theme } from '../utils/theme';
import { TestEmailModal } from './Accounts/TestEmailModal';
import {
  AccountsContainer,
  Container,
  EmptyIconCircle,
  EmptyState,
  FilterBar,
  FilterSelectBox,
  FloatingIcon,
  Header,
  HeaderContent,
  OnlineBadge,
  SectionHeaderRow,
  StatCard,
  StatIcon,
  StatLabel,
  StatValue,
  StatsGrid,
  StyledTable,
  Subtitle,
  TableScroller,
  Title,
  UsageFill,
  UsageTrack,
} from './Accounts/styles';
import {
  countRulesForAccount,
  filterAccounts,
  getAccountKey,
  getUsagePercent,
  uniqueProviders,
} from './Accounts/accountHelpers';

const PROVIDER_NAMES = {
  smtp: 'SMTP',
  nodemailer: 'Nodemailer',
  'gmail-oauth': 'Gmail OAuth',
  'microsoft-oauth': 'Microsoft OAuth',
  'yahoo-oauth': 'Yahoo Mail OAuth',
  sendgrid: 'SendGrid',
  mailgun: 'Mailgun',
};
const providerName = (value) => PROVIDER_NAMES[value] ?? value;

/** Centered loader in the page area (keeps the current look). */
const PageLoader = ({ label }) => (
  <Flex justifyContent="center" alignItems="center" style={{ minHeight: '400px' }}>
    <Loader>{label}</Loader>
  </Flex>
);

/** Strips an OAuth code that the callback fallback left in the admin URL. */
const useStripOAuthCallbackParams = () => {
  const { toggleNotification } = useNotification();
  const { t } = useMagicMailIntl();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('oauth_code') && !params.has('oauth_state')) return;
    params.delete('oauth_code');
    params.delete('oauth_state');
    const query = params.toString();
    window.history.replaceState(
      window.history.state,
      document.title,
      `${window.location.pathname}${query ? `?${query}` : ''}`
    );
    toggleNotification({
      type: 'warning',
      message: t(
        'accounts.oauth.fallback',
        'The authorization result could not be passed back to the account wizard. Close this window and start the connection again from the original tab.'
      ),
    });
  }, [t, toggleNotification]);
};

const HomePage = () => {
  const {
    canManage,
    canTestSend,
    isLoading: permissionsLoading,
    error: permissionsError,
  } = useMagicMailRBAC();
  const { get, post, del } = useFetchClient();
  const { toggleNotification } = useNotification();
  const { t } = useMagicMailIntl();
  const { formatDateTime, formatNumber } = useFormatters();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [rules, setRules] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [testingAccount, setTestingAccount] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterProvider, setFilterProvider] = useState('all');

  useStripOAuthCallbackParams();

  // Loads accounts and rules on mount and after every fetchAccounts(); state is
  // only set once both requests settled, and `ignore` drops stale answers.
  const [accountsReloadKey, setAccountsReloadKey] = useState(0);
  useEffect(() => {
    let ignore = false;
    const load = async () => {
      // Rules are only used for the rename/delete warnings; a failure there
      // must not hide the accounts.
      const [accountsResult, rulesResult] = await Promise.allSettled([
        get('/magic-mail/accounts'),
        get('/magic-mail/routing-rules'),
      ]);
      if (ignore) return;

      if (accountsResult.status === 'fulfilled') {
        const list = accountsResult.value?.data?.data;
        setAccounts(Array.isArray(list) ? list : []);
      } else {
        console.error('[magic-mail] Failed to fetch email accounts');
        setLoadError(true);
      }
      setRules(
        rulesResult.status === 'fulfilled' && Array.isArray(rulesResult.value?.data?.data)
          ? rulesResult.value.data.data
          : null
      );
      setLoading(false);
    };
    load();
    return () => {
      ignore = true;
    };
  }, [get, accountsReloadKey]);

  /** Reloads accounts and rules (Retry, after add, edit, delete or test). */
  const fetchAccounts = () => {
    setLoading(true);
    setLoadError(false);
    setAccountsReloadKey((key) => key + 1);
  };

  /**
   * Sends a test message through exactly this account and forwards optional CC recipients.
   * @returns {Promise<boolean>} true when the server reports success
   */
  const testAccount = async (account, testEmail, testOptions = {}) => {
    try {
      const { data } = await post(`/magic-mail/accounts/${getAccountKey(account)}/test`, {
        testEmail,
        cc: testOptions.cc || undefined,
        priority: testOptions.priority || 'normal',
        type: testOptions.type || 'transactional',
        unsubscribeUrl: testOptions.unsubscribeUrl || null,
      });

      if (data?.success) {
        toggleNotification({
          type: 'success',
          message: t('accounts.test.directSuccess', 'Test email sent to {email} via {name}.', {
            email: testEmail,
            name: account.name,
          }),
        });
        return true;
      }
      toggleNotification({
        type: 'danger',
        message: data?.message
          ? t('accounts.test.failedReason', 'The test email failed: {reason}', {
              reason: data.message,
            })
          : t('accounts.test.failed', 'The test email failed.'),
      });
      return false;
    } catch (err) {
      const reason = err?.response?.data?.error?.message;
      toggleNotification({
        type: 'danger',
        message: reason
          ? t('accounts.test.failedReason', 'The test email failed: {reason}', { reason })
          : t('accounts.test.failed', 'The test email failed.'),
      });
      return false;
    }
  };

  const deleteAccount = async (account) => {
    if (!canManage) return;
    try {
      await del(`/magic-mail/accounts/${getAccountKey(account)}`);
      toggleNotification({
        type: 'success',
        message: t('accounts.delete.success', '{name} was deleted.', { name: account.name }),
      });
      setPendingDelete(null);
      fetchAccounts();
    } catch {
      toggleNotification({
        type: 'danger',
        message: t('accounts.delete.failed', 'The account could not be deleted.'),
      });
    }
  };

  if (permissionsLoading || (loading && accounts.length === 0 && !loadError)) {
    return <PageLoader label={t('accounts.loading', 'Loading email accounts...')} />;
  }

  const hasRowActions = canManage || canTestSend;
  const totalSentToday = accounts.reduce((sum, acc) => sum + (acc.emailsSentToday || 0), 0);
  const totalSent = accounts.reduce((sum, acc) => sum + (acc.totalEmailsSent || 0), 0);
  const activeAccounts = accounts.filter((a) => a.isActive).length;
  const filteredAccounts = filterAccounts(accounts, {
    query: searchQuery,
    status: filterStatus,
    provider: filterProvider,
  });
  const providers = uniqueProviders(accounts);
  const filtersActive =
    searchQuery.trim() !== '' || filterStatus !== 'all' || filterProvider !== 'all';
  const pendingDeleteRuleCount = pendingDelete
    ? countRulesForAccount(rules, pendingDelete.name)
    : null;

  const resetFilters = () => {
    setSearchQuery('');
    setFilterStatus('all');
    setFilterProvider('all');
  };

  const renderContent = () => {
    if (loadError) {
      return (
        <EmptyState role="alert">
          <Flex
            direction="column"
            alignItems="center"
            gap={6}
            style={{ position: 'relative', zIndex: 1 }}
          >
            <EmptyIconCircle $danger>
              <ExclamationTriangleIcon aria-hidden="true" />
            </EmptyIconCircle>
            <SectionHeading
              tag="h2"
              textColor="neutral800"
              style={{ fontSize: '2rem', fontWeight: 700 }}
            >
              {t('accounts.error.title', 'Email accounts could not be loaded')}
            </SectionHeading>
            <Typography
              variant="omega"
              textColor="neutral600"
              style={{ maxWidth: '500px', lineHeight: '1.6' }}
            >
              {t(
                'accounts.error.body',
                'Check your connection and try again. If the problem persists, check the server logs.'
              )}
            </Typography>
            <GradientButton onClick={fetchAccounts} loading={loading}>
              {t('accounts.error.retry', 'Try again')}
            </GradientButton>
          </Flex>
        </EmptyState>
      );
    }

    if (accounts.length === 0) {
      return (
        <EmptyState>
          <FloatingIcon aria-hidden="true">
            <EnvelopeIcon />
          </FloatingIcon>

          <Flex
            direction="column"
            alignItems="center"
            gap={6}
            style={{ position: 'relative', zIndex: 1 }}
          >
            <EmptyIconCircle>
              <EnvelopeIcon aria-hidden="true" />
            </EmptyIconCircle>

            <SectionHeading
              tag="h2"
              textColor="neutral800"
              style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '8px' }}
            >
              {t('accounts.empty.title', 'No email accounts yet')}
            </SectionHeading>

            <Typography
              variant="omega"
              textColor="neutral600"
              style={{ maxWidth: '500px', lineHeight: '1.6' }}
            >
              {canManage
                ? t(
                    'accounts.empty.body',
                    'Add your first email account to start sending emails through MagicMail’s multi-account routing.'
                  )
                : t(
                    'accounts.empty.readOnly',
                    'No email accounts have been set up yet. Ask an administrator with manage permission to add one.'
                  )}
            </Typography>

            {canManage && (
              <CTAButton
                startIcon={<PlusIcon style={{ width: 20, height: 20 }} aria-hidden="true" />}
                onClick={() => setShowAddModal(true)}
              >
                {t('accounts.empty.cta', 'Add first account')}
              </CTAButton>
            )}
          </Flex>
        </EmptyState>
      );
    }

    return (
      <AccountsContainer>
        <Box style={{ marginBottom: theme.spacing.md }}>
          <SectionHeaderRow justifyContent="space-between" alignItems="center" marginBottom={4}>
            <SectionHeading>{t('accounts.section.title', 'Email accounts')}</SectionHeading>
            {canManage && (
              <GradientButton
                startIcon={<PlusIcon style={{ width: 16, height: 16 }} aria-hidden="true" />}
                onClick={() => setShowAddModal(true)}
              >
                {t('accounts.add', 'Add account')}
              </GradientButton>
            )}
          </SectionHeaderRow>
        </Box>

        <FilterBar>
          <SearchField
            label={t('accounts.search.label', 'Search accounts')}
            placeholder={t('accounts.search.placeholder', 'Search by name, email or provider...')}
            value={searchQuery}
            onChange={setSearchQuery}
          />

          <FilterSelectBox>
            <SingleSelect
              value={filterStatus}
              onChange={setFilterStatus}
              aria-label={t('accounts.filters.status', 'Filter by status')}
              placeholder={t('accounts.filters.statusPlaceholder', 'Status')}
              size="S"
            >
              <SingleSelectOption value="all">
                {t('accounts.filters.allAccounts', 'All accounts')}
              </SingleSelectOption>
              <SingleSelectOption value="active">
                {t('accounts.status.active', 'Active')}
              </SingleSelectOption>
              <SingleSelectOption value="inactive">
                {t('accounts.status.inactive', 'Inactive')}
              </SingleSelectOption>
              <SingleSelectOption value="primary">
                {t('accounts.status.primary', 'Primary')}
              </SingleSelectOption>
            </SingleSelect>
          </FilterSelectBox>

          <FilterSelectBox>
            <SingleSelect
              value={filterProvider}
              onChange={setFilterProvider}
              aria-label={t('accounts.filters.provider', 'Filter by provider')}
              placeholder={t('accounts.filters.providerPlaceholder', 'Provider')}
              size="S"
            >
              <SingleSelectOption value="all">
                {t('accounts.filters.allProviders', 'All providers')}
              </SingleSelectOption>
              {providers.map((provider) => (
                <SingleSelectOption key={provider} value={provider}>
                  {providerName(provider)}
                </SingleSelectOption>
              ))}
            </SingleSelect>
          </FilterSelectBox>
        </FilterBar>

        {filteredAccounts.length > 0 ? (
          <TableScroller>
            <StyledTable colCount={hasRowActions ? 8 : 7} rowCount={filteredAccounts.length + 1}>
              <Thead>
                <Tr>
                  <Th>{t('accounts.table.status', 'Status')}</Th>
                  <Th>{t('accounts.table.account', 'Account')}</Th>
                  <Th>{t('accounts.table.provider', 'Provider')}</Th>
                  <Th>
                    <span
                      title={t(
                        'accounts.table.priorityHint',
                        'Routing priority (higher = preferred)'
                      )}
                    >
                      {t('accounts.table.priority', 'Priority')}
                    </span>
                  </Th>
                  <Th>{t('accounts.table.usageToday', 'Usage today')}</Th>
                  <Th>{t('accounts.table.totalSent', 'Total sent')}</Th>
                  <Th>{t('accounts.table.lastUsed', 'Last used')}</Th>
                  {hasRowActions && <Th>{t('accounts.table.actions', 'Actions')}</Th>}
                </Tr>
              </Thead>
              <Tbody>
                {filteredAccounts.map((account) => {
                  const usagePercent = getUsagePercent(account);
                  const isNearLimit = usagePercent > 80;

                  return (
                    <Tr key={getAccountKey(account)}>
                      <Td>
                        <Flex alignItems="center" gap={2}>
                          <OnlineBadge $active={account.isActive} aria-hidden="true" />
                          <Badge variant={account.isActive ? 'success' : 'neutral'} size="S">
                            {account.isActive
                              ? t('accounts.status.active', 'Active')
                              : t('accounts.status.inactive', 'Inactive')}
                          </Badge>
                        </Flex>
                      </Td>

                      <Td>
                        <Flex direction="column" alignItems="flex-start" gap={1}>
                          <Flex alignItems="center" gap={2} wrap="wrap">
                            <Typography fontWeight="semiBold">{account.name}</Typography>
                            {account.isPrimary && (
                              <Badge variant="warning" size="S">
                                <Flex tag="span" alignItems="center" gap={1}>
                                  <StarIcon aria-hidden="true" style={{ width: 12, height: 12 }} />
                                  {t('accounts.status.primary', 'Primary')}
                                </Flex>
                              </Badge>
                            )}
                          </Flex>
                          <Typography variant="pi" textColor="neutral600">
                            {account.fromEmail}
                          </Typography>
                        </Flex>
                      </Td>

                      <Td>
                        <Badge size="S">
                          <Flex tag="span" alignItems="center" gap={1}>
                            <ServerIcon aria-hidden="true" style={{ width: 12, height: 12 }} />
                            {providerName(account.provider)}
                          </Flex>
                        </Badge>
                      </Td>

                      <Td>
                        <Badge size="S" variant="secondary">
                          {t('accounts.table.priorityValue', '{priority}/10', {
                            priority: account.priority ?? 1,
                          })}
                        </Badge>
                      </Td>

                      <Td>
                        <Flex direction="column" alignItems="flex-start" gap={1}>
                          <Typography fontWeight="semiBold">
                            {formatNumber(account.emailsSentToday || 0)}
                            {account.dailyLimit > 0 ? (
                              <Typography variant="pi" textColor="neutral600" tag="span">
                                {' '}
                                / {formatNumber(account.dailyLimit)}
                              </Typography>
                            ) : (
                              <Typography variant="pi" textColor="neutral600" tag="span">
                                {' '}
                                ({t('accounts.table.unlimited', 'unlimited')})
                              </Typography>
                            )}
                          </Typography>
                          {account.dailyLimit > 0 && (
                            <UsageTrack
                              role="progressbar"
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-valuenow={Math.min(usagePercent, 100)}
                              aria-label={t(
                                'accounts.table.usageLabel',
                                'Daily limit used: {percent}%',
                                { percent: usagePercent }
                              )}
                            >
                              <UsageFill
                                $danger={isNearLimit}
                                style={{ width: `${Math.min(usagePercent, 100)}%` }}
                              />
                            </UsageTrack>
                          )}
                        </Flex>
                      </Td>

                      <Td>
                        <Typography fontWeight="semiBold">
                          {formatNumber(account.totalEmailsSent || 0)}
                        </Typography>
                      </Td>

                      <Td>
                        <Typography
                          variant="pi"
                          textColor={account.lastUsed ? 'neutral600' : 'neutral500'}
                        >
                          {formatDateTime(
                            account.lastUsed,
                            undefined,
                            t('accounts.table.never', 'Never')
                          )}
                        </Typography>
                      </Td>

                      {hasRowActions && (
                        <Td>
                          <Flex gap={2}>
                            {canManage && (
                              <IconButton
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingAccount(account);
                                }}
                                aria-label={t('accounts.actions.edit', 'Edit account {name}', {
                                  name: account.name,
                                })}
                              >
                                <PencilIcon aria-hidden="true" />
                              </IconButton>
                            )}
                            {canTestSend && (
                              <IconButtonPrimary
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setTestingAccount(account);
                                }}
                                aria-label={t('accounts.actions.test', 'Test account {name}', {
                                  name: account.name,
                                })}
                              >
                                <PlayIcon aria-hidden="true" />
                              </IconButtonPrimary>
                            )}
                            {canManage && (
                              <IconButtonDanger
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPendingDelete(account);
                                }}
                                aria-label={t('accounts.actions.delete', 'Delete account {name}', {
                                  name: account.name,
                                })}
                              >
                                <TrashIcon aria-hidden="true" />
                              </IconButtonDanger>
                            )}
                          </Flex>
                        </Td>
                      )}
                    </Tr>
                  );
                })}
              </Tbody>
            </StyledTable>
          </TableScroller>
        ) : (
          <Flex
            direction="column"
            alignItems="center"
            gap={4}
            padding={8}
            style={{ textAlign: 'center' }}
          >
            <Typography variant="beta" tag="p" textColor="neutral600">
              {t('accounts.filters.noResults', 'No accounts match your filters')}
            </Typography>
            {filtersActive && (
              <TertiaryButton onClick={resetFilters}>
                {t('accounts.filters.reset', 'Reset filters')}
              </TertiaryButton>
            )}
          </Flex>
        )}
      </AccountsContainer>
    );
  };

  return (
    <Container>
      <Header>
        <HeaderContent justifyContent="space-between" alignItems="center">
          <Flex direction="column" alignItems="flex-start" gap={2}>
            <Title tag="h1">
              <EnvelopeIcon aria-hidden="true" />
              {t('accounts.hero.title', 'MagicMail - Email Business Suite')}
            </Title>
            <Subtitle tag="p">
              {t(
                'accounts.hero.subtitle',
                'Multi-account email management with smart routing and OAuth support'
              )}
            </Subtitle>
          </Flex>
        </HeaderContent>
      </Header>

      {permissionsError ? (
        <Box marginBottom={6}>
          <Typography variant="omega" textColor="danger600" role="alert">
            {t(
              'common.permissions.loadError',
              'Your permissions could not be loaded. Reload the page to try again.'
            )}
          </Typography>
        </Box>
      ) : null}

      {!loadError && (
        <StatsGrid>
          <StatCard $delay="0.1s" $tone="primary">
            <StatIcon className="stat-icon" $bg="rgba(2, 132, 199, 0.12)" $tone="primary">
              <EnvelopeIcon aria-hidden="true" />
            </StatIcon>
            <StatValue className="stat-value" tag="p">
              {formatNumber(totalSentToday)}
            </StatValue>
            <StatLabel tag="p">{t('accounts.stats.today', 'Emails today')}</StatLabel>
          </StatCard>

          <StatCard $delay="0.2s" $tone="success">
            <StatIcon className="stat-icon" $bg="rgba(22, 163, 74, 0.12)" $tone="success">
              <ServerIcon aria-hidden="true" />
            </StatIcon>
            <StatValue className="stat-value" tag="p">
              {formatNumber(totalSent)}
            </StatValue>
            <StatLabel tag="p">{t('accounts.stats.totalSent', 'Total sent')}</StatLabel>
          </StatCard>

          <StatCard $delay="0.3s" $tone="warning">
            <StatIcon className="stat-icon" $bg="rgba(234, 179, 8, 0.12)" $tone="warning">
              <SparklesIcon aria-hidden="true" />
            </StatIcon>
            <StatValue className="stat-value" tag="p">
              {t('accounts.stats.activeValue', '{active} / {total}', {
                active: formatNumber(activeAccounts),
                total: formatNumber(accounts.length),
              })}
            </StatValue>
            <StatLabel tag="p">{t('accounts.stats.active', 'Active accounts')}</StatLabel>
          </StatCard>
        </StatsGrid>
      )}

      {renderContent()}

      {canManage && (
        <AddAccountModal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          onAccountAdded={fetchAccounts}
        />
      )}

      {canManage && (
        <AddAccountModal
          isOpen={!!editingAccount}
          onClose={() => setEditingAccount(null)}
          onAccountAdded={() => {
            fetchAccounts();
            setEditingAccount(null);
          }}
          editAccount={editingAccount}
          referencingRuleCount={
            editingAccount ? countRulesForAccount(rules, editingAccount.name) : null
          }
        />
      )}

      {canTestSend && testingAccount && (
        <TestEmailModal
          account={testingAccount}
          onClose={() => setTestingAccount(null)}
          onTest={(email, testOptions) => testAccount(testingAccount, email, testOptions)}
        />
      )}

      <ConfirmDialog
        isOpen={canManage && pendingDelete !== null}
        title={t('accounts.delete.title', 'Delete email account?')}
        description={t('accounts.delete.body', 'Delete "{name}"? This cannot be undone.', {
          name: pendingDelete?.name ?? '',
        })}
        confirmLabel={t('common.delete', 'Delete')}
        confirmIcon={<TrashIcon style={{ width: 16, height: 16 }} aria-hidden="true" />}
        onConfirm={() => deleteAccount(pendingDelete)}
        onClose={() => setPendingDelete(null)}
      >
        {pendingDeleteRuleCount > 0
          ? t(
              'accounts.delete.rulesCount',
              '{count, plural, one {# routing rule uses this account} other {# routing rules use this account}}. Update the rules, otherwise routing falls back to the default account.',
              { count: pendingDeleteRuleCount }
            )
          : t(
              'accounts.delete.rulesHint',
              'Routing rules that use this account fall back to the default account.'
            )}
      </ConfirmDialog>
    </Container>
  );
};

export default HomePage;

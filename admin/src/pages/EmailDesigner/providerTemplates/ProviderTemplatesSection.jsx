import {
  Button,
  Flex,
  IconButton,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  Typography,
  VisuallyHidden,
} from '@strapi/design-system';
import { ArrowClockwise, Cloud, Eye } from '@strapi/icons';
import { SectionHeading } from '../../../components/shared/Headings';
import {
  DataTable,
  EmptyState,
  LoadErrorState,
  StatusBadge,
  StyledTable,
  keepNativeButtonKeys,
} from '../../../components/shared/table';
import { useMagicMailIntl } from '../../../hooks/useMagicMailIntl';
import { useFormatters } from '../../../hooks/useFormatters';
import { SectionHeaderRow, TemplatesContainer } from '../templateListStyles';
import { Notice } from './Notice';
import { KeyText } from './providerTemplateStyles';
import { providerName, statusInfo } from './providerTemplateUtils';

/**
 * Account sync error codes from the server (services/provider-templates.js).
 * @type {Record<string, {id: string, label: string}>}
 */
const ACCOUNT_ERRORS = {
  AUTH: {
    id: 'templates.provider.accountError.auth',
    label: 'The API key was rejected or may not read templates.',
  },
  RATE_LIMITED: {
    id: 'templates.provider.accountError.rateLimited',
    label: 'The provider rate limit was reached. Try again in a minute.',
  },
  CREDENTIALS: {
    id: 'templates.provider.accountError.credentials',
    label: 'The stored credentials can not be read. Enter the API key again.',
  },
  NOT_FOUND: {
    id: 'templates.provider.accountError.notFound',
    label: 'The provider did not find this account or domain.',
  },
  default: {
    id: 'templates.provider.accountError.unavailable',
    label: 'The provider could not be reached.',
  },
};

/**
 * "Provider templates" section under the local templates. Rendered only when
 * a SendGrid or Mailgun account exists (progressive disclosure); read-only:
 * every row opens the preview dialog.
 *
 * @param {object} props
 * @param {object|null} props.overview - GET /provider-templates data
 * @param {boolean} props.loading
 * @param {boolean} props.error - The overview could not be loaded
 * @param {boolean} props.syncing
 * @param {() => void} props.onSync
 * @param {() => void} props.onRetry
 * @param {(template: object) => void} props.onOpen
 * @returns {import('react').ReactElement|null}
 */
export const ProviderTemplatesSection = ({
  overview,
  loading,
  error,
  syncing,
  onSync,
  onRetry,
  onOpen,
}) => {
  const { t } = useMagicMailIntl();
  const { formatDateTime, formatRelative } = useFormatters();

  if (loading && !overview) return null;
  if (error && !overview) {
    return (
      <TemplatesContainer>
        <SectionHeading>{t('templates.provider.heading', 'Provider templates')}</SectionHeading>
        <DataTable>
          <LoadErrorState
            message={t('templates.provider.error.title', 'Provider templates could not be loaded')}
            description={t(
              'templates.provider.error.description',
              'Check your connection and permissions, then try again.'
            )}
            onRetry={onRetry}
          />
        </DataTable>
      </TemplatesContainer>
    );
  }
  if (!overview?.enabled) return null;

  const templates = overview.templates ?? [];
  const failedAccounts = (overview.accounts ?? []).filter((account) => account.error);
  const lastSynced = overview.lastSyncedAt
    ? t('templates.provider.lastSynced', 'Last synced {time}.', {
        time: formatRelative(overview.lastSyncedAt),
      })
    : t('templates.provider.neverSynced', 'Not synced yet.');
  const columns = {
    name: t('templates.provider.table.name', 'Template'),
    changed: t('templates.provider.table.changed', 'Changed at provider'),
    accounts: t('templates.provider.table.accounts', 'Accounts'),
    status: t('templates.provider.table.status', 'Status'),
    actions: t('templates.table.actions', 'Actions'),
  };

  const syncButton = (
    <Button
      variant="secondary"
      size="L"
      startIcon={<ArrowClockwise aria-hidden="true" />}
      onClick={onSync}
      loading={syncing}
    >
      {syncing
        ? t('templates.provider.syncing', 'Syncing...')
        : t('templates.provider.sync', 'Sync')}
    </Button>
  );

  const renderBody = () => {
    if (templates.length === 0) {
      return (
        <EmptyState
          icon={Cloud}
          title={
            syncing
              ? t('templates.provider.empty.syncingTitle', 'Reading your provider templates...')
              : t('templates.provider.empty.title', 'No provider templates found')
          }
          description={t(
            'templates.provider.empty.description',
            'Create a template at your provider (SendGrid, Mailgun, Brevo or Amazon SES), then select Sync. Magic Mail lists it here and can send it with your routing, failover and logs.'
          )}
          actions={syncing ? null : syncButton}
        />
      );
    }
    return (
      <StyledTable colCount={5} rowCount={templates.length + 1}>
        <Thead>
          <Tr>
            <Th>{columns.name}</Th>
            <Th>{columns.changed}</Th>
            <Th>{columns.accounts}</Th>
            <Th>{columns.status}</Th>
            <Th>
              <VisuallyHidden>{columns.actions}</VisuallyHidden>
            </Th>
          </Tr>
        </Thead>
        <Tbody>
          {templates.map((template) => {
            const status = statusInfo(template.status);
            return (
              <Tr key={template.key}>
                <Td className="cell-wrap" data-label={columns.name}>
                  <Flex direction="column" alignItems="flex-start" gap={1} style={{ minWidth: 0 }}>
                    <Flex gap={2} alignItems="center" wrap="wrap">
                      <Typography variant="omega" fontWeight="semiBold">
                        {template.name}
                      </Typography>
                      <StatusBadge $tone="primary">{providerName(template.provider)}</StatusBadge>
                    </Flex>
                    <KeyText>{template.key}</KeyText>
                  </Flex>
                </Td>
                <Td data-label={columns.changed}>
                  <Typography variant="omega" textColor="neutral800">
                    {formatDateTime(template.updatedAtProvider)}
                  </Typography>
                </Td>
                <Td className="cell-wrap" data-label={columns.accounts}>
                  <Typography variant="omega" textColor="neutral800">
                    {template.accounts.map((account) => account.name).join(', ')}
                  </Typography>
                </Td>
                <Td data-label={columns.status}>
                  <StatusBadge $tone={status.tone}>{t(status.id, status.label)}</StatusBadge>
                </Td>
                <Td data-label="">
                  <Flex justifyContent="flex-end" onKeyDown={keepNativeButtonKeys}>
                    <IconButton
                      label={t('templates.provider.open', 'Open {name}', { name: template.name })}
                      variant="ghost"
                      onClick={() => onOpen(template)}
                    >
                      <Eye aria-hidden="true" />
                    </IconButton>
                  </Flex>
                </Td>
              </Tr>
            );
          })}
        </Tbody>
      </StyledTable>
    );
  };

  return (
    <TemplatesContainer>
      <SectionHeaderRow justifyContent="space-between" alignItems="center" wrap="wrap" gap={4}>
        <Flex direction="column" alignItems="flex-start" gap={1} style={{ minWidth: 0 }}>
          <SectionHeading>{t('templates.provider.heading', 'Provider templates')}</SectionHeading>
          <Typography variant="pi" textColor="neutral600" tag="p">
            {t(
              'templates.provider.description',
              'Read-only templates from your SendGrid, Mailgun, Brevo and Amazon SES accounts.'
            )}{' '}
            {lastSynced}
          </Typography>
        </Flex>
        {templates.length > 0 ? syncButton : null}
      </SectionHeaderRow>

      {failedAccounts.length > 0 ? (
        <Flex direction="column" alignItems="stretch" gap={2} marginBottom={4}>
          {failedAccounts.map((account) => {
            const info = ACCOUNT_ERRORS[account.error] ?? ACCOUNT_ERRORS.default;
            return (
              <Notice
                key={account.documentId}
                tone="warning"
                title={t(
                  'templates.provider.accountError.title',
                  '{account} ({provider}) could not be read',
                  { account: account.name, provider: providerName(account.provider) }
                )}
              >
                {t(info.id, info.label)}{' '}
                {t(
                  'templates.provider.accountError.keep',
                  'Its templates keep their last synced state.'
                )}
              </Notice>
            );
          })}
        </Flex>
      ) : null}

      <DataTable aria-label={t('templates.provider.heading', 'Provider templates')}>
        {renderBody()}
      </DataTable>
    </TemplatesContainer>
  );
};

export default ProviderTemplatesSection;

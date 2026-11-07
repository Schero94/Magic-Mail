import { useEffect, useRef, useState } from 'react';
import { useFetchClient, useNotification } from '@strapi/strapi/admin';
import {
  Button,
  Field,
  Flex,
  IconButton,
  SingleSelect,
  SingleSelectOption,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  Typography,
} from '@strapi/design-system';
import { ArrowClockwise, Check, Eye, Mail, Trash } from '@strapi/icons';
import styled from 'styled-components';
import { ConfirmDialog } from '../../components/shared/ConfirmDialog';
import { SectionHeading } from '../../components/shared/Headings';
import {
  DataTable,
  EmptyState,
  FilterActions,
  FilterBar,
  FilterSelect,
  LoadErrorState,
  LoadingState,
  MonoText,
  StatusBadge,
  StyledTable,
  TablePagination,
  clampPage,
  keepNativeButtonKeys,
  space,
} from '../../components/shared/table';
import { useMagicMailRBAC } from '../../hooks/useMagicMailRBAC';
import { useMagicMailIntl } from '../../hooks/useMagicMailIntl';
import { useFormatters } from '../../hooks/useFormatters';
import { apiErrorMessage } from '../../utils/analyticsLogs';
import { OutboxDetailDrawer } from './OutboxDetailDrawer';
import {
  OUTBOX_PAGE_SIZE,
  apiErrorCode,
  buildOutboxUrl,
  outboxActions,
  outboxStatusPresentation,
} from './outboxUtils';

const SummaryRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${space(2)};
  margin-bottom: ${space(4)};
  min-width: 0;
`;

const HeaderRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${space(1)};
  margin-bottom: ${space(4)};
  min-width: 0;
`;

/** Status filter options: value -> [translation key, English default]. */
const FILTER_LABELS = {
  '': ['queue.filter.all', 'All statuses'],
  pending: ['queue.status.pending', 'Pending'],
  retrying: ['queue.status.retrying', 'Retrying'],
  failed: ['queue.status.failed', 'Failed'],
  uncertain: ['queue.status.uncertain', 'Uncertain'],
  sent: ['queue.status.sent', 'Sent'],
  discarded: ['queue.status.discarded', 'Discarded'],
};

/** Summary badges shown above the table (statuses that need attention first). */
const SUMMARY = [
  ['pending', 'neutral', 'queue.summary.pending', '{count} pending'],
  ['failed', 'danger', 'queue.summary.failed', '{count} failed'],
  ['uncertain', 'warning', 'queue.summary.uncertain', '{count} uncertain'],
];

/**
 * Outbox view: mails waiting for a retry, failed for good, or with an
 * uncertain outcome. Answers one question: "Which mails were not delivered
 * yet, and what should happen with them?". Read needs `queue.read`; Retry
 * now, Mark as sent and Discard need `queue.manage` (the API re-checks).
 *
 * @returns {JSX.Element}
 */
const Outbox = () => {
  const { canReadQueue, canManageQueue, isQueueLoading } = useMagicMailRBAC();
  const { t } = useMagicMailIntl();
  const { formatDateTime, formatNumber } = useFormatters();
  const { get, post } = useFetchClient();
  const { toggleNotification } = useNotification();

  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [counts, setCounts] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [settledKey, setSettledKey] = useState(null);
  const [selected, setSelected] = useState(null);
  const [pending, setPending] = useState(null);
  const filterRef = useRef(null);

  const queryKey = JSON.stringify([page, status, reloadKey]);
  const loading = settledKey !== queryKey;
  const initialLoading = settledKey === null;

  useEffect(() => {
    if (!canReadQueue) return undefined;
    let ignore = false;
    const load = async () => {
      try {
        const response = await get(buildOutboxUrl({ page, status }));
        if (ignore) return;
        setRows(response.data?.data || []);
        setPagination(response.data?.pagination || null);
        setCounts(response.data?.counts || null);
        setLoadError(null);
        const clamped = clampPage(page, response.data?.pagination?.pageCount);
        if (clamped !== page) setPage(clamped);
      } catch (error) {
        if (ignore) return;
        console.error('[MagicMail] Failed to load the outbox');
        setLoadError(
          apiErrorMessage(error) || t('queue.loadError', 'The outbox could not be loaded.')
        );
      } finally {
        if (!ignore) setSettledKey(queryKey);
      }
    };
    load();
    return () => {
      ignore = true;
    };
  }, [get, page, status, queryKey, canReadQueue, t]);

  const reload = () => setReloadKey((key) => key + 1);

  const actionMessages = {
    retry: t('queue.retry.success', 'Mail scheduled for a new attempt.'),
    discard: t('queue.discard.success', 'Mail discarded.'),
    markSent: t('queue.markSent.success', 'Mail marked as sent.'),
  };

  /**
   * Runs one admin action and reports the server's outcome.
   * @param {'retry'|'discard'|'markSent'} type
   * @param {object} row
   */
  const runAction = async (type, row) => {
    const path = { retry: 'retry', discard: 'discard', markSent: 'mark-sent' }[type];
    const body =
      type === 'retry' && row.status === 'uncertain' ? { confirmDuplicateRisk: true } : {};
    try {
      await post(`/magic-mail/outbox/${encodeURIComponent(row.documentId)}/${path}`, body);
      toggleNotification({ type: 'success', message: actionMessages[type] });
      setPending(null);
      if (selected === row.documentId && type === 'discard') setSelected(null);
      reload();
    } catch (error) {
      const code = apiErrorCode(error);
      const message =
        code === 'STATE_CHANGED'
          ? t('queue.error.stateChanged', 'The mail was changed meanwhile. The list was refreshed.')
          : code === 'PAYLOAD_PURGED'
            ? t(
                'queue.error.payloadPurged',
                'The mail content was already removed. It can only be discarded.'
              )
            : apiErrorMessage(error) ||
              t('queue.error.action', 'The action could not be completed.');
      toggleNotification({ type: 'danger', message });
      if (code) {
        setPending(null);
        reload();
      }
      throw error;
    }
  };

  const total = pagination?.total ?? 0;
  const pageCount = pagination?.pageCount ?? 1;
  const currentPage = pagination?.page ?? page;

  const columnLabels = {
    recipient: t('queue.column.recipient', 'Recipient'),
    subject: t('queue.column.subject', 'Subject'),
    status: t('queue.column.status', 'Status'),
    attempts: t('queue.column.attempts', 'Attempts'),
    next: t('queue.column.next', 'Next try / last error'),
    created: t('queue.column.created', 'Queued at'),
    actions: t('queue.column.actions', 'Actions'),
  };
  const notRecorded = t('queue.value.none', 'Not recorded');

  const renderStatus = (row) => {
    const presentation = outboxStatusPresentation(row);
    return (
      <StatusBadge $tone={presentation.tone}>
        {t(presentation.labelKey, presentation.label)}
      </StatusBadge>
    );
  };

  const renderNext = (row) => {
    if (row.status === 'pending' && row.nextAttemptAt) {
      return (
        <Typography variant="pi" textColor="neutral800">
          {formatDateTime(row.nextAttemptAt)}
        </Typography>
      );
    }
    if (row.lastErrorCode) return <MonoText>{row.lastErrorCode}</MonoText>;
    return (
      <Typography variant="pi" textColor="neutral600" aria-label={notRecorded}>
        —
      </Typography>
    );
  };

  const renderActions = (row) => {
    const allowed = outboxActions(row);
    const name = row.recipient || row.documentId;
    return (
      <Flex gap={1} justifyContent="flex-end" onKeyDown={keepNativeButtonKeys}>
        <IconButton
          label={t('queue.action.view', 'Show details for {name}', { name })}
          variant="ghost"
          onClick={() => setSelected(row.documentId)}
        >
          <Eye aria-hidden="true" />
        </IconButton>
        {canManageQueue && allowed.retry && (
          <IconButton
            label={t('queue.action.retry', 'Retry now: {name}', { name })}
            variant="ghost"
            onClick={() => setPending({ type: 'retry', row })}
          >
            <ArrowClockwise aria-hidden="true" />
          </IconButton>
        )}
        {canManageQueue && allowed.markSent && (
          <IconButton
            label={t('queue.action.markSent', 'Mark as sent: {name}', { name })}
            variant="ghost"
            onClick={() => setPending({ type: 'markSent', row })}
          >
            <Check aria-hidden="true" />
          </IconButton>
        )}
        {canManageQueue && allowed.discard && (
          <IconButton
            label={t('queue.action.discard', 'Discard: {name}', { name })}
            variant="danger-light"
            onClick={() => setPending({ type: 'discard', row })}
          >
            <Trash aria-hidden="true" />
          </IconButton>
        )}
      </Flex>
    );
  };

  if (isQueueLoading || (canReadQueue && initialLoading)) {
    return <LoadingState label={t('queue.loading', 'Loading the outbox...')} />;
  }

  if (!canReadQueue) {
    return (
      <EmptyState
        icon={Mail}
        tone="neutral"
        title={t('queue.noPermission.title', 'No access to the outbox')}
        description={t(
          'queue.noPermission.body',
          'Viewing the outbox needs the permission "Read the outbox". An administrator can grant it in the role settings.'
        )}
      />
    );
  }

  const dialog = pending ? dialogCopy(t, pending) : null;

  return (
    <>
      <HeaderRow>
        <SectionHeading>
          {t('queue.heading', 'Outbox ({count})', { count: formatNumber(total, undefined, '0') })}
        </SectionHeading>
        <Typography variant="omega" textColor="neutral600">
          {t(
            'queue.description',
            'Mails that wait for a retry, failed for good, or may have been delivered. Uncertain mails are never sent again automatically.'
          )}
        </Typography>
      </HeaderRow>

      {counts && (
        <SummaryRow aria-label={t('queue.summary.label', 'Outbox summary')} role="group">
          {SUMMARY.map(([key, tone, labelKey, label]) => (
            <StatusBadge key={key} $tone={tone}>
              {t(labelKey, label, { count: formatNumber(counts[key] ?? 0) })}
            </StatusBadge>
          ))}
        </SummaryRow>
      )}

      <FilterBar>
        <FilterSelect>
          <Field.Root name="outboxStatus">
            <Field.Label>{t('queue.filter.label', 'Status')}</Field.Label>
            <SingleSelect
              ref={filterRef}
              value={status}
              onChange={(value) => {
                setStatus(String(value ?? ''));
                setPage(1);
              }}
            >
              {Object.entries(FILTER_LABELS).map(([value, [key, label]]) => (
                <SingleSelectOption key={value || 'all'} value={value}>
                  {t(key, label)}
                </SingleSelectOption>
              ))}
            </SingleSelect>
          </Field.Root>
        </FilterSelect>
        <FilterActions>
          <Button
            variant="secondary"
            size="L"
            startIcon={<ArrowClockwise aria-hidden="true" />}
            onClick={reload}
            loading={loading && !initialLoading}
          >
            {t('queue.refresh', 'Refresh')}
          </Button>
        </FilterActions>
      </FilterBar>

      <DataTable
        aria-label={t('queue.listLabel', 'Outbox')}
        aria-busy={loading ? 'true' : undefined}
      >
        {loadError ? (
          <LoadErrorState
            message={t('queue.errorTitle', "Couldn't load the outbox")}
            description={loadError}
            onRetry={reload}
            isRetrying={loading}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Mail}
            title={
              status
                ? t('queue.empty.filteredTitle', 'No mails match this filter')
                : t('queue.empty.title', 'The outbox is empty')
            }
            description={
              status
                ? t('queue.empty.filteredBody', 'Choose another status or show all mails.')
                : t(
                    'queue.empty.body',
                    'Mails appear here when a send is queued, or when a failed send is kept for a retry (Settings, "Queue failed sends").'
                  )
            }
            actions={
              status ? (
                <Button
                  variant="secondary"
                  size="L"
                  onClick={() => {
                    setStatus('');
                    setPage(1);
                    filterRef.current?.focus?.();
                  }}
                >
                  {t('queue.empty.clear', 'Show all statuses')}
                </Button>
              ) : null
            }
          />
        ) : (
          <>
            <StyledTable colCount={7} rowCount={rows.length + 1}>
              <Thead>
                <Tr>
                  <Th>{columnLabels.recipient}</Th>
                  <Th>{columnLabels.subject}</Th>
                  <Th>{columnLabels.status}</Th>
                  <Th>{columnLabels.attempts}</Th>
                  <Th>{columnLabels.next}</Th>
                  <Th>{columnLabels.created}</Th>
                  <Th>
                    <Typography variant="sigma">{columnLabels.actions}</Typography>
                  </Th>
                </Tr>
              </Thead>
              <Tbody>
                {rows.map((row) => (
                  <Tr key={row.documentId}>
                    <Td className="cell-wrap" data-label={columnLabels.recipient}>
                      <Typography variant="omega" fontWeight="semiBold">
                        {row.recipient || '—'}
                      </Typography>
                    </Td>
                    <Td className="cell-wrap" data-label={columnLabels.subject}>
                      <Typography variant="omega">{row.subject || '—'}</Typography>
                    </Td>
                    <Td data-label={columnLabels.status}>{renderStatus(row)}</Td>
                    <Td data-label={columnLabels.attempts}>
                      <Typography variant="omega">
                        {t('queue.attempts', '{attempts} of {max}', {
                          attempts: formatNumber(row.attempts || 0),
                          max: formatNumber(row.maxAttempts || 0),
                        })}
                      </Typography>
                    </Td>
                    <Td className="cell-wrap" data-label={columnLabels.next}>
                      {renderNext(row)}
                    </Td>
                    <Td className="cell-date" data-label={columnLabels.created}>
                      <Typography variant="pi" textColor="neutral800">
                        {formatDateTime(row.createdAt)}
                      </Typography>
                    </Td>
                    <Td data-label={columnLabels.actions}>{renderActions(row)}</Td>
                  </Tr>
                ))}
              </Tbody>
            </StyledTable>
            <TablePagination
              page={currentPage}
              pageCount={pageCount}
              total={total}
              pageSize={OUTBOX_PAGE_SIZE}
              onChange={setPage}
              label={t('queue.pagination.label', 'Outbox pages')}
            />
          </>
        )}
      </DataTable>

      <OutboxDetailDrawer
        documentId={selected}
        reloadKey={reloadKey}
        onClose={() => setSelected(null)}
      />

      <ConfirmDialog
        isOpen={canManageQueue && Boolean(pending)}
        onClose={() => setPending(null)}
        onConfirm={() => runAction(pending.type, pending.row)}
        variant={pending?.type === 'discard' ? 'danger' : 'default'}
        title={dialog?.title}
        description={dialog?.description}
        confirmLabel={dialog?.confirm}
      >
        {dialog?.extra}
      </ConfirmDialog>
    </>
  );
};

/**
 * Title, body and confirm label of the confirmation dialogs.
 *
 * @param {Function} t
 * @param {{type: string, row: object}} pending
 * @returns {{title: string, description: string, confirm: string, extra?: string}}
 */
function dialogCopy(t, { type, row }) {
  const name = row.recipient || row.documentId;
  if (type === 'discard') {
    return {
      title: t('queue.discard.title', 'Discard this mail?'),
      description: t(
        'queue.discard.body',
        'The mail to {name} is not sent and its content is deleted. This cannot be undone.',
        { name }
      ),
      confirm: t('queue.discard.confirm', 'Discard'),
    };
  }
  if (type === 'markSent') {
    return {
      title: t('queue.markSent.title', 'Mark this mail as sent?'),
      description: t(
        'queue.markSent.body',
        'Only do this after checking the provider (for example its activity log) that the mail to {name} was delivered. Nothing is sent.',
        { name }
      ),
      confirm: t('queue.markSent.confirm', 'Mark as sent'),
    };
  }
  if (row.status === 'uncertain') {
    return {
      title: t('queue.retryUncertain.title', 'Retry an uncertain mail?'),
      description: t(
        'queue.retryUncertain.body',
        'The provider may already have accepted the mail to {name}. Sending it again can deliver a duplicate.',
        { name }
      ),
      confirm: t('queue.retry.confirm', 'Retry now'),
      extra: t(
        'queue.retryUncertain.extra',
        'Check the provider first. Use "Mark as sent" when it was delivered.'
      ),
    };
  }
  return {
    title: t('queue.retry.title', 'Retry this mail now?'),
    description: t(
      'queue.retry.body',
      'The mail to {name} is sent again within a few seconds through the routing rules.',
      { name }
    ),
    confirm: t('queue.retry.confirm', 'Retry now'),
  };
}

export default Outbox;

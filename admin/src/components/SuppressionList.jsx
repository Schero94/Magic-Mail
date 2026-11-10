import { useEffect, useState } from 'react';
import { Badge, Button, Tbody, Td, Th, Thead, Tr, Typography } from '@strapi/design-system';
import { CheckCircle, Trash } from '@strapi/icons';
import { useFetchClient, useNotification } from '@strapi/strapi/admin';
import { useMagicMailIntl } from '../hooks/useMagicMailIntl';
import { useFormatters } from '../hooks/useFormatters';
import { bounceReasonText } from '../utils/bounceReasons';
import { ConfirmDialog } from './shared/ConfirmDialog';
import {
  DataTable,
  EmptyState,
  LoadErrorState,
  LoadingState,
  MonoText,
  StyledTable,
  TablePagination,
} from './shared/table';

const PAGE_SIZE = 10;

/**
 * Hard-bounced recipients that are blocked before sending (when the owner
 * turned suppression on). Addresses are shown masked; the server stores only
 * a keyed hash plus the masked form.
 *
 * @param {{canManage: boolean}} props
 */
export const SuppressionList = ({ canManage }) => {
  const { t } = useMagicMailIntl();
  const { get, del } = useFetchClient();
  const { toggleNotification } = useNotification();
  const { formatDateTime, formatNumber } = useFormatters();
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState({ status: 'loading', rows: [], total: 0 });
  const [pending, setPending] = useState(null);

  useEffect(() => {
    let cancelled = false;
    get(`/magic-mail/suppressions?page=${page}&pageSize=${PAGE_SIZE}`)
      .then(({ data }) => {
        if (cancelled) return;
        setState({
          status: 'ready',
          rows: Array.isArray(data?.data) ? data.data : [],
          total: Number(data?.meta?.total) || 0,
        });
      })
      .catch(() => {
        if (!cancelled) setState((previous) => ({ ...previous, status: 'error' }));
      });
    return () => {
      cancelled = true;
    };
  }, [get, page, reloadKey]);

  const pageCount = Math.max(1, Math.ceil(state.total / PAGE_SIZE));
  const columns = {
    address: t('suppressions.column.address', 'Recipient'),
    reason: t('suppressions.column.reason', 'Reason'),
    count: t('suppressions.column.count', 'Bounces'),
    last: t('suppressions.column.last', 'Last bounce'),
    actions: t('suppressions.column.actions', 'Actions'),
  };

  const remove = async () => {
    try {
      await del(`/magic-mail/suppressions/${pending.documentId}`);
      toggleNotification({
        type: 'success',
        message: t('suppressions.removed', 'The recipient can receive emails again.'),
      });
      if (state.rows.length === 1 && page > 1) setPage(page - 1);
      else setReloadKey((key) => key + 1);
    } catch {
      toggleNotification({
        type: 'danger',
        message: t('suppressions.removeFailed', 'The entry could not be removed.'),
      });
    } finally {
      setPending(null);
    }
  };

  const body = () => {
    if (state.status === 'error') {
      return (
        <LoadErrorState
          message={t('suppressions.error', 'The suppression list could not be loaded')}
          onRetry={() => setReloadKey((key) => key + 1)}
        />
      );
    }
    if (state.status === 'loading') {
      return <LoadingState label={t('suppressions.loading', 'Loading suppression list')} />;
    }
    if (state.rows.length === 0) {
      return (
        <EmptyState
          icon={CheckCircle}
          tone="success"
          title={t('suppressions.empty.title', 'No suppressed recipients')}
          description={t(
            'suppressions.empty.description',
            'Recipients appear here after a permanent bounce.'
          )}
        />
      );
    }
    return (
      <>
        <StyledTable colCount={canManage ? 5 : 4} rowCount={state.rows.length + 1}>
          <Thead>
            <Tr>
              <Th>{columns.address}</Th>
              <Th>{columns.reason}</Th>
              <Th>{columns.count}</Th>
              <Th>{columns.last}</Th>
              {canManage ? <Th>{columns.actions}</Th> : null}
            </Tr>
          </Thead>
          <Tbody>
            {state.rows.map((row) => (
              <Tr key={row.documentId}>
                <Td data-label={columns.address}>
                  <MonoText>{row.maskedAddress}</MonoText>
                </Td>
                <Td data-label={columns.reason} className="cell-wrap">
                  <Badge backgroundColor="danger100" textColor="danger700">
                    {bounceReasonText(t, row.reasonCode)}
                  </Badge>
                </Td>
                <Td data-label={columns.count}>
                  <Typography variant="omega">{formatNumber(row.bounceCount || 0)}</Typography>
                </Td>
                <Td data-label={columns.last}>
                  <Typography variant="omega">{formatDateTime(row.lastBouncedAt)}</Typography>
                </Td>
                {canManage ? (
                  <Td data-label="">
                    <Button
                      variant="danger-light"
                      size="S"
                      startIcon={<Trash aria-hidden="true" />}
                      onClick={() => setPending(row)}
                    >
                      {t('suppressions.remove', 'Remove')}
                    </Button>
                  </Td>
                ) : null}
              </Tr>
            ))}
          </Tbody>
        </StyledTable>
        <TablePagination
          page={page}
          pageCount={pageCount}
          total={state.total}
          pageSize={PAGE_SIZE}
          onChange={setPage}
          label={t('suppressions.pagination', 'Suppression list pages')}
        />
      </>
    );
  };

  return (
    <>
      <DataTable aria-label={t('suppressions.label', 'Suppressed recipients')}>{body()}</DataTable>
      <ConfirmDialog
        isOpen={pending !== null}
        title={t('suppressions.confirm.title', 'Remove from the suppression list?')}
        description={t(
          'suppressions.confirm.body',
          'Emails to {address} are sent again. Only do this when the address was fixed.',
          { address: pending?.maskedAddress || '' }
        )}
        confirmLabel={t('suppressions.remove', 'Remove')}
        onConfirm={remove}
        onClose={() => setPending(null)}
      />
    </>
  );
};

export default SuppressionList;

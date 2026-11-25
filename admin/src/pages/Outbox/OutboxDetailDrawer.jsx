import { Fragment, useEffect, useState } from 'react';
import { useFetchClient } from '@strapi/strapi/admin';
import { Box, Flex, Loader, Modal, Typography } from '@strapi/design-system';
import { ArrowPathIcon, InboxStackIcon } from '@heroicons/react/24/outline';
import styled from 'styled-components';
import { TertiaryButton } from '../../components/StyledButtons';
import { MonoText, StatusBadge, space } from '../../components/shared/table';
import { useMagicMailIntl } from '../../hooks/useMagicMailIntl';
import { useFormatters } from '../../hooks/useFormatters';
import { useReturnFocus } from '../../hooks/useReturnFocus';
import { color, theme } from '../../utils/theme';
import {
  VersionModalContent,
  VersionSheet,
  VersionSheetHeader,
  VersionSheetTitle,
} from '../EmailDesigner/editorStyles';
import {
  ERROR_CLASS_KEYS,
  SOURCE_KEYS,
  outboxStatusPresentation,
  outboxTries,
} from './outboxUtils';
import { TriesText } from './TriesText';

const FactList = styled.dl`
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
  gap: ${space(2)} ${space(4)};
  margin: 0;

  dt,
  dd {
    margin: 0;
    min-width: 0;
    overflow-wrap: anywhere;
  }
`;

/**
 * Drawer body: facts, notes and the error history as sections with one
 * vertical rhythm (24px between sections, 12px from a heading to its
 * content). The heading used to sit directly on the first history card.
 */
const DrawerSections = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${space(6)};
  min-width: 0;
`;

const DrawerSection = styled.section`
  display: flex;
  flex-direction: column;
  gap: ${space(3)};
  min-width: 0;
`;

const HistoryList = styled.ol`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: ${space(3)};
`;

const HistoryItem = styled.li`
  display: flex;
  flex-direction: column;
  gap: ${space(1)};
  padding: ${space(4)};
  border: 1px solid ${color('neutral200')};
  border-radius: ${theme.borderRadius.md};
  min-width: 0;
`;

/**
 * Side sheet with the details of one outbox mail and its sanitized error
 * history (time, account, error code and class; never the provider's error
 * text or the mail content). Built on the DS Modal like the version history
 * drawer, so it has dialog semantics, a focus trap and Esc to close.
 *
 * @param {object} props
 * @param {string|null} props.documentId - open when set
 * @param {number} props.reloadKey - reloads the detail after a list action
 * @param {() => void} props.onClose
 * @returns {JSX.Element}
 */
export const OutboxDetailDrawer = ({ documentId, reloadKey, onClose }) => {
  const { t } = useMagicMailIntl();
  const { formatDateTime } = useFormatters();
  const { get } = useFetchClient();
  const isOpen = Boolean(documentId);
  const returnFocus = useReturnFocus(isOpen);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const loadKey = JSON.stringify([documentId, reloadKey, attempt]);
  const [settledKey, setSettledKey] = useState(null);
  const loading = isOpen && settledKey !== loadKey;

  useEffect(() => {
    if (!documentId) return undefined;
    let ignore = false;
    (async () => {
      try {
        const response = await get(`/magic-mail/outbox/${encodeURIComponent(documentId)}`);
        if (ignore) return;
        setDetail(response.data?.data || null);
        setError(false);
      } catch {
        if (ignore) return;
        console.error('[MagicMail] Failed to load an outbox mail');
        setDetail(null);
        setError(true);
      } finally {
        if (!ignore) setSettledKey(loadKey);
      }
    })();
    return () => {
      ignore = true;
    };
  }, [documentId, get, loadKey]);

  const none = (
    <Typography
      variant="omega"
      textColor="neutral600"
      aria-label={t('queue.value.none', 'Not recorded')}
    >
      —
    </Typography>
  );
  const classText = (errorClass) => {
    const entry = ERROR_CLASS_KEYS[errorClass];
    return entry ? t(entry[0], entry[1]) : errorClass || '';
  };
  const presentation = detail ? outboxStatusPresentation(detail) : null;

  const tries = detail ? outboxTries(detail) : null;
  const sourceText = (source) => {
    const entry = SOURCE_KEYS[source];
    return entry ? t(entry[0], entry[1]) : source;
  };

  // Facts that do not apply to the mail's state are left out instead of
  // showing "—": no next try unless it waits for one, no send deadline once
  // it was sent or discarded.
  const facts = detail
    ? [
        [t('queue.column.recipient', 'Recipient'), detail.recipient || none],
        [t('queue.column.subject', 'Subject'), detail.subject || none],
        [
          t('queue.column.status', 'Status'),
          <StatusBadge key="status" $tone={presentation.tone}>
            {t(presentation.labelKey, presentation.label)}
          </StatusBadge>,
        ],
        [t('queue.column.attempts', 'Tries'), <TriesText key="tries" tries={tries} />],
        detail.status === 'pending'
          ? [
              t('queue.detail.nextAttempt', 'Next try'),
              detail.nextAttemptAt ? formatDateTime(detail.nextAttemptAt) : none,
            ]
          : null,
        detail.notAfter && !['sent', 'discarded'].includes(detail.status)
          ? [t('queue.detail.notAfter', 'Not sent after'), formatDateTime(detail.notAfter)]
          : null,
        [t('queue.detail.account', 'Account used'), detail.accountUsed || none],
        [t('queue.detail.source', 'Sent by'), detail.source ? sourceText(detail.source) : none],
        [t('queue.column.created', 'Queued at'), formatDateTime(detail.createdAt)],
        detail.status === 'sent' || detail.sentAt
          ? [
              t('queue.detail.sentAt', 'Sent at'),
              detail.sentAt ? formatDateTime(detail.sentAt) : none,
            ]
          : null,
      ].filter(Boolean)
    : [];

  return (
    <Modal.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <VersionSheet onCloseAutoFocus={returnFocus} aria-describedby={undefined}>
        <VersionSheetHeader closeLabel={t('queue.detail.close', 'Close details')}>
          <VersionSheetTitle>
            <InboxStackIcon aria-hidden="true" />
            <Modal.Title>{t('queue.detail.title', 'Outbox mail')}</Modal.Title>
          </VersionSheetTitle>
        </VersionSheetHeader>
        <VersionModalContent aria-busy={loading}>
          {loading ? (
            <Flex justifyContent="center" padding={8}>
              <Loader>{t('queue.detail.loading', 'Loading details...')}</Loader>
            </Flex>
          ) : error || !detail ? (
            <Flex direction="column" alignItems="center" gap={4} padding={6} role="alert">
              <Typography variant="beta" tag="p">
                {t('queue.detail.error', 'The details could not be loaded.')}
              </Typography>
              <TertiaryButton
                startIcon={<ArrowPathIcon width={16} height={16} aria-hidden="true" />}
                onClick={() => setAttempt((value) => value + 1)}
              >
                {t('queue.detail.retry', 'Try again')}
              </TertiaryButton>
            </Flex>
          ) : (
            <DrawerSections>
              <FactList>
                {facts.map(([label, value]) => (
                  <Fragment key={label}>
                    <Typography tag="dt" variant="sigma" textColor="neutral600">
                      {label}
                    </Typography>
                    <Typography tag="dd" variant="omega" textColor="neutral800">
                      {value}
                    </Typography>
                  </Fragment>
                ))}
              </FactList>

              {detail.status === 'uncertain' && (
                <Box>
                  <Typography variant="omega" textColor="neutral800" tag="p">
                    {t(
                      'queue.detail.uncertainHint',
                      'The connection ended after the provider received the mail, so it may have been delivered. Check the provider before retrying.'
                    )}
                  </Typography>
                </Box>
              )}

              <DrawerSection aria-labelledby="magic-mail-outbox-history">
                <Typography
                  id="magic-mail-outbox-history"
                  variant="delta"
                  tag="h3"
                  textColor="neutral800"
                >
                  {t('queue.detail.history', 'Error history')}
                </Typography>
                {detail.errorHistory?.length ? (
                  <HistoryList>
                    {[...detail.errorHistory].reverse().map((entry, index) => (
                      <HistoryItem key={`${entry.at}-${index}`}>
                        <Flex gap={2} wrap="wrap" alignItems="center">
                          <MonoText>{entry.code}</MonoText>
                          <Typography variant="pi" textColor="neutral600">
                            {formatDateTime(entry.at)}
                          </Typography>
                        </Flex>
                        <Typography variant="pi" textColor="neutral800">
                          {classText(entry.class)}
                        </Typography>
                        {entry.account && (
                          <Typography variant="pi" textColor="neutral600">
                            {t('queue.detail.historyAccount', 'Account: {account}', {
                              account: entry.account,
                            })}
                          </Typography>
                        )}
                      </HistoryItem>
                    ))}
                  </HistoryList>
                ) : (
                  <Typography variant="omega" textColor="neutral600" tag="p">
                    {t('queue.detail.noHistory', 'No failed attempts recorded.')}
                  </Typography>
                )}
              </DrawerSection>
            </DrawerSections>
          )}
        </VersionModalContent>
      </VersionSheet>
    </Modal.Root>
  );
};

export default OutboxDetailDrawer;

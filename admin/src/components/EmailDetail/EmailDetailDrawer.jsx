import { Fragment, useEffect, useState } from 'react';
import { useFetchClient } from '@strapi/strapi/admin';
import { Flex, Loader, Modal, Tabs, Typography } from '@strapi/design-system';
import {
  ArrowPathIcon,
  ComputerDesktopIcon,
  DevicePhoneMobileIcon,
  EnvelopeIcon,
  LockClosedIcon,
  PhotoIcon,
} from '@heroicons/react/24/outline';
import styled from 'styled-components';
import { TertiaryButton } from '../StyledButtons';
import { StatusBadge, breakpoints, space } from '../shared/table';
import { useMagicMailIntl } from '../../hooks/useMagicMailIntl';
import { useFormatters } from '../../hooks/useFormatters';
import { useReturnFocus } from '../../hooks/useReturnFocus';
import { color, theme } from '../../utils/theme';
import {
  VersionModalContent,
  VersionSheet,
  VersionSheetHeader,
  VersionSheetTitle,
} from '../../pages/EmailDesigner/editorStyles';
import {
  PREVIEW_STATE_NOTICES,
  PREVIEW_WIDTHS,
  countVariables,
} from '../../utils/emailPreview.mjs';
import { VariablesTable } from './VariablesTable';

const ICON_16 = { width: 16, height: 16 };

/** Wider than the outbox sheet: the preview shows a 640px email. */
const DetailSheet = styled(VersionSheet)`
  && {
    width: min(760px, 100vw);
  }
`;

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

const TabPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${space(4)};
  padding-top: ${space(4)};
  min-width: 0;
`;

const Notice = styled.div`
  display: flex;
  gap: ${space(2)};
  align-items: flex-start;
  padding: ${space(3)} ${space(4)};
  border-radius: ${theme.borderRadius.md};
  border: 1px solid ${(p) => color(p.$tone === 'warning' ? 'warning200' : 'neutral200')(p)};
  background: ${(p) => color(p.$tone === 'warning' ? 'warning100' : 'neutral100')(p)};
  color: ${color('neutral800')};
  min-width: 0;

  svg {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
    margin-top: 1px;
  }
`;

const Toolbar = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${space(2)};
  align-items: center;
  justify-content: space-between;
`;

/** Two-button segmented switch (aria-pressed), Magic Mail control height. */
const Segmented = styled.div`
  display: inline-flex;
  border: 1px solid ${color('neutral200')};
  border-radius: ${theme.borderRadius.md};
  overflow: hidden;

  button {
    display: inline-flex;
    align-items: center;
    gap: ${space(1)};
    min-height: 36px;
    padding: 0 ${space(3)};
    border: 0;
    background: ${color('neutral0')};
    color: ${color('neutral700')};
    font: inherit;
    font-size: 1.3rem;
    font-weight: 600;
    cursor: pointer;
  }

  button + button {
    border-left: 1px solid ${color('neutral200')};
  }

  button[aria-pressed='true'] {
    background: ${color('primary100')};
    color: ${color('primary700')};
  }

  button:focus-visible {
    outline: 2px solid ${color('primary600')};
    outline-offset: -2px;
  }

  svg {
    width: 16px;
    height: 16px;
  }

  @media (max-width: ${breakpoints.mobile}) {
    button {
      min-height: 44px;
    }
  }
`;

const FrameStage = styled.div`
  display: flex;
  justify-content: center;
  padding: ${space(4)};
  border-radius: ${theme.borderRadius.lg};
  background: ${color('neutral100')};
  border: 1px solid ${color('neutral200')};
  min-width: 0;
  overflow-x: auto;
`;

const PreviewFrame = styled.iframe`
  display: block;
  width: 100%;
  max-width: ${(p) => p.$width}px;
  height: min(70vh, 900px);
  min-height: 360px;
  border: 1px solid ${color('neutral200')};
  border-radius: ${theme.borderRadius.md};
  background: ${color('neutral0')};
`;

const PlainText = styled.pre`
  margin: 0;
  padding: ${space(4)};
  max-height: min(70vh, 900px);
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 1.3rem;
  line-height: 1.5;
  color: ${color('neutral800')};
  background: ${color('neutral100')};
  border: 1px solid ${color('neutral200')};
  border-radius: ${theme.borderRadius.md};
`;

/**
 * Notice box with an icon.
 *
 * @param {{tone?: 'neutral'|'warning', icon?: Function, children: import('react').ReactNode, role?: string}} props
 * @returns {JSX.Element}
 */
const PanelNotice = ({ tone = 'neutral', icon: Icon, children, role }) => (
  <Notice $tone={tone} role={role}>
    {Icon ? <Icon aria-hidden="true" /> : null}
    <Typography variant="omega" textColor="neutral800" tag="p">
      {children}
    </Typography>
  </Notice>
);

/**
 * Loads the email detail (Overview) and, on demand, the preview data
 * (Preview and Variables tabs, `content.read` grant) of one log row.
 *
 * @param {string|null} emailId
 * @param {boolean} wantContent - true once Preview or Variables was opened
 * @param {boolean} allowImages
 * @returns {{detail: object|null, detailState: string, retryDetail: Function,
 *   content: object|null, contentState: string, retryContent: Function}}
 */
const useEmailDetail = (emailId, wantContent, allowImages) => {
  const { get } = useFetchClient();
  const [detail, setDetail] = useState(null);
  const [detailKey, setDetailKey] = useState(null);
  const [detailError, setDetailError] = useState(false);
  const [detailAttempt, setDetailAttempt] = useState(0);
  const [content, setContent] = useState(null);
  const [contentKey, setContentKey] = useState(null);
  const [contentError, setContentError] = useState(null);
  const [contentAttempt, setContentAttempt] = useState(0);

  const wantedDetailKey = JSON.stringify([emailId, detailAttempt]);
  const wantedContentKey = JSON.stringify([emailId, allowImages, contentAttempt]);

  useEffect(() => {
    if (!emailId) return undefined;
    let ignore = false;
    (async () => {
      try {
        const response = await get(`/magic-mail/analytics/emails/${encodeURIComponent(emailId)}`);
        if (ignore) return;
        setDetail(response.data?.data || null);
        setDetailError(false);
      } catch {
        if (ignore) return;
        console.error('[MagicMail] Failed to load email details');
        setDetail(null);
        setDetailError(true);
      } finally {
        if (!ignore) setDetailKey(wantedDetailKey);
      }
    })();
    return () => {
      ignore = true;
    };
  }, [emailId, get, wantedDetailKey]);

  useEffect(() => {
    if (!emailId || !wantContent) return undefined;
    let ignore = false;
    (async () => {
      try {
        const response = await get(
          `/magic-mail/analytics/emails/${encodeURIComponent(emailId)}/content${
            allowImages ? '?images=1' : ''
          }`
        );
        if (ignore) return;
        setContent(response.data?.data || null);
        setContentError(null);
      } catch (error) {
        if (ignore) return;
        console.error('[MagicMail] Failed to load the email preview');
        setContent(null);
        setContentError(error?.response?.status === 403 ? 'forbidden' : 'error');
      } finally {
        if (!ignore) setContentKey(wantedContentKey);
      }
    })();
    return () => {
      ignore = true;
    };
  }, [emailId, wantContent, allowImages, get, wantedContentKey]);

  return {
    detail,
    detailState: detailKey !== wantedDetailKey ? 'loading' : detailError ? 'error' : 'ready',
    retryDetail: () => setDetailAttempt((value) => value + 1),
    content,
    contentState: !wantContent
      ? 'idle'
      : contentKey !== wantedContentKey
        ? 'loading'
        : contentError || 'ready',
    retryContent: () => setContentAttempt((value) => value + 1),
  };
};

/**
 * Side sheet with the details of one sent email: Overview (status, tries,
 * account, times, opens and clicks, errors), Preview (sandboxed, without
 * tracking, images blocked until "Load images", desktop/mobile width, plain
 * text) and Variables (masked at store time). Preview and Variables need the
 * "View email content" permission; without it they say so.
 *
 * Built on the DS Modal like the outbox drawer: dialog semantics, focus
 * trap, Esc closes, focus returns to the row that opened it.
 *
 * @param {object} props
 * @param {object|null} props.log - Row of the email log list; open when set
 * @param {boolean} props.canReadContent - `content.read` granted
 * @param {(log: object) => {label: string, tone: string}} props.presentDelivery - status badge of a row
 * @param {() => void} props.onClose
 * @returns {JSX.Element}
 */
export const EmailDetailDrawer = ({ log, canReadContent, presentDelivery, onClose }) => {
  const { t } = useMagicMailIntl();
  const { formatDateTime, formatNumber } = useFormatters();
  const isOpen = Boolean(log);
  const returnFocus = useReturnFocus(isOpen);
  const [tab, setTab] = useState('overview');
  const [width, setWidth] = useState('desktop');
  const [view, setView] = useState('html');
  const [allowImages, setAllowImages] = useState(false);
  const [openedFor, setOpenedFor] = useState(null);

  // A different row starts on Overview with images blocked again
  // (adjusted while rendering, not in an effect).
  const emailId = log?.emailId || null;
  if (openedFor !== emailId) {
    setOpenedFor(emailId);
    setTab('overview');
    setAllowImages(false);
    setView('html');
  }

  const wantContent = canReadContent && (tab === 'preview' || tab === 'variables');
  const { detail, detailState, retryDetail, content, contentState, retryContent } = useEmailDetail(
    emailId,
    wantContent,
    allowImages
  );

  const none = (
    <Typography
      variant="omega"
      textColor="neutral600"
      aria-label={t('analytics.detail.none', 'Not recorded')}
    >
      —
    </Typography>
  );

  const row = detail || log;
  const delivery = row ? presentDelivery(row) : null;
  const metadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const attempted = Array.isArray(metadata.attemptedAccounts) ? metadata.attemptedAccounts : [];
  const applied = metadata.trackingApplied;
  const trackingText = (kind, count, first) => {
    if (applied && applied[kind] === false && !(count > 0)) {
      return t('analytics.detail.notTracked', 'Not tracked');
    }
    if (!(count > 0)) return t('analytics.table.no', 'No');
    const times = t('analytics.table.times', '{count, plural, one {# time} other {# times}}', {
      count,
    });
    return first
      ? t('analytics.detail.firstAt', '{times}, first on {date}', {
          times,
          date: formatDateTime(first),
        })
      : times;
  };

  const facts = row
    ? [
        [t('analytics.table.recipient', 'Recipient'), row.recipient || none],
        [t('analytics.table.subject', 'Subject'), row.subject || none],
        [
          t('analytics.table.deliveryStatus', 'Delivery status'),
          <StatusBadge key="status" $tone={delivery.tone ?? 'neutral'}>
            {delivery.text}
          </StatusBadge>,
        ],
        row.bounceReason && /^[A-Z0-9_]{2,64}$/.test(row.bounceReason)
          ? [t('analytics.detail.reason', 'Reason'), delivery.reason || row.bounceReason]
          : null,
        [
          t('analytics.detail.account', 'Account used'),
          row.accountName
            ? detail?.accountProvider
              ? t('analytics.detail.accountProvider', '{name} ({provider})', {
                  name: row.accountName,
                  provider: detail.accountProvider,
                })
              : row.accountName
            : none,
        ],
        attempted.length > 1
          ? [
              t('analytics.detail.attempts', 'Accounts tried'),
              t('analytics.detail.attemptsValue', '{count} ({names})', {
                count: formatNumber(attempted.length),
                names: attempted.join(', '),
              }),
            ]
          : null,
        [t('analytics.table.template', 'Template'), row.templateName || none],
        [t('analytics.table.attemptedAt', 'Attempted at'), formatDateTime(row.sentAt)],
        row.deliveredAt
          ? [
              t('analytics.detail.deliveredAt', 'Accepted by the provider at'),
              formatDateTime(row.deliveredAt),
            ]
          : null,
        [
          t('analytics.table.opened', 'Opened'),
          trackingText('opens', row.openCount, row.firstOpenedAt),
        ],
        [t('analytics.table.clicked', 'Clicked'), trackingText('clicks', row.clickCount)],
      ].filter(Boolean)
    : [];

  const noPermission = (
    <PanelNotice icon={LockClosedIcon} role="status">
      {t(
        'analytics.detail.noPermission',
        'No permission. Viewing the content of sent emails needs the "View email content" permission.'
      )}
    </PanelNotice>
  );

  const contentLoading = (
    <Flex justifyContent="center" padding={8}>
      <Loader>{t('analytics.detail.contentLoading', 'Loading the email...')}</Loader>
    </Flex>
  );

  const contentError = (
    <Flex direction="column" alignItems="flex-start" gap={3} role="alert">
      <Typography variant="omega" textColor="neutral800" tag="p">
        {t('analytics.detail.contentError', 'The email could not be loaded.')}
      </Typography>
      <TertiaryButton
        startIcon={<ArrowPathIcon style={ICON_16} aria-hidden="true" />}
        onClick={retryContent}
      >
        {t('analytics.detail.retry', 'Try again')}
      </TertiaryButton>
    </Flex>
  );

  /** Shared gate of the Preview and Variables panels. */
  const contentGate = () => {
    if (!canReadContent || contentState === 'forbidden') return noPermission;
    if (contentState === 'loading' && !content) return contentLoading;
    if (contentState === 'error') return contentError;
    return null;
  };

  const renderPreview = () => {
    const gate = contentGate();
    if (gate) return gate;
    if (!content) return contentLoading;
    const notice = PREVIEW_STATE_NOTICES[content.state];
    const source =
      content.state === 'copy'
        ? t('analytics.detail.preview.copy', 'Exact copy as sent. Tracking was removed.')
        : content.state === 'rerendered'
          ? content.template?.versionNumber
            ? t(
                'analytics.detail.preview.rerenderedVersion',
                'Rebuilt from the template "{name}", version {version}, with the stored variables. Hidden values show as ••••••.',
                { name: content.template?.name || '', version: content.template.versionNumber }
              )
            : t(
                'analytics.detail.preview.rerendered',
                'Rebuilt from the template "{name}" with the stored variables. Hidden values show as ••••••.',
                { name: content.template?.name || '' }
              )
          : null;
    return (
      <>
        <Flex direction="column" alignItems="stretch" gap={1}>
          <Typography variant="sigma" textColor="neutral600" tag="p">
            {t('analytics.table.subject', 'Subject')}
          </Typography>
          <Typography
            variant="delta"
            textColor="neutral800"
            tag="p"
            style={{ overflowWrap: 'anywhere' }}
          >
            {content.subject || '—'}
          </Typography>
        </Flex>
        {notice ? (
          <PanelNotice tone={notice[2]} role="status">
            {t(notice[0], notice[1])}
          </PanelNotice>
        ) : null}
        {source ? (
          <Typography variant="pi" textColor="neutral600" tag="p">
            {source}
          </Typography>
        ) : null}
        {content.state === 'rerendered' && content.variablesComplete === false ? (
          <PanelNotice role="status">
            {t(
              'analytics.detail.preview.noVariables',
              'The variables of this email were not stored, so its placeholders are empty.'
            )}
          </PanelNotice>
        ) : null}
        {content.html !== null || content.text !== null ? (
          <>
            <Toolbar>
              <Segmented
                role="group"
                aria-label={t('analytics.detail.preview.formatLabel', 'Format')}
              >
                <button
                  type="button"
                  aria-pressed={view === 'html'}
                  onClick={() => setView('html')}
                >
                  {t('analytics.detail.preview.html', 'Formatted')}
                </button>
                <button
                  type="button"
                  aria-pressed={view === 'text'}
                  onClick={() => setView('text')}
                >
                  {t('analytics.detail.preview.text', 'Plain text')}
                </button>
              </Segmented>
              {view === 'html' ? (
                <Segmented
                  role="group"
                  aria-label={t('analytics.detail.preview.widthLabel', 'Width')}
                >
                  <button
                    type="button"
                    aria-pressed={width === 'desktop'}
                    onClick={() => setWidth('desktop')}
                  >
                    <ComputerDesktopIcon aria-hidden="true" />
                    {t('analytics.detail.preview.desktop', 'Desktop')}
                  </button>
                  <button
                    type="button"
                    aria-pressed={width === 'mobile'}
                    onClick={() => setWidth('mobile')}
                  >
                    <DevicePhoneMobileIcon aria-hidden="true" />
                    {t('analytics.detail.preview.mobile', 'Mobile')}
                  </button>
                </Segmented>
              ) : null}
            </Toolbar>
            {view === 'html' && content.images?.blocked > 0 && !content.images?.allowed ? (
              <Notice $tone="neutral">
                <PhotoIcon aria-hidden="true" />
                <Flex direction="column" alignItems="flex-start" gap={2} style={{ minWidth: 0 }}>
                  <Typography variant="omega" textColor="neutral800" tag="p">
                    {t(
                      'analytics.detail.preview.imagesBlocked',
                      '{count, plural, one {# image is} other {# images are}} blocked. Loading images contacts the servers that host them.',
                      { count: content.images.blocked }
                    )}
                  </Typography>
                  {content.images.adminCsp === 'none' ? (
                    <Typography variant="pi" textColor="neutral600" tag="p">
                      {t(
                        'analytics.detail.preview.cspBlocks',
                        'The Content Security Policy of this admin does not allow images from other sites, so they can not be loaded here. To allow them, add the image hosts to img-src of strapi::security in config/middlewares.js.'
                      )}
                    </Typography>
                  ) : (
                    <>
                      {content.images.adminCsp === 'some' ? (
                        <Typography variant="pi" textColor="neutral600" tag="p">
                          {t(
                            'analytics.detail.preview.cspSome',
                            'Only images from hosts allowed in img-src (config/middlewares.js) can appear.'
                          )}
                        </Typography>
                      ) : null}
                      <TertiaryButton
                        startIcon={<PhotoIcon style={ICON_16} aria-hidden="true" />}
                        onClick={() => setAllowImages(true)}
                        loading={contentState === 'loading'}
                      >
                        {t('analytics.detail.preview.loadImages', 'Load images')}
                      </TertiaryButton>
                    </>
                  )}
                </Flex>
              </Notice>
            ) : null}
            {view === 'html' ? (
              content.html ? (
                <FrameStage>
                  <PreviewFrame
                    title={t('analytics.detail.preview.frameTitle', 'Email preview')}
                    sandbox=""
                    referrerPolicy="no-referrer"
                    srcDoc={content.html}
                    $width={PREVIEW_WIDTHS[width]}
                  />
                </FrameStage>
              ) : (
                <PanelNotice>
                  {t('analytics.detail.preview.noHtml', 'This email has no HTML part.')}
                </PanelNotice>
              )
            ) : content.text ? (
              <PlainText tabIndex={0} aria-label={t('analytics.detail.preview.text', 'Plain text')}>
                {content.text}
              </PlainText>
            ) : (
              <PanelNotice>
                {t('analytics.detail.preview.noText', 'This email has no plain-text part.')}
              </PanelNotice>
            )}
          </>
        ) : null}
      </>
    );
  };

  const renderVariables = () => {
    const gate = contentGate();
    if (gate) return gate;
    if (!content) return contentLoading;
    if (content.variablesState === 'disabled') {
      return (
        <PanelNotice role="status">
          {t(
            'analytics.detail.variables.disabled',
            'Variables were not stored for this email because storing them was turned off in the settings.'
          )}
        </PanelNotice>
      );
    }
    if (content.variablesState === 'tooLarge') {
      return (
        <PanelNotice role="status">
          {t(
            'analytics.detail.variables.tooLarge',
            'The variables of this email were too large to store.'
          )}
        </PanelNotice>
      );
    }
    if (!content.variables || countVariables(content.variables) === 0) {
      return (
        <PanelNotice role="status">
          {content.state === 'notStored'
            ? t(
                'analytics.detail.variables.notStored',
                'No variables were stored for this email. Emails sent before Magic Mail 4.11 have none.'
              )
            : t('analytics.detail.variables.none', 'This email was sent without variables.')}
        </PanelNotice>
      );
    }
    return (
      <>
        <Typography variant="pi" textColor="neutral600" tag="p">
          {t(
            'analytics.detail.variables.hint',
            'Passwords, tokens, codes and sign-in links were hidden before they were stored. They can not be shown.'
          )}
        </Typography>
        <VariablesTable variables={content.variables} />
      </>
    );
  };

  return (
    <Modal.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DetailSheet onCloseAutoFocus={returnFocus} aria-describedby={undefined}>
        <VersionSheetHeader closeLabel={t('analytics.detail.close', 'Close details')}>
          <VersionSheetTitle>
            <EnvelopeIcon aria-hidden="true" />
            <Modal.Title>{t('analytics.detail.title', 'Email details')}</Modal.Title>
          </VersionSheetTitle>
        </VersionSheetHeader>
        <VersionModalContent>
          <Tabs.Root value={tab} onValueChange={setTab} variant="simple">
            <Tabs.List aria-label={t('analytics.detail.tabsLabel', 'Email details')}>
              <Tabs.Trigger value="overview">
                {t('analytics.detail.tab.overview', 'Overview')}
              </Tabs.Trigger>
              <Tabs.Trigger value="preview">
                {t('analytics.detail.tab.preview', 'Preview')}
              </Tabs.Trigger>
              <Tabs.Trigger value="variables">
                {t('analytics.detail.tab.variables', 'Variables')}
              </Tabs.Trigger>
            </Tabs.List>
            <Tabs.Content value="overview">
              <TabPanel aria-busy={detailState === 'loading'}>
                {detailState === 'error' && !detail ? (
                  <Flex direction="column" alignItems="flex-start" gap={3} role="alert">
                    <Typography variant="omega" textColor="neutral800" tag="p">
                      {t('analytics.detail.error', 'The details could not be loaded.')}
                    </Typography>
                    <TertiaryButton
                      startIcon={<ArrowPathIcon style={ICON_16} aria-hidden="true" />}
                      onClick={retryDetail}
                    >
                      {t('analytics.detail.retry', 'Try again')}
                    </TertiaryButton>
                  </Flex>
                ) : (
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
                )}
              </TabPanel>
            </Tabs.Content>
            <Tabs.Content value="preview">
              <TabPanel aria-busy={contentState === 'loading'}>
                {tab === 'preview' ? renderPreview() : null}
              </TabPanel>
            </Tabs.Content>
            <Tabs.Content value="variables">
              <TabPanel aria-busy={contentState === 'loading'}>
                {tab === 'variables' ? renderVariables() : null}
              </TabPanel>
            </Tabs.Content>
          </Tabs.Root>
        </VersionModalContent>
      </DetailSheet>
    </Modal.Root>
  );
};

export default EmailDetailDrawer;

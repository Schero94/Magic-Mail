import { useEffect, useRef, useState } from 'react';
import { useFetchClient, useNotification } from '@strapi/strapi/admin';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Field,
  Flex,
  Loader,
  Modal,
  SingleSelect,
  SingleSelectOption,
  TextInput,
  Typography,
} from '@strapi/design-system';
import { CheckIcon, ClipboardDocumentIcon, PaperAirplaneIcon } from '@heroicons/react/24/outline';
import { GradientButton, SecondaryButton, TertiaryButton } from '../../../components/StyledButtons';
import { ConfirmDialog } from '../../../components/shared/ConfirmDialog';
import { StatusBadge } from '../../../components/shared/table';
import { useCopyToClipboard } from '../../../hooks/useCopyToClipboard';
import { useFormatters } from '../../../hooks/useFormatters';
import { useMagicMailIntl } from '../../../hooks/useMagicMailIntl';
import { useReturnFocus } from '../../../hooks/useReturnFocus';
import { validateTestSendInput } from '../templateListUtils';
import {
  CodeModalContent,
  ScrollableDialogBody,
  StyledModalFooter,
  StyledModalHeader,
} from '../templateListStyles';
import { Notice } from './Notice';
import { conversionWarning, providerName, statusInfo } from './providerTemplateUtils';
import { ConvertedCode, PreviewFrame, VariableList, VariableItem } from './providerTemplateStyles';

const NO_FALLBACK = '__none__';

/**
 * Preview dialog of one provider template: read-only preview, detected
 * variables, the code to send it, the optional local fallback and a test
 * send. One primary action ("Send test"); "Copy as Magic Mail template" is
 * the secondary action.
 *
 * @param {object} props
 * @param {string|null} props.templateKey - Key of the template to show; null closes
 * @param {() => void} props.onClose
 * @param {boolean} props.canManage - May set the fallback and copy
 * @param {boolean} props.canTestSend - May send a test
 * @param {Array<{templateReferenceId: number, name: string}>} props.localTemplates
 * @param {() => void} props.onChanged - Called after the fallback changed
 * @returns {import('react').ReactElement}
 */
export const ProviderTemplateDialog = ({
  templateKey,
  onClose,
  canManage,
  canTestSend,
  localTemplates,
  onChanged,
}) => {
  const { t } = useMagicMailIntl();
  const { get, post, put } = useFetchClient();
  const { toggleNotification } = useNotification();
  const { formatDateTime } = useFormatters();
  const navigate = useNavigate();
  const copy = useCopyToClipboard();
  const isOpen = Boolean(templateKey);
  const returnFocus = useReturnFocus(isOpen);

  const [detail, setDetail] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [recipient, setRecipient] = useState('');
  const [recipientError, setRecipientError] = useState(null);
  const [sending, setSending] = useState(false);
  const [savingFallback, setSavingFallback] = useState(false);
  const [copying, setCopying] = useState(false);
  const [confirmCopy, setConfirmCopy] = useState(false);
  const [snippetCopied, setSnippetCopied] = useState(false);
  const copiedTimer = useRef(null);

  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  // Reset when another template opens (adjusted while rendering).
  const [shownKey, setShownKey] = useState(null);
  if (templateKey !== shownKey) {
    setShownKey(templateKey);
    setDetail(null);
    setLoadError(false);
    setRecipient('');
    setRecipientError(null);
    setConfirmCopy(false);
  }

  useEffect(() => {
    if (!templateKey) return undefined;
    let ignore = false;
    get(`/magic-mail/provider-templates/${encodeURIComponent(templateKey)}`)
      .then((response) => {
        if (!ignore) setDetail(response?.data?.data ?? null);
      })
      .catch(() => {
        if (!ignore) setLoadError(true);
      });
    return () => {
      ignore = true;
    };
  }, [get, templateKey, reloadKey]);

  const busy = sending || copying || savingFallback;
  const handleClose = () => {
    if (!busy) onClose();
  };

  /** Sends the template to the given address, or to the signed-in admin. */
  const sendTest = async (event) => {
    event?.preventDefault?.();
    if (sending || !detail) return;
    let to;
    if (recipient.trim()) {
      const result = validateTestSendInput({ to: recipient, cc: '' });
      if (!result.valid) {
        setRecipientError(
          t(
            'templates.testSend.errors.toInvalid',
            'Enter a valid email address, for example name@example.com.'
          )
        );
        return;
      }
      to = result.to;
    }
    setRecipientError(null);
    setSending(true);
    try {
      const response = await post(
        `/magic-mail/provider-templates/${encodeURIComponent(detail.key)}/test-send`,
        to ? { to } : {}
      );
      toggleNotification({
        type: 'success',
        message: t('templates.provider.testSend.success', 'Test email sent to {email}.', {
          email: response?.data?.data?.recipient ?? to ?? '',
        }),
      });
    } catch (error) {
      toggleNotification({
        type: 'danger',
        message:
          error?.response?.data?.error?.message ||
          t('templates.testSend.failure', 'The test email could not be sent.'),
      });
    } finally {
      setSending(false);
    }
  };

  /** Saves the local fallback template right away. */
  const changeFallback = async (value) => {
    if (!detail || savingFallback) return;
    const next = value === NO_FALLBACK ? null : Number(value);
    setSavingFallback(true);
    try {
      const response = await put(
        `/magic-mail/provider-templates/${encodeURIComponent(detail.key)}/settings`,
        { fallbackTemplateReferenceId: next }
      );
      setDetail((current) => ({
        ...current,
        fallbackTemplateReferenceId: response?.data?.data?.fallbackTemplateReferenceId ?? null,
      }));
      toggleNotification({
        type: 'success',
        message:
          next === null
            ? t(
                'templates.provider.fallback.cleared',
                'Fallback removed. Failed sends report an error.'
              )
            : t('templates.provider.fallback.saved', 'Fallback template saved.'),
      });
      onChanged?.();
    } catch (error) {
      toggleNotification({
        type: 'danger',
        message:
          error?.response?.data?.error?.message ||
          t('templates.provider.fallback.failure', 'The fallback could not be saved.'),
      });
    } finally {
      setSavingFallback(false);
    }
  };

  /** Creates the local copy and opens it in the designer. */
  const copyAsLocal = async () => {
    if (!detail || copying) return;
    setCopying(true);
    try {
      const response = await post(
        `/magic-mail/provider-templates/${encodeURIComponent(detail.key)}/copy`
      );
      const created = response?.data?.data;
      toggleNotification({
        type: created?.warnings?.length ? 'warning' : 'success',
        message: created?.warnings?.length
          ? t(
              'templates.provider.copy.successWithWarnings',
              'Copy created. Check the marked blocks in the designer before you use it.'
            )
          : t('templates.provider.copy.success', 'Copy created as a Magic Mail template.'),
      });
      setConfirmCopy(false);
      onClose();
      if (created?.templateReferenceId) {
        navigate(`/plugins/magic-mail/designer/${created.templateReferenceId}`);
      }
    } catch (error) {
      toggleNotification({
        type: 'danger',
        message:
          error?.response?.data?.error?.message ||
          t('templates.provider.copy.failure', 'The template could not be copied.'),
      });
    } finally {
      setCopying(false);
    }
  };

  const startCopy = () => {
    if (detail?.copyWarnings?.length) setConfirmCopy(true);
    else copyAsLocal();
  };

  const copySnippet = async () => {
    const copied = await copy(detail?.usage ?? '', {
      success: t('templates.code.copied', 'Code copied to clipboard'),
    });
    if (!copied) return;
    setSnippetCopied(true);
    clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setSnippetCopied(false), 2000);
  };

  const status = detail ? statusInfo(detail.status) : null;
  const provider = detail ? providerName(detail.provider) : '';
  const notSentInTest = (detail?.variables ?? []).filter((variable) => !variable.inSample);
  const fallbackValue =
    detail?.fallbackTemplateReferenceId != null
      ? String(detail.fallbackTemplateReferenceId)
      : NO_FALLBACK;

  const renderBody = () => {
    if (loadError) {
      return (
        <Notice
          tone="danger"
          role="alert"
          title={t('templates.provider.detail.error', 'This template could not be loaded.')}
          action={
            <TertiaryButton
              onClick={() => {
                setLoadError(false);
                setReloadKey((key) => key + 1);
              }}
            >
              {t('common.table.retry', 'Try again')}
            </TertiaryButton>
          }
        >
          {t(
            'templates.provider.detail.errorHint',
            'Sync the provider templates and open it again.'
          )}
        </Notice>
      );
    }
    if (!detail) {
      return (
        <Flex justifyContent="center" padding={8}>
          <Loader>{t('templates.provider.detail.loading', 'Loading template...')}</Loader>
        </Flex>
      );
    }
    return (
      <Flex direction="column" alignItems="stretch" gap={5}>
        <Flex gap={2} wrap="wrap" alignItems="center">
          <StatusBadge $tone="primary">{provider}</StatusBadge>
          <StatusBadge $tone={status.tone}>{t(status.id, status.label)}</StatusBadge>
          <Typography variant="pi" textColor="neutral600">
            {t('templates.provider.detail.changed', 'Changed at {provider}: {date}', {
              provider,
              date: formatDateTime(detail.updatedAtProvider),
            })}
          </Typography>
        </Flex>

        {detail.status === 'missing' || detail.status === 'unpublished' ? (
          <Notice
            tone="danger"
            role="alert"
            title={
              detail.status === 'missing'
                ? t('templates.provider.detail.missingTitle', 'Deleted at {provider}', { provider })
                : t(
                    'templates.provider.detail.unpublishedTitle',
                    'No active version at {provider}',
                    {
                      provider,
                    }
                  )
            }
          >
            {t(
              'templates.provider.detail.staleBody',
              'Sends with this template fail with a clear error until it is available again and synced.'
            )}
          </Notice>
        ) : null}
        {detail.status === 'matchedByName' ? (
          <Notice
            tone="info"
            title={t('templates.provider.detail.matchedTitle', 'Matched by name')}
          >
            {t(
              'templates.provider.detail.matchedBody',
              'The id at the provider changed, for example after this database was moved to another environment. Magic Mail uses the template with the same name.'
            )}
          </Notice>
        ) : null}

        <Flex direction="column" alignItems="stretch" gap={2}>
          <Typography variant="delta" tag="h3">
            {t('templates.provider.detail.preview', 'Preview')}
          </Typography>
          <Typography variant="pi" textColor="neutral600">
            {t(
              'templates.provider.detail.previewHint',
              '{provider} fills the placeholders when it sends. Subject: {subject}',
              { provider, subject: detail.subject || '-' }
            )}
          </Typography>
          {detail.previewHtml ? (
            <PreviewFrame
              title={t('templates.provider.detail.previewTitle', 'Preview of {name}', {
                name: detail.name,
              })}
              sandbox=""
              referrerPolicy="no-referrer"
              srcDoc={detail.previewHtml}
            />
          ) : (
            <Notice tone="info">
              {detail.previewTooLarge
                ? t(
                    'templates.provider.detail.previewTooLarge',
                    'This template is too large to preview here. Open it at the provider.'
                  )
                : t(
                    'templates.provider.detail.previewEmpty',
                    'There is no active version to preview.'
                  )}
            </Notice>
          )}
        </Flex>

        <Flex direction="column" alignItems="stretch" gap={2}>
          <Typography variant="delta" tag="h3">
            {t('templates.provider.detail.variables', 'Variables')}
          </Typography>
          <Typography variant="pi" textColor="neutral600">
            {t(
              'templates.provider.detail.variablesHint',
              'Pass these in data when you send. Names stay the same as in Magic Mail templates; the test send uses the sample values name and email.'
            )}
          </Typography>
          {detail.variables.length === 0 ? (
            <Typography variant="omega" textColor="neutral800">
              {t('templates.provider.detail.noVariables', 'This template uses no variables.')}
            </Typography>
          ) : (
            <VariableList aria-label={t('templates.provider.detail.variables', 'Variables')}>
              {detail.variables.map((variable) => (
                <VariableItem key={variable.path}>
                  <code>{variable.path}</code>
                  {variable.scoped ? (
                    <StatusBadge $tone="neutral">
                      {t('templates.provider.variable.inList', 'In a list')}
                    </StatusBadge>
                  ) : variable.inSample ? (
                    <StatusBadge $tone="success">
                      {t('templates.provider.variable.inTest', 'In test send')}
                    </StatusBadge>
                  ) : (
                    <StatusBadge $tone="warning">
                      {t('templates.provider.variable.notInTest', 'Empty in test send')}
                    </StatusBadge>
                  )}
                </VariableItem>
              ))}
            </VariableList>
          )}
          {notSentInTest.length > 0 ? (
            <Typography variant="pi" textColor="neutral600">
              {t(
                'templates.provider.detail.notInTestHint',
                'Variables marked "Empty in test send" render empty in the test email. Your code provides them.'
              )}
            </Typography>
          ) : null}
        </Flex>

        <Flex direction="column" alignItems="stretch" gap={2}>
          <Typography variant="delta" tag="h3">
            {t('templates.provider.detail.code', 'Send it from code')}
          </Typography>
          <ConvertedCode>{detail.usage}</ConvertedCode>
          <Box>
            <TertiaryButton
              type="button"
              onClick={copySnippet}
              startIcon={
                snippetCopied ? (
                  <CheckIcon style={{ width: 16, height: 16 }} aria-hidden="true" />
                ) : (
                  <ClipboardDocumentIcon style={{ width: 16, height: 16 }} aria-hidden="true" />
                )
              }
            >
              <span aria-live="polite">
                {snippetCopied
                  ? t('templates.code.copiedShort', 'Copied')
                  : t('templates.provider.detail.copyCode', 'Copy the code example')}
              </span>
            </TertiaryButton>
          </Box>
        </Flex>

        {canManage ? (
          <Field.Root
            name="providerFallback"
            hint={t(
              'templates.provider.fallback.hint',
              'Used only when nothing was sent: the template is deleted or unpublished, or the provider refused the email. Without a fallback, the send fails with an error.'
            )}
          >
            <Field.Label>{t('templates.provider.fallback.label', 'Fallback template')}</Field.Label>
            <SingleSelect
              value={fallbackValue}
              // Not disabled while saving: a disabled select would drop the
              // keyboard focus; changeFallback ignores changes while it saves.
              onChange={(value) => changeFallback(String(value))}
            >
              <SingleSelectOption value={NO_FALLBACK}>
                {t('templates.provider.fallback.none', 'Report an error (recommended)')}
              </SingleSelectOption>
              {(localTemplates ?? []).map((template) => (
                <SingleSelectOption
                  key={template.templateReferenceId}
                  value={String(template.templateReferenceId)}
                >
                  {template.name}
                </SingleSelectOption>
              ))}
            </SingleSelect>
            <Field.Hint />
          </Field.Root>
        ) : null}

        {canTestSend ? (
          <Field.Root
            name="providerTestRecipient"
            error={recipientError ?? undefined}
            hint={t(
              'templates.provider.testSend.hint',
              'Leave empty to send the test to your own admin email address.'
            )}
          >
            <Field.Label>{t('templates.provider.testSend.recipient', 'Send test to')}</Field.Label>
            <TextInput
              type="email"
              autoComplete="email"
              placeholder={t('templates.provider.testSend.placeholder', 'Your admin email address')}
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
              disabled={sending}
            />
            <Field.Hint />
            <Field.Error />
          </Field.Root>
        ) : null}
      </Flex>
    );
  };

  return (
    <>
      <Modal.Root open={isOpen} onOpenChange={(open) => !open && handleClose()}>
        <CodeModalContent
          onCloseAutoFocus={returnFocus}
          // The dialog has no separate description; this tells Radix so.
          aria-describedby={undefined}
        >
          <form onSubmit={sendTest} noValidate>
            <StyledModalHeader closeLabel={t('common.close', 'Close')}>
              <Modal.Title>
                {detail?.name ?? t('templates.provider.detail.title', 'Provider template')}
              </Modal.Title>
            </StyledModalHeader>
            <ScrollableDialogBody>
              <Box>{renderBody()}</Box>
            </ScrollableDialogBody>
            <StyledModalFooter>
              <TertiaryButton type="button" onClick={handleClose} disabled={busy}>
                {t('common.close', 'Close')}
              </TertiaryButton>
              <Flex gap={2} wrap="wrap" justifyContent="flex-end">
                {canManage && detail?.previewHtml ? (
                  <SecondaryButton
                    type="button"
                    onClick={startCopy}
                    loading={copying}
                    disabled={busy}
                  >
                    {t('templates.provider.copy.button', 'Copy as Magic Mail template')}
                  </SecondaryButton>
                ) : null}
                {canTestSend && detail ? (
                  <GradientButton
                    type="submit"
                    loading={sending}
                    disabled={busy || !detail.usable}
                    startIcon={
                      sending ? undefined : (
                        <PaperAirplaneIcon style={{ width: 16, height: 16 }} aria-hidden="true" />
                      )
                    }
                  >
                    {t('templates.provider.testSend.submit', 'Send test')}
                  </GradientButton>
                ) : null}
              </Flex>
            </StyledModalFooter>
          </form>
        </CodeModalContent>
      </Modal.Root>

      <ConfirmDialog
        isOpen={confirmCopy}
        variant="default"
        title={t('templates.provider.copy.confirmTitle', 'Copy with changes?')}
        description={t(
          'templates.provider.copy.confirmBody',
          'Some Handlebars logic can not be carried over to Magic Mail templates exactly:'
        )}
        confirmLabel={t('templates.provider.copy.confirm', 'Copy anyway')}
        onConfirm={copyAsLocal}
        onClose={() => setConfirmCopy(false)}
      >
        <Box tag="ul" paddingLeft={4}>
          {(detail?.copyWarnings ?? []).slice(0, 8).map((warning, index) => {
            const info = conversionWarning(warning.code);
            return (
              <li key={`${warning.code}-${warning.line}-${index}`}>
                <Typography variant="pi" textColor="neutral800">
                  {t('templates.provider.copy.warningLine', 'Line {line}: {message}', {
                    line: warning.line,
                    message: t(info.id, info.label),
                  })}
                </Typography>
              </li>
            );
          })}
        </Box>
      </ConfirmDialog>
    </>
  );
};

export default ProviderTemplateDialog;

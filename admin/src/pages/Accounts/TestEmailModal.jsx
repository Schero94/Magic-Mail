import { useId, useRef, useState } from 'react';
import { Box, Flex, Modal, Typography } from '@strapi/design-system';
import { useFetchClient, useNotification } from '@strapi/strapi/admin';
import { PlayIcon, SparklesIcon } from '@heroicons/react/24/outline';
import { GradientButton, TertiaryButton } from '../../components/StyledButtons';
import { useMagicMailIntl } from '../../hooks/useMagicMailIntl';
import { useReturnFocus } from '../../hooks/useReturnFocus';
import {
  AccentText,
  AccountInfoCard,
  AdvancedBox,
  ModalError,
  ModalFieldLabel,
  ModalGroupLabel,
  ModalHint,
  StyledModalBody,
  StyledModalContent,
  StyledModalFooter,
  StyledModalHeader,
  StyledModalInput,
  StyledModalSelect,
  TestOptionCard,
} from './styles';
import { MAX_TEST_CC, normaliseCc, validateTestForm } from './accountHelpers';

/**
 * Keeps typing inside the dialog from reaching global admin shortcuts.
 * Escape must still reach the dialog, which listens on the document to close.
 */
const stop = (event) => {
  if (event.key !== 'Escape') event.stopPropagation();
};

/**
 * Test-send dialog for one account.
 *
 * "Direct test" sends through exactly this account (also when inactive).
 * "Strapi service test" sends through strapi.plugin('email') to verify the
 * interception; the router only uses active accounts, so it is disabled for
 * inactive ones.
 *
 * @param {object} props
 * @param {Record<string, any>} props.account
 * @param {() => void} props.onClose
 * @param {(email: string, testOptions: object) => Promise<boolean>} props.onTest - direct test; resolves true on success
 */
export const TestEmailModal = ({ account, onClose, onTest }) => {
  const { post } = useFetchClient();
  const { toggleNotification } = useNotification();
  const { t } = useMagicMailIntl();
  const idPrefix = useId();
  const ids = {
    to: `${idPrefix}-to`,
    toError: `${idPrefix}-to-error`,
    cc: `${idPrefix}-cc`,
    ccHint: `${idPrefix}-cc-hint`,
    ccError: `${idPrefix}-cc-error`,
    mode: `${idPrefix}-mode`,
    priority: `${idPrefix}-priority`,
    type: `${idPrefix}-type`,
    unsubscribe: `${idPrefix}-unsubscribe`,
    unsubscribeHint: `${idPrefix}-unsubscribe-hint`,
    unsubscribeError: `${idPrefix}-unsubscribe-error`,
  };

  const strapiModeAvailable = account.isActive === true;
  const [testEmail, setTestEmail] = useState('');
  const [testCc, setTestCc] = useState('');
  const [priority, setPriority] = useState('normal');
  const [emailType, setEmailType] = useState('transactional');
  const [unsubscribeUrl, setUnsubscribeUrl] = useState('');
  const [testMode, setTestMode] = useState(strapiModeAvailable ? 'strapi' : 'direct');
  const [sending, setSending] = useState(false);
  const [touched, setTouched] = useState({});
  const optionRefs = { direct: useRef(null), strapi: useRef(null) };
  const returnFocus = useReturnFocus(true);
  const toInputRef = useRef(null);
  // Focus the recipient field on open. Done here instead of autoFocus, which
  // runs before useReturnFocus can remember the button that opened the dialog.
  const focusRecipient = (event) => {
    event.preventDefault();
    toInputRef.current?.focus();
  };

  const errors = validateTestForm({
    to: testEmail,
    cc: testCc,
    mode: testMode,
    emailType,
    unsubscribeUrl,
  });
  const hasErrors = Object.keys(errors).length > 0;
  const showError = (field) => Boolean(errors[field] && (touched[field] || touched.submit));

  const errorText = {
    to: {
      required: t('accounts.test.toRequired', 'Enter a recipient email address.'),
      invalid: t('accounts.test.toInvalid', 'Enter a valid email address.'),
    },
    cc: {
      invalid: t('accounts.test.ccInvalid', 'Enter valid email addresses separated by commas.'),
      tooMany: t('accounts.test.ccTooMany', 'Enter at most {max} CC recipients.', {
        max: MAX_TEST_CC,
      }),
    },
    unsubscribeUrl: {
      required: t('accounts.test.unsubscribeRequired', 'Marketing emails need an unsubscribe URL.'),
      invalid: t(
        'accounts.test.unsubscribeInvalid',
        'Enter a URL that starts with http:// or https://.'
      ),
    },
  };

  const testStrapiService = async () => {
    try {
      const { data } = await post('/magic-mail/test-strapi-service', {
        testEmail: testEmail.trim(),
        cc: normaliseCc(testCc),
        accountName: account.name,
      });

      if (data?.success) {
        toggleNotification({
          type: 'success',
          message: t('accounts.test.strapiSuccess', 'Strapi email service test sent via {name}.', {
            name: account.name,
          }),
        });
        return true;
      }
      toggleNotification({
        type: 'warning',
        message: data?.message
          ? t('accounts.test.warningReason', 'The test finished with warnings: {reason}', {
              reason: data.message,
            })
          : t('accounts.test.warning', 'The test finished with warnings.'),
      });
      return false;
    } catch (err) {
      const reason = err?.response?.data?.error?.message;
      toggleNotification({
        type: 'danger',
        message: reason
          ? t(
              'accounts.test.strapiFailedReason',
              'The Strapi email service test failed: {reason}',
              { reason }
            )
          : t('accounts.test.strapiFailed', 'The Strapi email service test failed.'),
      });
      return false;
    }
  };

  const handleSubmit = async () => {
    if (sending) return;
    setTouched((previous) => ({ ...previous, submit: true }));
    if (hasErrors) return;

    setSending(true);
    let succeeded;
    try {
      succeeded =
        testMode === 'direct'
          ? await onTest(testEmail.trim(), {
              priority,
              type: emailType,
              unsubscribeUrl: emailType === 'marketing' ? unsubscribeUrl.trim() : '',
              cc: normaliseCc(testCc),
            })
          : await testStrapiService();
    } finally {
      setSending(false);
    }
    // Keep the dialog open on failure so the input can be corrected.
    if (succeeded) onClose();
  };

  const selectMode = (mode) => {
    if (sending) return;
    if (mode === 'strapi' && !strapiModeAvailable) return;
    setTestMode(mode);
  };

  const handleModeKeyDown = (event) => {
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const next = testMode === 'direct' ? 'strapi' : 'direct';
    if (next === 'strapi' && !strapiModeAvailable) return;
    setTestMode(next);
    optionRefs[next].current?.focus();
  };

  const describedBy = (...entries) => entries.filter(Boolean).join(' ') || undefined;

  const modeOption = (mode, Icon, title, description, disabled = false) => {
    const selected = testMode === mode;
    return (
      <TestOptionCard
        ref={optionRefs[mode]}
        role="radio"
        aria-checked={selected}
        aria-disabled={disabled || undefined}
        tabIndex={selected ? 0 : -1}
        $selected={selected}
        $disabled={disabled}
        onClick={() => selectMode(mode)}
        onKeyDown={(event) => {
          if (event.key === ' ' || event.key === 'Enter') {
            event.preventDefault();
            event.stopPropagation();
            selectMode(mode);
            return;
          }
          handleModeKeyDown(event);
        }}
      >
        <Flex alignItems="center" gap={3}>
          <Icon className="option-icon" aria-hidden="true" />
          <Box style={{ flex: 1, minWidth: 0 }}>
            <Typography
              tag="span"
              fontWeight="semiBold"
              className="option-title"
              style={{ display: 'block', fontSize: '14px' }}
            >
              {title}
            </Typography>
            <Typography
              tag="span"
              variant="pi"
              textColor="neutral600"
              style={{ display: 'block', marginTop: '2px' }}
            >
              {description}
            </Typography>
          </Box>
        </Flex>
      </TestOptionCard>
    );
  };

  return (
    <Modal.Root
      open
      onOpenChange={(open) => {
        if (!open && !sending) onClose();
      }}
    >
      <StyledModalContent onOpenAutoFocus={focusRecipient} onCloseAutoFocus={returnFocus}>
        <StyledModalHeader closeLabel={t('common.close', 'Close')}>
          <Modal.Title>{t('accounts.test.title', 'Test email account')}</Modal.Title>
        </StyledModalHeader>

        <StyledModalBody>
          <AccountInfoCard>
            <AccentText variant="pi" tag="span">
              {t('accounts.test.testing', 'Testing account')}
            </AccentText>
            <Typography
              variant="beta"
              tag="span"
              textColor="neutral800"
              style={{ fontSize: '1.8rem', fontWeight: 700, marginTop: '4px' }}
            >
              {account.name}
            </Typography>
            <Typography variant="pi" tag="span" textColor="neutral600" style={{ marginTop: '2px' }}>
              {account.fromEmail}
            </Typography>
          </AccountInfoCard>

          <Box style={{ marginTop: '20px' }}>
            <ModalFieldLabel htmlFor={ids.to}>
              {t('accounts.test.to', 'Recipient email')} *
            </ModalFieldLabel>
            <StyledModalInput
              ref={toInputRef}
              id={ids.to}
              placeholder="test@example.com"
              value={testEmail}
              onChange={(e) => {
                e.stopPropagation();
                setTestEmail(e.target.value);
              }}
              // The field has focus on open: leaving it empty (for example to
              // pick the test mode) is not an error until a send is attempted.
              onBlur={() => {
                if (testEmail.trim()) setTouched((previous) => ({ ...previous, to: true }));
              }}
              onKeyDown={stop}
              onClick={stop}
              type="email"
              autoComplete="email"
              required
              aria-required="true"
              aria-invalid={showError('to')}
              aria-describedby={describedBy(showError('to') && ids.toError)}
              $invalid={showError('to')}
            />
            {showError('to') ? (
              <ModalError id={ids.toError}>{errorText.to[errors.to]}</ModalError>
            ) : null}
          </Box>

          <Box style={{ marginTop: '16px' }}>
            <ModalFieldLabel htmlFor={ids.cc}>
              {t('accounts.test.cc', 'CC recipients (optional)')}
            </ModalFieldLabel>
            <StyledModalInput
              id={ids.cc}
              placeholder="copy@example.com, second-copy@example.com"
              value={testCc}
              onChange={(e) => {
                e.stopPropagation();
                setTestCc(e.target.value);
              }}
              onBlur={() => setTouched((previous) => ({ ...previous, cc: true }))}
              onKeyDown={stop}
              onClick={stop}
              type="text"
              autoComplete="off"
              aria-invalid={showError('cc')}
              aria-describedby={describedBy(ids.ccHint, showError('cc') && ids.ccError)}
              $invalid={showError('cc')}
            />
            <ModalHint id={ids.ccHint}>
              {t('accounts.test.ccHint', 'Separate multiple addresses with commas.')}
            </ModalHint>
            {showError('cc') ? (
              <ModalError id={ids.ccError}>{errorText.cc[errors.cc]}</ModalError>
            ) : null}
          </Box>

          <Box style={{ marginTop: '20px' }}>
            <ModalGroupLabel id={ids.mode}>{t('accounts.test.mode', 'Test mode')}</ModalGroupLabel>
            <div role="radiogroup" aria-labelledby={ids.mode}>
              {modeOption(
                'direct',
                PlayIcon,
                t('accounts.test.direct', 'Direct test'),
                t(
                  'accounts.test.directHint',
                  'Send directly through this account, even if it is inactive.'
                )
              )}
              {modeOption(
                'strapi',
                SparklesIcon,
                t('accounts.test.strapi', 'Strapi service test'),
                strapiModeAvailable
                  ? t(
                      'accounts.test.strapiHint',
                      'Verify that MagicMail intercepts the Strapi email service.'
                    )
                  : t(
                      'accounts.test.strapiInactive',
                      'Only available for active accounts, because routing skips inactive accounts.'
                    ),
                !strapiModeAvailable
              )}
            </div>
          </Box>

          {testMode === 'direct' && (
            <AdvancedBox role="group" aria-labelledby={`${idPrefix}-advanced`}>
              <ModalGroupLabel
                id={`${idPrefix}-advanced`}
                style={{ marginBottom: '16px', fontSize: '14px' }}
              >
                {t('accounts.test.advanced', 'Advanced options')}
              </ModalGroupLabel>

              <Box style={{ marginBottom: '12px' }}>
                <ModalFieldLabel htmlFor={ids.priority}>
                  {t('accounts.test.priority', 'Priority')}
                </ModalFieldLabel>
                <StyledModalSelect
                  id={ids.priority}
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  onKeyDown={stop}
                >
                  <option value="normal">{t('accounts.test.priorityNormal', 'Normal')}</option>
                  <option value="high">{t('accounts.test.priorityHigh', 'High priority')}</option>
                </StyledModalSelect>
              </Box>

              <Box style={{ marginBottom: emailType === 'marketing' ? '12px' : '0' }}>
                <ModalFieldLabel htmlFor={ids.type}>
                  {t('accounts.test.type', 'Email type')}
                </ModalFieldLabel>
                <StyledModalSelect
                  id={ids.type}
                  value={emailType}
                  onChange={(e) => setEmailType(e.target.value)}
                  onKeyDown={stop}
                >
                  <option value="transactional">
                    {t('accounts.test.typeTransactional', 'Transactional')}
                  </option>
                  <option value="marketing">{t('accounts.test.typeMarketing', 'Marketing')}</option>
                  <option value="notification">
                    {t('accounts.test.typeNotification', 'Notification')}
                  </option>
                </StyledModalSelect>
              </Box>

              {emailType === 'marketing' && (
                <Box>
                  <ModalFieldLabel htmlFor={ids.unsubscribe}>
                    {t('accounts.test.unsubscribe', 'Unsubscribe URL')} *
                  </ModalFieldLabel>
                  <StyledModalInput
                    id={ids.unsubscribe}
                    type="url"
                    placeholder="https://example.com/unsubscribe"
                    value={unsubscribeUrl}
                    onChange={(e) => setUnsubscribeUrl(e.target.value)}
                    onBlur={() => setTouched((previous) => ({ ...previous, unsubscribeUrl: true }))}
                    onKeyDown={stop}
                    required
                    aria-required="true"
                    aria-invalid={showError('unsubscribeUrl')}
                    aria-describedby={describedBy(
                      ids.unsubscribeHint,
                      showError('unsubscribeUrl') && ids.unsubscribeError
                    )}
                    $invalid={showError('unsubscribeUrl')}
                  />
                  <ModalHint id={ids.unsubscribeHint}>
                    {t(
                      'accounts.test.unsubscribeHint',
                      'Required for GDPR and CAN-SPAM compliance.'
                    )}
                  </ModalHint>
                  {showError('unsubscribeUrl') ? (
                    <ModalError id={ids.unsubscribeError}>
                      {errorText.unsubscribeUrl[errors.unsubscribeUrl]}
                    </ModalError>
                  ) : null}
                </Box>
              )}
            </AdvancedBox>
          )}
        </StyledModalBody>

        <StyledModalFooter>
          <Flex justifyContent="space-between" gap={2} wrap="wrap" style={{ width: '100%' }}>
            <TertiaryButton onClick={onClose} disabled={sending}>
              {t('common.cancel', 'Cancel')}
            </TertiaryButton>
            <GradientButton
              onClick={handleSubmit}
              disabled={hasErrors && Boolean(touched.submit)}
              loading={sending}
              startIcon={
                testMode === 'direct' ? (
                  <PlayIcon style={{ width: 16, height: 16 }} aria-hidden="true" />
                ) : (
                  <SparklesIcon style={{ width: 16, height: 16 }} aria-hidden="true" />
                )
              }
            >
              {testMode === 'direct'
                ? t('accounts.test.sendDirect', 'Send test email')
                : t('accounts.test.sendStrapi', 'Test Strapi service')}
            </GradientButton>
          </Flex>
        </StyledModalFooter>
      </StyledModalContent>
    </Modal.Root>
  );
};

export default TestEmailModal;

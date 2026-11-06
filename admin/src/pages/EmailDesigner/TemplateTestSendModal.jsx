import { useEffect, useState } from 'react';
import { useFetchClient, useNotification } from '@strapi/strapi/admin';
import {
  Field,
  Modal,
  SingleSelect,
  SingleSelectOption,
  TextInput,
  Typography,
} from '@strapi/design-system';
import { PaperAirplaneIcon } from '@heroicons/react/24/outline';
import { GradientButton, TertiaryButton } from '../../components/StyledButtons';
import { useMagicMailIntl } from '../../hooks/useMagicMailIntl';
import { validateTestSendInput } from './templateListUtils';
import {
  ModalField,
  ModalTemplateInfo,
  StyledModalBody,
  StyledModalContent,
  StyledModalFooter,
  StyledModalHeader,
} from './templateListStyles';

const AUTO_ACCOUNT = '__auto__';

/**
 * Sends one rendered template to test recipients (UI-12).
 *
 * The dialog stays open until the server answers, the submit button shows a
 * loading state (no double sends) and To/CC are validated before sending.
 *
 * @param {{template: object|null, isOpen: boolean, onClose: () => void}} props
 */
export const TemplateTestSendModal = ({ template, isOpen, onClose }) => {
  const { t } = useMagicMailIntl();
  const { get, post } = useFetchClient();
  const { toggleNotification } = useNotification();

  const [testEmail, setTestEmail] = useState('');
  const [testCc, setTestCc] = useState('');
  const [testAccount, setTestAccount] = useState(AUTO_ACCOUNT);
  const [errors, setErrors] = useState({});
  const [sending, setSending] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [accountsError, setAccountsError] = useState(false);

  useEffect(() => {
    if (!isOpen) return undefined;
    setTestEmail('');
    setTestCc('');
    setTestAccount(AUTO_ACCOUNT);
    setErrors({});
    setAccountsError(false);

    let cancelled = false;
    get('/magic-mail/accounts')
      .then((response) => {
        if (!cancelled) setAccounts(Array.isArray(response?.data?.data) ? response.data.data : []);
      })
      .catch(() => {
        if (!cancelled) {
          setAccounts([]);
          setAccountsError(true);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const errorText = {
    to: {
      required: t('templates.testSend.errors.toRequired', 'Enter a recipient email address.'),
      invalid: t(
        'templates.testSend.errors.toInvalid',
        'Enter a valid email address, for example name@example.com.'
      ),
    },
    cc: {
      invalid: t('templates.testSend.errors.ccInvalid', 'One or more CC addresses are not valid.'),
    },
  };

  const handleClose = () => {
    if (!sending) onClose();
  };

  /** Sends a rendered template to the selected test recipients through the API. */
  const sendTestEmail = async (event) => {
    event?.preventDefault?.();
    if (sending || !template) return;

    const result = validateTestSendInput({ to: testEmail, cc: testCc });
    setErrors(result.errors);
    if (!result.valid) return;

    setSending(true);
    try {
      // templateReferenceId is the stable, user-visible identifier.
      const templateIdForLookup = template.templateReferenceId ?? template.id;
      await post(
        `/magic-mail/designer/templates/${encodeURIComponent(templateIdForLookup)}/test-send`,
        {
          to: result.to,
          cc: result.cc.length > 0 ? result.cc.join(', ') : undefined,
          accountName: testAccount === AUTO_ACCOUNT ? null : testAccount,
        }
      );

      toggleNotification({
        type: 'success',
        message: t('templates.testSend.success', 'Test email sent to {email}', {
          email: result.to,
        }),
      });
      onClose();
    } catch (error) {
      console.error('[MagicMail] Failed to send template test email');
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

  const activeAccounts = accounts.filter((account) => account?.isActive);

  return (
    <Modal.Root open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <StyledModalContent>
        <form onSubmit={sendTestEmail} noValidate>
          <StyledModalHeader closeLabel={t('common.close', 'Close')}>
            <Modal.Title>{t('templates.testSend.title', 'Send test email')}</Modal.Title>
          </StyledModalHeader>
          <StyledModalBody>
            <ModalField>
              <Typography variant="pi" fontWeight="bold" textColor="neutral800" tag="p">
                {t('templates.testSend.template', 'Template')}
              </Typography>
              <ModalTemplateInfo>
                <Typography variant="omega">{template?.name}</Typography>
              </ModalTemplateInfo>
            </ModalField>

            <ModalField>
              <Field.Root
                name="testRecipient"
                required
                error={errors.to ? errorText.to[errors.to] : undefined}
              >
                <Field.Label>{t('templates.testSend.recipient', 'Recipient email')}</Field.Label>
                <TextInput
                  placeholder="test@example.com"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  type="email"
                  autoComplete="email"
                  disabled={sending}
                />
                <Field.Error />
              </Field.Root>
            </ModalField>

            <ModalField>
              <Field.Root
                name="testCc"
                error={errors.cc ? errorText.cc[errors.cc] : undefined}
                hint={t('templates.testSend.ccHint', 'Separate multiple addresses with commas.')}
              >
                <Field.Label>{t('templates.testSend.cc', 'CC recipients (optional)')}</Field.Label>
                <TextInput
                  placeholder="copy@example.com, second-copy@example.com"
                  value={testCc}
                  onChange={(e) => setTestCc(e.target.value)}
                  type="text"
                  disabled={sending}
                />
                <Field.Hint />
                <Field.Error />
              </Field.Root>
            </ModalField>

            <ModalField>
              <Field.Root
                name="testAccount"
                hint={
                  accountsError
                    ? t(
                        'templates.testSend.accountsUnavailable',
                        'Accounts could not be loaded. Smart routing selects the account.'
                      )
                    : t(
                        'templates.testSend.accountHint',
                        'Leave on automatic to use smart routing.'
                      )
                }
              >
                <Field.Label>
                  {t('templates.testSend.account', 'Send from account (optional)')}
                </Field.Label>
                <SingleSelect
                  value={testAccount}
                  onChange={(value) => setTestAccount(String(value))}
                  disabled={sending}
                >
                  <SingleSelectOption value={AUTO_ACCOUNT}>
                    {t('templates.testSend.autoAccount', 'Automatic (smart routing)')}
                  </SingleSelectOption>
                  {activeAccounts.map((account) => (
                    <SingleSelectOption key={account.name} value={account.name}>
                      {`${account.name} (${account.provider})`}
                    </SingleSelectOption>
                  ))}
                </SingleSelect>
                <Field.Hint />
              </Field.Root>
            </ModalField>
          </StyledModalBody>
          <StyledModalFooter>
            <TertiaryButton type="button" onClick={handleClose} disabled={sending}>
              {t('common.cancel', 'Cancel')}
            </TertiaryButton>
            <GradientButton
              type="submit"
              loading={sending}
              disabled={sending}
              startIcon={
                sending ? undefined : (
                  <PaperAirplaneIcon style={{ width: 16, height: 16 }} aria-hidden="true" />
                )
              }
            >
              {t('templates.testSend.submit', 'Send test email')}
            </GradientButton>
          </StyledModalFooter>
        </form>
      </StyledModalContent>
    </Modal.Root>
  );
};

export default TemplateTestSendModal;

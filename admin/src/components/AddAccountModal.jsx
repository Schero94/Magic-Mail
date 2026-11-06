import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Flex, Loader, Modal } from '@strapi/design-system';
import { useFetchClient, useNotification } from '@strapi/strapi/admin';
import { ArrowLeft, ArrowRight, Check, Cog, Lock, Mail, Server, Star } from '@strapi/icons';
import { GradientButton, TertiaryButton } from './StyledButtons';
import { UnsavedChangesDialog } from './shared/UnsavedChangesDialog';
import { useDiscardGuard } from '../hooks/useUnsavedChangesGuard';
import { useMagicMailIntl } from '../hooks/useMagicMailIntl';
import { ProviderStep } from './AccountWizard/ProviderStep';
import { DetailsStep } from './AccountWizard/DetailsStep';
import { CredentialsStep } from './AccountWizard/CredentialsStep';
import { SettingsStep } from './AccountWizard/SettingsStep';
import { useOAuthPopup } from './AccountWizard/useOAuthPopup';
import {
  StepDot,
  StepHeader,
  StepLabel,
  StepSubtitle,
  StepTitle,
  StepWrapper,
  StepperList,
} from './AccountWizard/styles';
import {
  OAUTH_PROVIDER_NAMES,
  PROVIDER_LABELS,
  accountToForm,
  buildAccountPayload,
  buildOAuthCreatePayload,
  buildOAuthReconnectPayload,
  canProceedStep,
  createEmptyForm,
  isOAuthProvider,
  snapshotWizard,
} from './AccountWizard/wizardState';

const STEPS = [1, 2, 3, 4];
const STEP_ICONS = { 1: Mail, 2: Server, 3: Lock, 4: Cog };
const OAUTH_APP_FIELDS = ['oauthClientId', 'oauthClientSecret', 'microsoftTenantId'];

/**
 * Four-step wizard to add or edit an email account.
 *
 * @param {object} props
 * @param {boolean} props.isOpen
 * @param {() => void} props.onClose
 * @param {() => void} props.onAccountAdded - called after a successful create or update
 * @param {object|null} [props.editAccount] - account row from the list (edit mode)
 * @param {number|null} [props.referencingRuleCount] - routing rules that use the account name
 */
const AddAccountModal = ({
  isOpen,
  onClose,
  onAccountAdded,
  editAccount = null,
  referencingRuleCount = null,
}) => {
  const { post, get, put } = useFetchClient();
  const { toggleNotification } = useNotification();
  const { t } = useMagicMailIntl();
  const isEditMode = Boolean(editAccount);
  const accountId = editAccount ? (editAccount.documentId ?? editAccount.id) : null;

  const [saving, setSaving] = useState(false);
  const [loadState, setLoadState] = useState('idle'); // idle | loading | error
  const [reloadKey, setReloadKey] = useState(0);
  const [currentStep, setCurrentStep] = useState(1);
  const [provider, setProvider] = useState('');
  const [formData, setFormData] = useState(createEmptyForm);
  const [credentialsUnreadable, setCredentialsUnreadable] = useState(false);
  const [originalName, setOriginalName] = useState('');
  // The snapshot decides `isDirty` during render, so it is state, not a ref.
  const [initialSnapshot, setInitialSnapshot] = useState(() =>
    snapshotWizard({ provider: '', form: createEmptyForm(), oauthCode: null })
  );

  // Reset the wizard whenever the modal opens or a failed load is retried.
  // State is adjusted while rendering (react.dev "Adjusting some state when a
  // prop changes") instead of synchronously in an effect.
  const openKey = isOpen ? `${isEditMode ? accountId : 'new'}:${reloadKey}` : null;
  const [handledOpenKey, setHandledOpenKey] = useState(null);
  if (openKey !== handledOpenKey) {
    setHandledOpenKey(openKey);
    if (openKey !== null) {
      setSaving(false);
      if (isEditMode) {
        setLoadState('loading');
      } else {
        const empty = createEmptyForm();
        setLoadState('idle');
        setCurrentStep(1);
        setProvider('');
        setFormData(empty);
        setCredentialsUnreadable(false);
        setOriginalName('');
        setInitialSnapshot(snapshotWizard({ provider: '', form: empty, oauthCode: null }));
      }
    }
  }

  const handleOAuthEvent = useCallback(
    ({ type, provider: eventProvider }) => {
      const name = OAUTH_PROVIDER_NAMES[eventProvider] ?? '';
      const messages = {
        blocked: [
          'warning',
          t(
            'accountModal.oauth.blocked',
            'The authorization window was blocked. Allow pop-ups for this site and try again.'
          ),
        ],
        started: [
          'info',
          t('accountModal.oauth.started', 'Complete the authorization in the pop-up window.'),
        ],
        success: [
          'success',
          t(
            'accountModal.oauth.success',
            '{provider} authorization succeeded. Complete the account setup.',
            { provider: name }
          ),
        ],
        closed: [
          'info',
          t(
            'accountModal.oauth.closed',
            'The authorization window was closed before the authorization finished. Try again if needed.'
          ),
        ],
        failed: [
          'danger',
          t(
            'accountModal.oauth.failed',
            'The authorization could not be started. Check the client ID and try again.'
          ),
        ],
      };
      const [notificationType, message] = messages[type] ?? [];
      if (message) toggleNotification({ type: notificationType, message });
    },
    [t, toggleNotification]
  );

  const oauth = useOAuthPopup({ get, onEvent: handleOAuthEvent });
  const authorization = oauth.authorization?.provider === provider ? oauth.authorization : null;
  const resetOAuth = oauth.reset;

  // Forget any OAuth flow and load the account (edit) whenever the modal opens.
  useEffect(() => {
    if (!isOpen) return undefined;
    resetOAuth();
    if (!isEditMode) return undefined;
    let cancelled = false;

    const load = async () => {
      try {
        const { data } = await get(`/magic-mail/accounts/${accountId}`);
        if (cancelled) return;
        const account = data?.data ?? {};
        const form = accountToForm(account);
        setProvider(account.provider || '');
        setFormData(form);
        setCredentialsUnreadable(account.credentialsUnreadable === true);
        setOriginalName(form.name);
        setCurrentStep(2); // the provider cannot be changed in edit mode
        setInitialSnapshot(
          snapshotWizard({
            provider: account.provider || '',
            form,
            oauthCode: null,
          })
        );
        setLoadState('idle');
      } catch {
        if (cancelled) return;
        console.error('[magic-mail] Account details could not be loaded');
        setLoadState('error');
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [isOpen, isEditMode, accountId, reloadKey, get, resetOAuth]);

  const isDirty =
    isOpen &&
    loadState === 'idle' &&
    snapshotWizard({ provider, form: formData, oauthCode: authorization?.code }) !==
      initialSnapshot;
  const discard = useDiscardGuard(isDirty && !saving);

  const handleChange = (field, value) => {
    setFormData((previous) => ({ ...previous, [field]: value }));
    // An authorization code is bound to the OAuth app it was issued for.
    if (!isEditMode && OAUTH_APP_FIELDS.includes(field) && oauth.authorization) resetOAuth();
  };

  const handleProviderSelect = (value) => {
    if (value !== provider) resetOAuth();
    setProvider(value);
  };

  const closeNow = () => {
    resetOAuth();
    onClose();
  };

  const requestClose = () => {
    if (saving) return;
    discard.runGuarded(closeNow);
  };

  const canProceed = canProceedStep(currentStep, {
    provider,
    form: formData,
    isEditMode,
    credentialsUnreadable,
    oauthCode: authorization?.code ?? null,
    oauthState: authorization?.state ?? null,
  });

  const startOAuth = () =>
    isEditMode
      ? oauth.start(provider, { accountId })
      : oauth.start(provider, {
          clientId: formData.oauthClientId.trim(),
          tenantId: formData.microsoftTenantId.trim(),
        });

  const handleSubmit = async () => {
    if (!canProceed || saving) return;
    setSaving(true);
    const name = formData.name.trim();
    try {
      if (!isEditMode && isOAuthProvider(provider)) {
        await post(
          '/magic-mail/oauth/create-account',
          buildOAuthCreatePayload(provider, formData, authorization.code, authorization.state)
        );
        toggleNotification({
          type: 'success',
          message: t(
            'accountModal.toast.createdOAuth',
            '{name} was created with {provider} OAuth.',
            {
              name,
              provider: OAUTH_PROVIDER_NAMES[provider],
            }
          ),
        });
      } else {
        const payload = buildAccountPayload(provider, formData, {
          isEditMode,
          credentialsUnreadable,
        });
        if (isEditMode) {
          await put(`/magic-mail/accounts/${accountId}`, payload);
          const reconnectPayload = isOAuthProvider(provider)
            ? buildOAuthReconnectPayload(provider, authorization)
            : null;
          if (reconnectPayload) {
            // Re-authorization of an existing OAuth account (revoked or expired
            // refresh token). The server checks state, PKCE, account and mailbox.
            await post(`/magic-mail/oauth/reconnect/${accountId}`, reconnectPayload);
            toggleNotification({
              type: 'success',
              message: t(
                'accountModal.toast.reconnected',
                '{name} was reconnected with {provider}.',
                {
                  name,
                  provider: OAUTH_PROVIDER_NAMES[provider],
                }
              ),
            });
          } else {
            toggleNotification({
              type: 'success',
              message: t('accountModal.toast.updated', '{name} was updated.', { name }),
            });
          }
        } else {
          await post('/magic-mail/accounts', payload);
          toggleNotification({
            type: 'success',
            message: t('accountModal.toast.created', '{name} was created.', { name }),
          });
        }
      }

      resetOAuth();
      onAccountAdded();
      onClose();
    } catch (err) {
      const serverMessage = err?.response?.data?.error?.message;
      toggleNotification({
        type: 'danger',
        message: serverMessage
          ? t('accountModal.toast.saveFailedReason', 'The account could not be saved: {reason}', {
              reason: serverMessage,
            })
          : isEditMode
            ? t('accountModal.toast.updateFailed', 'The account could not be updated.')
            : t('accountModal.toast.createFailed', 'The account could not be created.'),
      });
    } finally {
      setSaving(false);
    }
  };

  const stepTitles = useMemo(
    () => ({
      1: t('accountModal.steps.provider', 'Provider'),
      2: t('accountModal.steps.details', 'Details'),
      3: t('accountModal.steps.credentials', 'Credentials'),
      4: t('accountModal.steps.settings', 'Settings'),
    }),
    [t]
  );

  const headings = {
    1: [
      t('accountModal.step1.title', 'Choose an email provider'),
      t('accountModal.step1.subtitle', 'Select the email service that sends for this account.'),
    ],
    2: [
      t('accountModal.step2.title', 'Account details'),
      t('accountModal.step2.subtitle', 'Configure how emails appear to recipients.'),
    ],
    3: [
      t('accountModal.step3.title', 'Authentication'),
      t(
        'accountModal.step3.subtitle',
        'Enter your {provider} credentials. They are stored encrypted.',
        {
          provider: PROVIDER_LABELS[provider] ?? '',
        }
      ),
    ],
    4: [
      t('accountModal.step4.title', 'Configuration'),
      t('accountModal.step4.subtitle', 'Set rate limits and the priority of this account.'),
    ],
  };
  const StepIcon = STEP_ICONS[currentStep];
  const firstStep = isEditMode ? 2 : 1;

  const renderBody = () => {
    if (loadState === 'loading') {
      return (
        <Flex justifyContent="center" padding={8}>
          <Loader>{t('accountModal.loading', 'Loading account...')}</Loader>
        </Flex>
      );
    }
    if (loadState === 'error') {
      return (
        <Alert
          variant="danger"
          closeLabel={t('common.close', 'Close')}
          title={t('accountModal.loadError.title', 'The account could not be loaded')}
          action={
            <TertiaryButton size="S" onClick={() => setReloadKey((key) => key + 1)}>
              {t('accountModal.loadError.retry', 'Try again')}
            </TertiaryButton>
          }
        >
          {t(
            'accountModal.loadError.body',
            'Check your connection and permissions, then try again.'
          )}
        </Alert>
      );
    }

    return (
      <Flex direction="column" gap={0} alignItems="stretch">
        <StepHeader>
          <StepTitle tag="h3">
            <StepIcon aria-hidden="true" />
            {headings[currentStep][0]}
          </StepTitle>
          <StepSubtitle tag="p">{headings[currentStep][1]}</StepSubtitle>
        </StepHeader>

        <nav aria-label={t('accountModal.steps.label', 'Wizard progress')}>
          <StepperList>
            {STEPS.map((step) => {
              const completed = currentStep > step;
              const active = currentStep === step;
              const reachable = completed && step >= firstStep;
              return (
                <StepWrapper key={step} $completed={completed}>
                  <StepDot
                    type="button"
                    $active={active}
                    $completed={completed}
                    disabled={!reachable}
                    aria-current={active ? 'step' : undefined}
                    aria-label={
                      completed
                        ? t(
                            'accountModal.steps.completedLabel',
                            'Step {step}: {title}, completed',
                            { step, title: stepTitles[step] }
                          )
                        : t('accountModal.steps.stepLabel', 'Step {step}: {title}', {
                            step,
                            title: stepTitles[step],
                          })
                    }
                    onClick={() => reachable && setCurrentStep(step)}
                  >
                    {completed ? <Check aria-hidden="true" /> : step}
                  </StepDot>
                  <StepLabel tag="span" aria-hidden="true" $active={active} $completed={completed}>
                    {stepTitles[step]}
                  </StepLabel>
                </StepWrapper>
              );
            })}
          </StepperList>
        </nav>

        {currentStep === 1 && <ProviderStep provider={provider} onSelect={handleProviderSelect} />}
        {currentStep === 2 && (
          <DetailsStep
            provider={provider}
            form={formData}
            onChange={handleChange}
            isEditMode={isEditMode}
            originalName={originalName}
            referencingRuleCount={referencingRuleCount}
          />
        )}
        {currentStep === 3 && (
          <CredentialsStep
            provider={provider}
            form={formData}
            onChange={handleChange}
            isEditMode={isEditMode}
            credentialsUnreadable={credentialsUnreadable}
            isAuthorized={Boolean(authorization)}
            isStarting={oauth.isStarting}
            onConnect={startOAuth}
            serverRedirectUris={oauth.serverRedirectUris}
          />
        )}
        {currentStep === 4 && <SettingsStep form={formData} onChange={handleChange} />}
      </Flex>
    );
  };

  return (
    <>
      <Modal.Root
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) requestClose();
        }}
      >
        <Modal.Content size="XL">
          <Modal.Header closeLabel={t('common.close', 'Close')}>
            <Modal.Title variant="beta">
              <Flex tag="span" alignItems="center" gap={2}>
                <Star aria-hidden="true" />
                {isEditMode
                  ? t('accountModal.title.edit', 'Edit email account')
                  : t('accountModal.title.add', 'Add email account')}
              </Flex>
            </Modal.Title>
          </Modal.Header>

          <Modal.Body>{renderBody()}</Modal.Body>

          <Modal.Footer>
            <Flex justifyContent="space-between" gap={2} wrap="wrap" style={{ width: '100%' }}>
              <div>
                {currentStep > firstStep && loadState === 'idle' && (
                  <TertiaryButton
                    startIcon={<ArrowLeft />}
                    onClick={() => setCurrentStep(currentStep - 1)}
                    disabled={saving}
                  >
                    {t('accountModal.back', 'Back')}
                  </TertiaryButton>
                )}
              </div>
              <Flex gap={2} wrap="wrap">
                <TertiaryButton onClick={requestClose} disabled={saving}>
                  {t('common.cancel', 'Cancel')}
                </TertiaryButton>
                {currentStep < 4 ? (
                  <GradientButton
                    endIcon={<ArrowRight />}
                    onClick={() => setCurrentStep(currentStep + 1)}
                    disabled={!canProceed || loadState !== 'idle'}
                  >
                    {t('accountModal.continue', 'Continue')}
                  </GradientButton>
                ) : (
                  <GradientButton
                    onClick={handleSubmit}
                    loading={saving}
                    disabled={!canProceed || loadState !== 'idle'}
                    startIcon={<Check />}
                  >
                    {isEditMode
                      ? t('accountModal.submit.update', 'Update account')
                      : t('accountModal.submit.create', 'Create account')}
                  </GradientButton>
                )}
              </Flex>
            </Flex>
          </Modal.Footer>
        </Modal.Content>
      </Modal.Root>
      <UnsavedChangesDialog guard={discard} />
    </>
  );
};

export default AddAccountModal;

import { useMemo, useState } from 'react';
import { useFetchClient, useNotification } from '@strapi/strapi/admin';
import {
  Box,
  Flex,
  Typography,
  Modal,
  Field,
  TextInput,
  Textarea,
  NumberInput,
  Switch,
  SingleSelect,
  SingleSelectOption,
} from '@strapi/design-system';
import { CheckIcon, Cog6ToothIcon } from '@heroicons/react/24/outline';
import { GradientButton, TertiaryButton } from '../../components/StyledButtons';
import { UnsavedChangesDialog } from '../../components/shared/UnsavedChangesDialog';
import { useDiscardGuard } from '../../hooks/useUnsavedChangesGuard';
import { useMagicMailIntl } from '../../hooks/useMagicMailIntl';
import { ActiveSwitchBox, RuleModalHeading } from './styles';
import {
  MATCH_TYPES,
  PRIORITY_MAX,
  PRIORITY_MIN,
  buildAccountOptions,
  getInitialFormData,
  getMatchTypeLabel,
  isSameFormData,
  toRulePayload,
  validateRuleForm,
} from './ruleUtils';

/** Sentinel option value for "no fallback" (select options cannot be empty strings). */
const NO_FALLBACK = '__magic-mail-no-fallback__';

const MATCH_VALUE_PLACEHOLDERS = {
  emailType: 'marketing',
  recipient: '@vip-customers.com',
  subject: 'Invoice',
  template: 'welcome-email',
  custom: 'custom-value',
};

/**
 * Create / edit dialog for a routing rule.
 *
 * @param {object} props
 * @param {object|null} props.rule - rule to edit, or null to create
 * @param {Array<object>} props.accounts - accounts loaded by the page
 * @param {() => void} props.onClose
 * @param {() => void} props.onSave - refetch after a successful save
 * @param {boolean} props.canManage
 */
export const RuleModal = ({ rule, accounts, onClose, onSave, canManage }) => {
  const { post, put } = useFetchClient();
  const { toggleNotification } = useNotification();
  const { t } = useMagicMailIntl();
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState({});
  const isEditMode = Boolean(rule);

  const initialData = useMemo(() => getInitialFormData(rule), [rule]);
  const [formData, setFormData] = useState(initialData);
  const isDirty = !isSameFormData(formData, initialData);
  const discard = useDiscardGuard(isDirty && !saving);

  const errors = validateRuleForm(formData, accounts);
  const canSubmit = canManage && Object.keys(errors).length === 0;

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));
  };

  const requestClose = () => {
    if (saving) return;
    discard.runGuarded(onClose);
  };

  const handleSubmit = async () => {
    if (!canManage || !canSubmit || saving) return;
    setSaving(true);
    try {
      const payload = toRulePayload(formData);
      if (isEditMode) {
        await put(`/magic-mail/routing-rules/${rule.documentId || rule.id}`, payload);
        toggleNotification({
          type: 'success',
          message: t('routing.notify.updated', 'Routing rule updated'),
        });
      } else {
        await post('/magic-mail/routing-rules', payload);
        toggleNotification({
          type: 'success',
          message: t('routing.notify.created', 'Routing rule created'),
        });
      }
      onSave();
      onClose();
    } catch (err) {
      const serverMessage = err?.response?.data?.error?.message;
      toggleNotification({
        type: 'danger',
        message:
          typeof serverMessage === 'string' && serverMessage
            ? serverMessage
            : isEditMode
              ? t('routing.notify.updateFailed', 'The routing rule could not be updated.')
              : t('routing.notify.createFailed', 'The routing rule could not be created.'),
      });
    } finally {
      setSaving(false);
    }
  };

  const getMatchTypeHelp = () => {
    switch (formData.matchType) {
      case 'emailType':
        return t('routing.form.matchType.help.emailType', 'Match based on email type (e.g. "transactional", "marketing", "notification").');
      case 'recipient':
        return t('routing.form.matchType.help.recipient', 'Match if the recipient address contains this value (e.g. "@vip-customers.com").');
      case 'subject':
        return t('routing.form.matchType.help.subject', 'Match if the subject line contains this value (e.g. "Invoice", "Password Reset").');
      case 'template':
        return t('routing.form.matchType.help.template', 'Match if the email uses this template name (exact match).');
      case 'custom':
        return t('routing.form.matchType.help.custom', 'Match based on the custom field value passed in emailData.customField.');
      default:
        return '';
    }
  };

  /** Error text for a field; "required" only after the field was touched. */
  const fieldError = (field) => {
    const code = errors[field];
    if (!code) return undefined;
    if (code === 'required') {
      return touched[field] ? t('routing.form.error.required', 'This field is required.') : undefined;
    }
    switch (code) {
      case 'inactive':
        return t('routing.form.error.accountInactive', 'This account is inactive. Choose an active account.');
      case 'missing':
        return t('routing.form.error.accountMissing', 'This account no longer exists (renamed or deleted). Choose another account.');
      case 'sameAsTarget':
        return t('routing.form.error.sameAsTarget', 'The fallback account must differ from the target account.');
      case 'range':
        return t('routing.form.error.priorityRange', 'Enter a whole number from {min} to {max}.', {
          min: PRIORITY_MIN,
          max: PRIORITY_MAX,
        });
      default:
        return undefined;
    }
  };

  const accountOptionLabel = (option) => {
    const base = option.provider ? `${option.name} (${option.provider})` : option.name;
    if (option.status === 'inactive') {
      return t('routing.form.account.inactiveOption', '{account} - inactive', { account: base });
    }
    if (option.status === 'missing') {
      return t('routing.form.account.missingOption', '{account} - not found', { account: base });
    }
    return base;
  };

  const targetOptions = buildAccountOptions(accounts, formData.accountName);
  const fallbackOptions = buildAccountOptions(accounts, formData.fallbackAccountName, {
    exclude: formData.accountName,
  });

  const title = isEditMode
    ? t('routing.form.editTitle', 'Edit Routing Rule')
    : t('routing.form.createTitle', 'Create Routing Rule');

  return (
    <>
      <Modal.Root
        open={true}
        onOpenChange={(open) => {
          if (!open) requestClose();
        }}
      >
        <Modal.Content size="L">
          <Modal.Header>
            <Modal.Title>
              <RuleModalHeading tag="span" alignItems="center" gap={2}>
                <Cog6ToothIcon aria-hidden="true" />
                {title}
              </RuleModalHeading>
            </Modal.Title>
          </Modal.Header>

          <Modal.Body>
            <Box width="100%">
              <Flex direction="column" alignItems="stretch" gap={6} width="100%">
                {/* Rule Name */}
                <Field.Root name="name" required error={fieldError('name')} width="100%">
                  <Field.Label>{t('routing.form.name.label', 'Rule Name')}</Field.Label>
                  <TextInput
                    placeholder={t('routing.form.name.placeholder', 'Marketing emails via SendGrid')}
                    value={formData.name}
                    onChange={(e) => handleChange('name', e.target.value)}
                    maxLength={255}
                  />
                  <Field.Error />
                  <Field.Hint>{t('routing.form.name.hint', 'A descriptive name for this routing rule')}</Field.Hint>
                </Field.Root>

                {/* Description */}
                <Field.Root name="description" width="100%">
                  <Field.Label>{t('routing.form.description.label', 'Description (optional)')}</Field.Label>
                  <Textarea
                    placeholder={t(
                      'routing.form.description.placeholder',
                      'Route all marketing emails through SendGrid for better deliverability...'
                    )}
                    value={formData.description}
                    onChange={(e) => handleChange('description', e.target.value)}
                    rows={3}
                  />
                </Field.Root>

                {/* Match Type */}
                <Field.Root name="matchType" required error={fieldError('matchType')} width="100%">
                  <Field.Label>{t('routing.form.matchType.label', 'Match Type')}</Field.Label>
                  <SingleSelect
                    value={formData.matchType}
                    onChange={(value) => handleChange('matchType', value)}
                  >
                    {MATCH_TYPES.map((type) => (
                      <SingleSelectOption key={type} value={type}>
                        {getMatchTypeLabel(type, t)}
                      </SingleSelectOption>
                    ))}
                  </SingleSelect>
                  <Field.Error />
                  <Field.Hint>{getMatchTypeHelp()}</Field.Hint>
                </Field.Root>

                {/* Match Value */}
                <Field.Root name="matchValue" required error={fieldError('matchValue')} width="100%">
                  <Field.Label>{t('routing.form.matchValue.label', 'Match Value')}</Field.Label>
                  <TextInput
                    placeholder={MATCH_VALUE_PLACEHOLDERS[formData.matchType] ?? MATCH_VALUE_PLACEHOLDERS.custom}
                    value={formData.matchValue}
                    onChange={(e) => handleChange('matchValue', e.target.value)}
                  />
                  <Field.Error />
                  <Field.Hint>
                    {t(
                      'routing.form.matchValue.hint',
                      'The value to match against. Case-insensitive for recipient and subject.'
                    )}
                  </Field.Hint>
                </Field.Root>

                {/* Target Account */}
                <Field.Root name="accountName" required error={fieldError('accountName')} width="100%">
                  <Field.Label>{t('routing.form.account.label', 'Target Account')}</Field.Label>
                  <SingleSelect
                    value={formData.accountName || null}
                    placeholder={t('routing.form.account.placeholder', 'Select account...')}
                    onChange={(value) => handleChange('accountName', String(value))}
                  >
                    {targetOptions.map((option) => (
                      <SingleSelectOption key={option.value} value={option.value}>
                        {accountOptionLabel(option)}
                      </SingleSelectOption>
                    ))}
                  </SingleSelect>
                  <Field.Error />
                  <Field.Hint>
                    {targetOptions.length === 0
                      ? t('routing.form.account.noneActive', 'There is no active email account. Add or activate an account first.')
                      : t('routing.form.account.hint', 'The email account to use when this rule matches')}
                  </Field.Hint>
                </Field.Root>

                {/* Fallback Account */}
                <Field.Root name="fallbackAccountName" error={fieldError('fallbackAccountName')} width="100%">
                  <Field.Label>{t('routing.form.fallback.label', 'Fallback Account (optional)')}</Field.Label>
                  <SingleSelect
                    value={formData.fallbackAccountName || NO_FALLBACK}
                    onChange={(value) =>
                      handleChange('fallbackAccountName', value === NO_FALLBACK ? '' : String(value))
                    }
                  >
                    <SingleSelectOption value={NO_FALLBACK}>
                      {t('routing.form.fallback.none', 'No fallback')}
                    </SingleSelectOption>
                    {fallbackOptions.map((option) => (
                      <SingleSelectOption key={option.value} value={option.value}>
                        {accountOptionLabel(option)}
                      </SingleSelectOption>
                    ))}
                  </SingleSelect>
                  <Field.Error />
                  <Field.Hint>
                    {t(
                      'routing.form.fallback.hint',
                      'Use this account if the target account is unavailable or rate-limited'
                    )}
                  </Field.Hint>
                </Field.Root>

                {/* Priority */}
                <Field.Root name="priority" required error={fieldError('priority')} width="100%">
                  <Field.Label>{t('routing.form.priority.label', 'Rule Priority')}</Field.Label>
                  <NumberInput
                    value={formData.priority ?? undefined}
                    onValueChange={(value) => handleChange('priority', value ?? null)}
                    min={PRIORITY_MIN}
                    max={PRIORITY_MAX}
                    step={1}
                  />
                  <Field.Error />
                  <Field.Hint>
                    {t(
                      'routing.form.priority.hint',
                      'Rules are evaluated from the highest to the lowest priority ({min}-{max}); the first matching rule wins. Give more specific rules a higher priority.',
                      { min: PRIORITY_MIN, max: PRIORITY_MAX }
                    )}
                  </Field.Hint>
                </Field.Root>

                {/* Active Switch */}
                <ActiveSwitchBox
                  padding={4}
                  background="neutral100"
                  hasRadius
                  borderColor="neutral200"
                  borderStyle="solid"
                  borderWidth="1px"
                >
                  <Flex gap={3} alignItems="center" justifyContent="space-between">
                    <Box style={{ flex: 1, minWidth: 0 }}>
                      <Typography tag="p" fontWeight="semiBold">
                        {t('routing.form.active.label', 'Rule Active')}
                      </Typography>
                      <Typography variant="pi" tag="p" textColor="neutral600" marginTop={1}>
                        {formData.isActive
                          ? t('routing.form.active.on', 'This rule is active and will be used for email routing')
                          : t('routing.form.active.off', 'This rule is disabled and will be ignored')}
                      </Typography>
                    </Box>
                    <Box style={{ flexShrink: 0 }}>
                      <Switch
                        checked={formData.isActive}
                        onCheckedChange={(checked) => handleChange('isActive', checked)}
                        aria-label={t('routing.form.active.aria', 'Routing rule active')}
                        onLabel={t('routing.status.active', 'Active')}
                        offLabel={t('routing.status.inactive', 'Inactive')}
                        visibleLabels={false}
                      />
                    </Box>
                  </Flex>
                </ActiveSwitchBox>
              </Flex>
            </Box>
          </Modal.Body>

          <Modal.Footer>
            <Flex justifyContent="flex-end" gap={2} wrap="wrap" width="100%">
              <TertiaryButton onClick={requestClose} disabled={saving}>
                {t('common.cancel', 'Cancel')}
              </TertiaryButton>
              <GradientButton
                onClick={handleSubmit}
                loading={saving}
                disabled={!canSubmit}
                startIcon={<CheckIcon style={{ width: 16, height: 16 }} aria-hidden="true" />}
              >
                {isEditMode
                  ? t('routing.form.submit.update', 'Update Rule')
                  : t('routing.form.submit.create', 'Create Rule')}
              </GradientButton>
            </Flex>
          </Modal.Footer>
        </Modal.Content>
      </Modal.Root>
      <UnsavedChangesDialog guard={discard} />
    </>
  );
};

export default RuleModal;

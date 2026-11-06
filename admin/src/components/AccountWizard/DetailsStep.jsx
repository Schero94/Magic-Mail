import { Alert, Field, Flex, TextInput, Textarea, Typography } from '@strapi/design-system';
import { useMagicMailIntl } from '../../hooks/useMagicMailIntl';
import { isOptionalEmailAddressValid, isValidEmailAddress } from '../../utils/emailValidation.mjs';
import { FormSection, FullWidthField } from './styles';
import { OAUTH_PROVIDER_NAMES, isOAuthProvider } from './wizardState';

/**
 * Step 2: account name, sender and reply address, description.
 *
 * @param {object} props
 * @param {string} props.provider
 * @param {Record<string, any>} props.form
 * @param {(field: string, value: unknown) => void} props.onChange
 * @param {boolean} props.isEditMode
 * @param {string} props.originalName - stored name (edit mode)
 * @param {number|null} props.referencingRuleCount - routing rules that use the stored name
 */
export const DetailsStep = ({ provider, form, onChange, isEditMode, originalName, referencingRuleCount }) => {
  const { t } = useMagicMailIntl();
  const fromEmailInvalid = Boolean(form.fromEmail) && !isValidEmailAddress(form.fromEmail);
  const replyToInvalid = Boolean(form.replyTo) && !isOptionalEmailAddressValid(form.replyTo);
  const nameChanged = isEditMode && form.name.trim() !== '' && form.name.trim() !== originalName;
  const oauth = isOAuthProvider(provider);

  return (
    <FormSection>
      <Flex direction="column" gap={4} style={{ width: '100%' }} alignItems="stretch">
        <FullWidthField>
          <Field.Root required name="name">
            <Field.Label>{t('accountModal.details.name', 'Account name')}</Field.Label>
            <TextInput
              placeholder={t('accountModal.details.namePlaceholder', 'e.g. Company Gmail, Marketing SendGrid, Transactional Emails')}
              value={form.name}
              onChange={(e) => onChange('name', e.target.value)}
              autoComplete="off"
            />
            <Field.Hint>
              {t('accountModal.details.nameHint', 'Give this email account a unique, descriptive name so you can identify it later.')}
            </Field.Hint>
          </Field.Root>
        </FullWidthField>

        {nameChanged ? (
          <Alert variant="warning" closeLabel={t('common.close', 'Close')} title={t('accountModal.details.renameTitle', 'Renaming affects routing rules')}>
            {referencingRuleCount > 0
              ? t(
                  'accountModal.details.renameRules',
                  'Routing rules refer to "{name}" by name ({count, plural, one {# rule} other {# rules}}). Update them after renaming, otherwise routing falls back to the default account.',
                  { count: referencingRuleCount, name: originalName }
                )
              : t(
                  'accountModal.details.renameGeneric',
                  'Routing rules refer to accounts by name. Check the routing rules after renaming this account.'
                )}
          </Alert>
        ) : null}

        {oauth ? (
          <Alert variant="default" closeLabel={t('common.close', 'Close')} title={t('accountModal.details.oauthEmailTitle', 'Email address')}>
            <Typography variant="pi">
              {t(
                'accountModal.details.oauthEmailBody',
                'The sender address is retrieved from {provider} after authorization. You do not need to enter it.',
                { provider: OAUTH_PROVIDER_NAMES[provider] }
              )}
            </Typography>
          </Alert>
        ) : (
          <FullWidthField>
            <Field.Root
              required
              name="fromEmail"
              error={fromEmailInvalid ? t('accountModal.details.fromEmailInvalid', 'Enter a valid sender email address.') : undefined}
            >
              <Field.Label>{t('accountModal.details.fromEmail', 'From email address')}</Field.Label>
              <TextInput
                placeholder="noreply@company.com"
                type="email"
                value={form.fromEmail}
                onChange={(e) => onChange('fromEmail', e.target.value)}
                autoComplete="off"
              />
              <Field.Error />
              <Field.Hint>
                {t('accountModal.details.fromEmailHint', 'The address that appears as the sender in the recipients’ inbox.')}
              </Field.Hint>
            </Field.Root>
          </FullWidthField>
        )}

        <FullWidthField>
          <Field.Root name="fromName">
            <Field.Label>{t('accountModal.details.fromName', 'From display name')}</Field.Label>
            <TextInput
              placeholder={t('accountModal.details.fromNamePlaceholder', 'Company name')}
              value={form.fromName}
              onChange={(e) => onChange('fromName', e.target.value)}
              autoComplete="off"
            />
            <Field.Hint>
              {t('accountModal.details.fromNameHint', 'The friendly name shown next to the email address, e.g. "ACME Corp" instead of only "noreply@acme.com".')}
            </Field.Hint>
          </Field.Root>
        </FullWidthField>

        <FullWidthField>
          <Field.Root
            name="replyTo"
            error={replyToInvalid ? t('accountModal.details.replyToInvalid', 'Enter a valid Reply-To email address or leave the field empty.') : undefined}
          >
            <Field.Label>{t('accountModal.details.replyTo', 'Reply-To email address')}</Field.Label>
            <TextInput
              placeholder="support@company.com"
              type="email"
              value={form.replyTo}
              onChange={(e) => onChange('replyTo', e.target.value)}
              autoComplete="off"
            />
            <Field.Error />
            <Field.Hint>
              {t('accountModal.details.replyToHint', 'Replies from recipients go to this address. Leave it empty to use the sender address.')}
            </Field.Hint>
          </Field.Root>
        </FullWidthField>

        <FullWidthField>
          <Field.Root name="description">
            <Field.Label>{t('accountModal.details.description', 'Account description')}</Field.Label>
            <Textarea
              placeholder={t('accountModal.details.descriptionPlaceholder', 'What is this account used for? For example marketing campaigns, order confirmations or password resets.')}
              value={form.description}
              onChange={(e) => onChange('description', e.target.value)}
            />
            <Field.Hint>
              {t('accountModal.details.descriptionHint', 'Notes about the purpose of this account. Only visible to admins.')}
            </Field.Hint>
          </Field.Root>
        </FullWidthField>
      </Flex>
    </FormSection>
  );
};

export default DetailsStep;

import { Box, Divider, Field, Flex, NumberInput, Switch, Typography } from '@strapi/design-system';
import { useMagicMailIntl } from '../../hooks/useMagicMailIntl';
import { FormSection, SwitchCard } from './styles';
import { LIMIT_MAX, validateLimits } from './wizardState';
import { BounceMonitorFields } from './BounceMonitorFields';

const LABEL_STYLE = { fontSize: '15px' };

/**
 * Step 4: rate limits, priority, active and primary flags, bounce monitoring.
 *
 * @param {{
 *   form: Record<string, any>,
 *   onChange: (field: string, value: unknown) => void,
 *   provider?: string,
 *   accountId?: string|null,
 *   isEditMode?: boolean,
 *   onGrantRead?: () => void,
 * }} props
 */
export const SettingsStep = ({ form, onChange, provider, accountId, isEditMode, onGrantRead }) => {
  const { t } = useMagicMailIntl();
  const errors = validateLimits(form);
  const limitError = t(
    'accountModal.settings.limitInvalid',
    'Enter a whole number from 0 to {max}.',
    { max: LIMIT_MAX }
  );

  return (
    <FormSection>
      <Flex direction="column" gap={5} style={{ width: '100%' }} alignItems="stretch">
        <Field.Root
          hint={t(
            'accountModal.settings.dailyLimitHint',
            'Maximum number of emails this account can send per day. Set 0 for unlimited.'
          )}
          name="dailyLimit"
          error={errors.dailyLimit ? limitError : undefined}
        >
          <Field.Label style={LABEL_STYLE}>
            {t('accountModal.settings.dailyLimit', 'Daily email limit')}
          </Field.Label>
          <NumberInput
            value={form.dailyLimit}
            onValueChange={(value) => onChange('dailyLimit', value)}
            min={0}
            max={LIMIT_MAX}
            step={1}
          />
          <Field.Error />
          <Field.Hint />
        </Field.Root>

        <Field.Root
          hint={t(
            'accountModal.settings.hourlyLimitHint',
            'Maximum number of emails this account can send per hour. Set 0 for unlimited.'
          )}
          name="hourlyLimit"
          error={errors.hourlyLimit ? limitError : undefined}
        >
          <Field.Label style={LABEL_STYLE}>
            {t('accountModal.settings.hourlyLimit', 'Hourly email limit')}
          </Field.Label>
          <NumberInput
            value={form.hourlyLimit}
            onValueChange={(value) => onChange('hourlyLimit', value)}
            min={0}
            max={LIMIT_MAX}
            step={1}
          />
          <Field.Error />
          <Field.Hint />
        </Field.Root>

        <Field.Root
          hint={t(
            'accountModal.settings.priorityHint',
            'When routing emails, accounts with a higher priority (1-10) are preferred. Use 10 for your most reliable account.'
          )}
          name="priority"
          error={
            errors.priority
              ? t('accountModal.settings.priorityInvalid', 'Enter a whole number from 1 to 10.')
              : undefined
          }
        >
          <Field.Label style={LABEL_STYLE}>
            {t('accountModal.settings.priority', 'Account priority')}
          </Field.Label>
          <NumberInput
            value={form.priority}
            onValueChange={(value) => onChange('priority', value)}
            min={1}
            max={10}
            step={1}
          />
          <Field.Error />
          <Field.Hint />
        </Field.Root>

        <Divider />

        <SwitchCard
          padding={4}
          background="neutral100"
          hasRadius
          borderColor="neutral200"
          borderStyle="solid"
          borderWidth="1px"
        >
          <Flex gap={4} alignItems="center" justifyContent="space-between">
            <Box style={{ flex: 1, minWidth: 0 }}>
              <Typography
                fontWeight="semiBold"
                marginBottom={1}
                style={{ display: 'block', ...LABEL_STYLE }}
              >
                {t('accountModal.settings.active', 'Account active')}
              </Typography>
              <Typography
                variant="pi"
                textColor="neutral600"
                style={{ display: 'block', lineHeight: '1.6' }}
              >
                {form.isActive
                  ? t(
                      'accountModal.settings.activeOn',
                      'This account can send emails. Turn it off to pause sending without deleting the account.'
                    )
                  : t(
                      'accountModal.settings.activeOff',
                      'This account does not send emails until it is turned on again.'
                    )}
              </Typography>
            </Box>
            <Box style={{ flexShrink: 0 }}>
              <Switch
                checked={form.isActive}
                onCheckedChange={(checked) => onChange('isActive', checked)}
                aria-label={t('accountModal.settings.activeLabel', 'Account active')}
                onLabel={t('accountModal.switch.active', 'Active')}
                offLabel={t('accountModal.switch.inactive', 'Inactive')}
                visibleLabels={false}
              />
            </Box>
          </Flex>
        </SwitchCard>

        <SwitchCard
          padding={4}
          background="neutral100"
          hasRadius
          borderColor="neutral200"
          borderStyle="solid"
          borderWidth="1px"
        >
          <Flex gap={4} alignItems="center" justifyContent="space-between">
            <Box style={{ flex: 1, minWidth: 0 }}>
              <Typography
                fontWeight="semiBold"
                marginBottom={1}
                style={{ display: 'block', ...LABEL_STYLE }}
              >
                {t('accountModal.settings.primary', 'Set as primary account')}
              </Typography>
              <Typography
                variant="pi"
                textColor="neutral600"
                style={{ display: 'block', lineHeight: '1.6' }}
              >
                {t(
                  'accountModal.settings.primaryHint',
                  'Used by default when no routing rule selects an account. Only one account can be primary at a time.'
                )}
              </Typography>
            </Box>
            <Box style={{ flexShrink: 0 }}>
              <Switch
                checked={form.isPrimary}
                onCheckedChange={(checked) => onChange('isPrimary', checked)}
                aria-label={t('accountModal.settings.primaryLabel', 'Primary account')}
                onLabel={t('accountModal.switch.primary', 'Primary')}
                offLabel={t('accountModal.switch.notPrimary', 'Not primary')}
                visibleLabels={false}
              />
            </Box>
          </Flex>
        </SwitchCard>

        <BounceMonitorFields
          form={form}
          onChange={onChange}
          provider={provider}
          accountId={accountId}
          isEditMode={isEditMode}
          onGrantRead={onGrantRead}
        />
      </Flex>
    </FormSection>
  );
};

export default SettingsStep;

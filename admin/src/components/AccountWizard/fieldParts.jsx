import { Field, TextInput } from '@strapi/design-system';
import { useMagicMailIntl } from '../../hooks/useMagicMailIntl';
import { isMaskedSecret } from './wizardState';
import { ExternalAnchor, FullWidthField, InfoAlert } from './styles';

/**
 * Small building blocks shared by the provider credential sections of the
 * account wizard (CredentialsStep, ApiProviderFields, BounceMonitorFields).
 */

/**
 * External link that opens in a new tab and says so to screen readers.
 *
 * @param {{href: string, children: React.ReactNode, standalone?: boolean}} props
 */
export const ExternalLink = ({ href, children, standalone = false }) => {
  const { t } = useMagicMailIntl();
  return (
    <ExternalAnchor href={href} target="_blank" rel="noopener noreferrer" $standalone={standalone}>
      {children}
      <span
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
        }}
      >
        {` (${t('accountModal.guide.newTab', 'opens in a new tab')})`}
      </span>
    </ExternalAnchor>
  );
};

/**
 * Green notice about how a credential is protected.
 *
 * @param {{title: string, children: React.ReactNode}} props
 */
export const SecurityAlert = ({ title, children }) => {
  const { t } = useMagicMailIntl();
  return (
    <InfoAlert
      variant="success"
      title={title}
      marginBottom={4}
      closeLabel={t('common.close', 'Close')}
    >
      {children}
    </InfoAlert>
  );
};

/** Text input for a secret; explains how stored (masked) secrets are kept. */
export const SecretField = ({
  name,
  label,
  value,
  placeholder,
  hint,
  onChange,
  isEditMode,
  required = true,
}) => {
  const { t } = useMagicMailIntl();
  const masked = isEditMode && isMaskedSecret(value);
  return (
    <FullWidthField>
      <Field.Root
        hint={
          masked
            ? t(
                'accountModal.credentials.maskedHint',
                'A secret is stored. Leave this value unchanged to keep it, or enter a new one to replace it.'
              )
            : hint
        }
        required={required}
        name={name}
      >
        <Field.Label>{label}</Field.Label>
        <TextInput
          type="password"
          autoComplete="new-password"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <Field.Hint />
      </Field.Root>
    </FullWidthField>
  );
};

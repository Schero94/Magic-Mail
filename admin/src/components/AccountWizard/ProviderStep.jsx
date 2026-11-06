import { Box } from '@strapi/design-system';
import { Check, Cloud, Mail, Server } from '@strapi/icons';
import { useMagicMailIntl } from '../../hooks/useMagicMailIntl';
import {
  ProviderCard,
  ProviderCategoryHeader,
  ProviderCategoryHint,
  ProviderCategoryLabel,
  ProviderIcon,
  ProviderName,
  ProviderTagline,
  ProviderTextBlock,
  ProvidersGrid,
  SelectedBadge,
} from './styles';

const ICON_STYLE = { width: 26, height: 26 };

const ProviderTile = ({ value, selected, onSelect, icon, name, tagline }) => (
  <ProviderCard
    type="button"
    $selected={selected}
    aria-pressed={selected}
    onClick={() => onSelect(value)}
  >
    {selected ? (
      <SelectedBadge aria-hidden="true">
        <Check />
      </SelectedBadge>
    ) : null}
    {icon}
    <ProviderTextBlock>
      <ProviderName tag="span">{name}</ProviderName>
      <ProviderTagline tag="span">{tagline}</ProviderTagline>
    </ProviderTextBlock>
  </ProviderCard>
);

/**
 * Step 1: provider selection (OAuth providers and custom/transactional APIs).
 *
 * @param {{provider: string, onSelect: (provider: string) => void}} props
 */
export const ProviderStep = ({ provider, onSelect }) => {
  const { t } = useMagicMailIntl();

  const tile = (value, icon, name, tagline) => (
    <ProviderTile
      key={value}
      value={value}
      selected={provider === value}
      onSelect={onSelect}
      icon={icon}
      name={name}
      tagline={tagline}
    />
  );

  return (
    <Box>
      <ProviderCategoryHeader>
        <ProviderCategoryLabel tag="h3" id="mm-provider-oauth">
          {t('accountModal.providers.oauth', 'OAuth providers')}
        </ProviderCategoryLabel>
        <ProviderCategoryHint>
          {t('accountModal.providers.recommended', 'Recommended')}
        </ProviderCategoryHint>
      </ProviderCategoryHeader>
      <ProvidersGrid role="group" aria-labelledby="mm-provider-oauth">
        {tile(
          'gmail-oauth',
          <ProviderIcon
            $round
            $bgColor="rgba(66, 133, 244, 0.22)"
            $color="#4285F4"
            $shadowColor="rgba(66, 133, 244, 0.3)"
            aria-hidden="true"
          >
            G
          </ProviderIcon>,
          'Gmail',
          t(
            'accountModal.providers.gmailTagline',
            'Google Workspace and personal accounts · 1-click OAuth'
          )
        )}
        {tile(
          'microsoft-oauth',
          <ProviderIcon
            $round
            $bgColor="rgba(0, 164, 239, 0.22)"
            $color="#00A4EF"
            $shadowColor="rgba(0, 164, 239, 0.3)"
            aria-hidden="true"
          >
            M
          </ProviderIcon>,
          'Microsoft 365',
          t(
            'accountModal.providers.microsoftTagline',
            'Outlook · Exchange · Azure AD · 1-click OAuth'
          )
        )}
        {tile(
          'yahoo-oauth',
          <ProviderIcon
            $round
            $bgColor="rgba(96, 1, 210, 0.22)"
            $color="#9C6BF0"
            $shadowColor="rgba(96, 1, 210, 0.3)"
            aria-hidden="true"
          >
            Y
          </ProviderIcon>,
          'Yahoo Mail',
          t('accountModal.providers.yahooTagline', 'Yahoo and AOL accounts · 1-click OAuth')
        )}
      </ProvidersGrid>

      <ProviderCategoryHeader>
        <ProviderCategoryLabel tag="h3" id="mm-provider-custom">
          {t('accountModal.providers.custom', 'Custom and transactional APIs')}
        </ProviderCategoryLabel>
      </ProviderCategoryHeader>
      <ProvidersGrid role="group" aria-labelledby="mm-provider-custom">
        {tile(
          'smtp',
          <ProviderIcon
            $bgColor="rgba(73, 69, 255, 0.22)"
            $color="#7B78FF"
            $shadowColor="rgba(73, 69, 255, 0.3)"
            aria-hidden="true"
          >
            <Server style={ICON_STYLE} />
          </ProviderIcon>,
          'SMTP',
          t(
            'accountModal.providers.smtpTagline',
            'Any SMTP server · full control over host, port and authentication'
          )
        )}
        {tile(
          'sendgrid',
          <ProviderIcon
            $bgColor="rgba(30, 144, 255, 0.22)"
            $color="#4FA8FF"
            $shadowColor="rgba(30, 144, 255, 0.3)"
            aria-hidden="true"
          >
            <Cloud style={ICON_STYLE} />
          </ProviderIcon>,
          'SendGrid',
          t(
            'accountModal.providers.sendgridTagline',
            'Transactional API · high deliverability · analytics'
          )
        )}
        {tile(
          'mailgun',
          <ProviderIcon
            $bgColor="rgba(255, 107, 107, 0.22)"
            $color="#FF8A8A"
            $shadowColor="rgba(255, 107, 107, 0.3)"
            aria-hidden="true"
          >
            <Mail style={ICON_STYLE} />
          </ProviderIcon>,
          'Mailgun',
          t(
            'accountModal.providers.mailgunTagline',
            'Developer-first API · EU/US regions · routes and webhooks'
          )
        )}
      </ProvidersGrid>
    </Box>
  );
};

export default ProviderStep;

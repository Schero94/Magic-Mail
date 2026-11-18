import { useEffect, useState } from 'react';
import { useFetchClient } from '@strapi/strapi/admin';
import { useNavigate } from 'react-router-dom';
import { Box } from '@strapi/design-system';
import { TertiaryButton } from '../../../components/StyledButtons';
import { useMagicMailIntl } from '../../../hooks/useMagicMailIntl';
import { Notice } from './Notice';

const CORE_NAMES = {
  'reset-password': { id: 'templates.core.resetPassword.name', label: 'Reset password' },
  'email-confirmation': {
    id: 'templates.core.emailConfirmation.name',
    label: 'Email address confirmation',
  },
};

/**
 * Dashboard notice: a core email uses a provider template that is deleted or
 * has no active version, so those emails fail. Renders nothing otherwise, and
 * nothing without a SendGrid or Mailgun account (`enabled`).
 *
 * @param {{enabled: boolean}} props
 * @returns {import('react').ReactElement|null}
 */
export const CoreDesignAlert = ({ enabled }) => {
  const { t } = useMagicMailIntl();
  const { get } = useFetchClient();
  const navigate = useNavigate();
  const [designs, setDesigns] = useState(null);

  useEffect(() => {
    if (!enabled) return undefined;
    let ignore = false;
    get('/magic-mail/designer/core-designs')
      .then((response) => {
        if (!ignore) setDesigns(response?.data?.data ?? null);
      })
      .catch(() => {
        // No users-permissions template permission or no data: no notice.
        if (!ignore) setDesigns(null);
      });
    return () => {
      ignore = true;
    };
  }, [enabled, get]);

  const broken = Object.entries(designs ?? {}).filter(([, design]) => design?.usable === false);
  if (!enabled || broken.length === 0) return null;

  return (
    <Box marginBottom={6}>
      <Notice
        tone="danger"
        role="alert"
        title={t(
          'templates.coreDesign.staleTitle',
          'A core email uses a provider template that is not available'
        )}
        action={
          <TertiaryButton onClick={() => navigate('/plugins/magic-mail/designer')}>
            {t('templates.coreDesign.openTemplates', 'Open email templates')}
          </TertiaryButton>
        }
      >
        {t(
          'templates.coreDesign.staleBody',
          '{names}: these emails fail until the template is available again and synced, or until you switch back to the Magic Mail designer.',
          {
            names: broken
              .map(([type]) => t(CORE_NAMES[type]?.id ?? type, CORE_NAMES[type]?.label ?? type))
              .join(', '),
          }
        )}
      </Notice>
    </Box>
  );
};

export default CoreDesignAlert;

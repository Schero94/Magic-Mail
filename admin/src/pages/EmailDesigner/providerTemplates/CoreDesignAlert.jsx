import { useEffect, useState } from 'react';
import { useFetchClient } from '@strapi/strapi/admin';
import { useNavigate } from 'react-router-dom';
import { Box } from '@strapi/design-system';
import { TertiaryButton } from '../../../components/StyledButtons';
import { useMagicMailIntl } from '../../../hooks/useMagicMailIntl';
import { useFormatters } from '../../../hooks/useFormatters';
import { Notice } from './Notice';

const CORE_NAMES = {
  'reset-password': { id: 'templates.core.resetPassword.name', label: 'Reset password' },
  'email-confirmation': {
    id: 'templates.core.emailConfirmation.name',
    label: 'Email address confirmation',
  },
  'admin-forgot-password': {
    id: 'templates.core.adminForgotPassword.name',
    label: 'Admin password reset',
  },
};

/** Reason text per problem code of a core email design. */
export const CORE_DESIGN_PROBLEMS = {
  MAGIC_MAIL_PROVIDER_TEMPLATE_UNKNOWN: {
    id: 'templates.coreDesign.problem.unknown',
    label: 'not synced',
  },
  MAGIC_MAIL_PROVIDER_TEMPLATE_UNAVAILABLE: {
    id: 'templates.coreDesign.problem.unavailable',
    label: 'deleted or unpublished at the provider',
  },
  MAGIC_MAIL_PROVIDER_TEMPLATE_NO_SUBJECT: {
    id: 'templates.coreDesign.problem.noSubject',
    label: 'the Mailgun template has no Subject header',
  },
};

/**
 * Dashboard notice: a core email uses a provider template that is not synced,
 * deleted or has no active version, so those emails fail. Names each core
 * email with the reason (the same check the server runs after start) and the
 * time of the last check. Renders nothing otherwise, and nothing without a
 * provider-template account (`enabled`).
 *
 * @param {{enabled: boolean}} props
 * @returns {import('react').ReactElement|null}
 */
export const CoreDesignAlert = ({ enabled }) => {
  const { t } = useMagicMailIntl();
  const { formatDateTime } = useFormatters();
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

  const describe = ([type, design]) => {
    const name = t(CORE_NAMES[type]?.id ?? type, CORE_NAMES[type]?.label ?? type);
    const problem = CORE_DESIGN_PROBLEMS[design?.problem];
    return problem
      ? t('templates.coreDesign.problemItem', '{name} ({reason})', {
          name,
          reason: t(problem.id, problem.label),
        })
      : name;
  };
  const checkedAt = broken
    .map(([, design]) => design?.checkedAt)
    .filter((value) => typeof value === 'string' && !Number.isNaN(Date.parse(value)))
    .sort()
    .pop();

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
          { names: broken.map(describe).join(', ') }
        )}
        {checkedAt ? (
          <>
            {' '}
            {t('templates.coreDesign.checkedAt', 'Last checked: {date}.', {
              date: formatDateTime(checkedAt),
            })}
          </>
        ) : null}
      </Notice>
    </Box>
  );
};

export default CoreDesignAlert;

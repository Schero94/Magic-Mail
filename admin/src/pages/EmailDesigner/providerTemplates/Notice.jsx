import { Box, Flex, Typography } from '@strapi/design-system';
import { CheckCircle, Information, WarningCircle } from '@strapi/icons';

const TONES = {
  danger: { background: 'danger100', border: 'danger200', icon: 'danger600', Icon: WarningCircle },
  warning: {
    background: 'warning100',
    border: 'warning200',
    icon: 'warning600',
    Icon: WarningCircle,
  },
  info: { background: 'primary100', border: 'primary200', icon: 'primary600', Icon: Information },
  success: {
    background: 'success100',
    border: 'success200',
    icon: 'success600',
    Icon: CheckCircle,
  },
};

/**
 * Persistent inline notice (no close button, unlike the DS Alert, whose close
 * button is always rendered). Text stays neutral800 for contrast in both
 * themes; the tone is carried by the icon, the background and the title.
 *
 * @param {object} props
 * @param {'danger'|'warning'|'info'|'success'} [props.tone='info']
 * @param {string} [props.title]
 * @param {import('react').ReactNode} props.children
 * @param {import('react').ReactNode} [props.action] - Optional button under the text
 * @param {'alert'|'status'|'note'} [props.role='note']
 * @returns {import('react').ReactElement}
 */
export const Notice = ({ tone = 'info', title, children, action, role = 'note' }) => {
  const style = TONES[tone] ?? TONES.info;
  const Icon = style.Icon;
  return (
    <Box role={role} background={style.background} borderColor={style.border} hasRadius padding={4}>
      <Flex gap={3} alignItems="flex-start">
        <Box paddingTop={1} style={{ flexShrink: 0 }}>
          <Icon aria-hidden="true" fill={style.icon} width="1.6rem" height="1.6rem" />
        </Box>
        <Flex direction="column" alignItems="flex-start" gap={1} style={{ minWidth: 0 }}>
          {title ? (
            <Typography variant="omega" fontWeight="bold" textColor="neutral800">
              {title}
            </Typography>
          ) : null}
          <Typography variant="omega" textColor="neutral800">
            {children}
          </Typography>
          {action ? <Box paddingTop={2}>{action}</Box> : null}
        </Flex>
      </Flex>
    </Box>
  );
};

export default Notice;

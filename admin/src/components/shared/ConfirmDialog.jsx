import { useEffect, useRef, useState } from 'react';
import { Dialog, Flex, Typography } from '@strapi/design-system';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { DangerButton, GradientButton, TertiaryButton } from '../StyledButtons';
import { useMagicMailIntl } from '../../hooks/useMagicMailIntl';
import { accent } from '../../utils/theme';
import styled from 'styled-components';

const WarningIcon = styled(ExclamationTriangleIcon)`
  width: 24px;
  height: 24px;
  color: ${(p) => (p.$danger ? accent.danger(p) : accent.warning(p))};
`;

/**
 * Accessible confirmation dialog (DS 2 alert dialog) in the MagicMail look.
 * Replaces window.confirm(): it follows dark mode, is translated, traps focus
 * and announces its title and description to screen readers.
 *
 *   <ConfirmDialog
 *     isOpen={pendingDelete !== null}
 *     title={t('accounts.delete.title', 'Delete account?')}
 *     description={t('accounts.delete.body', 'Delete "{name}"? This cannot be undone.', { name })}
 *     confirmLabel={t('common.delete', 'Delete')}
 *     onConfirm={async () => { await removeAccount(id); setPendingDelete(null); }}
 *     onClose={() => setPendingDelete(null)}
 *   />
 *
 * While the promise returned by onConfirm is pending, both buttons are
 * disabled, the confirm button shows a spinner and Esc/overlay do not close.
 *
 * @param {object} props
 * @param {boolean} props.isOpen
 * @param {() => void} props.onClose - called on Cancel, Esc and overlay click
 * @param {() => (void|Promise<unknown>)} props.onConfirm
 * @param {React.ReactNode} props.title
 * @param {React.ReactNode} [props.description] - main sentence (read as the dialog description)
 * @param {React.ReactNode} [props.children] - extra body content below the description
 * @param {string} [props.confirmLabel]
 * @param {string} [props.cancelLabel]
 * @param {'danger'|'default'} [props.variant='danger']
 * @param {boolean} [props.isLoading] - external loading flag (optional)
 * @param {React.ReactNode} [props.confirmIcon]
 */
export const ConfirmDialog = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  children,
  confirmLabel,
  cancelLabel,
  variant = 'danger',
  isLoading = false,
  confirmIcon,
}) => {
  const { t } = useMagicMailIntl();
  const [isPending, setIsPending] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const busy = isLoading || isPending;
  const danger = variant === 'danger';
  const ConfirmButton = danger ? DangerButton : GradientButton;

  const handleConfirm = async () => {
    if (busy) return;
    const result = onConfirm?.();
    if (result && typeof result.then === 'function') {
      setIsPending(true);
      try {
        await result;
      } catch {
        // The caller reports errors (notification); keep the dialog usable.
      } finally {
        if (mounted.current) setIsPending(false);
      }
    }
  };

  const handleOpenChange = (open) => {
    if (!open && !busy) onClose?.();
  };

  return (
    <Dialog.Root open={Boolean(isOpen)} onOpenChange={handleOpenChange}>
      <Dialog.Content>
        <Dialog.Header>{title}</Dialog.Header>
        <Dialog.Body icon={<WarningIcon aria-hidden="true" $danger={danger} />}>
          <Flex direction="column" gap={2} width="100%" alignItems="stretch">
            {description ? (
              <Dialog.Description textAlign="center">{description}</Dialog.Description>
            ) : null}
            {typeof children === 'string' ? (
              <Typography variant="pi" textColor="neutral600" textAlign="center">
                {children}
              </Typography>
            ) : (
              children
            )}
          </Flex>
        </Dialog.Body>
        <Dialog.Footer>
          <TertiaryButton fullWidth onClick={() => onClose?.()} disabled={busy}>
            {cancelLabel ?? t('common.cancel', 'Cancel')}
          </TertiaryButton>
          <ConfirmButton
            fullWidth
            onClick={handleConfirm}
            loading={busy}
            startIcon={busy ? undefined : confirmIcon}
          >
            {confirmLabel ??
              (danger ? t('common.delete', 'Delete') : t('common.confirm', 'Confirm'))}
          </ConfirmButton>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Root>
  );
};

export default ConfirmDialog;

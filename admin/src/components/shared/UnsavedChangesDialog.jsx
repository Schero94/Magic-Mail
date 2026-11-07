import { ConfirmDialog } from './ConfirmDialog';
import { useMagicMailIntl } from '../../hooks/useMagicMailIntl';

/**
 * Confirmation shown by useUnsavedChangesGuard / useDiscardGuard.
 *
 * @param {object} props
 * @param {{isOpen: boolean, confirm: () => void, cancel: () => void}} props.guard
 * @param {string} [props.title]
 * @param {string} [props.description]
 * @param {string} [props.confirmLabel]
 */
export const UnsavedChangesDialog = ({ guard, title, description, confirmLabel }) => {
  const { t } = useMagicMailIntl();

  return (
    <ConfirmDialog
      isOpen={guard.isOpen}
      onClose={guard.cancel}
      onConfirm={guard.confirm}
      title={title ?? t('common.unsaved.title', 'Discard unsaved changes?')}
      description={
        description ??
        t(
          'common.unsaved.description',
          'You have unsaved changes. If you continue, they will be lost.'
        )
      }
      confirmLabel={confirmLabel ?? t('common.unsaved.confirm', 'Discard changes')}
      cancelLabel={t('common.unsaved.cancel', 'Keep editing')}
    />
  );
};

export default UnsavedChangesDialog;

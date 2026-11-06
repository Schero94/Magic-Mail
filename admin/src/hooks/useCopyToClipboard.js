import { useCallback } from 'react';
import { useNotification } from '@strapi/strapi/admin';
import { copyToClipboard } from '../components/shared/clipboard';
import { useMagicMailIntl } from './useMagicMailIntl';

/**
 * Copy helper that shows a success or failure toast based on the real result.
 *
 *   const copy = useCopyToClipboard();
 *   await copy(snippet);                                   // generic messages
 *   await copy(redirectUri, { success: t('accountModal.redirectCopied', 'Redirect URI copied') });
 *
 * @returns {(text: string, messages?: {success?: string, failure?: string}) => Promise<boolean>}
 */
export const useCopyToClipboard = () => {
  const { toggleNotification } = useNotification();
  const { t } = useMagicMailIntl();

  return useCallback(
    async (text, messages = {}) => {
      const copied = await copyToClipboard(text);
      toggleNotification({
        type: copied ? 'success' : 'warning',
        message: copied
          ? messages.success ?? t('common.clipboard.copied', 'Copied to clipboard')
          : messages.failure ??
            t('common.clipboard.failed', 'Copy failed. Select the text and copy it manually.'),
      });
      return copied;
    },
    [t, toggleNotification]
  );
};

export default useCopyToClipboard;

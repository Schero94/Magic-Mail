import { useCallback } from 'react';
import { useIntl } from 'react-intl';
import { getTranslation } from '../utils/getTranslation';

/**
 * Translation helper for MagicMail views.
 *
 *   const { t } = useMagicMailIntl();
 *   t('accounts.title', 'Email Accounts');
 *   t('accounts.deleteConfirm', 'Delete "{name}"?', { name: account.name });
 *
 * Keys are written without the plugin prefix; the runtime id becomes
 * "magic-mail.<key>". The default message is the English text and is shown
 * when a locale has no entry for the key.
 *
 * @returns {{t: (key: string, defaultMessage: string, values?: object) => string, formatMessage: Function, locale: string}}
 */
export const useMagicMailIntl = () => {
  const intl = useIntl();
  const t = useCallback(
    (key, defaultMessage, values) =>
      intl.formatMessage({ id: getTranslation(key), defaultMessage }, values),
    [intl]
  );
  return { t, formatMessage: intl.formatMessage, locale: intl.locale };
};

export default useMagicMailIntl;

import pluginId from '../pluginId';

/**
 * Builds the full react-intl message id for a MagicMail translation key.
 * Translation files store keys without the prefix ("accounts.title");
 * registerTrads prefixes them, so the runtime id is "magic-mail.accounts.title".
 *
 * @param {string} key - key as written in admin/src/translations/<locale>.json
 * @returns {string}
 */
export const getTranslation = (key) => `${pluginId}.${key}`;

/**
 * Prefixes every key of a translation file with the plugin id.
 * @param {Record<string, string>} data
 * @param {string} [prefix]
 * @returns {Record<string, string>}
 */
export const prefixPluginTranslations = (data, prefix = pluginId) => {
  const prefixed = {};
  for (const [key, value] of Object.entries(data ?? {})) {
    if (typeof value === 'string') prefixed[`${prefix}.${key}`] = value;
  }
  return prefixed;
};

export default getTranslation;

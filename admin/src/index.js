import pluginPkg from '../../package.json';
import pluginId from './pluginId';
import Initializer from './components/Initializer';
import PluginIcon from './components/PluginIcon';
import pluginPermissions from './permissions';
import { getTranslation, prefixPluginTranslations } from './utils/getTranslation';

const name = pluginPkg.strapi.name;

/**
 * Loads one locale file. Missing locales resolve to an empty map so the
 * English defaultMessage values are shown instead.
 * @param {string} locale
 */
const loadLocale = async (locale) => {
  try {
    const { default: data } = await import(`./translations/${locale}.json`);
    return { data: prefixPluginTranslations(data, pluginId), locale };
  } catch {
    return { data: {}, locale };
  }
};

export default {
  register(app) {
    app.addMenuLink({
      to: `plugins/${pluginId}`,
      icon: PluginIcon,
      intlLabel: {
        id: getTranslation('plugin.name'),
        defaultMessage: 'MagicMail',
      },
      Component: () => import('./pages/App'),
      permissions: pluginPermissions.access,
    });

    // Settings section - paths are relative to /settings (no /settings/ prefix)
    app.createSettingSection(
      {
        intlLabel: { id: getTranslation('plugin.settings.section'), defaultMessage: 'MagicMail' },
        id: pluginId,
        to: pluginId,
      },
      [
        {
          intlLabel: {
            id: getTranslation('plugin.settings.pluginSettings'),
            defaultMessage: 'Plugin Settings',
          },
          id: 'plugin-settings',
          to: `${pluginId}/plugin-settings`,
          Component: () => import('./pages/PluginSettings'),
          permissions: pluginPermissions.read,
        },
      ]
    );

    app.registerPlugin({
      id: pluginId,
      initializer: Initializer,
      isReady: true,
      name,
    });
  },

  async registerTrads({ locales }) {
    return Promise.all(locales.map(loadLocale));
  },
};

import pluginPkg from '../../package.json';
import pluginId from './pluginId';
import Initializer from './components/Initializer';
import PluginIcon from './components/PluginIcon';

const name = pluginPkg.strapi.name;

// Prefix translation keys with pluginId (required for Strapi)
const prefixPluginTranslations = (data, pluginId) => {
  const prefixed = {};
  Object.keys(data).forEach((key) => {
    prefixed[`${pluginId}.${key}`] = data[key];
  });
  return prefixed;
};

export default {
  register(app) {
    // Menu link - path should be relative to root (no leading slash)
    app.addMenuLink({
      to: `plugins/${pluginId}`,
      icon: PluginIcon,
      intlLabel: {
        id: `${pluginId}.plugin.name`,
        defaultMessage: 'MagicMail',
      },
      Component: () => import('./pages/App'),
    });

    // Settings section - paths should be relative to /settings (no /settings/ prefix)
    app.createSettingSection(
      {
        intlLabel: { id: `${pluginId}.settings.section`, defaultMessage: 'MagicMail' },
        id: pluginId,
        to: pluginId,
      },
      [
        {
          intlLabel: {
            id: `${pluginId}.settings.upgrade`,
            defaultMessage: 'Upgrade',
          },
          id: 'upgrade',
          to: `${pluginId}/upgrade`,
          Component: () => import('./pages/LicensePage'),
        },
        {
          intlLabel: {
            id: `${pluginId}.settings.license`,
            defaultMessage: 'License Details',
          },
          id: 'license',
          to: `${pluginId}/license`,
          Component: () => import('./pages/Settings'),
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
    const importedTrads = await Promise.all(
      locales.map((locale) => {
        return import(`./translations/${locale}.json`)
          .then(({ default: data }) => {
            return {
              data: prefixPluginTranslations(data, pluginId),
              locale,
            };
          })
          .catch(() => {
            return {
              data: {},
              locale,
            };
          });
      })
    );

    return Promise.resolve(importedTrads);
  },
};

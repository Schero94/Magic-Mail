import pluginPkg from '../../package.json';
import pluginId from './pluginId';
import Initializer from './components/Initializer';
import PluginIcon from './components/PluginIcon';

const name = pluginPkg.strapi.name;

export default {
  register(app) {
    app.addMenuLink({
      to: `/plugins/${pluginId}`,
      icon: PluginIcon,
      intlLabel: {
        id: `${pluginId}.plugin.name`,
        defaultMessage: 'MagicMail',
      },
      Component: () => import('./pages/App'),
    });

    // Add Settings section
    app.createSettingSection(
      {
        intlLabel: { id: `${pluginId}.settings.section`, defaultMessage: 'MagicMail' },
        id: pluginId,
        to: `/settings/${pluginId}`,
      },
      [
        {
          intlLabel: {
            id: `${pluginId}.settings.upgrade`,
            defaultMessage: 'Upgrade',
          },
          id: 'upgrade',
          to: `/settings/${pluginId}/upgrade`,
          Component: () => import('./pages/LicensePage'),
        },
        {
          intlLabel: {
            id: `${pluginId}.settings.license`,
            defaultMessage: 'License Details',
          },
          id: 'license',
          to: `/settings/${pluginId}/license`,
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
    const importedTrads = {
      en: () => import('./translations/en.json'),
      de: () => import('./translations/de.json'),
      es: () => import('./translations/es.json'),
      fr: () => import('./translations/fr.json'),
      pt: () => import('./translations/pt.json'),
    };

    const translatedLanguages = Object.keys(importedTrads).filter((lang) =>
      locales.includes(lang)
    );

    const translations = await Promise.all(
      translatedLanguages.map((language) =>
        importedTrads[language]()
          .then(({ default: data }) => ({
            data: data,
            locale: language,
          }))
          .catch(() => ({
            data: {},
            locale: language,
          }))
      )
    );

    return Promise.resolve(translations);
  },
};

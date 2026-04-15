"use strict";
const React = require("react");
const admin = require("@strapi/strapi/admin");
const jsxRuntime = require("react/jsx-runtime");
const outline = require("@heroicons/react/24/outline");
const __variableDynamicImportRuntimeHelper = (glob, path, segs) => {
  const v = glob[path];
  if (v) {
    return typeof v === "function" ? v() : Promise.resolve(v);
  }
  return new Promise((_, reject) => {
    (typeof queueMicrotask === "function" ? queueMicrotask : setTimeout)(
      reject.bind(
        null,
        new Error(
          "Unknown variable dynamic import: " + path + (path.split("/").length !== segs ? ". Note that variables only represent file names one level deep." : "")
        )
      )
    );
  });
};
const strapi = {
  name: "magic-mail"
};
const pluginPkg = {
  strapi
};
const pluginId = "magic-mail";
const Initializer = ({ setPlugin }) => {
  const ref = React.useRef(setPlugin);
  const { get } = admin.useFetchClient();
  React.useEffect(() => {
    ref.current(pluginId);
  }, []);
  React.useEffect(() => {
    const HEARTBEAT_INTERVAL = 4 * 60 * 1e3;
    const heartbeat = async () => {
      try {
        await get(`/${pluginId}/license/status`);
      } catch (error) {
      }
    };
    const initialTimeout = setTimeout(heartbeat, 60 * 1e3);
    const interval = setInterval(heartbeat, HEARTBEAT_INTERVAL);
    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [get]);
  return null;
};
const PluginIcon = () => /* @__PURE__ */ jsxRuntime.jsx(outline.EnvelopeIcon, { style: { width: 24, height: 24 } });
const name = pluginPkg.strapi.name;
const prefixPluginTranslations = (data, pluginId2) => {
  const prefixed = {};
  Object.keys(data).forEach((key) => {
    prefixed[`${pluginId2}.${key}`] = data[key];
  });
  return prefixed;
};
const index = {
  register(app) {
    const pluginPermissions = [{ action: `plugin::${pluginId}.access`, subject: null }];
    app.addMenuLink({
      to: `plugins/${pluginId}`,
      icon: PluginIcon,
      intlLabel: {
        id: `${pluginId}.plugin.name`,
        defaultMessage: "MagicMail"
      },
      Component: () => Promise.resolve().then(() => require("../_chunks/App-DQ1MrJnt.js")),
      permissions: pluginPermissions
    });
    app.createSettingSection(
      {
        intlLabel: { id: `${pluginId}.settings.section`, defaultMessage: "MagicMail" },
        id: pluginId,
        to: pluginId
      },
      [
        {
          intlLabel: {
            id: `${pluginId}.settings.plugin-settings`,
            defaultMessage: "Plugin Settings"
          },
          id: "plugin-settings",
          to: `${pluginId}/plugin-settings`,
          Component: () => Promise.resolve().then(() => require("../_chunks/PluginSettings-cZXE_vy8.js")),
          permissions: pluginPermissions
        },
        {
          intlLabel: {
            id: `${pluginId}.settings.upgrade`,
            defaultMessage: "Upgrade"
          },
          id: "upgrade",
          to: `${pluginId}/upgrade`,
          Component: () => Promise.resolve().then(() => require("../_chunks/LicensePage-sB-xDRL9.js")),
          permissions: pluginPermissions
        },
        {
          intlLabel: {
            id: `${pluginId}.settings.license`,
            defaultMessage: "License Details"
          },
          id: "license",
          to: `${pluginId}/license`,
          Component: () => Promise.resolve().then(() => require("../_chunks/Settings-BRFoD1yZ.js")),
          permissions: pluginPermissions
        }
      ]
    );
    app.registerPlugin({
      id: pluginId,
      initializer: Initializer,
      isReady: true,
      name
    });
  },
  async registerTrads({ locales }) {
    const importedTrads = await Promise.all(
      locales.map((locale) => {
        return __variableDynamicImportRuntimeHelper(/* @__PURE__ */ Object.assign({ "./translations/de.json": () => Promise.resolve().then(() => require("../_chunks/de-CF2ItE3Z.js")), "./translations/en.json": () => Promise.resolve().then(() => require("../_chunks/en-CK6UpShS.js")), "./translations/es.json": () => Promise.resolve().then(() => require("../_chunks/es-BpV1MIdm.js")), "./translations/fr.json": () => Promise.resolve().then(() => require("../_chunks/fr-vpziIpRp.js")), "./translations/pt.json": () => Promise.resolve().then(() => require("../_chunks/pt-ODpAhDNa.js")) }), `./translations/${locale}.json`, 3).then(({ default: data }) => {
          return {
            data: prefixPluginTranslations(data, pluginId),
            locale
          };
        }).catch(() => {
          return {
            data: {},
            locale
          };
        });
      })
    );
    return Promise.resolve(importedTrads);
  }
};
module.exports = index;

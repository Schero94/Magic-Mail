import { useRef, useEffect } from "react";
import { useFetchClient } from "@strapi/strapi/admin";
import { jsx } from "react/jsx-runtime";
import { EnvelopeIcon } from "@heroicons/react/24/outline";
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
  const ref = useRef(setPlugin);
  const { get } = useFetchClient();
  useEffect(() => {
    ref.current(pluginId);
  }, []);
  useEffect(() => {
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
const PluginIcon = () => /* @__PURE__ */ jsx(EnvelopeIcon, { style: { width: 24, height: 24 } });
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
      Component: () => import("../_chunks/App-CDFT2wYy.mjs"),
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
          Component: () => import("../_chunks/PluginSettings-XwyzH95_.mjs"),
          permissions: pluginPermissions
        },
        {
          intlLabel: {
            id: `${pluginId}.settings.upgrade`,
            defaultMessage: "Upgrade"
          },
          id: "upgrade",
          to: `${pluginId}/upgrade`,
          Component: () => import("../_chunks/LicensePage-B61HnhyD.mjs"),
          permissions: pluginPermissions
        },
        {
          intlLabel: {
            id: `${pluginId}.settings.license`,
            defaultMessage: "License Details"
          },
          id: "license",
          to: `${pluginId}/license`,
          Component: () => import("../_chunks/Settings-DoSrZKfp.mjs"),
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
        return __variableDynamicImportRuntimeHelper(/* @__PURE__ */ Object.assign({ "./translations/de.json": () => import("../_chunks/de-CwbYw2jT.mjs"), "./translations/en.json": () => import("../_chunks/en-ZRmfU4qX.mjs"), "./translations/es.json": () => import("../_chunks/es-DQHwzPpP.mjs"), "./translations/fr.json": () => import("../_chunks/fr-BG1WfEVm.mjs"), "./translations/pt.json": () => import("../_chunks/pt-CMoGrOib.mjs") }), `./translations/${locale}.json`, 3).then(({ default: data }) => {
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
export {
  index as default
};

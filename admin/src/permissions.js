const pluginId = 'magic-mail';

const pluginPermissions = {
  access: [{ action: `plugin::${pluginId}.access`, subject: null }],
};

export default pluginPermissions;

const pluginId = 'magic-mail';

const pluginPermissions = {
  access: [{ action: `plugin::${pluginId}.access`, subject: null }],
  read: [{ action: `plugin::${pluginId}.read`, subject: null }],
  manage: [{ action: `plugin::${pluginId}.manage`, subject: null }],
  testSend: [{ action: `plugin::${pluginId}.test-send`, subject: null }],
};

export default pluginPermissions;

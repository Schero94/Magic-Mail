'use strict';

const controller = require('./controller');
const accounts = require('./accounts');
const oauth = require('./oauth');
const routingRules = require('./routing-rules');
const emailDesigner = require('./email-designer');
const analytics = require('./analytics');
const whatsapp = require('./whatsapp');
const pluginSettings = require('./plugin-settings');

module.exports = {
  controller,
  accounts,
  oauth,
  routingRules,
  emailDesigner,
  analytics,
  whatsapp,
  pluginSettings,
};

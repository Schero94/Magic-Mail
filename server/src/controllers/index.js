'use strict';

const controller = require('./controller');
const accounts = require('./accounts');
const oauth = require('./oauth');
const routingRules = require('./routing-rules');
const license = require('./license');
const emailDesigner = require('./email-designer');
const analytics = require('./analytics');
const test = require('./test');
const whatsapp = require('./whatsapp');
const pluginSettings = require('./plugin-settings');

module.exports = {
  controller,
  accounts,
  oauth,
  routingRules,
  license,
  emailDesigner,
  analytics,
  test,
  whatsapp,
  pluginSettings,
};

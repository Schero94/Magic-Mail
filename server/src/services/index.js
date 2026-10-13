'use strict';

const emailRouter = require('./email-router');
const accountManager = require('./account-manager');
const oauth = require('./oauth');
const emailDesigner = require('./email-designer');
const analytics = require('./analytics');
const pluginSettings = require('./plugin-settings');

module.exports = {
  'email-router': emailRouter,
  'account-manager': accountManager,
  oauth,
  'email-designer': emailDesigner,
  analytics,
  'plugin-settings': pluginSettings,
};

'use strict';

const emailRouter = require('./email-router');
const accountManager = require('./account-manager');
const oauth = require('./oauth');
const licenseGuard = require('./license-guard');
const emailDesigner = require('./email-designer');
const analytics = require('./analytics');
const whatsapp = require('./whatsapp');
const pluginSettings = require('./plugin-settings');

module.exports = {
  'email-router': emailRouter,
  'account-manager': accountManager,
  oauth,
  'license-guard': licenseGuard,
  'email-designer': emailDesigner,
  analytics,
  whatsapp,
  'plugin-settings': pluginSettings,
};

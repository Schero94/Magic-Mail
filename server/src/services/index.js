'use strict';

const emailRouter = require('./email-router');
const accountManager = require('./account-manager');
const oauth = require('./oauth');
const emailDesigner = require('./email-designer');
const analytics = require('./analytics');
const pluginSettings = require('./plugin-settings');
const deliveryWebhooks = require('./delivery-webhooks');
const queue = require('./queue');
const bounceMonitor = require('./bounce-monitor');

module.exports = {
  'email-router': emailRouter,
  'account-manager': accountManager,
  oauth,
  'email-designer': emailDesigner,
  analytics,
  'plugin-settings': pluginSettings,
  'delivery-webhooks': deliveryWebhooks,
  queue,
  'bounce-monitor': bounceMonitor,
};

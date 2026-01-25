'use strict';

const emailAccount = require('./email-account/schema.json');
const routingRule = require('./routing-rule/schema.json');
const emailLog = require('./email-log/schema.json');
const emailEvent = require('./email-event/schema.json');
const emailLink = require('./email-link/schema.json');
const emailTemplate = require('./email-template/schema.json');
const emailTemplateVersion = require('./email-template-version/schema.json');
const pluginSettings = require('./plugin-settings/schema.json');

module.exports = {
  'email-account': {
    schema: emailAccount,
  },
  'routing-rule': {
    schema: routingRule,
  },
  'email-log': {
    schema: emailLog,
  },
  'email-event': {
    schema: emailEvent,
  },
  'email-link': {
    schema: emailLink,
  },
  'email-template': {
    schema: emailTemplate,
  },
  'email-template-version': {
    schema: emailTemplateVersion,
  },
  'plugin-settings': {
    schema: pluginSettings,
  },
};

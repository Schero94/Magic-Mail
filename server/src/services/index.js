'use strict';

const emailRouter = require('./email-router');
const accountManager = require('./account-manager');
const oauth = require('./oauth');
const licenseGuard = require('./license-guard');
const emailDesigner = require('./email-designer');
const analytics = require('./analytics');

module.exports = {
  'email-router': emailRouter,
  'account-manager': accountManager,
  oauth,
  'license-guard': licenseGuard,
  'email-designer': emailDesigner,
  analytics,
};

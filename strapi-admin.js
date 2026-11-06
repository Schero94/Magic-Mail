'use strict';

// Legacy entry kept for tools that resolve the package root file instead of the
// exports map. Strapi 5 itself loads ./strapi-admin through package.json exports.
module.exports = require('./dist/admin/index.js');

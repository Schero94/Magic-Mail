'use strict';

// Legacy entry kept for tools that resolve the package root file instead of the
// exports map. Strapi 5 itself loads ./strapi-server through package.json exports.
module.exports = require('./dist/server/index.js');

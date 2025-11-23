'use strict';

const admin = require('./admin');
const contentApi = require('./content-api');

module.exports = {
  admin,
  'content-api': contentApi,
};

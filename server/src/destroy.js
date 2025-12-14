'use strict';

const { createLogger } = require('./utils/logger');

module.exports = ({ strapi }) => {
  const log = createLogger(strapi);
  
  // Cleanup intervals
  if (global.magicMailIntervals) {
    if (global.magicMailIntervals.hourly) {
      clearInterval(global.magicMailIntervals.hourly);
      log.info('Cleared hourly reset interval');
    }
    if (global.magicMailIntervals.daily) {
      clearInterval(global.magicMailIntervals.daily);
      log.info('Cleared daily reset interval');
    }
  }

  // Cleanup license guard ping interval
  if (strapi.licenseGuardMagicMail && strapi.licenseGuardMagicMail.pingInterval) {
    clearInterval(strapi.licenseGuardMagicMail.pingInterval);
    log.info('Cleared license ping interval');
  }

  log.info('👋 Plugin destroyed gracefully');
};

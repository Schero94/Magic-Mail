'use strict';

module.exports = ({ strapi }) => {
  // Cleanup intervals
  if (global.magicMailIntervals) {
    if (global.magicMailIntervals.hourly) {
      clearInterval(global.magicMailIntervals.hourly);
      strapi.log.info('[magic-mail] Cleared hourly reset interval');
    }
    if (global.magicMailIntervals.daily) {
      clearInterval(global.magicMailIntervals.daily);
      strapi.log.info('[magic-mail] Cleared daily reset interval');
    }
  }

  // Cleanup license guard ping interval
  if (strapi.licenseGuardMagicMail && strapi.licenseGuardMagicMail.pingInterval) {
    clearInterval(strapi.licenseGuardMagicMail.pingInterval);
    strapi.log.info('[magic-mail] Cleared license ping interval');
  }

  strapi.log.info('[magic-mail] 👋 Plugin destroyed gracefully');
};

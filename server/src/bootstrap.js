'use strict';

const { createLogger } = require('./utils/logger');

/**
 * Bootstrap: Initialize MagicMail plugin
 * Sets up email account counter resets and health checks
 * OVERRIDES Strapi's native email service with MagicMail router
 */

module.exports = async ({ strapi }) => {
  const log = createLogger(strapi);
  
  log.info('[BOOTSTRAP] Starting...');

  try {
    // Initialize License Guard
    const licenseGuardService = strapi.plugin('magic-mail').service('license-guard');
    
    // Wait a bit for all services to be ready
    setTimeout(async () => {
      try {
        const licenseStatus = await licenseGuardService.initialize();
        
        if (!licenseStatus.valid && licenseStatus.demo) {
          log.error('╔════════════════════════════════════════════════════════════════╗');
          log.error('║  [ERROR] MAGICMAIL - NO VALID LICENSE                         ║');
          log.error('║                                                                ║');
          log.error('║  This plugin requires a valid license to operate.             ║');
          log.error('║  Please activate your license via Admin UI:                   ║');
          log.error('║  Go to MagicMail -> License tab                               ║');
          log.error('║                                                                ║');
          log.error('║  Click "Generate Free License" to get started!                ║');
          log.error('╚════════════════════════════════════════════════════════════════╝');
        } else if (licenseStatus.gracePeriod) {
          log.warn('[WARNING] Running on grace period (license server unreachable)');
        }
      } catch (err) {
        log.error('[ERROR] License initialization failed:', err.message);
      }
    }, 2000);

    const accountManager = strapi.plugin('magic-mail').service('account-manager');
    const emailRouter = strapi.plugin('magic-mail').service('email-router');

    // ============================================================
    // OVERRIDE STRAPI'S NATIVE EMAIL SERVICE
    // ============================================================
    
    // Try to get email service (support both v4 and v5 APIs)
    const originalEmailService = strapi.plugin('email')?.service?.('email') || 
                                  strapi.plugins?.email?.services?.email;
    
    if (originalEmailService && originalEmailService.send) {
      const originalSend = originalEmailService.send.bind(originalEmailService);
      
      // Override the send method
      originalEmailService.send = async (emailData) => {
        log.info('[EMAIL] Intercepted from native Strapi service');
        log.debug('Email data:', {
          to: emailData.to,
          subject: emailData.subject,
          templateId: emailData.templateId,
          hasHtml: !!emailData.html,
          hasText: !!emailData.text,
        });
        
        try {
          // Map 'data' to 'templateData' for backward compatibility
          if (emailData.data && !emailData.templateData) {
            emailData.templateData = emailData.data;
          }
          
          // Route through MagicMail
          const result = await emailRouter.send(emailData);
          
          log.info('[SUCCESS] Email routed successfully through MagicMail');
          return result;
        } catch (magicMailError) {
          log.warn('[WARNING] MagicMail routing failed, falling back to original service');
          log.error('Error:', magicMailError.message);
          
          // Fallback to original Strapi email service
          return await originalSend(emailData);
        }
      };
      
      log.info('[SUCCESS] Native email service overridden!');
      log.info('[INFO] All strapi.plugins.email.services.email.send() calls will route through MagicMail');
    } else {
      log.warn('[WARNING] Native email service not found - MagicMail will work standalone');
      log.warn('[INFO] Make sure @strapi/plugin-email is installed');
    }

    // ============================================================
    // COUNTER RESET SCHEDULES
    // ============================================================

    // Reset hourly counters every hour
    const hourlyResetInterval = setInterval(async () => {
      try {
        if (!strapi || !strapi.plugin) {
          strapi.log.warn('[magic-mail] Strapi not available for hourly reset');
          return;
        }
        const accountMgr = strapi.plugin('magic-mail').service('account-manager');
        await accountMgr.resetCounters('hourly');
        log.info('[RESET] Hourly counters reset');
      } catch (err) {
        strapi.log.error('[magic-mail] Hourly reset error:', err.message);
      }
    }, 60 * 60 * 1000); // Every hour
    
    // Store interval for cleanup
    if (!global.magicMailIntervals) global.magicMailIntervals = {};
    global.magicMailIntervals.hourly = hourlyResetInterval;

    // Reset daily counters at midnight
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
    const msUntilMidnight = midnight - now;

    setTimeout(async () => {
      try {
        if (!strapi || !strapi.plugin) {
          strapi.log.warn('[magic-mail] Strapi not available for daily reset');
          return;
        }
        const accountMgr = strapi.plugin('magic-mail').service('account-manager');
        await accountMgr.resetCounters('daily');
        log.info('[RESET] Daily counters reset');

        // Then set daily interval
        const dailyResetInterval = setInterval(async () => {
          try {
            if (!strapi || !strapi.plugin) {
              strapi.log.warn('[magic-mail] Strapi not available for daily reset');
              return;
            }
            const accountMgr = strapi.plugin('magic-mail').service('account-manager');
            await accountMgr.resetCounters('daily');
            log.info('[RESET] Daily counters reset');
          } catch (err) {
            strapi.log.error('[magic-mail] Daily reset error:', err.message);
          }
        }, 24 * 60 * 60 * 1000); // Every 24 hours
        
        // Store interval for cleanup
        global.magicMailIntervals.daily = dailyResetInterval;
      } catch (err) {
        strapi.log.error('[magic-mail] Initial daily reset error:', err.message);
      }
    }, msUntilMidnight);

    log.info('[SUCCESS] Counter reset schedules initialized');
    log.info('[SUCCESS] Bootstrap complete');
  } catch (err) {
    log.error('[ERROR] Bootstrap error:', err);
  }
};

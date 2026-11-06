'use strict';

const SETTINGS_UID = 'plugin::magic-mail.plugin-settings';

/** How long a loaded settings row is reused (per process). */
const CACHE_TTL_MS = 10_000;

const DEFAULT_SETTINGS = Object.freeze({
  enableLinkTracking: true,
  enableOpenTracking: true,
  trackingBaseUrl: null,
  defaultFromName: null,
  defaultFromEmail: null,
  unsubscribeUrl: null,
  enableUnsubscribeHeader: true,
  trackingFallbackUrl: null,
});

/**
 * Plugin Settings Service
 *
 * The settings single type is read on every send. Reads are cached for a few
 * seconds (invalidated by updateSettings on this instance), the default row
 * is created by at most one caller per process, and duplicate rows left by
 * concurrent first sends (pre-4.0) are removed so every read sees the same
 * row (FUN-27).
 */
module.exports = ({ strapi }) => {
  let cache = null;
  let cacheExpiresAt = 0;
  let creating = null;
  let duplicatesChecked = false;

  const documents = () => strapi.documents(SETTINGS_UID);

  /** Loads the oldest settings row (stable choice when duplicates exist). */
  const findCurrent = async () => documents().findFirst({ sort: [{ id: 'asc' }] });

  /**
   * Deletes every settings row except the oldest one.
   *
   * @returns {Promise<void>}
   */
  const removeDuplicates = async () => {
    const docs = documents();
    if (typeof docs.findMany !== 'function') return;
    const rows = await docs.findMany({ sort: [{ id: 'asc' }], fields: ['documentId'] });
    if (!Array.isArray(rows) || rows.length <= 1) return;
    for (const row of rows.slice(1)) {
      await docs.delete({ documentId: row.documentId });
    }
    strapi.log.warn(`[magic-mail] [SETTINGS] Removed ${rows.length - 1} duplicate settings row(s)`);
  };

  /**
   * Returns the settings row, creating the defaults once if none exists.
   *
   * @returns {Promise<object>}
   */
  const loadOrCreate = async () => {
    const existing = await findCurrent();
    if (existing) {
      if (!duplicatesChecked) {
        duplicatesChecked = true;
        await removeDuplicates();
      }
      return existing;
    }

    if (!creating) {
      creating = (async () => {
        try {
          const again = await findCurrent();
          if (again) return again;
          const created = await documents().create({ data: { ...DEFAULT_SETTINGS } });
          strapi.log.info('[magic-mail] [SETTINGS] Created default plugin settings');
          // Another instance may have created a row at the same time.
          await removeDuplicates();
          duplicatesChecked = true;
          return (await findCurrent()) || created;
        } finally {
          creating = null;
        }
      })();
    }
    return creating;
  };

  return {
    /**
     * Get plugin settings (creates the default row if none exists).
     *
     * @returns {Promise<Object>} Plugin settings
     */
    async getSettings() {
      const now = Date.now();
      if (cache && now < cacheExpiresAt) return { ...cache };
      try {
        const settings = await loadOrCreate();
        cache = settings;
        cacheExpiresAt = Date.now() + CACHE_TTL_MS;
        return { ...settings };
      } catch (error) {
        strapi.log.error(
          `[magic-mail] [SETTINGS] Error getting settings: ${error?.name || 'Error'}`
        );
        // Defaults keep sending working; they are not cached.
        return { ...DEFAULT_SETTINGS };
      }
    },

    /**
     * Partially updates the settings. Only keys present in `data` are
     * written, so toggling one switch never clears other fields.
     *
     * @param {Object} data - Validated settings
     * @returns {Promise<Object>} Updated settings
     */
    async updateSettings(data) {
      const trimToNull = (value) => (typeof value === 'string' ? value.trim() || null : value);
      const sanitizedData = { ...data };
      if ('trackingBaseUrl' in data)
        sanitizedData.trackingBaseUrl = trimToNull(data.trackingBaseUrl);
      if ('defaultFromName' in data)
        sanitizedData.defaultFromName = trimToNull(data.defaultFromName);
      if ('defaultFromEmail' in data) {
        const email = trimToNull(data.defaultFromEmail);
        sanitizedData.defaultFromEmail = email ? email.toLowerCase() : null;
      }
      if ('unsubscribeUrl' in data) sanitizedData.unsubscribeUrl = trimToNull(data.unsubscribeUrl);
      if ('trackingFallbackUrl' in data)
        sanitizedData.trackingFallbackUrl = trimToNull(data.trackingFallbackUrl);

      cache = null;
      try {
        const current = await loadOrCreate();
        const settings = await documents().update({
          documentId: current.documentId,
          data: sanitizedData,
        });
        strapi.log.info('[magic-mail] [SETTINGS] Updated plugin settings');
        return settings;
      } catch (error) {
        strapi.log.error(
          `[magic-mail] [SETTINGS] Error updating settings: ${error?.name || 'Error'}`
        );
        throw error;
      } finally {
        cache = null;
      }
    },

    /** Drops the cached settings (tests, external writers). */
    clearCache() {
      cache = null;
      cacheExpiresAt = 0;
    },
  };
};

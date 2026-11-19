'use strict';

/**
 * In-memory Strapi double for provider-template tests: documents for
 * accounts, provider templates and local templates, a plugin store, the real
 * email-router, provider-templates and email-designer services, and fake
 * analytics/settings services. No database: coordination falls back to
 * in-process locks and the plain plugin store.
 */

const quietLog = { debug() {}, info() {}, warn() {}, error() {} };

const SERVICE_PATHS = {
  'email-router': '../../server/src/services/email-router',
  'provider-templates': '../../server/src/services/provider-templates',
  'email-designer': '../../server/src/services/email-designer',
};

/**
 * Applies the filter subset the plugin uses ($in, $notIn, $eq, plain values).
 *
 * @param {object} row
 * @param {object} filters
 * @returns {boolean}
 */
function matches(row, filters = {}) {
  return Object.entries(filters).every(([field, condition]) => {
    const value = row[field];
    if (condition && typeof condition === 'object' && !Array.isArray(condition)) {
      if (condition.$in && !condition.$in.includes(value)) return false;
      if (condition.$notIn && condition.$notIn.includes(value)) return false;
      if ('$eq' in condition && value !== condition.$eq) return false;
      if (condition.$eqi && String(value).toLowerCase() !== String(condition.$eqi).toLowerCase())
        return false;
      return true;
    }
    return value === condition;
  });
}

/**
 * @param {{accounts?: object[], localTemplates?: object[], log?: object, emailPlugin?: object,
 *   usersPermissions?: object, config?: Record<string, unknown>, db?: object}} [options]
 *   `config` answers strapi.config.get(key); `db` becomes strapi.db
 * @returns {{strapi: object, tables: object, logs: object[], store: Map, service: Function}}
 */
function createStrapi({
  accounts = [],
  localTemplates = [],
  log = quietLog,
  emailPlugin = null,
  usersPermissions = null,
  config = {},
  db = null,
} = {}) {
  let counter = 0;
  const nextId = () => `doc${(counter += 1)}`;
  const tables = {
    'plugin::magic-mail.email-account': accounts.map((a) => ({ ...a })),
    'plugin::magic-mail.provider-template': [],
    'plugin::magic-mail.email-template': localTemplates.map((t) => ({ ...t })),
    'plugin::magic-mail.routing-rule': [],
    'plugin::magic-mail.email-template-version': [],
  };
  const logs = [];
  const logUpdates = [];
  const store = new Map();
  const services = {};
  const events = [];

  const strapi = {
    log,
    magicMail: {},
    config: {
      get: (key, fallback) => (Object.hasOwn(config, key) ? config[key] : fallback),
    },
    ...(db ? { db } : {}),
    eventHub: { emit: (name, payload) => events.push({ name, payload }) },
    store: async ({ type, name }) => ({
      get: async ({ key }) => {
        const value = store.get(`${type}_${name}_${key}`);
        return value === undefined ? null : JSON.parse(JSON.stringify(value));
      },
      set: async ({ key, value }) => {
        store.set(`${type}_${name}_${key}`, JSON.parse(JSON.stringify(value)));
      },
    }),
    documents(uid) {
      const table = tables[uid] || (tables[uid] = []);
      return {
        findMany: async ({ filters = {}, sort, limit } = {}) => {
          let list = table.filter((row) => matches(row, filters));
          if (Array.isArray(sort) && sort[0]?.priority === 'desc') {
            list = [...list].sort((a, b) => (b.priority || 0) - (a.priority || 0));
          }
          return limit ? list.slice(0, limit) : list;
        },
        findOne: async ({ documentId }) =>
          table.find((row) => row.documentId === documentId) || null,
        findFirst: async ({ filters = {} } = {}) =>
          table.find((row) => matches(row, filters)) || null,
        create: async ({ data }) => {
          const row = {
            id: counter + 1,
            documentId: nextId(),
            ...JSON.parse(JSON.stringify(data)),
          };
          table.push(row);
          return row;
        },
        update: async ({ documentId, data }) => {
          const row = table.find((r) => r.documentId === documentId);
          if (!row) return null;
          Object.assign(row, JSON.parse(JSON.stringify(data)));
          logUpdates.push({ uid, documentId, data });
          return row;
        },
        delete: async ({ documentId }) => {
          const index = table.findIndex((r) => r.documentId === documentId);
          if (index >= 0) table.splice(index, 1);
          return {};
        },
        count: async ({ filters = {} } = {}) => table.filter((row) => matches(row, filters)).length,
      };
    },
    plugin(name) {
      if (name === 'email') return emailPlugin;
      if (name === 'users-permissions') return usersPermissions;
      if (name !== 'magic-mail') return null;
      return { service: (serviceName) => services[serviceName] };
    },
  };

  services['plugin-settings'] = { getSettings: async () => ({}) };
  services.analytics = {
    createEmailLog: async (data) => {
      const entry = {
        // Alphanumeric like a real Strapi documentId (sent as magicmail_id).
        documentId: `logdoc${logs.length + 1}`,
        emailId: `email${logs.length + 1}`,
        data,
      };
      logs.push(entry);
      return entry;
    },
    updateEmailLog: async () => {},
    generateRecipientHash: () => 'hash',
    injectTrackingPixel: (html) => html,
    rewriteLinksForTracking: async (html) => html,
    buildSystemMergeTags: () => ({
      date: '2026-11-17',
      year: '2026',
      unsubscribe: '',
      webview: '',
    }),
  };
  for (const [serviceName, path] of Object.entries(SERVICE_PATHS)) {
    delete require.cache[require.resolve(path)];
    services[serviceName] = require(path)({ strapi });
  }
  const designer = services['email-designer'];
  designer.findByReferenceId = async (id) =>
    tables['plugin::magic-mail.email-template'].find(
      (t) => String(t.templateReferenceId) === String(id)
    ) || null;
  designer.findOne = designer.findByReferenceId;
  designer.snapshotVersion = async () => {};
  const router = services['email-router'];
  router.updateAccountStats = async () => {};
  router.reserveQuota = async () => 'unlimited';
  router.releaseQuota = async () => {};
  router.markLog = async (emailLog, fields, info) => {
    logUpdates.push({ uid: 'log', fields, info });
  };
  router.queueService = () => null;

  return {
    strapi,
    tables,
    logs,
    logUpdates,
    store,
    events,
    service: (serviceName) => services[serviceName],
  };
}

module.exports = { createStrapi, quietLog };

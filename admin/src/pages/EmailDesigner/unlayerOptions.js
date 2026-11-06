/**
 * Hardened configuration for the Unlayer visual editor (react-email-editor).
 *
 * Security and privacy defaults (SUP-01, SUP-02, UI-26):
 * - The loader script URL is explicit and the editor bundle is pinned to an
 *   exact version, so a new Unlayer release cannot change the admin silently.
 * - No Unlayer projectId unless the operator configures one.
 * - No Unlayer image hosting: uploads go to the Strapi Media Library through
 *   the registered `image` callback (see uploadImageToMediaLibrary).
 * - No stock images, AI assistant, hosted image editor or "preview in browser"
 *   (they call third-party services), no Google Fonts preload and no
 *   third-party placeholder image.
 *
 * Operators can override projectId / scriptUrl / version through
 * GET /magic-mail/designer/editor-config (see sanitizeEditorConfig).
 */

/** Unlayer loader used by react-email-editor 2.1.x (same URL, made explicit). */
export const UNLAYER_SCRIPT_URL = 'https://editor.unlayer.com/embed.js?2';

/** Exact Unlayer editor build, matches the @unlayer/types version we test against. */
export const UNLAYER_EDITOR_VERSION = '1.524.0';

/** Neutral inline placeholder for new image blocks (no external request). */
export const PLACEHOLDER_IMAGE_URL =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="350" viewBox="0 0 600 350">' +
      '<rect width="600" height="350" fill="#eaeaef"/>' +
      '<path d="M250 215l40-50 30 36 20-24 40 38z" fill="#a5a5ba"/>' +
      '<circle cx="265" cy="145" r="14" fill="#a5a5ba"/>' +
      '</svg>'
  );

export const DEFAULT_EDITOR_CONFIG = Object.freeze({
  projectId: null,
  scriptUrl: UNLAYER_SCRIPT_URL,
  version: UNLAYER_EDITOR_VERSION,
  systemMergeTags: false,
});

const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

/**
 * Accepts only well-formed operator settings and falls back to the defaults.
 *
 * @param {unknown} raw - `data` of GET /magic-mail/designer/editor-config
 * @returns {{projectId: number|null, scriptUrl: string, version: string, systemMergeTags: boolean}}
 */
export const sanitizeEditorConfig = (raw) => {
  const source = raw && typeof raw === 'object' ? raw : {};
  const projectId =
    Number.isSafeInteger(source.projectId) && source.projectId > 0 ? source.projectId : null;

  let scriptUrl = UNLAYER_SCRIPT_URL;
  if (typeof source.scriptUrl === 'string') {
    try {
      const url = new URL(source.scriptUrl);
      if (url.protocol === 'https:' && !url.username && !url.password) scriptUrl = url.href;
    } catch {
      // keep the default
    }
  }

  const version =
    typeof source.version === 'string' && VERSION_PATTERN.test(source.version)
      ? source.version
      : UNLAYER_EDITOR_VERSION;

  return { projectId, scriptUrl, version, systemMergeTags: source.systemMergeTags === true };
};

const UNLAYER_LOCALES = {
  de: 'de-DE',
  en: 'en-US',
  es: 'es-ES',
  fr: 'fr-FR',
  pt: 'pt-BR',
};

/**
 * Maps the admin locale (e.g. "de", "pt-BR") to an Unlayer locale.
 * @param {string} locale
 * @returns {string}
 */
export const toUnlayerLocale = (locale) => {
  const value = String(locale ?? 'en');
  if (/^[a-z]{2}-[A-Z]{2}$/.test(value)) return value;
  return UNLAYER_LOCALES[value.slice(0, 2).toLowerCase()] ?? 'en-US';
};

const mergeTag = (name, value, sample) => ({ name, value, sample });

/**
 * Builds the options object passed to <EmailEditor options={...}>.
 * react-email-editor recreates the editor whenever these options change, so
 * callers compute them once per editor mount.
 *
 * @param {object} params
 * @param {{projectId: number|null, version: string, systemMergeTags: boolean}} params.config
 * @param {boolean} params.isDark
 * @param {string} params.locale
 * @param {(key: string, fallback: string) => string} params.t
 * @returns {object}
 */
export const buildUnlayerOptions = ({ config, isDark, locale, t }) => {
  const label = typeof t === 'function' ? t : (_key, fallback) => fallback;
  const settings = config ?? DEFAULT_EDITOR_CONFIG;

  const mergeTags = {
    user: {
      name: label('editor.mergeTags.user', 'User'),
      mergeTags: {
        firstName: mergeTag(label('editor.mergeTags.firstName', 'First name'), '{{user.firstName}}', 'John'),
        lastName: mergeTag(label('editor.mergeTags.lastName', 'Last name'), '{{user.lastName}}', 'Doe'),
        email: mergeTag(label('editor.mergeTags.email', 'Email'), '{{user.email}}', 'john@example.com'),
        username: mergeTag(label('editor.mergeTags.username', 'Username'), '{{user.username}}', 'johndoe'),
      },
    },
    company: {
      name: label('editor.mergeTags.company', 'Company'),
      mergeTags: {
        name: mergeTag(label('editor.mergeTags.companyName', 'Name'), '{{company.name}}', 'ACME Corp'),
        url: mergeTag(label('editor.mergeTags.website', 'Website'), '{{company.url}}', 'https://acme.example'),
        address: mergeTag(label('editor.mergeTags.address', 'Address'), '{{company.address}}', '123 Main St, City'),
      },
    },
    order: {
      name: label('editor.mergeTags.order', 'Order'),
      mergeTags: {
        number: mergeTag(label('editor.mergeTags.orderNumber', 'Number'), '{{order.number}}', '#12345'),
        total: mergeTag(label('editor.mergeTags.orderTotal', 'Total'), '{{order.total}}', '199.99'),
        date: mergeTag(label('editor.mergeTags.orderDate', 'Date'), '{{order.date}}', '2024-01-15'),
        status: mergeTag(label('editor.mergeTags.orderStatus', 'Status'), '{{order.status}}', 'Shipped'),
      },
    },
  };

  const options = {
    displayMode: 'email',
    version: settings.version || UNLAYER_EDITOR_VERSION,
    locale: toUnlayerLocale(locale),
    safeHtml: true,
    mergeTagsConfig: {
      autocompleteTriggerChar: '@',
      sort: false,
      delimiter: ['{{', '}}'],
    },
    appearance: {
      theme: isDark ? 'modern_dark' : 'modern_light',
      panels: { tools: { dock: 'left' } },
    },
    features: {
      preview: true,
      previewInBrowser: false,
      stockImages: false,
      imageEditor: false,
      ai: false,
      userUploads: true,
      textEditor: {
        spellChecker: true,
        tables: true,
        cleanPaste: true,
      },
    },
    fonts: { showDefaultFonts: true },
    tools: {
      image: {
        properties: {
          src: { value: { url: PLACEHOLDER_IMAGE_URL, width: 600, height: 350 } },
        },
      },
    },
    mergeTags,
    customCSS: [
      '.blockbuilder-content-email { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }',
    ],
    validator: {
      enabled: true,
      rules: { maxImageSize: 1024 * 1024 },
    },
  };

  // {{system.*}} values exist only when the server provides them.
  if (settings.systemMergeTags) {
    mergeTags.system = {
      name: label('editor.mergeTags.system', 'System'),
      mergeTags: {
        date: mergeTag(label('editor.mergeTags.currentDate', 'Current date'), '{{system.date}}', '2026-01-01'),
        year: mergeTag(label('editor.mergeTags.currentYear', 'Current year'), '{{system.year}}', '2026'),
        unsubscribe: mergeTag(
          label('editor.mergeTags.unsubscribe', 'Unsubscribe link'),
          '{{system.unsubscribe}}',
          'https://example.com/unsubscribe'
        ),
      },
    };
    options.specialLinks = {
      unsubscribe: {
        enabled: true,
        text: label('editor.specialLinks.unsubscribe', 'Unsubscribe'),
        href: '{{system.unsubscribe}}',
      },
    };
  }

  if (settings.projectId) options.projectId = settings.projectId;

  return options;
};

/**
 * Makes a Media Library URL absolute so it works inside sent emails.
 * @param {string} url
 * @param {string} base
 * @returns {string|null}
 */
export const toAbsoluteMediaUrl = (url, base) => {
  if (typeof url !== 'string' || !url) return null;
  try {
    const resolved = new URL(url, base);
    return resolved.protocol === 'http:' || resolved.protocol === 'https:' ? resolved.href : null;
  } catch {
    return null;
  }
};

/**
 * Unlayer `image` callback that stores uploads in the Strapi Media Library
 * (POST /upload with the admin fetch client) instead of Unlayer's hosting.
 *
 * @param {object} params
 * @param {(url: string, body: FormData) => Promise<{data: unknown}>} params.post
 * @param {string} params.baseUrl
 * @param {string} params.failureMessage
 * @returns {(file: {attachments?: File[]}, done: (result: object) => void) => Promise<void>}
 */
export const createMediaLibraryUploader = ({ post, baseUrl, failureMessage }) => async (file, done) => {
  const attachment = file?.attachments?.[0];
  if (!attachment) {
    done({ abort: true });
    return;
  }
  try {
    done({ progress: 10 });
    const body = new FormData();
    body.append('files', attachment);
    const response = await post('/upload', body);
    const uploaded = Array.isArray(response?.data) ? response.data[0] : response?.data?.[0] ?? response?.data;
    const url = toAbsoluteMediaUrl(uploaded?.url, baseUrl);
    if (!url) throw new Error('missing url');
    done({ progress: 100, url });
  } catch {
    done({ error: failureMessage });
  }
};

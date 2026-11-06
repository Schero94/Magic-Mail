/**
 * Pure helpers for the template editor (payloads, validation, core designs).
 */
import { toPositiveTemplateId } from './templateListUtils';

// Standard design used for core emails that have no Unlayer design yet.
const STANDARD_EMAIL_TEMPLATE = {
  counters: { u_row: 2, u_content_text: 1, u_content_image: 1, u_column: 2 },
  body: {
    values: {
      backgroundColor: '#ffffff',
      linkStyle: {
        body: true,
        linkHoverColor: '#0000ee',
        linkHoverUnderline: true,
        linkColor: '#0000ee',
        linkUnderline: true,
      },
      contentWidth: '500px',
      backgroundImage: { repeat: false, center: true, fullWidth: true, url: '', cover: false },
      contentAlign: 'center',
      textColor: '#000000',
      _meta: { htmlID: 'u_body', htmlClassNames: 'u_body' },
      fontFamily: { label: 'Arial', value: 'arial,helvetica,sans-serif' },
      preheaderText: '',
    },
    rows: [
      {
        cells: [1],
        values: {
          backgroundImage: { cover: false, url: '', repeat: false, fullWidth: true, center: true },
          hideDesktop: false,
          selectable: true,
          columnsBackgroundColor: '',
          hideable: true,
          backgroundColor: '',
          padding: '0px',
          columns: false,
          _meta: { htmlID: 'u_row_2', htmlClassNames: 'u_row' },
          deletable: true,
          displayCondition: null,
          duplicatable: true,
          draggable: true,
        },
        columns: [
          {
            contents: [
              {
                values: {
                  hideDesktop: false,
                  duplicatable: true,
                  deletable: true,
                  linkStyle: {
                    linkHoverUnderline: true,
                    linkColor: '#0000ee',
                    inherit: true,
                    linkUnderline: true,
                    linkHoverColor: '#0000ee',
                  },
                  hideable: true,
                  lineHeight: '140%',
                  draggable: true,
                  containerPadding: '10px',
                  text: '',
                  _meta: { htmlID: 'u_content_text_1', htmlClassNames: 'u_content_text' },
                  textAlign: 'left',
                  selectable: true,
                },
                type: 'text',
              },
            ],
            values: {
              border: {},
              _meta: { htmlClassNames: 'u_column', htmlID: 'u_column_2' },
              backgroundColor: '',
              padding: '0px',
            },
          },
        ],
      },
    ],
  },
  schemaVersion: 6,
};

/**
 * Converts a legacy core email message (users-permissions store) into a
 * minimal Unlayer design. The text is placed into the design object directly
 * (no string replacement inside serialized JSON).
 *
 * @param {string} message
 * @param {(html: string) => string} [htmlToText] - DOM based converter for full documents
 * @returns {object|null}
 */
export const buildCoreDesign = (message, htmlToText) => {
  if (typeof message !== 'string' || !message.trim()) return null;
  let text = message;
  if (/<body/i.test(text) && typeof htmlToText === 'function') {
    text = htmlToText(text);
  }
  text = text
    // Keep links, images, emphasis and Strapi <%= KEY %> placeholders; drop other tags.
    .replace(/<(?!\/?(?:(?:a|img|strong|b|i)\b|%))[^>]+>/gi, '')
    .replace(/"/g, "'")
    .replace(/\r?\n/g, '<br />');

  const design = JSON.parse(JSON.stringify(STANDARD_EMAIL_TEMPLATE));
  design.body.rows[0].columns[0].contents[0].values.text =
    `<p style="font-size: 14px; line-height: 140%; text-align: center;"><span style="font-size: 14px; line-height: 19.6px;">${text}</span></p>`;
  return design;
};

/**
 * Field validation for the editor header form.
 *
 * @param {object} data
 * @param {{isCoreEmail: boolean, isNewTemplate: boolean}} mode
 * @returns {{templateReferenceId?: 'required'|'invalid', name?: 'required', subject?: 'required'}}
 */
export const validateTemplateFields = (data, { isCoreEmail, isNewTemplate }) => {
  const errors = {};
  if (!isCoreEmail) {
    if (isNewTemplate) {
      const raw = data?.templateReferenceId;
      if (raw === '' || raw === null || raw === undefined) {
        errors.templateReferenceId = 'required';
      } else if (toPositiveTemplateId(typeof raw === 'number' ? raw : String(raw)) === null) {
        errors.templateReferenceId = 'invalid';
      }
    }
    if (!String(data?.name ?? '').trim()) errors.name = 'required';
  }
  if (!String(data?.subject ?? '').trim()) errors.subject = 'required';
  return errors;
};

/**
 * Whitelisted payload for POST/PUT /designer/templates. The reference id is
 * only sent when a template is created: it is the stable address of the
 * template (URL, API calls) and cannot be changed afterwards (UI-04, FUN-14).
 *
 * @param {object} data
 * @param {{design: object|null, bodyHtml: string, isNewTemplate: boolean}} exported
 * @returns {object}
 */
export const buildTemplatePayload = (data, { design, bodyHtml, isNewTemplate }) => {
  const payload = {
    name: data?.name,
    subject: data?.subject,
    bodyHtml,
    bodyText: data?.bodyText,
    design,
    category: data?.category,
    isActive: data?.isActive,
    tags: data?.tags,
  };
  if (isNewTemplate) {
    const raw = data?.templateReferenceId;
    const id = toPositiveTemplateId(typeof raw === 'number' ? raw : String(raw ?? ''));
    if (id !== null) payload.templateReferenceId = id;
  }
  Object.keys(payload).forEach((key) => {
    if (payload[key] === undefined) delete payload[key];
  });
  return payload;
};

/**
 * Payload for PUT /designer/core/:type.
 * @param {object} data
 * @param {{design: object|null, bodyHtml: string}} exported
 */
export const buildCorePayload = (data, { design, bodyHtml }) => ({
  subject: data?.subject,
  design,
  message: bodyHtml,
  bodyText: data?.bodyText ?? '',
});

/**
 * Parses an imported Unlayer design file.
 * @param {string} text
 * @returns {object|null} the design, or null when the file is not a design
 */
export const parseDesignFile = (text) => {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.body && typeof parsed.body === 'object') {
      return parsed;
    }
  } catch {
    // invalid JSON
  }
  return null;
};

/**
 * Safe file name for downloads.
 * @param {string} name
 * @param {string} fallback
 */
export const toFileName = (name, fallback = 'template') => {
  const cleaned = String(name ?? '')
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  return cleaned || fallback;
};

/**
 * Triggers a browser download for a Blob.
 * @param {Blob} blob
 * @param {string} fileName
 */
export const downloadBlob = (blob, fileName) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

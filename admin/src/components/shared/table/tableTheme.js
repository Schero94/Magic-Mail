/**
 * Mirrors the Magic Link table design; keep in sync.
 * Source: strapi-plugin-magic-link admin/src/utils/theme.js (space, tint,
 * breakpoints and the static radius, shadow, transition and control-height
 * tokens). Only the values the table layer needs are copied here, so the rest
 * of MagicMail keeps its own tokens (for example its 6px button radius).
 *
 * Colours come from the DS 2.2.4 theme (dark mode aware) through the MagicMail
 * helpers in utils/theme, whose accent values are identical to Magic Link.
 */
import { accent, byScheme } from '../../../utils/theme';

/** DS 2 spacing scale (theme.spaces). Index 1 = 4px, 2 = 8px, 3 = 12px, 4 = 16px, 6 = 24px, 7 = 32px. */
export const SPACE_FALLBACK = Object.freeze([
  '0px',
  '4px',
  '8px',
  '12px',
  '16px',
  '20px',
  '24px',
  '32px',
  '40px',
  '48px',
  '56px',
  '64px',
]);

/**
 * styled-components interpolation for a DS spacing step (theme.spaces index).
 * @param {number} step - 1 = 4px, 2 = 8px, 3 = 12px, 4 = 16px, 6 = 24px, 7 = 32px
 * @returns {(props: {theme?: object}) => string}
 */
export const space = (step) => (props) => props?.theme?.spaces?.[step] ?? SPACE_FALLBACK[step];

/**
 * Tinted surfaces (status badges, selection bar) for both schemes.
 * Pair `tint.X.bg` with `tint.X.fg` text and `tint.X.border`.
 */
const TINT_VALUES = Object.freeze({
  primary: { bg: ['#F0F9FF', 'rgba(14, 165, 233, 0.12)'], border: ['#BAE6FD', '#0C4A6E'] },
  success: { bg: ['#F0FDF4', 'rgba(34, 197, 94, 0.12)'], border: ['#BBF7D0', '#14532D'] },
  warning: { bg: ['#FFFBEB', 'rgba(245, 158, 11, 0.12)'], border: ['#FDE68A', '#78350F'] },
  danger: { bg: ['#FEF2F2', 'rgba(239, 68, 68, 0.12)'], border: ['#FECACA', '#7F1D1D'] },
});

export const tint = Object.freeze({
  ...Object.fromEntries(
    Object.entries(TINT_VALUES).map(([name, values]) => [
      name,
      Object.freeze({
        bg: byScheme(...values.bg),
        border: byScheme(...values.border),
        fg: accent[name],
      }),
    ])
  ),
  /* Neutral and secondary (purple) badge tones, defined like the Magic Link
     STAT_TONES secondary set: fg keeps >= 4.5:1 on its own bg in both schemes. */
  neutral: Object.freeze({
    bg: byScheme('#F6F6F9', 'rgba(165, 165, 186, 0.12)'),
    border: byScheme('#DCDCE4', '#4A4A6A'),
    fg: byScheme('#4A4A6A', '#C0C0CF'),
  }),
  secondary: Object.freeze({
    bg: byScheme('#FAF5FF', 'rgba(147, 51, 234, 0.16)'),
    border: byScheme('#E9D5FF', '#581C87'),
    fg: accent.secondary,
  }),
});

/**
 * Media-query widths (max-width queries). `mobile` switches the table to the
 * card layout; `tableCompact` narrows the inner cell padding.
 */
export const breakpoints = Object.freeze({
  mobile: '768px',
  tableCompact: '1199px',
  compact: '520px',
});

/** Static, scheme-independent tokens of the Magic Link table. */
export const tableTheme = Object.freeze({
  borderRadius: Object.freeze({ sm: '4px', md: '8px', lg: '12px', xl: '16px', full: '9999px' }),
  shadows: Object.freeze({
    sm: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
  }),
  transitions: Object.freeze({
    fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
  }),
  /** DS 2.2.4 button heights at >= 768px (theme.sizes.button). */
  controlHeight: Object.freeze({ S: '32px', M: '36px', L: '40px' }),
});

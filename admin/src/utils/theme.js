/**
 * MagicMail design tokens.
 *
 * Strapi Design System 2 does NOT define `--colors-*` CSS custom properties
 * (for example `--colors-neutral100`). Its colours only exist on the
 * styled-components theme that the admin's ThemeProvider switches between
 * light and dark mode. Use the helpers below instead:
 *
 *   import { color, fontSize, byScheme, brand, accent } from '../utils/theme';
 *
 *   const Card = styled.div`
 *     background: ${color('neutral0')};          // DS token, follows dark mode
 *     color: ${color('neutral800')};
 *     font-size: ${fontSize(2)};                  // 14px (DS scale, 1rem = 10px)
 *     border-left: 3px solid ${accent.primary};   // brand accent, readable in both modes
 *   `;
 *
 * In JSX, prefer DS props (`background="neutral100"`, `textColor="neutral600"`) or
 * `const colors = useThemeColors()` for inline styles.
 *
 * The static `theme` object stays available for values that never depend on
 * the colour scheme: spacing, radii, shadows and transitions.
 */
import { useTheme } from 'styled-components';

/**
 * Light-theme values of DS 2.2.4, used only when no ThemeProvider is present
 * (unit tests, isolated renders). Inside the admin the real theme always wins.
 */
export const LIGHT_FALLBACK_COLORS = Object.freeze({
  alternative100: '#f6ecfc',
  alternative200: '#e0c1f4',
  alternative500: '#ac73e6',
  alternative600: '#9736e8',
  alternative700: '#8312d1',
  neutral0: '#ffffff',
  neutral100: '#f6f6f9',
  neutral150: '#eaeaef',
  neutral200: '#dcdce4',
  neutral300: '#c0c0cf',
  neutral400: '#a5a5ba',
  neutral500: '#8e8ea9',
  neutral600: '#666687',
  neutral700: '#4a4a6a',
  neutral800: '#32324d',
  neutral900: '#212134',
  neutral1000: '#181826',
  primary100: '#f0f0ff',
  primary200: '#d9d8ff',
  primary500: '#7b79ff',
  primary600: '#4945ff',
  primary700: '#271fe0',
  secondary100: '#eaf5ff',
  secondary200: '#b8e1ff',
  secondary500: '#66b7f1',
  secondary600: '#0c75af',
  secondary700: '#006096',
  success100: '#eafbe7',
  success200: '#c6f0c2',
  success500: '#5cb176',
  success600: '#328048',
  success700: '#2f6846',
  warning100: '#fdf4dc',
  warning200: '#fae7b9',
  warning500: '#f29d41',
  warning600: '#d9822f',
  warning700: '#be5d01',
  danger100: '#fcecea',
  danger200: '#f5c0b8',
  danger500: '#ee5e52',
  danger600: '#d02b20',
  danger700: '#b72b1a',
});

/** DS 2 font scale (html font-size is 62.5%, so 1rem = 10px). */
export const FONT_SIZE_FALLBACK = Object.freeze([
  '1.1rem', // 0 -> 11px
  '1.2rem', // 1 -> 12px
  '1.4rem', // 2 -> 14px
  '1.6rem', // 3 -> 16px
  '1.8rem', // 4 -> 18px
  '2rem', //   5 -> 20px
  '2.8rem', // 6 -> 28px
  '3.2rem', // 7 -> 32px
]);

/**
 * styled-components interpolation for a DS colour token.
 * @param {string} token - DS colour key, e.g. 'neutral100', 'danger600'
 * @returns {(props: {theme?: object}) => string}
 */
export const color = (token) => (props) =>
  props?.theme?.colors?.[token] ?? LIGHT_FALLBACK_COLORS[token];

/**
 * Resolves a DS colour token from a theme object (inline styles and tests).
 * @param {object|undefined} themeObject
 * @param {string} token
 * @returns {string|undefined}
 */
export const resolveColor = (themeObject, token) => color(token)({ theme: themeObject });

/**
 * styled-components interpolation for a DS font size step (0-7).
 * @param {number} step
 * @returns {(props: {theme?: object}) => string}
 */
export const fontSize = (step) => (props) =>
  props?.theme?.fontSizes?.[step] ?? FONT_SIZE_FALLBACK[step];

/**
 * @param {object|undefined} themeObject
 * @returns {boolean} true when the active DS theme is the dark theme
 */
export const isDarkTheme = (themeObject) => themeObject?.colorScheme === 'dark';

/**
 * Picks a value per colour scheme (for brand colours that DS does not provide).
 * @param {string} light
 * @param {string} dark
 * @returns {(props: {theme?: object}) => string}
 */
export const byScheme = (light, dark) => (props) => (isDarkTheme(props?.theme) ? dark : light);

/**
 * Hook returning the active DS colour map, for inline `style={{ ... }}` values.
 * @returns {Record<string, string>}
 */
export const useThemeColors = () => {
  const activeTheme = useTheme();
  return activeTheme?.colors ?? LIGHT_FALLBACK_COLORS;
};

/**
 * MagicMail brand colours. Every value keeps white text at WCAG AA (>= 4.5:1).
 * Use them for filled surfaces with white text (gradient buttons, hero headers).
 */
export const brand = Object.freeze({
  primary: '#0369A1',
  primaryHover: '#075985',
  secondary: '#9333EA',
  secondaryHover: '#7E22CE',
  success: '#15803D',
  successHover: '#166534',
  warning: '#B45309',
  warningHover: '#92400E',
  danger: '#DC2626',
  dangerHover: '#B91C1C',
  gradient: 'linear-gradient(135deg, #0369A1 0%, #9333EA 100%)',
  gradientHover: 'linear-gradient(135deg, #075985 0%, #7E22CE 100%)',
});

/**
 * Brand accents for text, icons and borders drawn on neutral surfaces. They
 * switch to lighter tints in dark mode so they stay readable on neutral0.
 */
export const ACCENT_VALUES = Object.freeze({
  primary: ['#0369A1', '#7DD3FC'],
  secondary: ['#7E22CE', '#D8B4FE'],
  success: ['#15803D', '#86EFAC'],
  warning: ['#B45309', '#FCD34D'],
  danger: ['#B91C1C', '#FCA5A5'],
});

export const accent = Object.freeze(
  Object.fromEntries(
    Object.entries(ACCENT_VALUES).map(([name, [light, dark]]) => [name, byScheme(light, dark)])
  )
);

/** Static, scheme-independent design tokens (spacing, radii, shadows, motion). */
export const theme = {
  colors: {
    primary: {
      50: '#F0F9FF',
      100: '#E0F2FE',
      200: '#BAE6FD',
      500: '#0EA5E9',
      600: '#0284C7',
      700: '#0369A1',
    },
    secondary: {
      50: '#FAF5FF',
      100: '#F3E8FF',
      500: '#A855F7',
      600: '#9333EA',
    },
    success: {
      50: '#F0FDF4',
      100: '#DCFCE7',
      500: '#22C55E',
      600: '#16A34A',
      700: '#15803D',
    },
    warning: {
      50: '#FFFBEB',
      100: '#FEF3C7',
      500: '#F59E0B',
      600: '#D97706',
    },
    danger: {
      50: '#FEF2F2',
      100: '#FEE2E2',
      500: '#EF4444',
      600: '#DC2626',
    },
  },
  shadows: {
    sm: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
    xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
  },
  transitions: {
    fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
    normal: '300ms cubic-bezier(0.4, 0, 0.2, 1)',
    slow: '500ms cubic-bezier(0.4, 0, 0.2, 1)',
  },
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
    '2xl': '48px',
  },
  borderRadius: {
    sm: '6px',
    md: '8px',
    lg: '12px',
    xl: '16px',
  },
};

export default theme;

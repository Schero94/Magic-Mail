/**
 * Styled button components for MagicMail.
 *
 * - Text buttons and icon buttons share one control height (36px, DS size M).
 * - Filled surfaces use the contrast-safe brand palette (white text >= 4.5:1).
 * - Colours on neutral surfaces come from DS theme tokens or scheme-aware
 *   accents, so dark mode works.
 * - Hover lifts are disabled for users who prefer reduced motion.
 * - Icon buttons show a DS tooltip with their aria-label.
 */
import { forwardRef } from 'react';
import styled, { css } from 'styled-components';
import { Button, Tooltip } from '@strapi/design-system';
import { accent, brand, color, fontSize } from '../utils/theme';
import { reducedMotion } from './shared/motion';

export const CONTROL_HEIGHT = '36px';
export const CTA_HEIGHT = '52px';

const disabledState = css`
  &:disabled,
  &[aria-disabled='true'] {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const textButtonBase = css`
  font-weight: 600;
  padding: 8px 16px;
  min-height: ${CONTROL_HEIGHT};
  transition: all 0.2s ease;
  ${disabledState}
  ${reducedMotion}
`;

// ================ PRIMARY GRADIENT BUTTON ================
export const GradientButton = styled(Button)`
  && {
    ${textButtonBase}
    background: ${brand.gradient};
    color: #ffffff;
    border: none;

    &:hover:not(:disabled) {
      background: ${brand.gradientHover};
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(3, 105, 161, 0.3);
    }

    &:active:not(:disabled) {
      transform: translateY(0);
    }
  }
`;

// ================ SECONDARY BUTTON (Gradient Outline) ================
export const SecondaryButton = styled(Button)`
  && {
    ${textButtonBase}
    background: ${color('neutral0')};
    color: ${accent.secondary};
    border: 2px solid transparent;
    background-image:
      linear-gradient(${color('neutral0')}, ${color('neutral0')}), ${brand.gradient};
    background-origin: border-box;
    background-clip: padding-box, border-box;

    &:hover:not(:disabled) {
      background: ${brand.gradient};
      background-clip: padding-box;
      color: #ffffff;
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(147, 51, 234, 0.3);
    }

    &:active:not(:disabled) {
      transform: translateY(0);
    }
  }
`;

// ================ TERTIARY/GHOST BUTTON ================
export const TertiaryButton = styled(Button)`
  && {
    ${textButtonBase}
    font-weight: 500;
    background: transparent;
    color: ${color('neutral700')};
    border: 1px solid ${color('neutral200')};

    &:hover:not(:disabled) {
      background: ${color('neutral100')};
      border-color: ${color('neutral300')};
      color: ${color('neutral800')};
    }
  }
`;

// ================ DANGER BUTTON ================
export const DangerButton = styled(Button)`
  && {
    ${textButtonBase}
    background: rgba(220, 38, 38, 0.12);
    color: ${accent.danger};
    border: 1px solid rgba(220, 38, 38, 0.3);

    &:hover:not(:disabled) {
      background: ${brand.danger};
      color: #ffffff;
      border-color: ${brand.danger};
    }
  }
`;

// ================ ICON BUTTONS ================
const iconButtonBase = css`
  padding: 8px;
  min-width: ${CONTROL_HEIGHT};
  min-height: ${CONTROL_HEIGHT};
  width: ${CONTROL_HEIGHT};
  height: ${CONTROL_HEIGHT};
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);

  svg {
    width: 18px;
    height: 18px;
  }

  &:hover:not(:disabled) {
    color: #ffffff;
    transform: translateY(-1px);
  }

  ${disabledState}
  ${reducedMotion}
`;

/**
 * Builds a tinted icon button.
 * @param {object} tone
 * @param {string} tone.tint - rgb triple used for resting background and border
 * @param {Function|string} tone.fg - resting icon colour
 * @param {string} tone.hover - filled hover background (white icon >= 4.5:1)
 * @param {string} tone.hoverBorder
 */
const createIconButton = ({ tint, fg, hover, hoverBorder }) => {
  const StyledIconButton = styled(Button)`
    && {
      ${iconButtonBase}
      background: linear-gradient(135deg, rgba(${tint}, 0.06) 0%, rgba(${tint}, 0.14) 100%);
      color: ${fg};
      border: 1px solid rgba(${tint}, 0.32);

      &:hover:not(:disabled) {
        background: ${hover};
        border-color: ${hoverBorder};
        box-shadow: 0 4px 12px rgba(${tint}, 0.3);
      }
    }
  `;

  /**
   * Icon-only button. Its aria-label doubles as a DS tooltip for sighted
   * users; a native `title` is dropped to avoid a duplicate tooltip.
   */
  const IconOnlyButton = forwardRef(({ title, ...props }, ref) => {
    const label = props['aria-label'] ?? title;
    const button = <StyledIconButton ref={ref} aria-label={label} {...props} />;
    return label ? <Tooltip label={label}>{button}</Tooltip> : button;
  });

  return IconOnlyButton;
};

export const IconButton = createIconButton({
  tint: '128, 128, 128',
  fg: color('neutral600'),
  hover: `linear-gradient(135deg, ${brand.primary} 0%, ${brand.primaryHover} 100%)`,
  hoverBorder: brand.primary,
});
IconButton.displayName = 'IconButton';

export const IconButtonDanger = createIconButton({
  tint: '220, 38, 38',
  fg: accent.danger,
  hover: `linear-gradient(135deg, ${brand.danger} 0%, ${brand.dangerHover} 100%)`,
  hoverBorder: brand.danger,
});
IconButtonDanger.displayName = 'IconButtonDanger';

export const IconButtonPrimary = createIconButton({
  tint: '3, 105, 161',
  fg: accent.primary,
  hover: `linear-gradient(135deg, ${brand.primary} 0%, ${brand.primaryHover} 100%)`,
  hoverBorder: brand.primary,
});
IconButtonPrimary.displayName = 'IconButtonPrimary';

export const IconButtonSuccess = createIconButton({
  tint: '21, 128, 61',
  fg: accent.success,
  hover: `linear-gradient(135deg, ${brand.success} 0%, ${brand.successHover} 100%)`,
  hoverBorder: brand.success,
});
IconButtonSuccess.displayName = 'IconButtonSuccess';

export const IconButtonWarning = createIconButton({
  tint: '180, 83, 9',
  fg: accent.warning,
  hover: `linear-gradient(135deg, ${brand.warning} 0%, ${brand.warningHover} 100%)`,
  hoverBorder: brand.warning,
});
IconButtonWarning.displayName = 'IconButtonWarning';

export const IconButtonPurple = createIconButton({
  tint: '147, 51, 234',
  fg: accent.secondary,
  hover: `linear-gradient(135deg, ${brand.secondary} 0%, ${brand.secondaryHover} 100%)`,
  hoverBorder: brand.secondary,
});
IconButtonPurple.displayName = 'IconButtonPurple';

// ================ LARGE CTA BUTTON (empty states) ================
export const CTAButton = styled(Button)`
  && {
    background: ${brand.gradient};
    color: #ffffff;
    font-weight: 700;
    font-size: ${fontSize(3)};
    border: none;
    padding: 14px 28px;
    min-height: ${CTA_HEIGHT};
    border-radius: 12px;
    transition: all 0.2s ease;
    box-shadow: 0 4px 14px rgba(3, 105, 161, 0.25);

    &:hover:not(:disabled) {
      background: ${brand.gradientHover};
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(3, 105, 161, 0.35);
    }

    &:active:not(:disabled) {
      transform: translateY(0);
    }

    ${disabledState}
    ${reducedMotion}
  }
`;

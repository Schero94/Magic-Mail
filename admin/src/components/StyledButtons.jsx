/**
 * Styled button components for MagicMail.
 *
 * - Text buttons share one control height (36px, DS size M).
 * - Filled surfaces use the contrast-safe brand palette (white text >= 4.5:1).
 * - Colours on neutral surfaces come from DS theme tokens or scheme-aware
 *   accents, so dark mode works.
 * - Hover lifts are disabled for users who prefer reduced motion.
 * - Table row actions use the DS IconButton through the shared table layer
 *   (components/shared/table), the same as Magic Link.
 */
import styled, { css } from 'styled-components';
import { Button } from '@strapi/design-system';
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

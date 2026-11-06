import styled, { keyframes, css } from 'styled-components';
import { Alert, Box, Typography } from '@strapi/design-system';
import { color, fontSize } from '../../utils/theme';
import { motionSafe, reducedMotion } from '../shared/motion';

// ============= ANIMATIONS =============
const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
`;

const pulse = keyframes`
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
`;

const slideIn = keyframes`
  from { transform: translateX(-20px); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
`;

// ============= TOKENS =============
// The wizard uses the Strapi primary (indigo) palette. Every value follows
// the active DS theme, so it stays readable in dark mode.
export const wizardColors = {
  primary: color('primary600'),
  primaryLight: 'rgba(73, 69, 255, 0.06)',
  // Filled surfaces with white text use success600 (AA contrast); lines use success500.
  successFill: color('success600'),
  successLine: color('success500'),
  successLight: 'rgba(92, 177, 118, 0.12)',
  neutralLight: 'rgba(142, 142, 169, 0.08)',
  surface: color('neutral0'),
  border: 'rgba(128, 128, 128, 0.2)',
  text: color('neutral800'),
  textLight: color('neutral600'),
};

// ============= LAYOUT =============
export const StepHeader = styled(Box)`
  padding-bottom: 24px;
  margin-bottom: 32px;
  position: relative;
  ${motionSafe(css`
    animation: ${fadeIn} 0.4s ease;
  `)}

  &::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: -24px;
    right: -24px;
    height: 1px;
    background: linear-gradient(90deg, transparent, ${wizardColors.border}, transparent);
  }
`;

export const StepTitle = styled(Typography)`
  && {
    color: ${wizardColors.text};
    font-size: 24px;
    font-weight: 600;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  svg {
    flex-shrink: 0;
  }
`;

export const StepSubtitle = styled(Typography)`
  && {
    color: ${wizardColors.textLight};
    font-size: 14px;
    line-height: 1.5;
  }
`;

export const StepperList = styled.ol`
  display: flex;
  align-items: flex-start;
  justify-content: center;
  gap: 0;
  margin: 8px 0 48px;
  position: relative;
  padding: 0 40px;
  list-style: none;

  @media (max-width: 600px) {
    padding: 0;
    margin-bottom: 32px;
  }
`;

export const StepWrapper = styled.li`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  min-width: 0;

  &:not(:last-child)::after {
    content: '';
    position: absolute;
    top: 28px;
    left: 50%;
    width: 100%;
    height: 3px;
    background: ${(p) => (p.$completed ? wizardColors.successLine(p) : wizardColors.neutralLight)};
    transition: all 0.4s ease;
    z-index: 0;
  }

  @media (max-width: 600px) {
    &:not(:last-child)::after {
      top: 20px;
    }
  }

  ${reducedMotion}
`;

export const StepDot = styled.button`
  width: 56px;
  height: 56px;
  padding: 0;
  border-radius: 50%;
  background: ${(p) =>
    p.$active
      ? wizardColors.primary(p)
      : p.$completed
        ? wizardColors.successFill(p)
        : wizardColors.surface(p)};
  color: ${(p) => (p.$active || p.$completed ? '#ffffff' : wizardColors.textLight(p))};
  border: 4px solid
    ${(p) => (p.$active ? wizardColors.primary(p) : p.$completed ? wizardColors.successFill(p) : wizardColors.border)};
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 18px;
  font-family: inherit;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  z-index: 1;
  cursor: ${(p) => (p.$completed ? 'pointer' : 'default')};
  box-shadow: ${(p) =>
    p.$active
      ? `0 4px 16px rgba(73, 69, 255, 0.25), 0 0 0 8px ${wizardColors.primaryLight}`
      : p.$completed
        ? '0 4px 12px rgba(50, 128, 72, 0.2)'
        : '0 2px 8px rgba(0,0,0,0.08)'};

  ${(p) =>
    p.$active &&
    motionSafe(css`
      animation: ${pulse} 2s infinite;
    `)}

  &:hover {
    transform: ${(p) => (p.$completed ? 'scale(1.1)' : p.$active ? 'scale(1.05)' : 'scale(1)')};
  }

  &:focus-visible {
    outline: 2px solid ${wizardColors.primary};
    outline-offset: 3px;
  }

  &:disabled {
    cursor: default;
  }

  svg {
    width: 20px;
    height: 20px;
  }

  @media (max-width: 600px) {
    width: 40px;
    height: 40px;
    border-width: 3px;
    font-size: 15px;
  }

  ${reducedMotion}
`;

export const StepLabel = styled(Typography)`
  && {
    margin-top: 12px;
    font-size: 13px;
    color: ${(p) =>
      p.$active
        ? wizardColors.primary(p)
        : p.$completed
          ? wizardColors.successFill(p)
          : wizardColors.textLight(p)};
    white-space: nowrap;
    font-weight: ${(p) => (p.$active ? 600 : 500)};
    text-align: center;
  }

  @media (max-width: 600px) {
    && {
      font-size: 12px;
      white-space: normal;
    }
  }
`;

// ============= PROVIDER SELECTION =============
export const ProviderCategoryHeader = styled(Box)`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin: 0 0 16px;
  ${motionSafe(css`
    animation: ${fadeIn} 0.4s ease;
  `)}

  &::after {
    content: '';
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, ${wizardColors.border}, transparent);
  }
`;

export const ProviderCategoryLabel = styled(Typography)`
  && {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: ${wizardColors.textLight};
  }
`;

export const ProviderCategoryHint = styled.span`
  font-size: ${fontSize(1)};
  font-weight: 500;
  padding: 3px 10px;
  border-radius: 999px;
  background: ${wizardColors.primaryLight};
  color: ${wizardColors.primary};
  letter-spacing: 0.02em;
  text-transform: none;
`;

export const ProvidersGrid = styled(Box)`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin: 0 auto 28px;
  ${motionSafe(css`
    animation: ${slideIn} 0.5s ease;
  `)}
  max-width: 960px;

  @media (max-width: 960px) {
    grid-template-columns: repeat(2, 1fr);
  }
  @media (max-width: 600px) {
    grid-template-columns: 1fr;
  }
`;

/**
 * Provider tile: landscape card with icon, title and tagline, a selection
 * ring and a check badge. Rendered as a native toggle button (aria-pressed).
 */
export const ProviderCard = styled.button`
  width: 100%;
  text-align: left;
  font-family: inherit;
  background: ${(p) =>
    p.$selected
      ? `linear-gradient(180deg, ${wizardColors.successLight}, rgba(92, 177, 118, 0.04))`
      : color('neutral100')(p)};
  border: 1.5px solid ${(p) => (p.$selected ? wizardColors.successFill(p) : wizardColors.border)};
  border-radius: 14px;
  padding: 22px 20px 20px;
  cursor: pointer;
  transition:
    transform 0.2s cubic-bezier(0.4, 0, 0.2, 1),
    box-shadow 0.2s,
    border-color 0.2s,
    background 0.2s;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 14px;
  position: relative;
  overflow: hidden;
  min-height: 170px;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, transparent 60%, rgba(73, 69, 255, 0.06));
    opacity: 0;
    transition: opacity 0.25s;
    pointer-events: none;
  }

  &:hover {
    transform: translateY(-3px);
    box-shadow: 0 10px 28px rgba(73, 69, 255, 0.18);
    border-color: ${(p) => (p.$selected ? wizardColors.successFill(p) : wizardColors.primary(p))};

    &::before {
      opacity: 1;
    }
  }

  &:focus-visible {
    outline: 2px solid ${wizardColors.primary};
    outline-offset: 2px;
  }

  ${(p) =>
    p.$selected &&
    css`
      box-shadow:
        0 0 0 1px ${wizardColors.successFill},
        0 10px 28px rgba(92, 177, 118, 0.18);
    `}

  @media (max-width: 600px) {
    min-height: 0;
  }

  ${reducedMotion}
`;

export const SelectedBadge = styled.span`
  position: absolute;
  top: 12px;
  right: 12px;
  width: 24px;
  height: 24px;
  background: ${wizardColors.successFill};
  color: #ffffff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 6px rgba(50, 128, 72, 0.35);

  svg {
    width: 14px;
    height: 14px;
  }
`;

export const ProviderIcon = styled.span`
  width: 48px;
  height: 48px;
  border-radius: ${(p) => (p.$round ? '50%' : '12px')};
  background: ${(p) => p.$bgColor || 'rgba(73, 69, 255, 0.2)'};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  font-weight: 700;
  color: ${(p) => p.$color || wizardColors.primary(p)};
  box-shadow: 0 4px 14px ${(p) => p.$shadowColor || 'rgba(73, 69, 255, 0.25)'};
  flex-shrink: 0;
`;

export const ProviderTextBlock = styled.span`
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: auto;
`;

export const ProviderName = styled(Typography)`
  && {
    font-weight: 600;
    font-size: 16px;
    line-height: 1.25;
    color: ${wizardColors.text};
    margin: 0;
  }
`;

export const ProviderTagline = styled(Typography)`
  && {
    font-size: 12.5px;
    line-height: 1.4;
    color: ${wizardColors.textLight};
    margin: 0;
  }
`;

// ============= FORMS =============
export const InfoAlert = styled(Alert)`
  background: ${wizardColors.primaryLight};
  border: 1px solid rgba(73, 69, 255, 0.2);
  ${motionSafe(css`
    animation: ${fadeIn} 0.4s ease;
  `)}

  svg {
    color: ${wizardColors.primary};
  }
`;

export const FormSection = styled(Box)`
  ${motionSafe(css`
    animation: ${slideIn} 0.4s ease;
  `)}
  width: 100%;
  max-width: 100%;
`;

export const FullWidthField = styled(Box)`
  width: 100%;

  & > * {
    width: 100%;
  }

  input,
  textarea {
    width: 100% !important;
  }
`;

export const SectionTitle = styled(Typography)`
  && {
    color: ${wizardColors.text};
    font-weight: 600;
    font-size: 16px;
    margin-bottom: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
`;

export const GuideBox = styled(Box)`
  border: 1px solid ${wizardColors.border};
  border-radius: 8px;
`;

export const GuideList = styled.ol`
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 14px;
  line-height: 1.6;
  color: ${wizardColors.text};

  a {
    color: ${wizardColors.primary};
    text-decoration: underline;
  }

  code {
    font-family: monospace;
  }
`;

export const BulletList = styled.ul`
  margin: 8px 0 0 20px;
  padding: 0;
  list-style: disc;
`;

export const RedirectUriRow = styled(Box)`
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
`;

export const RedirectUriValue = styled.code`
  flex: 1;
  min-width: 0;
  padding: 8px;
  border-radius: 4px;
  background: ${color('neutral0')};
  color: ${color('neutral800')};
  font-family: monospace;
  font-size: 13px;
  word-break: break-all;
  border: 1px solid ${wizardColors.border};
`;

/** Provider-branded connect button colours (white text, AA contrast). */
export const CONNECT_BUTTON_COLORS = Object.freeze({
  'gmail-oauth': '#1A73E8',
  'microsoft-oauth': '#0067B8',
  'yahoo-oauth': '#6001D2',
});

export const ConnectButton = styled.button`
  width: 100%;
  min-height: 40px;
  padding: 10px 16px;
  border: none;
  border-radius: 4px;
  background: ${(p) => p.$bg};
  color: #ffffff;
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  transition: filter 0.15s ease;

  &:hover:not(:disabled) {
    filter: brightness(0.92);
  }

  &:focus-visible {
    outline: 2px solid ${wizardColors.primary};
    outline-offset: 2px;
  }

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  svg {
    width: 16px;
    height: 16px;
  }

  ${reducedMotion}
`;

export const SwitchCard = styled(Box)`
  border-radius: 8px;
`;

/**
 * Styled components of the template list. Same look as before, but every
 * colour is a DS token or a contrast-safe brand value (dark mode), font sizes
 * respect the DS 10px rem base, layouts wrap down to 320px and decorative
 * motion honours prefers-reduced-motion.
 */
import styled, { keyframes, css } from 'styled-components';
import { Box, Flex, Modal, Typography } from '@strapi/design-system';
import {
  CheckCircleIcon,
  CodeBracketIcon,
  DocumentArrowDownIcon,
} from '@heroicons/react/24/outline';
import { accent, brand, color, fontSize, theme } from '../../utils/theme';
import { motionSafe, reducedMotion } from '../../components/shared/motion';
import { CTA_HEIGHT } from '../../components/StyledButtons';

export const breakpoints = {
  mobile: '768px',
  tablet: '1024px',
};

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
`;

const shimmer = keyframes`
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
`;

const float = keyframes`
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-5px); }
`;

const tone = (p) => accent[p.$tone] ?? accent.primary;

// ================ PAGE ================
export const Container = styled(Box)`
  ${motionSafe(css`
    animation: ${fadeIn} ${theme.transitions.slow};
  `)}
  min-height: 100vh;
  max-width: 1440px;
  margin: 0 auto;
  padding: ${theme.spacing.xl} ${theme.spacing.lg} 0;
  overflow-x: hidden;

  @media screen and (max-width: ${breakpoints.mobile}) {
    padding: 16px 12px 0;
  }
`;

export const Header = styled(Box)`
  background: linear-gradient(135deg, ${brand.secondary} 0%, ${brand.primary} 100%);
  border-radius: ${theme.borderRadius.xl};
  padding: ${theme.spacing.xl} ${theme.spacing['2xl']};
  margin-bottom: ${theme.spacing.xl};
  position: relative;
  overflow: hidden;
  box-shadow: ${theme.shadows.xl};

  @media screen and (max-width: ${breakpoints.mobile}) {
    padding: 24px 20px;
    border-radius: 12px;
  }

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 200%;
    height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.15), transparent);
    ${motionSafe(css`
      animation: ${shimmer} 3s infinite;
    `)}
  }

  &::after {
    content: '';
    position: absolute;
    top: 0;
    right: 0;
    width: 100%;
    height: 100%;
    background-image: radial-gradient(
      circle at 20% 80%,
      transparent 50%,
      rgba(255, 255, 255, 0.1) 50%
    );
    background-size: 15px 15px;
    opacity: 0.3;
  }
`;

export const HeaderContent = styled(Flex)`
  position: relative;
  z-index: 1;
`;

export const Title = styled(Typography)`
  color: #ffffff;
  font-size: 2rem;
  font-weight: 700;
  letter-spacing: -0.025em;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};

  svg {
    width: 28px;
    height: 28px;
    ${motionSafe(css`
      animation: ${float} 3s ease-in-out infinite;
    `)}
  }

  @media screen and (max-width: ${breakpoints.mobile}) {
    font-size: 1.5rem;

    svg {
      width: 22px;
      height: 22px;
    }
  }
`;

export const Subtitle = styled(Typography)`
  color: rgba(255, 255, 255, 0.95);
  font-size: ${fontSize(2)};
  font-weight: 500;
  margin-top: ${theme.spacing.xs};
  letter-spacing: 0.01em;
`;

// ================ STATS ================
export const StatsGrid = styled.div`
  margin-bottom: ${theme.spacing.xl};
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: ${theme.spacing.lg};

  @media screen and (max-width: ${breakpoints.mobile}) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    margin-bottom: 24px;
  }
`;

export const StatCard = styled(Box)`
  background: ${color('neutral0')};
  border-radius: ${theme.borderRadius.lg};
  padding: 28px ${theme.spacing.lg};
  position: relative;
  overflow: hidden;
  transition: all ${theme.transitions.normal};
  ${motionSafe(css`
    animation: ${fadeIn} ${theme.transitions.slow} backwards;
  `)}
  animation-delay: ${(p) => p.$delay || '0s'};
  box-shadow: ${theme.shadows.sm};
  border: 1px solid rgba(128, 128, 128, 0.2);
  min-width: 0;
  flex: 1;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;

  @media screen and (max-width: ${breakpoints.mobile}) {
    padding: 20px 12px;

    &:hover {
      transform: none;
    }
  }

  &:hover {
    transform: translateY(-6px);
    box-shadow: ${theme.shadows.xl};
    border-color: ${tone};

    .stat-icon {
      transform: scale(1.15) rotate(5deg);
    }

    .stat-value {
      transform: scale(1.08);
      color: ${tone};
    }
  }

  ${reducedMotion}

  @media (prefers-reduced-motion: reduce) {
    &:hover .stat-icon,
    &:hover .stat-value {
      transform: none;
    }
  }
`;

export const StatIcon = styled(Box)`
  width: 68px;
  height: 68px;
  border-radius: ${theme.borderRadius.lg};
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${(p) => p.$bg || 'rgba(2, 132, 199, 0.12)'};
  transition: all ${theme.transitions.normal};
  margin: 0 auto 20px;
  box-shadow: ${theme.shadows.sm};

  svg {
    width: 34px;
    height: 34px;
    color: ${tone};
  }

  @media screen and (max-width: ${breakpoints.mobile}) {
    width: 48px;
    height: 48px;
    margin-bottom: 12px;

    svg {
      width: 24px;
      height: 24px;
    }
  }
`;

export const StatValue = styled(Typography)`
  font-size: 2.75rem;
  font-weight: 700;
  color: ${color('neutral800')};
  line-height: 1;
  margin-bottom: 10px;
  transition: all ${theme.transitions.normal};
  text-align: center;

  @media screen and (max-width: ${breakpoints.mobile}) {
    font-size: 2rem;
    margin-bottom: 6px;
  }
`;

export const StatLabel = styled(Typography)`
  font-size: ${fontSize(2)};
  color: ${color('neutral600')};
  font-weight: 500;
  letter-spacing: 0.025em;
  text-align: center;

  @media screen and (max-width: ${breakpoints.mobile}) {
    font-size: ${fontSize(1)};
  }
`;

export const SectionDivider = styled(Box)`
  margin-bottom: ${theme.spacing.xl};
`;

// ================ LIST ================
export const TemplatesContainer = styled(Box)`
  margin-top: ${theme.spacing.xl};
`;

export const SectionHeaderRow = styled(Flex)`
  margin-bottom: ${theme.spacing.md};
  gap: ${theme.spacing.md};
  flex-wrap: wrap;
`;

// ================ EMPTY / ERROR ================
export const EmptyFeatureList = styled.ul`
  list-style: none;
  padding: 0;
  margin: ${theme.spacing.xl} 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: ${theme.spacing.md};

  @media screen and (max-width: ${breakpoints.tablet}) {
    grid-template-columns: 1fr;
  }
`;

export const EmptyFeatureItem = styled.li`
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.lg};
  background: ${color('neutral0')};
  border-radius: ${theme.borderRadius.md};
  box-shadow: ${theme.shadows.sm};
  transition: ${theme.transitions.fast};

  &:hover {
    transform: translateY(-2px);
    box-shadow: ${theme.shadows.md};
  }

  svg {
    width: 28px;
    height: 28px;
    color: ${accent.success};
    flex-shrink: 0;
    margin-bottom: ${theme.spacing.xs};
  }

  ${reducedMotion}
`;

export const EmptyButtonGroup = styled.div`
  display: flex;
  gap: ${theme.spacing.md};
  justify-content: center;
  margin-top: ${theme.spacing.xl};
  flex-wrap: wrap;

  /* The secondary action sits next to the large CTA: same height in one row. */
  && > button {
    min-height: ${CTA_HEIGHT};
  }
`;

export const HiddenFileInput = styled.input`
  display: none;
`;

// ================ MODALS ================
export const StyledModalContent = styled(Modal.Content)`
  && {
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    max-width: min(480px, calc(100vw - 24px));
  }
`;

export const CodeModalContent = styled(Modal.Content)`
  && {
    max-width: 900px;
    width: calc(100vw - 24px);
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    border-radius: 16px;
    overflow: hidden;
  }
`;

export const StyledModalHeader = styled(Modal.Header)`
  && {
    background: ${brand.gradient};
    padding: 24px 28px;
    border-bottom: none;

    h2 {
      color: #ffffff;
      font-size: 1.6rem;
      font-weight: 700;
      overflow-wrap: anywhere;
    }

    button {
      color: #ffffff !important;
      opacity: 0.9;
      background: rgba(255, 255, 255, 0.15) !important;
      border-radius: 8px;

      &:hover {
        opacity: 1;
        background: rgba(255, 255, 255, 0.25) !important;
      }

      svg,
      svg path {
        fill: #ffffff !important;
        color: #ffffff !important;
      }
    }

    @media screen and (max-width: ${breakpoints.mobile}) {
      padding: 16px;
    }
  }
`;

export const StyledModalBody = styled(Modal.Body)`
  && {
    padding: 28px;
    background: ${color('neutral0')};

    @media screen and (max-width: ${breakpoints.mobile}) {
      padding: 16px;
    }
  }
`;

export const StyledModalFooter = styled(Modal.Footer)`
  && {
    padding: 20px 28px;
    background: ${color('neutral100')};
    border-top: 1px solid rgba(128, 128, 128, 0.2);
    gap: 12px;
    flex-wrap: wrap;
  }
`;

export const ModalField = styled(Box)`
  margin-bottom: 20px;

  &:last-child {
    margin-bottom: 0;
  }
`;

export const ModalTemplateInfo = styled(Box)`
  background: linear-gradient(135deg, rgba(2, 132, 199, 0.06) 0%, rgba(168, 85, 247, 0.06) 100%);
  border: 1px solid rgba(2, 132, 199, 0.12);
  border-radius: 10px;
  padding: 14px 16px;
  margin-top: 8px;
  color: ${color('neutral800')};
  overflow-wrap: anywhere;
`;

export const ScrollableDialogBody = styled(Box)`
  overflow-y: auto;
  max-height: calc(85vh - 160px);
  padding: 24px 28px 28px 28px;
  background: ${color('neutral0')};

  @media screen and (max-width: ${breakpoints.mobile}) {
    padding: 16px;
  }

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(128, 128, 128, 0.2);
    border-radius: 3px;
  }

  &::-webkit-scrollbar-thumb:hover {
    background: rgba(128, 128, 128, 0.3);
  }
`;

export const InfoBox = styled(Box)`
  background: linear-gradient(135deg, rgba(2, 132, 199, 0.06), rgba(2, 132, 199, 0.12));
  border-left: 4px solid ${accent.primary};
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 20px;
  color: ${accent.primary};
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  justify-content: space-between;
`;

export const WarningBox = styled(Box)`
  background: linear-gradient(135deg, rgba(234, 179, 8, 0.06), rgba(234, 179, 8, 0.12));
  border-left: 4px solid ${accent.warning};
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: ${accent.warning};

  svg {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
  }
`;

export const AccentText = styled(Typography)`
  && {
    color: inherit;
  }
`;

export const RecommendedBadge = styled.span`
  display: inline-flex;
  align-items: center;
  background-color: ${brand.successHover};
  background-image: linear-gradient(135deg, ${brand.success}, ${brand.successHover});
  color: #ffffff;
  padding: 4px 12px;
  border-radius: 4px;
  font-size: ${fontSize(0)};
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

export const SuccessTriggerIcon = styled(CheckCircleIcon)`
  width: 16px;
  height: 16px;
  color: ${accent.success};
`;

export const PrimaryTriggerIcon = styled(CodeBracketIcon)`
  width: 16px;
  height: 16px;
  color: ${accent.primary};
`;

export const SecondaryTriggerIcon = styled(DocumentArrowDownIcon)`
  width: 16px;
  height: 16px;
  color: ${accent.secondary};
`;

export const CodeBlockWrapper = styled(Box)`
  position: relative;
  background-color: #0f172a;
  background-image: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: ${theme.shadows.lg};
  border: 1px solid rgba(255, 255, 255, 0.1);
`;

export const CodeBlock = styled.pre`
  margin: 0;
  padding: 20px;
  padding-top: 52px;
  color: #e2e8f0;
  font-family: 'Monaco', 'Consolas', 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.7;
  overflow-x: auto;
  max-height: 320px;
  white-space: pre;

  &::-webkit-scrollbar {
    height: 6px;
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.05);
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 3px;
  }

  .comment {
    color: #94a3b8;
    font-style: italic;
  }

  .string {
    color: #86efac;
  }

  .keyword {
    color: #c084fc;
  }

  .function {
    color: #67e8f9;
  }

  .number {
    color: #fbbf24;
  }
`;

export const CopyButton = styled.button`
  position: absolute;
  top: 12px;
  right: 12px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  color: #ffffff;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: rgba(255, 255, 255, 0.15);
    border-color: rgba(255, 255, 255, 0.3);
    transform: translateY(-1px);
  }

  &:focus-visible {
    outline: 2px solid #7dd3fc;
    outline-offset: 2px;
  }

  svg {
    width: 14px;
    height: 14px;
  }

  ${reducedMotion}
`;

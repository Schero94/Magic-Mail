/**
 * Styled components for the routing-rules view. Same look as before, but every
 * colour comes from the DS theme (dark mode) or the contrast-safe brand
 * palette, font sizes use the DS scale, and decorative motion respects
 * prefers-reduced-motion.
 */
import styled, { css, keyframes } from 'styled-components';
import { Box, Flex, Typography } from '@strapi/design-system';
import { accent, brand, color, fontSize, theme } from '../../utils/theme';
import { motionSafe, reducedMotion } from '../../components/shared/motion';

// ================ ANIMATIONS ================
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

// ================ RESPONSIVE BREAKPOINTS ================
export const breakpoints = {
  mobile: '768px',
  tablet: '1024px',
};

/** Accent tone helper: `$tone` is one of primary|secondary|success|warning|danger. */
const tone = (p) => accent[p.$tone ?? 'primary'](p);

// ================ STYLED COMPONENTS ================
export const Container = styled(Box)`
  ${motionSafe(css`
    animation: ${fadeIn} ${theme.transitions.slow};
  `)}
  min-height: 100vh;
  max-width: 1440px;
  margin: 0 auto;
  padding: ${theme.spacing.xl} ${theme.spacing.lg} 0;
  min-width: 0;

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
  overflow-wrap: anywhere;

  svg {
    flex-shrink: 0;
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
  font-weight: 400;
  margin-top: ${theme.spacing.xs};
  letter-spacing: 0.01em;
`;

export const StatsGrid = styled.div`
  margin-bottom: ${theme.spacing.xl};
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: ${theme.spacing.lg};

  @media screen and (max-width: ${breakpoints.mobile}) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    margin-bottom: 24px;

    /* Three cards in two columns: the last one spans the row (no empty cell). */
    & > *:last-child:nth-child(odd) {
      grid-column: 1 / -1;
    }
  }

  @media screen and (max-width: 360px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

export const StatCard = styled(Box)`
  background: ${color('neutral0')};
  border-radius: ${theme.borderRadius.lg};
  padding: ${theme.spacing.lg};
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

  ${reducedMotion}
`;

export const StatValue = styled(Typography)`
  font-size: 2.75rem;
  font-weight: 700;
  color: ${color('neutral800')};
  line-height: 1;
  margin-bottom: ${theme.spacing.sm};
  transition: all ${theme.transitions.normal};
  text-align: center;
  overflow-wrap: anywhere;

  @media screen and (max-width: ${breakpoints.mobile}) {
    font-size: 2rem;
    margin-bottom: ${theme.spacing.xs};
  }

  ${reducedMotion}
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

export const RulesContainer = styled(Box)`
  margin-top: ${theme.spacing.xl};
  min-width: 0;
`;

export const SectionBar = styled(Flex)`
  flex-wrap: wrap;
  gap: ${theme.spacing.sm} ${theme.spacing.md};
`;

export const WarningText = styled(Typography)`
  color: ${accent.warning};
  display: inline-flex;
  /* The icon stays beside the first line when the message wraps. */
  align-items: flex-start;
  gap: 4px;

  svg {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    margin-top: calc((1.4em - 14px) / 2);
  }
`;

export const RuleModalHeading = styled(Flex)`
  svg {
    width: 24px;
    height: 24px;
    flex-shrink: 0;
  }
`;

export const ActiveSwitchBox = styled(Box)`
  width: 100%;
  border-radius: ${theme.borderRadius.md};

  /* Touch screens: the DS switch (40x24) grows to a 48x32 target with the
     same proportions; the thumb keeps its 4px inset in both states. */
  @media (max-width: 767px) {
    button[role='switch'] {
      width: 48px;
      height: 32px;
      border-radius: 16px;
    }

    button[role='switch'] > span {
      width: 24px;
      height: 24px;
    }
  }
`;

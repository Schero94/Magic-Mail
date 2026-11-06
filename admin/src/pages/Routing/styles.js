/**
 * Styled components for the routing-rules view. Same look as before, but every
 * colour comes from the DS theme (dark mode) or the contrast-safe brand
 * palette, font sizes use the DS scale, and decorative motion respects
 * prefers-reduced-motion.
 */
import styled, { css, keyframes } from 'styled-components';
import { Box, Flex, Table, Typography } from '@strapi/design-system';
import { accent, brand, byScheme, color, fontSize, theme } from '../../utils/theme';
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

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
`;

// ================ RESPONSIVE BREAKPOINTS ================
export const breakpoints = {
  mobile: '768px',
  tablet: '1024px',
};

/** Accent tone helper: `$tone` is one of primary|secondary|success|warning|danger. */
const tone = (p) => accent[p.$tone ?? 'primary'](p);

// ================ STYLED COMPONENTS ================
export const FloatingIcon = styled.div`
  position: absolute;
  bottom: 40px;
  right: 40px;
  opacity: 0.08;
  color: ${accent.secondary};
  pointer-events: none;
  ${motionSafe(css`
    animation: ${float} 4s ease-in-out infinite;
  `)}

  svg {
    width: 72px;
    height: 72px;
  }
`;

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

export const EmptyState = styled(Box)`
  background: ${color('neutral0')};
  border-radius: ${theme.borderRadius.xl};
  border: 2px dashed rgba(128, 128, 128, 0.3);
  padding: 80px 32px;
  text-align: center;
  position: relative;
  overflow: hidden;
  min-height: 400px;
  display: flex;
  align-items: center;
  justify-content: center;

  @media screen and (max-width: ${breakpoints.mobile}) {
    padding: 48px 16px;
    min-height: 320px;
  }

  /* Background Gradient */
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(135deg, rgba(168, 85, 247, 0.06) 0%, rgba(2, 132, 199, 0.06) 100%);
    opacity: 0.3;
    z-index: 0;
  }
`;

export const EmptyIconCircle = styled.div`
  width: 120px;
  height: 120px;
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(168, 85, 247, 0.12) 0%, rgba(2, 132, 199, 0.12) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: ${theme.shadows.xl};

  svg {
    width: 60px;
    height: 60px;
    color: ${(p) => (p.$tone ? tone(p) : accent.secondary(p))};
  }
`;

export const EmptyTitle = styled(Typography)`
  font-size: 1.75rem;
  font-weight: 700;
  margin-bottom: 8px;
`;

export const EmptyText = styled(Typography)`
  max-width: 500px;
  line-height: 1.6;
`;

export const OnlineBadge = styled.span`
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: ${(p) => (p.$active ? accent.success(p) : 'rgba(128, 128, 128, 0.4)')};
  display: inline-block;
  flex-shrink: 0;
  ${(p) =>
    p.$active
      ? motionSafe(css`
          animation: ${pulse} 2s ease-in-out infinite;
        `)
      : ''}
`;

/** Wrapper of the rules table; the DS table scrolls sideways inside it when needed. */
export const TableScroll = styled.div`
  width: 100%;
  max-width: 100%;
  min-width: 0;

  @media screen and (max-width: ${breakpoints.mobile}) {
    display: none;
  }
`;

/** Mobile replacement for the table: one card per rule (hidden on wider screens). */
export const RuleCardList = styled.ol`
  display: none;
  list-style: none;
  margin: 0;
  padding: 0;

  @media screen and (max-width: ${breakpoints.mobile}) {
    display: flex;
    flex-direction: column;
    gap: ${theme.spacing.sm};
  }
`;

export const RuleCard = styled.li`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
  padding: ${theme.spacing.md};
  background: ${color('neutral0')};
  border: 1px solid rgba(128, 128, 128, 0.2);
  border-radius: ${theme.borderRadius.lg};
  box-shadow: ${theme.shadows.sm};
  min-width: 0;
  overflow-wrap: anywhere;
`;

export const RuleCardDetails = styled.dl`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: ${theme.spacing.md};
  margin: 0;

  dt {
    font-size: ${fontSize(1)};
    font-weight: 600;
    letter-spacing: 0.025em;
    text-transform: uppercase;
    color: ${color('neutral600')};
    margin-bottom: ${theme.spacing.xs};
  }

  dd {
    margin: 0;
    min-width: 0;
    color: ${color('neutral800')};
  }
`;

export const StyledTable = styled(Table)`
  /* The row actions stay visible while a narrow table scrolls sideways. */
  th.actions-cell,
  td.actions-cell {
    position: sticky;
    /* The DS table wrapper has 24px inline padding; stick to its outer edge
       so scrolled columns do not show through beside the actions. */
    right: -24px;
    z-index: 1;
    background: ${color('neutral0')};
    box-shadow: -1px 0 0 rgba(128, 128, 128, 0.2);
  }

  th.actions-cell {
    background: ${color('neutral100')};
  }

  thead {
    background: ${color('neutral100')};
    border-bottom: 2px solid rgba(128, 128, 128, 0.2);

    th {
      font-weight: 600;
      color: ${color('neutral800')};
      font-size: ${fontSize(1)};
      text-transform: uppercase;
      letter-spacing: 0.025em;
      padding: ${theme.spacing.lg} ${theme.spacing.md};
      /* Long translated headings ("Tipo de correspondência") wrap between
         words instead of widening the table. */
      white-space: normal;
    }
  }

  tbody tr {
    transition: all ${theme.transitions.fast};
    border-bottom: 1px solid rgba(128, 128, 128, 0.15);

    &:last-child {
      border-bottom: none;
    }

    &:hover {
      background: rgba(2, 132, 199, 0.12);
    }

    &:hover td.actions-cell {
      background: ${byScheme('#E1F0F8', '#1D2D46')};
    }

    td {
      padding: ${theme.spacing.lg} ${theme.spacing.md};
      color: ${color('neutral800')};
      vertical-align: middle;
    }

    /* Long names, values and account names wrap instead of widening the table. */
    /* Minimum widths keep all seven columns inside the 976px content area of
       a 1024px admin (no sideways scrolling on desktop). */
    td.wrap-cell {
      white-space: normal;
      overflow-wrap: anywhere;
      min-width: 136px;
    }

    td.name-cell {
      min-width: 160px;
    }

    /* Long translated match types ("Benutzerdefiniertes Feld") wrap inside
       the badge between words. */
    td.type-cell {
      white-space: normal;
      max-width: 160px;
    }

    ${reducedMotion}
  }
`;

export const MatchValue = styled(Typography)`
  font-family: monospace;
  overflow-wrap: anywhere;
`;

export const FilterBar = styled(Flex)`
  background: ${color('neutral0')};
  padding: ${theme.spacing.md} ${theme.spacing.lg};
  border-radius: ${theme.borderRadius.lg};
  margin-bottom: ${theme.spacing.lg};
  box-shadow: ${theme.shadows.sm};
  border: 1px solid rgba(128, 128, 128, 0.2);
  gap: ${theme.spacing.md};
  align-items: center;
  flex-wrap: wrap;

  @media screen and (max-width: ${breakpoints.mobile}) {
    padding: 12px;
    gap: 12px;
    flex-direction: column;
    align-items: stretch;

    /* Doubled class: wins over the flex-basis of SearchSlot / FilterSlot,
       which would otherwise become a 260px height in the column layout. */
    && > * {
      flex: 0 0 auto;
      width: 100%;
      min-width: 0;
    }
  }
`;

export const SearchSlot = styled.div`
  flex: 1 1 260px;
  min-width: 0;
  display: flex;
`;

export const FilterSlot = styled.div`
  flex: 0 1 180px;
  min-width: 160px;

  /* Same height as the shared SearchField next to it (10px padding, 20px line,
     2px border). Below 768px both follow the 48px DS input height. */
  [role='combobox'] {
    min-height: 42px;
  }

  @media (max-width: 767px) {
    [role='combobox'] {
      min-height: 48px;
    }
  }
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

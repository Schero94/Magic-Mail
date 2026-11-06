import styled, { keyframes, css } from 'styled-components';
import { Box, Flex, Modal, Table, Typography } from '@strapi/design-system';
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

export const breakpoints = {
  mobile: '768px',
  tablet: '1024px',
};

/** Accent tone -> colour helpers used by the stat cards. */
const tone = (name) => accent[name] ?? accent.primary;

// ================ PAGE ================
export const FloatingIcon = styled.div`
  position: absolute;
  bottom: 40px;
  right: 40px;
  opacity: 0.08;
  color: ${color('neutral800')};
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

  @media screen and (max-width: ${breakpoints.mobile}) {
    padding: 16px 12px 0;
  }
`;

export const Header = styled(Box)`
  background: ${brand.gradient};
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
  && {
    color: #ffffff;
    font-size: 2rem;
    font-weight: 700;
    letter-spacing: -0.025em;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    line-height: 1.25;
    display: flex;
    /* The icon stays beside the first line when the title wraps. */
    align-items: flex-start;
    gap: ${theme.spacing.sm};
  }

  svg {
    width: 28px;
    height: 28px;
    margin-top: calc((1.25em - 28px) / 2);
    flex-shrink: 0;
    ${motionSafe(css`
      animation: ${float} 3s ease-in-out infinite;
    `)}
  }

  @media screen and (max-width: ${breakpoints.mobile}) {
    && {
      font-size: 1.5rem;
    }

    svg {
      width: 22px;
      height: 22px;
      margin-top: calc((1.25em - 22px) / 2);
    }
  }
`;

export const Subtitle = styled(Typography)`
  && {
    color: rgba(255, 255, 255, 0.95);
    font-size: ${fontSize(2)};
    font-weight: 400;
    margin-top: ${theme.spacing.xs};
    letter-spacing: 0.01em;
  }
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
    border-color: ${(p) => tone(p.$tone)(p)};

    .stat-icon {
      transform: scale(1.15) rotate(5deg);
    }

    .stat-value {
      transform: scale(1.08);
      color: ${(p) => tone(p.$tone)(p)};
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
    color: ${(p) => tone(p.$tone)(p)};
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
  && {
    font-size: 2.75rem;
    font-weight: 700;
    color: ${color('neutral800')};
    line-height: 1;
    margin-bottom: ${theme.spacing.sm};
    transition: all ${theme.transitions.normal};
    text-align: center;
    overflow-wrap: anywhere;
  }

  @media screen and (max-width: ${breakpoints.mobile}) {
    && {
      font-size: 2rem;
      margin-bottom: ${theme.spacing.xs};
    }
  }

  ${reducedMotion}
`;

export const StatLabel = styled(Typography)`
  && {
    font-size: ${fontSize(2)};
    color: ${color('neutral600')};
    font-weight: 500;
    letter-spacing: 0.025em;
    text-align: center;
  }

  @media screen and (max-width: ${breakpoints.mobile}) {
    && {
      font-size: ${fontSize(1)};
    }
  }
`;

export const AccountsContainer = styled(Box)`
  margin-top: ${theme.spacing.xl};
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

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, rgba(2, 132, 199, 0.06) 0%, rgba(168, 85, 247, 0.06) 100%);
    opacity: 0.3;
    z-index: 0;
  }
`;

export const EmptyIconCircle = styled.div`
  width: 120px;
  height: 120px;
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(2, 132, 199, 0.12) 0%, rgba(168, 85, 247, 0.12) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: ${theme.shadows.xl};

  svg {
    width: 60px;
    height: 60px;
    color: ${(p) => (p.$danger ? accent.danger(p) : accent.primary(p))};
  }
`;

export const OnlineBadge = styled.span`
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: ${(p) => (p.$active ? brand.success : 'rgba(128, 128, 128, 0.4)')};
  display: inline-block;
  flex-shrink: 0;
  ${(p) =>
    p.$active &&
    motionSafe(css`
      animation: ${pulse} 2s ease-in-out infinite;
    `)}
`;

export const TableScroller = styled(Box)`
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;

  @media screen and (max-width: ${breakpoints.mobile}) {
    display: none;
  }
`;

/** Mobile replacement for the table: one card per account (hidden on wider screens). */
export const AccountCardList = styled.ul`
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

export const AccountCard = styled.li`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
  padding: ${theme.spacing.md};
  background: ${color('neutral0')};
  border: 1px solid rgba(128, 128, 128, 0.2);
  border-radius: ${theme.borderRadius.lg};
  box-shadow: ${theme.shadows.sm};
  min-width: 0;
`;

export const AccountCardStats = styled.dl`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
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

    /* Long account names and addresses wrap instead of widening the table. */
    td.account-cell {
      white-space: normal;
      min-width: 200px;
      overflow-wrap: anywhere;
    }

    ${reducedMotion}
  }
`;

export const UsageTrack = styled.div`
  width: 100%;
  min-width: 80px;
  height: 6px;
  border-radius: 999px;
  overflow: hidden;
  background: ${color('neutral150')};
`;

export const UsageFill = styled.div`
  height: 100%;
  border-radius: 999px;
  background: ${(p) => (p.$danger ? brand.danger : brand.success)};
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
    flex-direction: column;
    align-items: stretch;

    & > * {
      width: 100%;
      min-width: 0 !important;
    }
  }
`;

export const FilterSelectBox = styled(Box)`
  min-width: 160px;

  /* Same height as the shared SearchField next to it (10px padding, 20px line,
     2px border). Below 768px both follow the 48px DS input height. */
  [role='combobox'] {
    min-height: 42px;
  }
`;

export const SectionHeaderRow = styled(Flex)`
  flex-wrap: wrap;
  gap: ${theme.spacing.md};
`;

// ================ TEST MODAL ================
export const StyledModalContent = styled(Modal.Content)`
  && {
    border-radius: 16px;
    overflow: hidden;
    max-width: 560px;
    width: calc(100vw - 24px);
  }
`;

export const StyledModalHeader = styled(Modal.Header)`
  && {
    background: ${brand.gradient};
    padding: ${theme.spacing.md} ${theme.spacing.lg};
    border-bottom: none;

    h2 {
      color: #ffffff;
      font-size: ${fontSize(4)};
      font-weight: 700;
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

      &:focus-visible {
        outline: 2px solid #ffffff;
        outline-offset: 2px;
      }

      svg {
        fill: #ffffff !important;
        color: #ffffff !important;
        path {
          fill: #ffffff !important;
        }
      }
    }
  }

  @media screen and (max-width: ${breakpoints.mobile}) {
    && {
      padding: ${theme.spacing.md};
    }
  }
`;

export const StyledModalBody = styled(Modal.Body)`
  && {
    padding: 0 ${theme.spacing.lg};
    background: ${color('neutral0')};
    width: 100%;
    box-sizing: border-box;
  }

  /* The DS scroll viewport adds 40px block padding; match the 24px inline padding. */
  && > div {
    padding-block: ${theme.spacing.lg};
  }

  @media screen and (max-width: ${breakpoints.mobile}) {
    && {
      padding: 0 ${theme.spacing.md};
    }

    && > div {
      padding-block: ${theme.spacing.md};
    }
  }
`;

export const StyledModalFooter = styled(Modal.Footer)`
  && {
    padding: ${theme.spacing.md} ${theme.spacing.lg};
    border-top: 1px solid rgba(128, 128, 128, 0.2);
    background: ${color('neutral100')};
  }

  @media screen and (max-width: ${breakpoints.mobile}) {
    && {
      padding: 16px;
    }
  }
`;

export const AccountInfoCard = styled(Box)`
  background: linear-gradient(135deg, rgba(2, 132, 199, 0.06) 0%, rgba(168, 85, 247, 0.06) 100%);
  border: 1px solid rgba(2, 132, 199, 0.2);
  border-radius: 12px;
  padding: 16px 20px;
  text-align: center;
  width: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  overflow-wrap: anywhere;
`;

export const AccentText = styled(Typography)`
  && {
    color: ${accent.primary};
    font-weight: 500;
  }
`;

export const TestOptionCard = styled.div`
  padding: 16px 20px;
  border: 2px solid ${(p) => (p.$selected ? accent.primary(p) : 'rgba(128, 128, 128, 0.2)')};
  border-radius: 12px;
  cursor: ${(p) => (p.$disabled ? 'not-allowed' : 'pointer')};
  opacity: ${(p) => (p.$disabled ? 0.6 : 1)};
  transition: all ${theme.transitions.fast};
  background: ${(p) => (p.$selected ? 'rgba(2, 132, 199, 0.06)' : color('neutral0')(p))};

  &:hover {
    border-color: ${(p) => (p.$disabled ? 'rgba(128, 128, 128, 0.2)' : 'rgba(2, 132, 199, 0.4)')};
    background: ${(p) => (p.$disabled ? color('neutral0')(p) : 'rgba(2, 132, 199, 0.06)')};
  }

  &:focus-visible {
    outline: 2px solid ${accent.primary};
    outline-offset: 2px;
  }

  & + & {
    margin-top: 12px;
  }

  .option-icon {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    color: ${(p) => (p.$selected ? accent.primary(p) : color('neutral600')(p))};
  }

  .option-title {
    color: ${(p) => (p.$selected ? accent.primary(p) : color('neutral800')(p))};
  }

  ${reducedMotion}
`;

export const ModalFieldLabel = styled.label`
  font-size: 13px;
  font-weight: 600;
  color: ${color('neutral700')};
  margin-bottom: 8px;
  display: block;
`;

export const ModalGroupLabel = styled.span`
  font-size: 13px;
  font-weight: 600;
  color: ${color('neutral700')};
  margin-bottom: 8px;
  display: block;
`;

export const ModalHint = styled.p`
  font-size: 12px;
  color: ${color('neutral600')};
  margin-top: ${theme.spacing.xs};
`;

export const ModalError = styled.p`
  font-size: 12px;
  color: ${accent.danger};
  margin-top: ${theme.spacing.xs};
`;

const fieldStyles = css`
  width: 100%;
  padding: 12px 16px;
  border: 1px solid ${(p) => (p.$invalid ? accent.danger(p) : 'rgba(128, 128, 128, 0.2)')};
  border-radius: 8px;
  font-size: 14px;
  background: ${color('neutral0')};
  color: ${color('neutral800')};
  transition: all ${theme.transitions.fast};
  box-sizing: border-box;

  &:focus {
    outline: none;
    border-color: ${brand.primary};
    box-shadow: 0 0 0 3px rgba(3, 105, 161, 0.2);
  }

  ${reducedMotion}
`;

export const StyledModalSelect = styled.select`
  ${fieldStyles}
  cursor: pointer;
`;

export const StyledModalInput = styled.input`
  ${fieldStyles}

  &::placeholder {
    color: ${color('neutral500')};
  }
`;

export const AdvancedBox = styled(Box)`
  margin-top: 20px;
  padding: 16px;
  background: ${color('neutral100')};
  border-radius: 12px;
`;

import { useState, useEffect, useRef } from 'react';
import { useFetchClient, useNotification } from '@strapi/strapi/admin';
import { useNavigate } from 'react-router-dom';
import { useAuthRefresh } from '../../hooks/useAuthRefresh';
import styled, { keyframes, css } from 'styled-components';
import {
  Box,
  Button,
  Flex,
  Typography,
  Loader,
  Badge,
  TextInput,
  Tabs,
  Divider,
  Modal,
  Accordion,
} from '@strapi/design-system';
import { Table, Thead, Tbody, Tr, Th, Td } from '@strapi/design-system';
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  DocumentTextIcon,
  MagnifyingGlassIcon,
  ChartBarIcon,
  SparklesIcon,
  CheckCircleIcon,
  BoltIcon,
  CodeBracketIcon,
  DocumentDuplicateIcon,
  DocumentArrowDownIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  PaperAirplaneIcon,
} from '@heroicons/react/24/outline';
import { useLicense } from '../../hooks/useLicense';
import { 
  GradientButton, 
  SecondaryButton, 
  TertiaryButton,
  CTAButton,
  IconButton,
  IconButtonDanger,
  IconButtonPrimary,
  IconButtonSuccess,
  IconButtonWarning,
  IconButtonPurple,
} from '../../components/StyledButtons';

// ================ THEME (Exact copy from RoutingRules) ================
const theme = {
  colors: {
    primary: { 50: 'rgba(14, 165, 233, 0.06)', 100: 'rgba(14, 165, 233, 0.12)', 500: '#0EA5E9', 600: '#0284C7', 700: '#0369A1' },
    secondary: { 50: 'rgba(168, 85, 247, 0.06)', 100: 'rgba(168, 85, 247, 0.1)', 500: '#A855F7', 600: '#9333EA' },
    success: { 100: 'rgba(34, 197, 94, 0.15)', 500: '#22C55E', 600: '#16A34A', 700: '#15803D' },
    warning: { 100: 'rgba(245, 158, 11, 0.15)', 500: '#F59E0B', 600: '#D97706' },
    danger: { 100: 'rgba(220, 38, 38, 0.12)', 500: '#EF4444', 600: '#DC2626' },
    neutral: { 0: 'var(--colors-neutral0, #FFFFFF)', 50: 'var(--colors-neutral100, #F9FAFB)', 100: 'rgba(128, 128, 128, 0.1)', 200: 'rgba(128, 128, 128, 0.2)', 600: 'var(--colors-neutral600, #4B5563)', 700: 'var(--colors-neutral800, #374151)', 800: 'var(--colors-neutral900, #1F2937)' }
  },
  shadows: {
    sm: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
    xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
  },
  transitions: { fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)', normal: '300ms cubic-bezier(0.4, 0, 0.2, 1)', slow: '500ms cubic-bezier(0.4, 0, 0.2, 1)' },
  spacing: { xs: '4px', sm: '8px', md: '16px', lg: '24px', xl: '32px', '2xl': '48px' },
  borderRadius: { md: '8px', lg: '12px', xl: '16px' }
};

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

const FloatingEmoji = styled.div`
  position: absolute;
  bottom: 40px;
  right: 40px;
  font-size: 72px;
  opacity: 0.08;
  ${css`animation: ${float} 4s ease-in-out infinite;`}
`;

// Custom Scrollbar for Modal
const ScrollableDialogBody = styled(Box)`
  overflow-y: auto;
  max-height: calc(85vh - 160px);
  padding: 24px 28px 28px 28px;
  background: ${(p) => p.theme.colors.neutral0};

  /* Custom Scrollbar */
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

const CodeSection = styled(Box)`
  margin-bottom: 32px;
  
  &:last-child {
    margin-bottom: 0;
  }
`;

const CodeHeader = styled(Flex)`
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
`;

const CodeLabel = styled(Typography)`
  font-size: 15px;
  font-weight: 600;
  color: var(--colors-neutral800);
  display: flex;
  align-items: center;
  gap: 8px;
`;

const RecommendedBadge = styled(Badge)`
  background: linear-gradient(135deg, ${'var(--colors-success600, #22C55E)'}, ${'var(--colors-success600, #16A34A)'});
  color: white;
  padding: 4px 12px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const CodeBlockWrapper = styled(Box)`
  position: relative;
  background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: ${theme.shadows.lg};
  border: 1px solid rgba(255, 255, 255, 0.1);
`;

const CodeBlock = styled.pre`
  margin: 0;
  padding: 20px;
  color: #e2e8f0;
  font-family: 'Monaco', 'Consolas', 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.7;
  overflow-x: auto;
  max-height: 320px;
  
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
  
  &::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.3);
  }

  /* Syntax highlighting */
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

const CopyButton = styled(Button)`
  position: absolute;
  top: 12px;
  right: 12px;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: white;
  padding: 6px 12px;
  font-size: 12px;
  transition: all 0.2s;
  
  &:hover {
    background: rgba(255, 255, 255, 0.15);
    border-color: rgba(255, 255, 255, 0.3);
    transform: translateY(-1px);
  }
  
  svg {
    width: 14px;
    height: 14px;
  }
`;

const InfoBox = styled(Box)`
  background: linear-gradient(135deg, ${'rgba(2, 132, 199, 0.06)'}, ${'rgba(2, 132, 199, 0.12)'});
  border-left: 4px solid ${'var(--colors-primary600, #0EA5E9)'};
  border-radius: 8px;
  padding: 16px;
  margin-top: 24px;
`;

const WarningBox = styled(Box)`
  background: linear-gradient(135deg, ${'rgba(234, 179, 8, 0.06)'}, ${'rgba(234, 179, 8, 0.12)'});
  border-left: 4px solid ${'var(--colors-warning600, #F59E0B)'};
  border-radius: 8px;
  padding: 12px 16px;
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const LimitWarning = styled(Box)`
  background: linear-gradient(135deg, ${'rgba(234, 179, 8, 0.06)'}, rgba(251, 191, 36, 0.1));
  border: 1px solid rgba(234, 179, 8, 0.2);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const UpgradeButton = styled(Button)`
  background: linear-gradient(135deg, ${'var(--colors-warning600, #F59E0B)'}, ${'var(--colors-warning600, #D97706)'});
  color: white;
  font-weight: 600;
  padding: 8px 16px;
  font-size: 13px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  
  &:hover {
    background: linear-gradient(135deg, ${'var(--colors-warning600, #D97706)'}, ${'var(--colors-warning600, #A16207)'});
    transform: translateY(-1px);
  }
`;

// ================ RESPONSIVE BREAKPOINTS ================
const breakpoints = {
  mobile: '768px',
  tablet: '1024px',
};

// ================ STYLED COMPONENTS ================
const Container = styled(Box)`
  ${css`animation: ${fadeIn} ${theme.transitions.slow};`}
  min-height: 100vh;
  max-width: 1440px;
  margin: 0 auto;
  padding: ${theme.spacing.xl} ${theme.spacing.lg} 0;
  
  @media screen and (max-width: ${breakpoints.mobile}) {
    padding: 16px 12px 0;
  }
`;

const Header = styled(Box)`
  background: linear-gradient(135deg, 
    var(--colors-secondary600, #7C3AED) 0%, 
    ${'var(--colors-primary600, #0284C7)'} 100%
  );
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
    ${css`animation: ${shimmer} 3s infinite;`}
  }
  
  &::after {
    content: '';
    position: absolute;
    top: 0;
    right: 0;
    width: 100%;
    height: 100%;
    background-image: radial-gradient(circle at 20% 80%, transparent 50%, rgba(255, 255, 255, 0.1) 50%);
    background-size: 15px 15px;
    opacity: 0.3;
  }
`;

const HeaderContent = styled(Flex)`
  position: relative;
  z-index: 1;
`;

const Title = styled(Typography)`
  color: white;
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
    ${css`animation: ${float} 3s ease-in-out infinite;`}
  }
  
  @media screen and (max-width: ${breakpoints.mobile}) {
    font-size: 1.5rem;
    
    svg {
      width: 22px;
      height: 22px;
    }
  }
`;

const Subtitle = styled(Typography)`
  color: rgba(255, 255, 255, 0.95);
  font-size: 0.95rem;
  font-weight: 500;
  margin-top: ${theme.spacing.xs};
  letter-spacing: 0.01em;
  
  @media screen and (max-width: ${breakpoints.mobile}) {
    font-size: 0.85rem;
  }
`;

const StatsGrid = styled.div`
  margin-bottom: ${theme.spacing.xl};
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: ${theme.spacing.lg};
  justify-content: center;
  max-width: 1200px;
  margin-left: auto;
  margin-right: auto;
  
  @media screen and (max-width: ${breakpoints.mobile}) {
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
    margin-bottom: 24px;
  }
`;

const StatCard = styled(Box)`
  background: ${(p) => p.theme.colors.neutral0};
  border-radius: ${theme.borderRadius.lg};
  padding: 28px ${theme.spacing.lg};
  position: relative;
  overflow: hidden;
  transition: all ${theme.transitions.normal};
  ${css`animation: ${fadeIn} ${theme.transitions.slow} backwards;`}
  animation-delay: ${props => props.$delay || '0s'};
  box-shadow: ${theme.shadows.sm};
  border: 1px solid rgba(128, 128, 128, 0.2);
  min-width: 200px;
  flex: 1;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  
  @media screen and (max-width: ${breakpoints.mobile}) {
    min-width: unset;
    padding: 20px 12px;
    
    &:hover {
      transform: none;
    }
  }
  
  &:hover {
    transform: translateY(-6px);
    box-shadow: ${theme.shadows.xl};
    border-color: ${props => props.$color || 'var(--colors-primary600, #0EA5E9)'};
    
    .stat-icon {
      transform: scale(1.15) rotate(5deg);
    }
    
    .stat-value {
      transform: scale(1.08);
      color: ${props => props.$color || 'var(--colors-primary600, #0284C7)'};
    }
  }
`;

const StatIcon = styled(Box)`
  width: 68px;
  height: 68px;
  border-radius: ${theme.borderRadius.lg};
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${props => props.$bg || 'rgba(2, 132, 199, 0.12)'};
  transition: all ${theme.transitions.normal};
  margin: 0 auto 20px;
  box-shadow: ${theme.shadows.sm};
  
  svg {
    width: 34px;
    height: 34px;
    color: ${props => props.$color || 'var(--colors-primary600, #0284C7)'};
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

const StatValue = styled(Typography)`
  font-size: 2.75rem;
  font-weight: 700;
  color: var(--colors-neutral800);
  line-height: 1;
  margin-bottom: 10px;
  transition: all ${theme.transitions.normal};
  text-align: center;
  
  @media screen and (max-width: ${breakpoints.mobile}) {
    font-size: 2rem;
    margin-bottom: 6px;
  }
`;

const StatLabel = styled(Typography)`
  font-size: 0.95rem;
  color: var(--colors-neutral600);
  font-weight: 500;
  letter-spacing: 0.025em;
  text-align: center;
  
  @media screen and (max-width: ${breakpoints.mobile}) {
    font-size: 0.8rem;
  }
`;

const TemplatesContainer = styled(Box)`
  margin-top: ${theme.spacing.xl};
`;

const SectionHeader = styled(Box)`
  margin-bottom: ${theme.spacing.md};
`;

const FilterBar = styled(Flex)`
  background: ${(p) => p.theme.colors.neutral0};
  padding: ${theme.spacing.md} ${theme.spacing.lg};
  border-radius: ${theme.borderRadius.lg};
  margin-bottom: ${theme.spacing.lg};
  box-shadow: ${theme.shadows.sm};
  border: 1px solid rgba(128, 128, 128, 0.2);
  gap: ${theme.spacing.md};
  align-items: center;
`;

const SearchInputWrapper = styled.div`
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
`;

const SearchIcon = styled(MagnifyingGlassIcon)`
  position: absolute;
  left: 12px;
  width: 16px;
  height: 16px;
  color: var(--colors-neutral600);
  pointer-events: none;
  z-index: 1;
`;

const StyledSearchInput = styled(TextInput)`
  width: 100%;
  padding-left: 36px;
`;

const TableWrapper = styled(Box)`
  overflow-x: auto;
  border-radius: ${theme.borderRadius.lg};
  border: 1px solid rgba(128, 128, 128, 0.2);
  background: ${(p) => p.theme.colors.neutral0};
  
  &::-webkit-scrollbar {
    height: 8px;
  }
  
  &::-webkit-scrollbar-track {
    background: var(--colors-neutral100);
    border-radius: 4px;
  }
  
  &::-webkit-scrollbar-thumb {
    background: rgba(128, 128, 128, 0.3);
    border-radius: 4px;
    
    &:hover {
      background: rgba(128, 128, 128, 0.4);
    }
  }
`;

const StyledTable = styled(Table)`
  width: 100%;
  min-width: 900px;
  
  thead {
    background: var(--colors-neutral100);
    border-bottom: 2px solid rgba(128, 128, 128, 0.2);
    
    th {
      font-weight: 600;
      color: var(--colors-neutral800);
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.025em;
      padding: 12px 16px;
      white-space: nowrap;
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
    
    td {
      padding: 10px 12px;
      color: var(--colors-neutral800);
      vertical-align: middle;
      font-size: 13px;
    }
  }
`;

const PaginationWrapper = styled(Flex)`
  padding: 16px 20px;
  background: var(--colors-neutral100);
  border-top: 1px solid rgba(128, 128, 128, 0.2);
  border-radius: 0 0 ${theme.borderRadius.lg} ${theme.borderRadius.lg};
`;

const PaginationButton = styled.button`
  background: ${props => props.active ? 'linear-gradient(135deg, var(--colors-primary600, #0EA5E9) 0%, var(--colors-secondary500, #A855F7) 100%)' : '${(p) => p.theme.colors.neutral0}'};
  color: ${props => props.active ? 'white' : 'var(--colors-neutral700)'};
  border: 1px solid ${props => props.active ? 'transparent' : 'rgba(128, 128, 128, 0.3)'};
  padding: 6px 12px;
  min-width: 36px;
  height: 36px;
  border-radius: 8px;
  font-weight: 500;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover:not(:disabled) {
    background: ${props => props.active ? 'linear-gradient(135deg, var(--colors-primary700, #0284C7) 0%, var(--colors-secondary600, #9333EA) 100%)' : 'var(--colors-neutral100)'};
    border-color: ${props => props.active ? 'transparent' : 'rgba(128, 128, 128, 0.4)'};
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const EmptyState = styled(Box)`
  background: ${(p) => p.theme.colors.neutral0};
  border-radius: ${theme.borderRadius.xl};
  border: 2px dashed rgba(128, 128, 128, 0.3);
  padding: 80px 32px;
  text-align: center;
  position: relative;
  overflow: hidden;
  min-height: 500px;
  display: flex;
  align-items: center;
  justify-content: center;
  
  /* Background Gradient */
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(135deg, rgba(168, 85, 247, 0.06) 0%, ${'rgba(2, 132, 199, 0.06)'} 100%);
    opacity: 0.3;
    z-index: 0;
  }
`;

const EmptyContent = styled.div`
  position: relative;
  z-index: 1;
  max-width: 600px;
  margin: 0 auto;
`;

const EmptyIcon = styled.div`
  width: 120px;
  height: 120px;
  margin: 0 auto ${theme.spacing.lg};
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(168, 85, 247, 0.12) 0%, ${'rgba(2, 132, 199, 0.12)'} 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: ${theme.shadows.xl};
  
  svg {
    width: 60px;
    height: 60px;
    color: ${'var(--colors-primary600, #0284C7)'};
  }
`;

const EmptyFeatureList = styled.div`
  margin: ${theme.spacing.xl} 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: ${theme.spacing.md};
  
  @media screen and (max-width: ${breakpoints.tablet}) {
    grid-template-columns: 1fr;
  }
`;

const EmptyFeatureItem = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.lg};
  background: ${(p) => p.theme.colors.neutral0};
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
    color: ${'var(--colors-success600, #22C55E)'};
    flex-shrink: 0;
    margin-bottom: ${theme.spacing.xs};
  }
`;

const EmptyButtonGroup = styled.div`
  display: flex;
  gap: ${theme.spacing.md};
  justify-content: center;
  margin-top: ${theme.spacing.xl};
  flex-wrap: wrap;
`;

const HiddenFileInput = styled.input`
  display: none;
`;

// ================ MODAL STYLED COMPONENTS ================
const StyledModalContent = styled(Modal.Content)`
  && {
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    max-width: 480px;
  }
`;

const StyledModalHeader = styled(Modal.Header)`
  && {
    background: linear-gradient(135deg, ${'var(--colors-primary600, #0EA5E9)'} 0%, var(--colors-secondary600, #A855F7) 100%);
    padding: 24px 28px;
    border-bottom: none;
    
    h2 {
      color: white;
      font-size: 1.25rem;
      font-weight: 700;
    }
    
    /* Close button styling */
    button {
      color: white !important;
      opacity: 0.9;
      background: rgba(255, 255, 255, 0.15) !important;
      border-radius: 8px;
      
      &:hover {
        opacity: 1;
        background: rgba(255, 255, 255, 0.25) !important;
      }
      
      svg {
        fill: white !important;
        color: white !important;
        
        path {
          fill: white !important;
        }
      }
    }
  }
`;

const StyledModalBody = styled(Modal.Body)`
  && {
    padding: 28px;
    background: ${(p) => p.theme.colors.neutral0};
  }
`;

const ModalField = styled(Box)`
  margin-bottom: 20px;
  
  &:last-child {
    margin-bottom: 0;
  }
`;

const ModalLabel = styled(Typography)`
  && {
    font-weight: 600;
    font-size: 13px;
    color: var(--colors-neutral700);
    margin-bottom: 8px;
    display: block;
  }
`;

const ModalHint = styled(Typography)`
  && {
    font-size: 12px;
    color: var(--colors-neutral600);
    margin-top: 6px;
    display: block;
  }
`;

const ModalTemplateInfo = styled(Box)`
  background: linear-gradient(135deg, ${'rgba(2, 132, 199, 0.06)'} 0%, rgba(168, 85, 247, 0.06) 100%);
  border: 1px solid ${'rgba(2, 132, 199, 0.12)'};
  border-radius: 10px;
  padding: 14px 16px;
  
  p {
    margin: 0;
    font-weight: 500;
    color: var(--colors-neutral800);
  }
`;

const StyledSelect = styled.select`
  width: 100%;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid rgba(128, 128, 128, 0.2);
  font-size: 14px;
  background: ${(p) => p.theme.colors.neutral0};
  cursor: pointer;
  transition: all ${theme.transitions.fast};
  color: var(--colors-neutral700);
  
  &:hover {
    border-color: ${'var(--colors-primary600, #0EA5E9)'};
  }
  
  &:focus {
    outline: none;
    border-color: ${'var(--colors-primary600, #0EA5E9)'};
    box-shadow: 0 0 0 3px ${'rgba(2, 132, 199, 0.12)'};
  }
`;

const StyledModalFooter = styled(Modal.Footer)`
  && {
    padding: 20px 28px;
    background: var(--colors-neutral100);
    border-top: 1px solid rgba(128, 128, 128, 0.2);
    gap: 12px;
  }
`;

const TemplateList = () => {
  const { get, del, post } = useFetchClient();
  const { toggleNotification } = useNotification();
  const navigate = useNavigate();
  const { hasFeature } = useLicense();
  useAuthRefresh(); // Initialize token auto-refresh

  const [templates, setTemplates] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('customTemplates');
  const [showCodeExample, setShowCodeExample] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [copiedCode, setCopiedCode] = useState(null); // Track which code snippet was copied
  const [limits, setLimits] = useState(null);
  const [showTestSendModal, setShowTestSendModal] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [testAccount, setTestAccount] = useState('');
  const [accounts, setAccounts] = useState([]);
  const fileInputRef = useRef(null);

  // Import/Export always available (no license required)
  const canExport = true;
  const canImport = true;

  // Core email types (Strapi defaults)
  const coreEmailTypes = [
    {
      type: 'reset-password',
      name: 'Reset Password',
      description: 'Email sent when user requests password reset',
    },
    {
      type: 'email-confirmation',
      name: 'Email Address Confirmation',
      description: 'Email sent to confirm user email address',
    },
  ];

  useEffect(() => {
    fetchData();
    fetchLimits();
    fetchAccounts();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Parallel fetching for speed
      const [templatesResponse, statsResponse] = await Promise.all([
        get('/magic-mail/designer/templates').catch(() => ({ data: { data: [] } })),
        get('/magic-mail/designer/stats').catch(() => ({ data: { data: null } })),
      ]);

      setTemplates(templatesResponse.data?.data || []);
      setStats(statsResponse.data?.data || null);
    } catch (error) {
      toggleNotification({ type: 'danger', message: 'Failed to load templates' });
    } finally {
      setLoading(false);
    }
  };

  const fetchLimits = async () => {
    try {
      const response = await get('/magic-mail/license/limits');
      console.log('[DEBUG] License limits response:', response.data);
      
      // Also fetch debug data
      try {
        const debugResponse = await get('/magic-mail/license/debug');
        console.log('[DEBUG] License debug data:', debugResponse.data);
      } catch (debugError) {
        console.error('[DEBUG] Failed to fetch debug data:', debugError);
      }
      
      setLimits({
        ...response.data?.limits,
        tier: response.data?.tier || 'free'
      });
    } catch (error) {
      console.error('Failed to fetch license limits:', error);
    }
  };

  const fetchAccounts = async () => {
    try {
      const response = await get('/magic-mail/accounts');
      setAccounts(response.data?.data || []);
    } catch (error) {
      console.error('Failed to fetch accounts:', error);
    }
  };

  const handleTestSend = (template) => {
    setSelectedTemplate(template);
    setShowTestSendModal(true);
    setTestEmail('');
    setTestAccount('');
  };

  const sendTestEmail = async () => {
    if (!testEmail) {
      toggleNotification({
        type: 'warning',
        message: 'Please enter an email address',
      });
      return;
    }

    try {
      const response = await post(`/magic-mail/designer/templates/${selectedTemplate.id}/test-send`, {
        to: testEmail,
        accountName: testAccount || null,
      });

      toggleNotification({
        type: 'success',
        message: `Test email sent to ${testEmail}!`,
      });

      setShowTestSendModal(false);
      setTestEmail('');
      setTestAccount('');
    } catch (error) {
      console.error('Failed to send test email:', error);
      toggleNotification({
        type: 'danger',
        message: error?.response?.data?.error?.message || 'Failed to send test email',
      });
    }
  };

  const getTierInfo = () => {
    const tier = limits?.tier || 'free';
    const tierInfo = {
      free: {
        name: 'FREE',
        color: 'neutral',
        next: 'PREMIUM',
        nextTemplates: 50,
        features: ['10 Templates', '1 Account', 'Import/Export'],
      },
      premium: {
        name: 'PREMIUM',
        color: 'secondary',
        next: 'ADVANCED',
        nextTemplates: 200,
        features: ['50 Templates', '5 Accounts', 'Versioning', 'Basic Analytics'],
      },
      advanced: {
        name: 'ADVANCED',
        color: 'primary',
        next: 'ENTERPRISE',
        nextTemplates: -1,
        features: ['200 Templates', 'Unlimited Accounts', 'Advanced Analytics', 'API Integrations'],
      },
      enterprise: {
        name: 'ENTERPRISE',
        color: 'warning',
        features: ['Unlimited Everything', 'Priority Support', 'Custom Features', 'SLA'],
      },
    };
    return tierInfo[tier] || tierInfo.free;
  };

  const fetchTemplates = async () => {
    try {
      const response = await get('/magic-mail/designer/templates');
      setTemplates(response.data?.data || []);
    } catch (error) {
      console.error('Failed to reload templates:', error);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await get('/magic-mail/designer/stats');
      setStats(response.data?.data || null);
    } catch (error) {
      console.error('Failed to reload stats:', error);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete template "${name}"?`)) return;

    try {
      await del(`/magic-mail/designer/templates/${id}`);
      toggleNotification({ type: 'success', message: 'Template deleted successfully' });
      fetchTemplates();
      fetchStats();
    } catch (error) {
      toggleNotification({ type: 'danger', message: 'Failed to delete template' });
    }
  };

  const handleDownload = async (id, type) => {
    try {
      const response = await get(`/magic-mail/designer/templates/${id}/download?type=${type}`, {
        responseType: 'blob',
      });

      // Create blob and download
      const blob = new Blob([response.data], {
        type: type === 'html' ? 'text/html' : 'application/json',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `template-${id}.${type}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toggleNotification({
        type: 'success',
        message: `Template downloaded as ${type.toUpperCase()}`,
      });
    } catch (error) {
      toggleNotification({
        type: 'danger',
        message: 'Failed to download template',
      });
    }
  };

  const handleDuplicate = async (id, name) => {
    try {
      const response = await post(`/magic-mail/designer/templates/${id}/duplicate`);
      const duplicated = response.data?.data;

      toggleNotification({
        type: 'success',
        message: `Template "${name}" duplicated successfully`,
      });

      fetchTemplates();
      fetchStats();

      // Navigate to the duplicated template
      if (duplicated?.templateReferenceId) {
        navigate(`/plugins/magic-mail/designer/${duplicated.templateReferenceId}`);
      }
    } catch (error) {
      toggleNotification({
        type: 'danger',
        message: 'Failed to duplicate template',
      });
    }
  };

  const handleCopyCode = (code, type) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(type);
    toggleNotification({
      type: 'success',
      message: 'Code copied to clipboard!',
    });
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleCreateTemplate = () => {
    // Check if we can create more templates
    if (limits?.emailTemplates && !limits.emailTemplates.canCreate) {
      const max = limits.emailTemplates.max;
      let upgradeMessage = '';
      
      if (max === 10) {
        // Free tier
        upgradeMessage = `You've reached the FREE tier limit of ${max} templates. Upgrade to PREMIUM for 50 templates, versioning, and more!`;
      } else if (max === 50) {
        // Premium tier
        upgradeMessage = `You've reached the PREMIUM tier limit of ${max} templates. Upgrade to ADVANCED for 200 templates and advanced features!`;
      } else if (max === 200) {
        // Advanced tier
        upgradeMessage = `You've reached the ADVANCED tier limit of ${max} templates. Upgrade to ENTERPRISE for unlimited templates!`;
      }
      
      toggleNotification({
        type: 'warning',
        title: '🚀 Time to Upgrade!',
        message: upgradeMessage,
      });
      return;
    }
    
    // Navigate to create new template
    navigate('/plugins/magic-mail/designer/new');
  };

  const handleExport = async () => {
    try {
      const response = await post('/magic-mail/designer/export', { templateIds: [] });
      const dataStr = JSON.stringify(response.data?.data || [], null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `magic-mail-templates-${new Date().toISOString().split('T')[0]}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toggleNotification({ type: 'success', message: 'Templates exported successfully' });
    } catch (error) {
      toggleNotification({
        type: 'danger',
        message: error.response?.data?.message || 'Export failed',
      });
    }
  };

  const handleImport = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const importedTemplates = JSON.parse(text);
      const response = await post('/magic-mail/designer/import', {
        templates: importedTemplates,
      });
      const results = response.data?.data || [];
      const successful = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;

      toggleNotification({
        type: 'success',
        message: `Imported ${successful} templates${failed > 0 ? `. ${failed} failed.` : ''}`,
      });

      fetchTemplates();
      fetchStats();
    } catch (error) {
      toggleNotification({ type: 'danger', message: 'Import failed' });
    }
  };

  const getCategoryBadge = (category) => {
    const configs = {
      transactional: { bg: 'primary', label: 'TRANSACTIONAL' },
      marketing: { bg: 'success', label: 'MARKETING' },
      notification: { bg: 'secondary', label: 'NOTIFICATION' },
      custom: { bg: 'neutral', label: 'CUSTOM' },
    };
    const config = configs[category] || configs.custom;
    return <Badge backgroundColor={config.bg}>{config.label}</Badge>;
  };

  const filteredTemplates = templates.filter(
    (t) =>
      t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.templateReferenceId.toString().includes(searchTerm)
  );

  // Pagination logic
  const totalPages = Math.ceil(filteredTemplates.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedTemplates = filteredTemplates.slice(startIndex, startIndex + itemsPerPage);
  
  // Reset to page 1 when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  // Optimistic UI - show skeleton while loading
  const showSkeleton = loading && templates.length === 0;

  return (
    <Container>
      {/* Header */}
      <Header>
        <HeaderContent justifyContent="flex-start" alignItems="center">
          <div>
            <Flex alignItems="center" justifyContent="space-between" style={{ width: '100%' }}>
              <Title variant="alpha">
                <DocumentTextIcon />
                Email Templates
              </Title>
            </Flex>
            {stats && limits && (
              <Subtitle variant="epsilon">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  <span>{stats.total} template{stats.total !== 1 ? 's' : ''} created</span>
                  <span style={{ opacity: 0.8 }}>•</span>
                  {!limits.emailTemplates.unlimited ? (
                    <span style={{ 
                      background: 'rgba(255, 255, 255, 0.2)', 
                      padding: '2px 10px', 
                      borderRadius: '12px',
                      fontWeight: '600'
                    }}>
                      {limits.emailTemplates.max - limits.emailTemplates.current} of {limits.emailTemplates.max} slots remaining
                    </span>
                  ) : (
                    <span style={{ 
                      background: 'rgba(255, 255, 255, 0.2)', 
                      padding: '2px 10px', 
                      borderRadius: '12px',
                      fontWeight: '600'
                    }}>
                      Unlimited templates
                    </span>
                  )}
                </span>
              </Subtitle>
            )}
          </div>
        </HeaderContent>
      </Header>

      {/* Stats Cards */}
      <StatsGrid>
        <StatCard $delay="0.1s" $color={'var(--colors-primary600, #0EA5E9)'}>
          <StatIcon className="stat-icon" $bg={'rgba(2, 132, 199, 0.12)'} $color={'var(--colors-primary600, #0284C7)'}>
            <DocumentTextIcon />
          </StatIcon>
          <StatValue className="stat-value" variant="alpha">
            {showSkeleton ? '...' : (stats?.total || 0)}
          </StatValue>
          <StatLabel variant="pi">Total Templates</StatLabel>
        </StatCard>

        <StatCard $delay="0.2s" $color={'var(--colors-success600, #22C55E)'}>
          <StatIcon className="stat-icon" $bg={'rgba(22, 163, 74, 0.12)'} $color={'var(--colors-success600, #16A34A)'}>
            <ChartBarIcon />
          </StatIcon>
          <StatValue className="stat-value" variant="alpha">
            {showSkeleton ? '...' : (stats?.active || 0)}
          </StatValue>
          <StatLabel variant="pi">Active</StatLabel>
        </StatCard>

        {(limits?.emailTemplates && !limits.emailTemplates.unlimited) && (
          <StatCard $delay="0.3s" $color={'var(--colors-warning600, #F59E0B)'}>
            <StatIcon className="stat-icon" $bg={'rgba(234, 179, 8, 0.12)'} $color={'var(--colors-warning600, #D97706)'}>
              <SparklesIcon />
            </StatIcon>
            <StatValue className="stat-value" variant="alpha">
              {showSkeleton ? '...' : (limits.emailTemplates.max - limits.emailTemplates.current)}
            </StatValue>
            <StatLabel variant="pi">Remaining</StatLabel>
          </StatCard>
        )}
      </StatsGrid>

      {/* Divider */}
      <Box style={{ margin: '0 -32px 32px -32px' }}>
        <Divider />
      </Box>

      {/* Tabs for Custom Templates vs Core Emails */}
      {/* Upgrade Warning */}
      {limits?.emailTemplates && !limits.emailTemplates.unlimited && 
       limits.emailTemplates.current >= limits.emailTemplates.max * 0.8 && (
        <LimitWarning>
          <Flex alignItems="center" gap={3}>
            <SparklesIcon style={{ width: 24, height: 24, color: 'var(--colors-warning600, #D97706)' }} />
            <Box>
              <Typography variant="omega" fontWeight="bold" textColor="neutral800">
                {limits.emailTemplates.current >= limits.emailTemplates.max 
                  ? `You've reached your ${getTierInfo().name} limit!`
                  : `You're approaching your ${getTierInfo().name} limit!`}
              </Typography>
              <Typography variant="pi" textColor="neutral600" style={{ marginTop: '4px' }}>
                Using {limits.emailTemplates.current} of {limits.emailTemplates.max} templates. 
                {getTierInfo().next && ` Upgrade to ${getTierInfo().next} for ${getTierInfo().nextTemplates === -1 ? 'unlimited' : getTierInfo().nextTemplates} templates!`}
              </Typography>
            </Box>
          </Flex>
          <UpgradeButton 
            onClick={() => navigate('/admin/settings/magic-mail/upgrade')}
          >
            <BoltIcon style={{ width: 16, height: 16, marginRight: '6px' }} />
            Upgrade Now
          </UpgradeButton>
        </LimitWarning>
      )}

      <Tabs.Root value={activeTab} onValueChange={setActiveTab}>
        <Tabs.List>
          <Tabs.Trigger value="customTemplates">Custom Templates</Tabs.Trigger>
          <Tabs.Trigger value="coreEmails">Core Emails</Tabs.Trigger>
        </Tabs.List>

        {/* Custom Templates Tab */}
        <Tabs.Content value="customTemplates">
          {templates.length === 0 ? (
        <EmptyState>
          
          <EmptyContent>
            <EmptyIcon>
              <SparklesIcon />
            </EmptyIcon>
            
            <Typography 
              variant="alpha" 
              textColor="neutral800"
              style={{ 
                fontSize: '1.75rem',
                fontWeight: '700',
                textAlign: 'center',
                display: 'block',
              }}
            >
              No Email Templates Yet
            </Typography>
            
            <Typography
              variant="omega"
              textColor="neutral600"
              style={{ 
                marginTop: '24px',
                lineHeight: '1.8',
                textAlign: 'center',
                maxWidth: '500px',
                margin: '24px auto 0',
                display: 'block',
              }}
            >
              Start creating beautiful, professional email templates with our visual designer
            </Typography>
            
            {/* Feature List */}
            <EmptyFeatureList>
              <EmptyFeatureItem>
                <CheckCircleIcon />
                <Typography variant="omega" fontWeight="semiBold">
                  Drag & Drop Editor
                </Typography>
                <Typography variant="pi" textColor="neutral600" style={{ marginTop: '4px' }}>
                  Build emails visually with Unlayer's powerful editor
                </Typography>
              </EmptyFeatureItem>
              
              <EmptyFeatureItem>
                <CheckCircleIcon />
                <Typography variant="omega" fontWeight="semiBold">
                  Dynamic Content
                </Typography>
                <Typography variant="pi" textColor="neutral600" style={{ marginTop: '4px' }}>
                  Use Mustache variables for personalized emails
                </Typography>
              </EmptyFeatureItem>
              
              <EmptyFeatureItem>
                <CheckCircleIcon />
                <Typography variant="omega" fontWeight="semiBold">
                  Version Control
                </Typography>
                <Typography variant="pi" textColor="neutral600" style={{ marginTop: '4px' }}>
                  Track changes and restore previous versions
                </Typography>
              </EmptyFeatureItem>
            </EmptyFeatureList>
            
            {/* Action Buttons */}
            <EmptyButtonGroup>
              <CTAButton 
                startIcon={<PlusIcon style={{ width: 20, height: 20 }} />} 
                onClick={handleCreateTemplate}
              >
                Create Your First Template
              </CTAButton>
              
              {canImport && (
                <SecondaryButton
                  startIcon={<ArrowUpTrayIcon style={{ width: 20, height: 20 }} />}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Import Template
                </SecondaryButton>
              )}
            </EmptyButtonGroup>
          </EmptyContent>
        </EmptyState>
      ) : (
        <TemplatesContainer>
          <SectionHeader>
            <Flex justifyContent="space-between" alignItems="center" marginBottom={4}>
              <Typography variant="delta" textColor="neutral700" style={{ fontSize: '1.5rem', fontWeight: 600 }}>
                Email Templates
              </Typography>
              <GradientButton 
                startIcon={<PlusIcon style={{ width: 20, height: 20 }} />} 
                onClick={handleCreateTemplate}
              >
                Create Template
              </GradientButton>
            </Flex>
          </SectionHeader>

          {/* Filter Bar */}
          <FilterBar>
            <SearchInputWrapper>
              <SearchIcon />
              <StyledSearchInput
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by name, subject, or ID..."
                type="text"
              />
            </SearchInputWrapper>

            {canImport && (
              <SecondaryButton
                startIcon={<ArrowUpTrayIcon style={{ width: 16, height: 16 }} />}
                onClick={() => fileInputRef.current?.click()}
              >
                Import
              </SecondaryButton>
            )}

            {canExport && (
              <TertiaryButton 
                startIcon={<ArrowDownTrayIcon style={{ width: 16, height: 16 }} />} 
                onClick={handleExport} 
                disabled={templates.length === 0}
              >
                Export
              </TertiaryButton>
            )}
          </FilterBar>

          {/* Templates Table */}
          {filteredTemplates.length > 0 ? (
            <TableWrapper>
              <StyledTable colCount={5} rowCount={paginatedTemplates.length}>
            <Thead>
              <Tr>
                <Th style={{ width: '100px' }}>
                  <Typography variant="sigma">ID</Typography>
                </Th>
                <Th>
                  <Typography variant="sigma">Name</Typography>
                </Th>
                <Th style={{ width: '100px' }}>
                  <Typography variant="sigma">Category</Typography>
                </Th>
                <Th style={{ width: '80px' }}>
                  <Typography variant="sigma">Status</Typography>
                </Th>
                <Th style={{ width: '260px' }}>
                  <Box style={{ textAlign: 'right', width: '100%' }}>
                    <Typography variant="sigma">Actions</Typography>
                  </Box>
                </Th>
              </Tr>
            </Thead>
            <Tbody>
              {paginatedTemplates.map((template) => (
                <Tr key={template.templateReferenceId}>
                  <Td>
                    <Typography variant="omega" fontWeight="bold" style={{ fontSize: '13px' }}>
                      #{template.templateReferenceId}
                    </Typography>
                  </Td>
                  <Td>
                    <Typography variant="omega" fontWeight="semiBold" style={{ fontSize: '13px' }}>
                      {template.name}
                    </Typography>
                  </Td>
                  <Td>{getCategoryBadge(template.category)}</Td>
                  <Td>
                    <Badge backgroundColor={template.isActive ? 'success' : 'neutral'}>
                      {template.isActive ? 'ACTIVE' : 'INACTIVE'}
                    </Badge>
                  </Td>
                  <Td>
                    <Flex gap={2} justifyContent="flex-end">
                      <IconButtonPrimary
                        onClick={() =>
                          navigate(`/plugins/magic-mail/designer/${template.templateReferenceId}`)
                        }
                        aria-label="Edit Template"
                        title="Edit Template"
                      >
                        <PencilIcon />
                      </IconButtonPrimary>
                      <IconButton
                        onClick={() => handleDownload(template.templateReferenceId, 'html')}
                        aria-label="Download HTML"
                        title="Download as HTML"
                      >
                        <DocumentArrowDownIcon />
                      </IconButton>
                      <IconButton
                        onClick={() => handleDownload(template.templateReferenceId, 'json')}
                        aria-label="Download JSON"
                        title="Download as JSON"
                      >
                        <CodeBracketIcon />
                      </IconButton>
                      <IconButton
                        onClick={() => handleDuplicate(template.templateReferenceId, template.name)}
                        aria-label="Duplicate Template"
                        title="Duplicate Template"
                      >
                        <DocumentDuplicateIcon />
                      </IconButton>
                      <IconButtonPurple
                        onClick={() => {
                          setSelectedTemplate(template);
                          setShowCodeExample(true);
                        }}
                        aria-label="Code Example"
                        title="View Code Example"
                      >
                        <BoltIcon />
                      </IconButtonPurple>
                      <IconButtonSuccess
                        onClick={() => handleTestSend(template)}
                        aria-label="Send Test Email"
                        title="Send Test Email"
                      >
                        <PaperAirplaneIcon />
                      </IconButtonSuccess>
                      <IconButtonDanger
                        onClick={() => handleDelete(template.templateReferenceId, template.name)}
                        aria-label="Delete Template"
                        title="Delete Template"
                      >
                        <TrashIcon />
                      </IconButtonDanger>
                    </Flex>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </StyledTable>
          
          {/* Pagination */}
          {totalPages > 1 && (
            <PaginationWrapper justifyContent="space-between" alignItems="center">
              <Flex gap={3} alignItems="center">
                <Typography variant="pi" textColor="neutral600">
                  Showing {startIndex + 1}-{Math.min(startIndex + itemsPerPage, filteredTemplates.length)} of {filteredTemplates.length}
                </Typography>
                <Flex gap={2} alignItems="center">
                  <Typography variant="pi" textColor="neutral600">per page:</Typography>
                  <StyledSelect
                    value={itemsPerPage}
                    onChange={(e) => {
                      setItemsPerPage(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    style={{ width: '70px', padding: '4px 8px', fontSize: '12px' }}
                  >
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </StyledSelect>
                </Flex>
              </Flex>
              <Flex gap={2}>
                <PaginationButton
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </PaginationButton>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  return (
                    <PaginationButton
                      key={pageNum}
                      active={currentPage === pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                    >
                      {pageNum}
                    </PaginationButton>
                  );
                })}
                <PaginationButton
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </PaginationButton>
              </Flex>
            </PaginationWrapper>
          )}
        </TableWrapper>
      ) : (
        <Box
          background="neutral100"
          style={{
            padding: '80px 32px',
            textAlign: 'center',
            borderRadius: theme.borderRadius.lg,
            border: '1px dashed rgba(128, 128, 128, 0.2)',
          }}
        >
          <MagnifyingGlassIcon style={{ width: '64px', height: '64px', margin: '0 auto 16px', color: 'var(--colors-neutral500)' }} />
          <Typography variant="beta" textColor="neutral700" style={{ marginBottom: '8px' }}>
            No templates found
          </Typography>
          <Typography variant="omega" textColor="neutral600">
            Try adjusting your search or filters
          </Typography>
          <Button
            variant="secondary"
            onClick={() => {
              setSearchTerm('');
              setActiveCategory('all');
            }}
            style={{ marginTop: '20px' }}
          >
            Clear Filters
          </Button>
        </Box>
      )}
        </TemplatesContainer>
      )}
        </Tabs.Content>

        {/* Core Emails Tab */}
        <Tabs.Content value="coreEmails">
          <Box style={{ marginTop: '24px' }}>
            <Flex direction="column" gap={2} style={{ marginBottom: '24px' }}>
              <Typography variant="delta" textColor="neutral700" style={{ fontSize: '1.5rem', fontWeight: 600 }}>
                Core Email Templates
              </Typography>
              <Typography variant="omega" textColor="neutral600">
                Design the default Strapi system emails (Password Reset & Email Confirmation)
              </Typography>
            </Flex>

            <Box background="neutral0" borderRadius={theme.borderRadius.lg} shadow="md" style={{ border: '1px solid rgba(128, 128, 128, 0.2)', overflow: 'hidden' }}>
              <Table colCount={2} rowCount={2}>
                <Thead>
                  <Tr>
                    <Th>
                      <Typography variant="sigma">Email Type</Typography>
                    </Th>
                <Th>
                  <Box style={{ textAlign: 'right', width: '100%' }}>
                    <Typography variant="sigma">Actions</Typography>
                  </Box>
                </Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {coreEmailTypes.map((coreEmail) => (
                    <Tr key={coreEmail.type}>
                      <Td>
                        <Flex direction="column" alignItems="flex-start" gap={1}>
                          <Typography variant="omega" fontWeight="semiBold" style={{ fontSize: '14px' }}>
                            {coreEmail.name}
                          </Typography>
                          <Typography variant="pi" textColor="neutral600" style={{ fontSize: '12px' }}>
                            {coreEmail.description}
                          </Typography>
                        </Flex>
                      </Td>
                      <Td>
                        <Flex gap={2} justifyContent="flex-end">
                          <IconButtonPrimary
                            onClick={() =>
                              navigate(`/plugins/magic-mail/designer/core/${coreEmail.type}`)
                            }
                            aria-label="Edit Core Email"
                            title="Edit Template"
                          >
                            <PencilIcon />
                          </IconButtonPrimary>
                        </Flex>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </Box>
          </Box>
        </Tabs.Content>
      </Tabs.Root>
      
      {/* Code Example Modal */}
      {selectedTemplate && (
        <Modal.Root open={showCodeExample} onOpenChange={setShowCodeExample}>
          <Modal.Content style={{ 
            maxWidth: '900px', 
            width: '90vw',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            borderRadius: '16px',
            overflow: 'hidden'
          }}>
            <StyledModalHeader>
              <Modal.Title>Code Snippets: {selectedTemplate.name}</Modal.Title>
            </StyledModalHeader>
            <ScrollableDialogBody>
              {/* Template Info Header */}
              <InfoBox style={{ marginTop: 0, marginBottom: '20px' }}>
                <Flex alignItems="center" justifyContent="space-between">
                  <Typography variant="pi" style={{ color: 'var(--colors-primary600, #075985)' }}>
                    <strong>Template ID:</strong> #{selectedTemplate.templateReferenceId}
                  </Typography>
                  <Typography variant="pi" style={{ color: 'var(--colors-primary600, #075985)' }}>
                    <strong>Status:</strong> {selectedTemplate.isActive ? 'Active' : 'Inactive'}
                  </Typography>
                </Flex>
              </InfoBox>

              {!selectedTemplate.isActive && (
                <WarningBox style={{ marginTop: 0, marginBottom: '20px' }}>
                  <SparklesIcon style={{ width: 20, height: 20, color: 'var(--colors-warning600, #D97706)' }} />
                  <Typography variant="pi" style={{ color: 'var(--colors-warning600, #A16207)', fontWeight: 500 }}>
                    This template is currently <strong>INACTIVE</strong> and will not be sent.
                  </Typography>
                </WarningBox>
              )}

              <Accordion.Root defaultValue="native" collapsible>
                {/* Native Strapi Email Service (RECOMMENDED) */}
                <Accordion.Item value="native">
                  <Accordion.Header>
                    <Accordion.Trigger icon={() => <CheckCircleIcon style={{ width: 16, height: 16, color: 'var(--colors-success600, #16A34A)' }} />}>
                      <Flex gap={2} alignItems="center">
                        Native Strapi Email Service
                        <RecommendedBadge>Recommended</RecommendedBadge>
                      </Flex>
                    </Accordion.Trigger>
                  </Accordion.Header>
                  <Accordion.Content>
                    <Box padding={4}>
                      <Typography variant="pi" textColor="neutral600" style={{ marginBottom: '16px', display: 'block' }}>
                        Use the standard Strapi Email function. MagicMail intercepts it automatically and applies all features.
                      </Typography>
                      <CodeBlockWrapper>
                        <CodeBlock dangerouslySetInnerHTML={{ __html: 
`<span class="comment">// Anywhere in your Strapi backend:</span>
<span class="keyword">await</span> strapi.plugins.email.services.email.<span class="function">send</span>({
  <span class="keyword">to</span>: <span class="string">'user@example.com'</span>,
  <span class="keyword">subject</span>: <span class="string">'Your Subject'</span>, <span class="comment">// Optional (overridden by template)</span>
  <span class="keyword">templateId</span>: <span class="number">${selectedTemplate.templateReferenceId}</span>, <span class="comment">// Template ID</span>
  <span class="keyword">data</span>: {
    <span class="keyword">name</span>: <span class="string">'John Doe'</span>,
    <span class="keyword">code</span>: <span class="string">'123456'</span>,
    <span class="comment">// ... your dynamic variables</span>
  }
});`
                        }} />
                        <CopyButton
                          size="S"
                          variant="ghost"
                          onClick={() => handleCopyCode(
`await strapi.plugins.email.services.email.send({
  to: 'user@example.com',
  subject: 'Your Subject',
  templateId: ${selectedTemplate.templateReferenceId},
  data: {
    name: 'John Doe',
    code: '123456'
  }
});`,
                            'native'
                          )}
                        >
                          {copiedCode === 'native' ? (
                            <><CheckIcon /> Copied!</>
                          ) : (
                            <><ClipboardDocumentIcon /> Copy</>
                          )}
                        </CopyButton>
                      </CodeBlockWrapper>
                    </Box>
                  </Accordion.Content>
                </Accordion.Item>

                {/* MagicMail Plugin Service */}
                <Accordion.Item value="plugin">
                  <Accordion.Header>
                    <Accordion.Trigger icon={() => <CodeBracketIcon style={{ width: 16, height: 16, color: 'var(--colors-primary600, #0284C7)' }} />}>
                      MagicMail Plugin Service
                    </Accordion.Trigger>
                  </Accordion.Header>
                  <Accordion.Content>
                    <Box padding={4}>
                      <Typography variant="pi" textColor="neutral600" style={{ marginBottom: '16px', display: 'block' }}>
                        Direct access to the MagicMail service for advanced options.
                      </Typography>
                      <CodeBlockWrapper>
                        <CodeBlock dangerouslySetInnerHTML={{ __html: 
`<span class="comment">// Inside Strapi backend</span>
<span class="keyword">await</span> strapi.<span class="function">plugin</span>(<span class="string">'magic-mail'</span>)
  .<span class="function">service</span>(<span class="string">'email-router'</span>)
  .<span class="function">send</span>({
    <span class="keyword">to</span>: <span class="string">'user@example.com'</span>,
    <span class="keyword">templateId</span>: <span class="number">${selectedTemplate.templateReferenceId}</span>,
    <span class="keyword">templateData</span>: {
      <span class="keyword">name</span>: <span class="string">'John Doe'</span>,
      <span class="keyword">code</span>: <span class="string">'123456'</span>
    }
  });`
                        }} />
                        <CopyButton
                          size="S"
                          variant="ghost"
                          onClick={() => handleCopyCode(
`await strapi.plugin('magic-mail')
  .service('email-router')
  .send({
    to: 'user@example.com',
    templateId: ${selectedTemplate.templateReferenceId},
    templateData: {
      name: 'John Doe',
      code: '123456'
    }
  });`,
                            'plugin'
                          )}
                        >
                          {copiedCode === 'plugin' ? (
                            <><CheckIcon /> Copied!</>
                          ) : (
                            <><ClipboardDocumentIcon /> Copy</>
                          )}
                        </CopyButton>
                      </CodeBlockWrapper>
                    </Box>
                  </Accordion.Content>
                </Accordion.Item>

                {/* REST API */}
                <Accordion.Item value="rest">
                  <Accordion.Header>
                    <Accordion.Trigger icon={() => <DocumentArrowDownIcon style={{ width: 16, height: 16, color: 'var(--colors-secondary600, #7C3AED)' }} />}>
                      REST API (cURL)
                    </Accordion.Trigger>
                  </Accordion.Header>
                  <Accordion.Content>
                    <Box padding={4}>
                      <Typography variant="pi" textColor="neutral600" style={{ marginBottom: '16px', display: 'block' }}>
                        For external applications, frontend calls, or Postman tests.
                      </Typography>
                      <CodeBlockWrapper>
                        <CodeBlock dangerouslySetInnerHTML={{ __html: 
`curl -X POST http://localhost:1337/api/magic-mail/send \\
  -H <span class="string">"Content-Type: application/json"</span> \\
  -H <span class="string">"Authorization: Bearer YOUR_API_TOKEN"</span> \\
  -d <span class="string">'{
    "to": "user@example.com",
    "templateId": ${selectedTemplate.templateReferenceId},
    "templateData": {
      "name": "John Doe",
      "code": "123456"
    }
  }'</span>`
                        }} />
                        <CopyButton
                          size="S"
                          variant="ghost"
                          onClick={() => handleCopyCode(
`curl -X POST http://localhost:1337/api/magic-mail/send \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_TOKEN" \\
  -d '{
    "to": "user@example.com",
    "templateId": ${selectedTemplate.templateReferenceId},
    "templateData": {
      "name": "John Doe",
      "code": "123456"
    }
  }'`,
                            'curl'
                          )}
                        >
                          {copiedCode === 'curl' ? (
                            <><CheckIcon /> Copied!</>
                          ) : (
                            <><ClipboardDocumentIcon /> Copy</>
                          )}
                        </CopyButton>
                      </CodeBlockWrapper>
                    </Box>
                  </Accordion.Content>
                </Accordion.Item>
              </Accordion.Root>
            </ScrollableDialogBody>
            <StyledModalFooter>
              <TertiaryButton onClick={() => setShowCodeExample(false)}>
                Close
              </TertiaryButton>
            </StyledModalFooter>
          </Modal.Content>
        </Modal.Root>
      )}

      {/* Test Send Modal */}
      <Modal.Root open={showTestSendModal} onOpenChange={setShowTestSendModal}>
        <StyledModalContent>
          <StyledModalHeader>
            <Modal.Title>Send Test Email</Modal.Title>
          </StyledModalHeader>
          <StyledModalBody>
            <ModalField>
              <ModalLabel>Template</ModalLabel>
              <ModalTemplateInfo>
                <Typography variant="omega">{selectedTemplate?.name}</Typography>
              </ModalTemplateInfo>
            </ModalField>

            <ModalField>
              <ModalLabel>Recipient Email *</ModalLabel>
              <TextInput
                placeholder="test@example.com"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                type="email"
              />
            </ModalField>

            <ModalField>
              <ModalLabel>Send from Account (optional)</ModalLabel>
              <StyledSelect
                value={testAccount}
                onChange={(e) => setTestAccount(e.target.value)}
              >
                <option value="">Auto-select best account</option>
                {accounts
                  .filter(acc => acc.isActive)
                  .map(account => (
                    <option key={account.name} value={account.name}>
                      {account.name} ({account.provider})
                    </option>
                  ))}
              </StyledSelect>
              <ModalHint>Leave empty to use smart routing</ModalHint>
            </ModalField>
          </StyledModalBody>
          <StyledModalFooter>
            <TertiaryButton onClick={() => setShowTestSendModal(false)}>
              Cancel
            </TertiaryButton>
            <GradientButton 
              onClick={sendTestEmail}
              startIcon={<PaperAirplaneIcon style={{ width: 16, height: 16 }} />}
            >
              Send Test Email
            </GradientButton>
          </StyledModalFooter>
        </StyledModalContent>
      </Modal.Root>

      <HiddenFileInput 
        ref={fileInputRef}
        type="file" 
        accept=".json" 
        onChange={handleImport} 
      />
    </Container>
  );
};

export default TemplateList;

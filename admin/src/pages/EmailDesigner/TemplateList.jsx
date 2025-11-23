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

// ================ THEME (Exact copy from RoutingRules) ================
const theme = {
  colors: {
    primary: { 50: '#F0F9FF', 100: '#E0F2FE', 500: '#0EA5E9', 600: '#0284C7', 700: '#0369A1' },
    secondary: { 50: '#F5F3FF', 100: '#EDE9FE', 500: '#A855F7', 600: '#9333EA' },
    success: { 100: '#DCFCE7', 500: '#22C55E', 600: '#16A34A', 700: '#15803D' },
    warning: { 100: '#FEF3C7', 500: '#F59E0B', 600: '#D97706' },
    danger: { 100: '#FEE2E2', 500: '#EF4444', 600: '#DC2626' },
    neutral: { 0: '#FFFFFF', 50: '#F9FAFB', 100: '#F3F4F6', 200: '#E5E7EB', 600: '#4B5563', 700: '#374151', 800: '#1F2937' }
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
  padding: 0 24px 24px 24px;

  /* Custom Scrollbar */
  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: ${theme.colors.neutral[200]};
    border-radius: 3px;
  }

  &::-webkit-scrollbar-thumb:hover {
    background: ${theme.colors.neutral[300]};
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
  color: ${theme.colors.neutral[800]};
  display: flex;
  align-items: center;
  gap: 8px;
`;

const RecommendedBadge = styled(Badge)`
  background: linear-gradient(135deg, ${theme.colors.success[500]}, ${theme.colors.success[600]});
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
  background: linear-gradient(135deg, ${theme.colors.primary[50]}, ${theme.colors.primary[100]});
  border-left: 4px solid ${theme.colors.primary[500]};
  border-radius: 8px;
  padding: 16px;
  margin-top: 24px;
`;

const WarningBox = styled(Box)`
  background: linear-gradient(135deg, ${theme.colors.warning[50]}, ${theme.colors.warning[100]});
  border-left: 4px solid ${theme.colors.warning[500]};
  border-radius: 8px;
  padding: 12px 16px;
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const LimitWarning = styled(Box)`
  background: linear-gradient(135deg, ${theme.colors.warning[50]}, rgba(251, 191, 36, 0.1));
  border: 1px solid ${theme.colors.warning[200]};
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const UpgradeButton = styled(Button)`
  background: linear-gradient(135deg, ${theme.colors.warning[500]}, ${theme.colors.warning[600]});
  color: white;
  font-weight: 600;
  padding: 8px 16px;
  font-size: 13px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  
  &:hover {
    background: linear-gradient(135deg, ${theme.colors.warning[600]}, ${theme.colors.warning[700]});
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
    ${theme.colors.secondary[600]} 0%, 
    ${theme.colors.primary[600]} 100%
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
  color: ${theme.colors.neutral[0]};
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
  background: ${theme.colors.neutral[0]};
  border-radius: ${theme.borderRadius.lg};
  padding: 28px ${theme.spacing.lg};
  position: relative;
  overflow: hidden;
  transition: all ${theme.transitions.normal};
  ${css`animation: ${fadeIn} ${theme.transitions.slow} backwards;`}
  animation-delay: ${props => props.$delay || '0s'};
  box-shadow: ${theme.shadows.sm};
  border: 1px solid ${theme.colors.neutral[200]};
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
    border-color: ${props => props.$color || theme.colors.primary[500]};
    
    .stat-icon {
      transform: scale(1.15) rotate(5deg);
    }
    
    .stat-value {
      transform: scale(1.08);
      color: ${props => props.$color || theme.colors.primary[600]};
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
  background: ${props => props.$bg || theme.colors.primary[100]};
  transition: all ${theme.transitions.normal};
  margin: 0 auto 20px;
  box-shadow: ${theme.shadows.sm};
  
  svg {
    width: 34px;
    height: 34px;
    color: ${props => props.$color || theme.colors.primary[600]};
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
  color: ${theme.colors.neutral[800]};
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
  color: ${theme.colors.neutral[600]};
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
  background: ${theme.colors.neutral[0]};
  padding: ${theme.spacing.md} ${theme.spacing.lg};
  border-radius: ${theme.borderRadius.lg};
  margin-bottom: ${theme.spacing.lg};
  box-shadow: ${theme.shadows.sm};
  border: 1px solid ${theme.colors.neutral[200]};
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
  color: ${theme.colors.neutral[600]};
  pointer-events: none;
  z-index: 1;
`;

const StyledSearchInput = styled(TextInput)`
  width: 100%;
  padding-left: 36px;
`;

const StyledTable = styled(Table)`
  width: 100%;
  thead {
    background: ${theme.colors.neutral[50]};
    border-bottom: 2px solid ${theme.colors.neutral[200]};
    
    th {
      font-weight: 600;
      color: ${theme.colors.neutral[700]};
      font-size: 0.875rem;
      text-transform: uppercase;
      letter-spacing: 0.025em;
      padding: ${theme.spacing.lg} ${theme.spacing.lg};
    }
  }
  
  tbody tr {
    transition: all ${theme.transitions.fast};
    border-bottom: 1px solid ${theme.colors.neutral[100]};
    
    &:last-child {
      border-bottom: none;
    }
    
    &:hover {
      background: ${theme.colors.neutral[50]};
    }
    
    td {
      padding: ${theme.spacing.lg} ${theme.spacing.lg};
      color: ${theme.colors.neutral[700]};
      vertical-align: middle;
    }
  }
`;

const EmptyState = styled(Box)`
  background: ${theme.colors.neutral[0]};
  border-radius: ${theme.borderRadius.xl};
  border: 2px dashed ${theme.colors.neutral[200]};
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
    background: linear-gradient(135deg, ${theme.colors.secondary[50]} 0%, ${theme.colors.primary[50]} 100%);
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
  background: linear-gradient(135deg, ${theme.colors.secondary[100]} 0%, ${theme.colors.primary[100]} 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: ${theme.shadows.xl};
  
  svg {
    width: 60px;
    height: 60px;
    color: ${theme.colors.primary[600]};
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
  background: ${theme.colors.neutral[0]};
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
    color: ${theme.colors.success[500]};
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
      if (duplicated?.id) {
        navigate(`/plugins/magic-mail/designer/${duplicated.id}`);
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
        <StatCard $delay="0.1s" $color={theme.colors.primary[500]}>
          <StatIcon className="stat-icon" $bg={theme.colors.primary[100]} $color={theme.colors.primary[600]}>
            <DocumentTextIcon />
          </StatIcon>
          <StatValue className="stat-value" variant="alpha">
            {showSkeleton ? '...' : (stats?.total || 0)}
          </StatValue>
          <StatLabel variant="pi">Total Templates</StatLabel>
        </StatCard>

        <StatCard $delay="0.2s" $color={theme.colors.success[500]}>
          <StatIcon className="stat-icon" $bg={theme.colors.success[100]} $color={theme.colors.success[600]}>
            <ChartBarIcon />
          </StatIcon>
          <StatValue className="stat-value" variant="alpha">
            {showSkeleton ? '...' : (stats?.active || 0)}
          </StatValue>
          <StatLabel variant="pi">Active</StatLabel>
        </StatCard>

        {(limits?.emailTemplates && !limits.emailTemplates.unlimited) && (
          <StatCard $delay="0.3s" $color={theme.colors.warning[500]}>
            <StatIcon className="stat-icon" $bg={theme.colors.warning[100]} $color={theme.colors.warning[600]}>
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
            <SparklesIcon style={{ width: 24, height: 24, color: theme.colors.warning[600] }} />
            <Box>
              <Typography variant="omega" fontWeight="bold" style={{ color: theme.colors.neutral[800] }}>
                {limits.emailTemplates.current >= limits.emailTemplates.max 
                  ? `You've reached your ${getTierInfo().name} limit!`
                  : `You're approaching your ${getTierInfo().name} limit!`}
              </Typography>
              <Typography variant="pi" style={{ color: theme.colors.neutral[600], marginTop: '4px' }}>
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
              style={{ 
                fontSize: '1.75rem',
                fontWeight: '700',
                color: theme.colors.neutral[800],
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
              <Button 
                startIcon={<PlusIcon style={{ width: 20, height: 20 }} />} 
                onClick={handleCreateTemplate}
                size="L"
              >
                Create Your First Template
              </Button>
              
              {canImport && (
                <Button
                  startIcon={<ArrowUpTrayIcon style={{ width: 20, height: 20 }} />}
                  onClick={() => fileInputRef.current?.click()}
                  size="L"
                >
                  Import Template
                </Button>
              )}
            </EmptyButtonGroup>
          </EmptyContent>
        </EmptyState>
      ) : (
        <TemplatesContainer>
          <SectionHeader>
            <Flex justifyContent="space-between" alignItems="center" marginBottom={4}>
              <Typography variant="delta" style={{ fontSize: '1.5rem', fontWeight: 600, color: theme.colors.neutral[700] }}>
                Email Templates
              </Typography>
              <Button 
                startIcon={<PlusIcon style={{ width: 20, height: 20 }} />} 
                onClick={handleCreateTemplate}
                size="L"
              >
                Create Template
              </Button>
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
              <Button
                startIcon={<ArrowUpTrayIcon style={{ width: 20, height: 20 }} />}
                onClick={() => fileInputRef.current?.click()}
                size="L"
              >
                Import
              </Button>
            )}

            {canExport && (
              <Button 
                startIcon={<ArrowDownTrayIcon style={{ width: 20, height: 20 }} />} 
                onClick={handleExport} 
                disabled={templates.length === 0}
                size="L"
              >
                Export
              </Button>
            )}
          </FilterBar>

          {/* Templates Table */}
          {filteredTemplates.length > 0 ? (
            <Box>
              <StyledTable colCount={6} rowCount={filteredTemplates.length}>
            <Thead>
              <Tr>
                <Th>
                  <Typography variant="sigma">ID</Typography>
                </Th>
                <Th>
                  <Typography variant="sigma">Name</Typography>
                </Th>
                <Th>
                  <Typography variant="sigma">Subject</Typography>
                </Th>
                <Th>
                  <Typography variant="sigma">Category</Typography>
                </Th>
                <Th>
                  <Typography variant="sigma">Status</Typography>
                </Th>
                <Th>
                  <Box style={{ textAlign: 'right', width: '100%' }}>
                    <Typography variant="sigma">Actions</Typography>
                  </Box>
                </Th>
              </Tr>
            </Thead>
            <Tbody>
              {filteredTemplates.map((template) => (
                <Tr key={template.id}>
                  <Td>
                    <Typography variant="omega" fontWeight="bold">
                      #{template.templateReferenceId}
                    </Typography>
                  </Td>
                  <Td>
                    <Typography variant="omega" fontWeight="semiBold">
                      {template.name}
                    </Typography>
                  </Td>
                  <Td>
                    <Typography variant="omega" textColor="neutral600">
                      {template.subject}
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
                      <Button
                        variant="secondary"
                        onClick={() =>
                          navigate(`/plugins/magic-mail/designer/${template.id}`)
                        }
                        size="S"
                        aria-label="Edit Template"
                      >
                        <PencilIcon style={{ width: 16, height: 16 }} />
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => handleDownload(template.id, 'html')}
                        size="S"
                        aria-label="Download HTML"
                        title="Download as HTML"
                      >
                        <DocumentArrowDownIcon style={{ width: 16, height: 16 }} />
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => handleDownload(template.id, 'json')}
                        size="S"
                        aria-label="Download JSON"
                        title="Download as JSON"
                      >
                        <CodeBracketIcon style={{ width: 16, height: 16 }} />
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => handleDuplicate(template.id, template.name)}
                        size="S"
                        aria-label="Duplicate Template"
                        title="Duplicate Template"
                      >
                        <DocumentDuplicateIcon style={{ width: 16, height: 16 }} />
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setSelectedTemplate(template);
                          setShowCodeExample(true);
                        }}
                        size="S"
                        aria-label="Code Example"
                        title="View Code Example"
                      >
                        <BoltIcon style={{ width: 16, height: 16 }} />
                      </Button>
                      <Button
                        variant="success-light"
                        onClick={() => handleTestSend(template)}
                        size="S"
                        aria-label="Send Test Email"
                        title="Send Test Email"
                      >
                        <PaperAirplaneIcon style={{ width: 16, height: 16 }} />
                      </Button>
                      <Button
                        variant="danger-light"
                        onClick={() => handleDelete(template.id, template.name)}
                        size="S"
                        aria-label="Delete Template"
                      >
                        <TrashIcon style={{ width: 16, height: 16 }} />
                      </Button>
                    </Flex>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </StyledTable>
        </Box>
      ) : (
        <Box
          style={{
            padding: '80px 32px',
            textAlign: 'center',
            background: theme.colors.neutral[50],
            borderRadius: theme.borderRadius.lg,
            border: `1px dashed ${theme.colors.neutral[200]}`,
          }}
        >
          <MagnifyingGlassIcon style={{ width: '64px', height: '64px', margin: '0 auto 16px', color: theme.colors.neutral[400] }} />
          <Typography variant="beta" style={{ marginBottom: '8px', color: theme.colors.neutral[700] }}>
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
              <Typography variant="delta" style={{ fontSize: '1.5rem', fontWeight: 600, color: theme.colors.neutral[700] }}>
                Core Email Templates
              </Typography>
              <Typography variant="omega" textColor="neutral600">
                Design the default Strapi system emails (Password Reset & Email Confirmation)
              </Typography>
            </Flex>

            <Box background="neutral0" borderRadius={theme.borderRadius.lg} shadow="md" style={{ border: `1px solid ${theme.colors.neutral[200]}`, overflow: 'hidden' }}>
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
                          <Button
                            variant="secondary"
                            onClick={() =>
                              navigate(`/plugins/magic-mail/designer/core/${coreEmail.type}`)
                            }
                            size="S"
                            aria-label="Edit Core Email"
                          >
                            <PencilIcon style={{ width: 16, height: 16 }} />
                          </Button>
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
            flexDirection: 'column'
          }}>
            <Modal.Header style={{ borderBottom: `1px solid ${theme.colors.neutral[200]}`, paddingBottom: '16px' }}>
              <Flex alignItems="center" gap={2}>
                <BoltIcon style={{ width: 24, height: 24, color: theme.colors.primary[600] }} />
                <Typography variant="beta" style={{ color: theme.colors.neutral[800] }}>
                  Send Template: {selectedTemplate.name}
                </Typography>
              </Flex>
            </Modal.Header>
            <ScrollableDialogBody>
              {/* Native Strapi Email Service (RECOMMENDED) */}
              <CodeSection>
                <CodeHeader>
                  <CodeLabel variant="omega">
                    <CheckCircleIcon style={{ width: 20, height: 20, color: theme.colors.success[600] }} />
                    Native Strapi Email Service
                  </CodeLabel>
                  <RecommendedBadge>Empfohlen</RecommendedBadge>
                </CodeHeader>
                <Typography variant="pi" style={{ color: theme.colors.neutral[600], marginBottom: '16px' }}>
                  Nutze die standard Strapi Email-Funktion. MagicMail fängt sie automatisch ab und wendet alle Features an.
                </Typography>
                <CodeBlockWrapper>
                  <CodeBlock dangerouslySetInnerHTML={{ __html: 
`<span class="comment">// Überall in deinem Strapi Backend:</span>
<span class="keyword">await</span> strapi.plugins.email.services.email.<span class="function">send</span>({
  <span class="keyword">to</span>: <span class="string">'user@example.com'</span>,
  <span class="keyword">subject</span>: <span class="string">'Dein Betreff'</span>, <span class="comment">// Optional (wird von Template überschrieben)</span>
  <span class="keyword">templateId</span>: <span class="number">${selectedTemplate.templateReferenceId}</span>, <span class="comment">// ← Template ID</span>
  <span class="keyword">data</span>: {
    <span class="keyword">name</span>: <span class="string">'John Doe'</span>,
    <span class="keyword">code</span>: <span class="string">'123456'</span>,
    <span class="comment">// ... deine dynamischen Variablen</span>
  }
});

<span class="comment">// MagicMail fängt das automatisch ab und:</span>
<span class="comment">// 1. Rendert das Template mit deinen Daten</span>
<span class="comment">// 2. Routet über die richtige Email-Account</span>
<span class="comment">// 3. Tracked Opens & Clicks (wenn aktiviert)</span>`
                  }} />
                  <CopyButton
                    size="S"
                    variant="ghost"
                    onClick={() => handleCopyCode(
`await strapi.plugins.email.services.email.send({
  to: 'user@example.com',
  subject: 'Dein Betreff',
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
                      <><CheckIcon /> Kopiert!</>
                    ) : (
                      <><ClipboardDocumentIcon /> Kopieren</>
                    )}
                  </CopyButton>
                </CodeBlockWrapper>
              </CodeSection>

              {/* MagicMail Plugin Service (Alternative) */}
              <CodeSection>
                <CodeHeader>
                  <CodeLabel variant="omega">
                    <CodeBracketIcon style={{ width: 20, height: 20, color: theme.colors.primary[600] }} />
                    MagicMail Plugin Service
                  </CodeLabel>
                </CodeHeader>
                <Typography variant="pi" style={{ color: theme.colors.neutral[600], marginBottom: '16px' }}>
                  Direkter Zugriff auf den MagicMail Service für erweiterte Optionen.
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
                      <><CheckIcon /> Kopiert!</>
                    ) : (
                      <><ClipboardDocumentIcon /> Kopieren</>
                    )}
                  </CopyButton>
                </CodeBlockWrapper>
              </CodeSection>
                
              {/* REST API / External */}
              <CodeSection>
                <CodeHeader>
                  <CodeLabel variant="omega">
                    <DocumentArrowDownIcon style={{ width: 20, height: 20, color: theme.colors.secondary[600] }} />
                    REST API
                  </CodeLabel>
                </CodeHeader>
                <Typography variant="pi" style={{ color: theme.colors.neutral[600], marginBottom: '16px' }}>
                  Für externe Anwendungen, Frontend-Calls oder Postman Tests.
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
                      <><CheckIcon /> Kopiert!</>
                    ) : (
                      <><ClipboardDocumentIcon /> Kopieren</>
                    )}
                  </CopyButton>
                </CodeBlockWrapper>
              </CodeSection>
                
              {/* Template Info */}
              <InfoBox>
                <Flex alignItems="center" justifyContent="space-between">
                  <Typography variant="pi" style={{ color: theme.colors.primary[700] }}>
                    <strong>Template ID:</strong> #{selectedTemplate.templateReferenceId}
                  </Typography>
                  <Typography variant="pi" style={{ color: theme.colors.primary[700] }}>
                    <strong>Name:</strong> {selectedTemplate.name}
                  </Typography>
                </Flex>
              </InfoBox>

              {!selectedTemplate.isActive && (
                <WarningBox>
                  <SparklesIcon style={{ width: 20, height: 20, color: theme.colors.warning[600] }} />
                  <Typography variant="pi" style={{ color: theme.colors.warning[700], fontWeight: 500 }}>
                    Dieses Template ist derzeit <strong>INAKTIV</strong> und wird nicht versendet.
                  </Typography>
                </WarningBox>
              )}
            </ScrollableDialogBody>
            <Modal.Footer>
              <Button onClick={() => setShowCodeExample(false)} variant="secondary">
                Schließen
              </Button>
            </Modal.Footer>
          </Modal.Content>
        </Modal.Root>
      )}

      {/* Test Send Modal */}
      <Modal.Root open={showTestSendModal} onOpenChange={setShowTestSendModal}>
        <Modal.Content>
          <Modal.Header>
            <Modal.Title>Send Test Email</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Flex direction="column" gap={4}>
              <Box>
                <Typography variant="pi" fontWeight="bold" style={{ marginBottom: '8px', display: 'block' }}>
                  Template
                </Typography>
                <Typography variant="omega" textColor="neutral600">
                  {selectedTemplate?.name}
                </Typography>
              </Box>

              <Box>
                <Typography variant="pi" fontWeight="bold" style={{ marginBottom: '8px', display: 'block' }}>
                  Recipient Email *
                </Typography>
                <TextInput
                  placeholder="test@example.com"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  type="email"
                />
              </Box>

              <Box>
                <Typography variant="pi" fontWeight="bold" style={{ marginBottom: '8px', display: 'block' }}>
                  Send from Account (optional)
                </Typography>
                <select
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '4px',
                    border: '1px solid #dcdce4',
                    fontSize: '14px',
                    backgroundColor: 'white',
                    cursor: 'pointer',
                  }}
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
                </select>
                <Typography variant="pi" textColor="neutral600" style={{ marginTop: '8px', display: 'block' }}>
                  Leave empty to use smart routing
                </Typography>
              </Box>
            </Flex>
          </Modal.Body>
          <Modal.Footer>
            <Button onClick={() => setShowTestSendModal(false)} variant="tertiary">
              Cancel
            </Button>
            <Button onClick={sendTestEmail} variant="default">
              <PaperAirplaneIcon style={{ width: 16, height: 16, marginRight: '6px' }} />
              Send Test Email
            </Button>
          </Modal.Footer>
        </Modal.Content>
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

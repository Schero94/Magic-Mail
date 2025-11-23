import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Box, Tabs, Flex } from '@strapi/design-system';
import { EnvelopeIcon, FunnelIcon, DocumentTextIcon, ChartBarIcon } from '@heroicons/react/24/outline';
import HomePage from './HomePage';
import RoutingRules from './RoutingRules';
import TemplateList from './EmailDesigner/TemplateList';
import EditorPage from './EmailDesigner/EditorPage';
import Analytics from './Analytics';
import LicenseGuard from '../components/LicenseGuard';
import { useLicense } from '../hooks/useLicense';

const App = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { hasFeature } = useLicense();
  
  const hasEmailDesigner = hasFeature('email-designer-basic');
  const hasAnalytics = hasFeature('email-logging'); // Basic analytics available with email logging
  
  // Check if we're in the editor (with specific ID, 'new', or 'core/...')
  const isEditorRoute = /\/designer\/(new|\d+|core\/.+)/.test(location.pathname);
  
  // Determine active tab from route
  const getActiveTab = () => {
    if (location.pathname.includes('/analytics')) return 'analytics';
    if (location.pathname.includes('/routing')) return 'routing';
    if (location.pathname.includes('/designer') && !isEditorRoute) return 'templates';
    return 'accounts';
  };
  
  const [activeTab, setActiveTab] = useState(getActiveTab());
  
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === 'accounts') navigate('/plugins/magic-mail');
    if (tab === 'routing') navigate('/plugins/magic-mail/routing');
    if (tab === 'templates') navigate('/plugins/magic-mail/designer');
    if (tab === 'analytics') navigate('/plugins/magic-mail/analytics');
  };
  
  // If we're in editor, render editor directly without tabs
  if (isEditorRoute) {
    return (
      <LicenseGuard>
        <EditorPage />
      </LicenseGuard>
    );
  }

  return (
    <LicenseGuard>
      <Box>
        <Tabs.Root value={activeTab} onValueChange={handleTabChange}>
          <Tabs.List>
            <Tabs.Trigger value="accounts">
              <Flex gap={2} alignItems="center">
                <EnvelopeIcon style={{ width: 16, height: 16 }} />
                Email Accounts
              </Flex>
            </Tabs.Trigger>
            <Tabs.Trigger value="routing">
              <Flex gap={2} alignItems="center">
                <FunnelIcon style={{ width: 16, height: 16 }} />
                Routing Rules
              </Flex>
            </Tabs.Trigger>
            {hasEmailDesigner && (
              <Tabs.Trigger value="templates">
                <Flex gap={2} alignItems="center">
                  <DocumentTextIcon style={{ width: 16, height: 16 }} />
                  Email Templates
                </Flex>
              </Tabs.Trigger>
            )}
            {hasAnalytics && (
              <Tabs.Trigger value="analytics">
                <Flex gap={2} alignItems="center">
                  <ChartBarIcon style={{ width: 16, height: 16 }} />
                  Analytics
                </Flex>
              </Tabs.Trigger>
            )}
          </Tabs.List>
          
          <Tabs.Content value="accounts">
            <HomePage />
          </Tabs.Content>
          
          <Tabs.Content value="routing">
            <RoutingRules />
          </Tabs.Content>
          
          {hasEmailDesigner && (
            <Tabs.Content value="templates">
              <TemplateList />
            </Tabs.Content>
          )}
          
          {hasAnalytics && (
            <Tabs.Content value="analytics">
              <Analytics />
            </Tabs.Content>
          )}
        </Tabs.Root>
      </Box>
    </LicenseGuard>
  );
};

export default App;

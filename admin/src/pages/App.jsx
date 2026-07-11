import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Box, Tabs, Flex } from '@strapi/design-system';
import { Page } from '@strapi/strapi/admin';
import { EnvelopeIcon, FunnelIcon, DocumentTextIcon, ChartBarIcon, ChatBubbleLeftIcon } from '@heroicons/react/24/outline';
import HomePage from './HomePage';
import RoutingRules from './RoutingRules';
import TemplateList from './EmailDesigner/TemplateList';
import EditorPage from './EmailDesigner/EditorPage';
import Analytics from './Analytics';
import WhatsAppPage from './WhatsApp';
import { useAuthRefresh } from '../hooks/useAuthRefresh';
import pluginPermissions from '../permissions';

const App = () => {
  useAuthRefresh(); // keep admin token auto-refresh running across all tabs
  const location = useLocation();
  const navigate = useNavigate();
  
  // Check if we're in the editor (with specific ID, 'new', or 'core/...')
  const isEditorRoute = /\/designer\/(new|\d+|core\/.+)/.test(location.pathname);
  
  // Determine active tab from route
  const getActiveTab = () => {
    if (location.pathname.includes('/analytics')) return 'analytics';
    if (location.pathname.includes('/routing')) return 'routing';
    if (location.pathname.includes('/designer') && !isEditorRoute) return 'templates';
    if (location.pathname.includes('/whatsapp')) return 'whatsapp';
    return 'accounts';
  };
  
  const [activeTab, setActiveTab] = useState(getActiveTab());
  
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === 'accounts') navigate('/plugins/magic-mail');
    if (tab === 'routing') navigate('/plugins/magic-mail/routing');
    if (tab === 'templates') navigate('/plugins/magic-mail/designer');
    if (tab === 'analytics') navigate('/plugins/magic-mail/analytics');
    if (tab === 'whatsapp') navigate('/plugins/magic-mail/whatsapp');
  };
  
  if (isEditorRoute) {
    return (
      <Page.Protect permissions={pluginPermissions.access}>
        <EditorPage />
      </Page.Protect>
    );
  }

  return (
    <Page.Protect permissions={pluginPermissions.access}>
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
            <Tabs.Trigger value="templates">
              <Flex gap={2} alignItems="center">
                <DocumentTextIcon style={{ width: 16, height: 16 }} />
                Email Templates
              </Flex>
            </Tabs.Trigger>
            <Tabs.Trigger value="analytics">
              <Flex gap={2} alignItems="center">
                <ChartBarIcon style={{ width: 16, height: 16 }} />
                Analytics
              </Flex>
            </Tabs.Trigger>
            <Tabs.Trigger value="whatsapp">
              <Flex gap={2} alignItems="center">
                <ChatBubbleLeftIcon style={{ width: 16, height: 16 }} />
                WhatsApp
              </Flex>
            </Tabs.Trigger>
          </Tabs.List>
          
          <Tabs.Content value="accounts">
            <HomePage />
          </Tabs.Content>
          
          <Tabs.Content value="routing">
            <RoutingRules />
          </Tabs.Content>
          
          <Tabs.Content value="templates">
            <TemplateList />
          </Tabs.Content>
          
          <Tabs.Content value="analytics">
            <Analytics />
          </Tabs.Content>
          
          <Tabs.Content value="whatsapp">
            <WhatsAppPage />
          </Tabs.Content>
        </Tabs.Root>
      </Box>
    </Page.Protect>
  );
};

export default App;

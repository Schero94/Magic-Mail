import { useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { Box, Tabs, Flex } from '@strapi/design-system';
import { Page } from '@strapi/strapi/admin';
import {
  EnvelopeIcon,
  FunnelIcon,
  DocumentTextIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';
import HomePage from './HomePage';
import RoutingRules from './RoutingRules';
import TemplateList from './EmailDesigner/TemplateList';
import EditorPage from './EmailDesigner/EditorPage';
import Analytics from './Analytics';
import pluginId from '../pluginId';
import pluginPermissions from '../permissions';
import { PluginPageTitle } from '../components/shared/Headings';
import { useMagicMailIntl } from '../hooks/useMagicMailIntl';

const BASE_PATH = `/plugins/${pluginId}`;

const TAB_PATHS = {
  accounts: BASE_PATH,
  routing: `${BASE_PATH}/routing`,
  templates: `${BASE_PATH}/designer`,
  analytics: `${BASE_PATH}/analytics`,
};

const iconProps = { width: 16, height: 16 };

/**
 * Below 768px the four tabs do not fit: they scroll sideways on one line
 * instead of wrapping their labels or being clipped off-screen.
 */
const TabsList = styled(Tabs.List)`
  @media (max-width: 767px) {
    overflow-x: auto;
    scrollbar-width: thin;

    [role='tab'] {
      flex: 0 0 auto;
      white-space: nowrap;
    }
  }
`;

const App = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useMagicMailIntl();

  // Check if we're in the editor (with specific ID, 'new', or 'core/...')
  const isEditorRoute = /\/designer\/(new|\d+|core\/.+)/.test(location.pathname);

  // Determine active tab from route
  const getActiveTab = () => {
    if (location.pathname.includes('/analytics')) return 'analytics';
    if (location.pathname.includes('/routing')) return 'routing';
    if (location.pathname.includes('/designer') && !isEditorRoute) return 'templates';
    return 'accounts';
  };

  const handleTabChange = (tab) => {
    const path = TAB_PATHS[tab];
    if (path) navigate(path);
  };

  const tabs = [
    { value: 'accounts', Icon: EnvelopeIcon, label: t('app.tabs.accounts', 'Email Accounts') },
    { value: 'routing', Icon: FunnelIcon, label: t('app.tabs.routing', 'Routing Rules') },
    {
      value: 'templates',
      Icon: DocumentTextIcon,
      label: t('app.tabs.templates', 'Email Templates'),
    },
    { value: 'analytics', Icon: ChartBarIcon, label: t('app.tabs.analytics', 'Analytics') },
  ];

  const activeTab = getActiveTab();
  const activeLabel = tabs.find((tab) => tab.value === activeTab)?.label;

  // On narrow screens the tab strip scrolls sideways; keep the active tab in
  // view (e.g. Analytics, the last tab, after a reload or a deep link).
  const tabsRef = useRef(null);
  useLayoutEffect(() => {
    const list = tabsRef.current?.querySelector('[role="tablist"]');
    const tab = list?.querySelector('[role="tab"][aria-selected="true"]');
    if (!list || !tab || list.scrollWidth <= list.clientWidth) return;
    const listBox = list.getBoundingClientRect();
    const tabBox = tab.getBoundingClientRect();
    if (tabBox.left >= listBox.left && tabBox.right <= listBox.right) return;
    list.scrollLeft += tabBox.left - listBox.left - (listBox.width - tabBox.width) / 2;
  }, [activeTab, isEditorRoute]);

  return (
    <Page.Protect permissions={pluginPermissions.access}>
      <Page.Protect permissions={pluginPermissions.read}>
        {/* Page.Main renders <main id="main-content">, the target of the admin's
            "Skip to content" link. It is labelled by the view's h1
            (#main-content-title) or, without one, by the active tab name. */}
        <Page.Main aria-label={isEditorRoute ? undefined : activeLabel}>
          {isEditorRoute ? (
            <EditorPage />
          ) : (
            <Box ref={tabsRef}>
              <PluginPageTitle>{activeLabel}</PluginPageTitle>
              <Tabs.Root value={getActiveTab()} onValueChange={handleTabChange}>
                <TabsList aria-label={t('app.tabs.label', 'MagicMail sections')}>
                  {tabs.map(({ value, Icon, label }) => (
                    <Tabs.Trigger key={value} value={value}>
                      <Flex gap={2} alignItems="center">
                        <Icon aria-hidden="true" style={iconProps} />
                        {label}
                      </Flex>
                    </Tabs.Trigger>
                  ))}
                </TabsList>

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
              </Tabs.Root>
            </Box>
          )}
        </Page.Main>
      </Page.Protect>
    </Page.Protect>
  );
};

export default App;

import { useLocation, useNavigate } from 'react-router-dom';
import { Box, Tabs, Flex } from '@strapi/design-system';
import { Page } from '@strapi/strapi/admin';
import {
  EnvelopeIcon,
  FunnelIcon,
  DocumentTextIcon,
  ChartBarIcon,
  InboxStackIcon,
} from '@heroicons/react/24/outline';
import HomePage from './HomePage';
import RoutingRules from './RoutingRules';
import TemplateList from './EmailDesigner/TemplateList';
import EditorPage from './EmailDesigner/EditorPage';
import Analytics from './Analytics';
import Outbox from './Outbox';
import pluginId from '../pluginId';
import pluginPermissions from '../permissions';
import { PluginPageTitle } from '../components/shared/Headings';
import { SectionTabsList } from '../components/shared/SectionTabsList';
import { useMagicMailIntl } from '../hooks/useMagicMailIntl';
import { useMagicMailRBAC } from '../hooks/useMagicMailRBAC';

const BASE_PATH = `/plugins/${pluginId}`;

const TAB_PATHS = {
  accounts: BASE_PATH,
  routing: `${BASE_PATH}/routing`,
  templates: `${BASE_PATH}/designer`,
  analytics: `${BASE_PATH}/analytics`,
  outbox: `${BASE_PATH}/outbox`,
};

const iconProps = { width: 16, height: 16 };

const App = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useMagicMailIntl();
  const { canReadQueue } = useMagicMailRBAC();

  // Check if we're in the editor (with specific ID, 'new', or 'core/...')
  const isEditorRoute = /\/designer\/(new|\d+|core\/.+)/.test(location.pathname);

  // Determine active tab from route
  const getActiveTab = () => {
    if (location.pathname.includes('/outbox')) return 'outbox';
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
    // The outbox has its own grant (queue.read); a direct link without it
    // shows the view's no-permission state.
    ...(canReadQueue || location.pathname.includes('/outbox')
      ? [{ value: 'outbox', Icon: InboxStackIcon, label: t('app.tabs.outbox', 'Outbox') }]
      : []),
  ];

  const activeTab = getActiveTab();
  const activeLabel = tabs.find((tab) => tab.value === activeTab)?.label;

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
            <Box>
              <PluginPageTitle>{activeLabel}</PluginPageTitle>
              <Tabs.Root value={getActiveTab()} onValueChange={handleTabChange}>
                <SectionTabsList
                  value={activeTab}
                  label={t('app.tabs.label', 'MagicMail sections')}
                  previousLabel={t('app.tabs.scrollPrevious', 'Show previous sections')}
                  nextLabel={t('app.tabs.scrollNext', 'Show more sections')}
                >
                  {tabs.map(({ value, Icon, label }) => (
                    <Tabs.Trigger key={value} value={value}>
                      <Flex gap={2} alignItems="center">
                        <Icon aria-hidden="true" style={iconProps} />
                        {label}
                      </Flex>
                    </Tabs.Trigger>
                  ))}
                </SectionTabsList>

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

                <Tabs.Content value="outbox">
                  <Outbox />
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

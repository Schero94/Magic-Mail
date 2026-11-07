import { useEffect, useMemo, useRef, useState } from 'react';
import { useFetchClient, useNotification } from '@strapi/strapi/admin';
import { useNavigate } from 'react-router-dom';
import { Badge, Divider, Flex, Loader, Tabs, Typography } from '@strapi/design-system';
import { Thead, Tbody, Tr, Th, Td, Table } from '@strapi/design-system';
import {
  PlusIcon,
  PencilIcon,
  EyeIcon,
  TrashIcon,
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  ArrowPathIcon,
  DocumentTextIcon,
  ChartBarIcon,
  SparklesIcon,
  CheckCircleIcon,
  BoltIcon,
  CodeBracketIcon,
  DocumentDuplicateIcon,
  DocumentArrowDownIcon,
  PaperAirplaneIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import {
  GradientButton,
  SecondaryButton,
  TertiaryButton,
  CTAButton,
  IconButton,
  IconButtonDanger,
  IconButtonPrimary,
  IconButtonSuccess,
  IconButtonPurple,
} from '../../components/StyledButtons';
import { ConfirmDialog } from '../../components/shared/ConfirmDialog';
import { SectionHeading } from '../../components/shared/Headings';
import { SearchField } from '../../components/shared/SearchField';
import { useMagicMailRBAC } from '../../hooks/useMagicMailRBAC';
import { useMagicMailIntl } from '../../hooks/useMagicMailIntl';
import { useFormatters } from '../../hooks/useFormatters';
import { TemplateCodeSnippetsModal } from './TemplateCodeSnippetsModal';
import { TemplateTestSendModal } from './TemplateTestSendModal';
import { downloadBlob } from './editorUtils';
import {
  PAGE_SIZE_OPTIONS,
  clampPage,
  countPages,
  filterTemplates,
  getCategoryBadgeProps,
  getPageWindow,
  keepNativeButtonKeys,
} from './templateListUtils';
import {
  Container,
  CoreTableCard,
  EmptyButtonGroup,
  EmptyContent,
  EmptyFeatureItem,
  EmptyFeatureList,
  EmptyIcon,
  EmptyState,
  EmptyText,
  EmptyTitle,
  FilterBar,
  Header,
  HeaderContent,
  HiddenFileInput,
  NoResultsBox,
  NoResultsIcon,
  PageSizeSelect,
  PaginationButton,
  PaginationWrapper,
  SectionDivider,
  SectionHeaderRow,
  StatCard,
  StatIcon,
  StatLabel,
  StatValue,
  StatsGrid,
  StyledTable,
  Subtitle,
  TableWrapper,
  TemplatesContainer,
  Title,
} from './templateListStyles';

const iconSize = { width: 16, height: 16 };

const TemplateList = () => {
  const { get, del, post } = useFetchClient();
  const { toggleNotification } = useNotification();
  const navigate = useNavigate();
  const { t } = useMagicMailIntl();
  const { formatNumber } = useFormatters();
  const {
    canRead,
    canManage,
    canTestSend,
    isLoading: permissionsLoading,
    error: permissionsError,
  } = useMagicMailRBAC();

  const [templates, setTemplates] = useState([]);
  const [stats, setStats] = useState(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataReloadKey, setDataReloadKey] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('customTemplates');
  const [codeTemplate, setCodeTemplate] = useState(null);
  const [testTemplate, setTestTemplate] = useState(null);
  const [showTestSendModal, setShowTestSendModal] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);
  const customPanelRef = useRef(null);
  const focusAfterDeleteRef = useRef(false);

  const canExport = canRead;
  const canImport = canManage;

  const coreEmailTypes = [
    {
      type: 'reset-password',
      name: t('templates.core.resetPassword.name', 'Reset password'),
      description: t(
        'templates.core.resetPassword.description',
        'Sent when a user requests a password reset'
      ),
    },
    {
      type: 'email-confirmation',
      name: t('templates.core.emailConfirmation.name', 'Email address confirmation'),
      description: t(
        'templates.core.emailConfirmation.description',
        'Sent to confirm a user email address'
      ),
    },
  ];

  // Without read permission nothing is requested, so nothing is loading.
  const loading = canRead && dataLoading;

  /**
   * Loads templates and statistics; `dataReloadKey` reloads them after a change
   * or "Try again". A failed template request shows an error state with retry.
   * State is only set once the requests settled; `ignore` drops stale answers.
   */
  useEffect(() => {
    if (!canRead) return undefined;
    let ignore = false;
    const load = async () => {
      const [templatesResult, statsResult] = await Promise.allSettled([
        get('/magic-mail/designer/templates'),
        get('/magic-mail/designer/stats'),
      ]);
      if (ignore) return;

      if (templatesResult.status === 'fulfilled') {
        const list = templatesResult.value?.data?.data;
        setTemplates(Array.isArray(list) ? list : []);
        setLoadError(false);
      } else {
        console.error('[MagicMail] Failed to load templates');
        setLoadError(true);
      }
      setStats(statsResult.status === 'fulfilled' ? (statsResult.value?.data?.data ?? null) : null);
      setDataLoading(false);
    };
    load();
    return () => {
      ignore = true;
    };
  }, [canRead, get, dataReloadKey]);

  const reloadData = () => setDataReloadKey((key) => key + 1);

  // The deleted row (and the button that opened the dialog) is gone after the
  // reload; move focus to the search field, or the first action of the empty
  // state, instead of leaving it on <body>.
  useEffect(() => {
    if (!focusAfterDeleteRef.current || dataLoading) return;
    focusAfterDeleteRef.current = false;
    const panel = customPanelRef.current;
    const target = panel?.querySelector('[role="search"] input') ?? panel?.querySelector('button');
    target?.focus();
  }, [templates, dataLoading]);

  const filteredTemplates = useMemo(
    () => filterTemplates(templates, searchTerm),
    [templates, searchTerm]
  );
  const totalPages = countPages(filteredTemplates.length, itemsPerPage);
  const page = clampPage(currentPage, totalPages);
  const startIndex = (page - 1) * itemsPerPage;
  const paginatedTemplates = filteredTemplates.slice(startIndex, startIndex + itemsPerPage);

  // Keep the stored page in range after deletes (UI-22); adjusted while rendering.
  if (currentPage !== page) setCurrentPage(page);

  /** A new search always starts at page 1. */
  const changeSearch = (value) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const openTestSend = (template) => {
    setTestTemplate(template);
    setShowTestSendModal(true);
  };

  /** Deletes the confirmed template. Called from the confirmation dialog only. */
  const handleDelete = async (template) => {
    if (!canManage || !template) return;
    try {
      await del(
        `/magic-mail/designer/templates/${encodeURIComponent(template.templateReferenceId)}`
      );
      toggleNotification({
        type: 'success',
        message: t('templates.delete.success', 'Template "{name}" deleted', {
          name: template.name,
        }),
      });
      focusAfterDeleteRef.current = true;
      setPendingDelete(null);
      reloadData();
    } catch {
      toggleNotification({
        type: 'danger',
        message: t('templates.delete.failure', 'The template could not be deleted.'),
      });
    }
  };

  const handleDownload = async (template, type) => {
    try {
      const response = await get(
        `/magic-mail/designer/templates/${encodeURIComponent(template.templateReferenceId)}/download?type=${type}`,
        { responseType: 'blob' }
      );
      const blob =
        response.data instanceof Blob
          ? response.data
          : new Blob([response.data], { type: type === 'html' ? 'text/html' : 'application/json' });
      downloadBlob(blob, `template-${template.templateReferenceId}.${type}`);
      toggleNotification({
        type: 'success',
        message: t('templates.download.success', 'Template downloaded as {format}', {
          format: type.toUpperCase(),
        }),
      });
    } catch {
      toggleNotification({
        type: 'danger',
        message: t('templates.download.failure', 'The template could not be downloaded.'),
      });
    }
  };

  const handleDuplicate = async (template) => {
    if (!canManage) return;
    try {
      const response = await post(
        `/magic-mail/designer/templates/${encodeURIComponent(template.templateReferenceId)}/duplicate`
      );
      const duplicated = response.data?.data;
      toggleNotification({
        type: 'success',
        message: t('templates.duplicate.success', 'Template "{name}" duplicated', {
          name: template.name,
        }),
      });
      if (duplicated?.templateReferenceId) {
        navigate(`/plugins/magic-mail/designer/${duplicated.templateReferenceId}`);
      } else {
        reloadData();
      }
    } catch {
      toggleNotification({
        type: 'danger',
        message: t('templates.duplicate.failure', 'The template could not be duplicated.'),
      });
    }
  };

  const handleCreateTemplate = () => {
    navigate('/plugins/magic-mail/designer/new');
  };

  const handleExport = async () => {
    if (!canExport) return;
    try {
      const response = await post('/magic-mail/designer/export', { templateIds: [] });
      const dataStr = JSON.stringify(response.data?.data || [], null, 2);
      downloadBlob(
        new Blob([dataStr], { type: 'application/json' }),
        `magic-mail-templates-${new Date().toISOString().split('T')[0]}.json`
      );
      toggleNotification({
        type: 'success',
        message: t('templates.export.success', 'Templates exported'),
      });
    } catch (error) {
      toggleNotification({
        type: 'danger',
        message:
          error?.response?.data?.error?.message ||
          t('templates.export.failure', 'The templates could not be exported.'),
      });
    }
  };

  const handleImport = async (event) => {
    const input = event.target;
    const file = input.files?.[0];
    try {
      if (!canImport || !file) return;
      setImporting(true);
      let importedTemplates;
      try {
        importedTemplates = JSON.parse(await file.text());
      } catch {
        toggleNotification({
          type: 'danger',
          message: t('templates.import.invalidFile', 'The file is not valid JSON.'),
        });
        return;
      }

      const response = await post('/magic-mail/designer/import', { templates: importedTemplates });
      const results = Array.isArray(response.data?.data) ? response.data.data : [];
      const successful = results.filter((r) => r.success).length;
      const failed = results.length - successful;

      toggleNotification({
        type: failed > 0 ? 'warning' : 'success',
        message:
          failed > 0
            ? t(
                'templates.import.partial',
                '{successful, plural, one {# template imported} other {# templates imported}}, {failed, plural, one {# failed} other {# failed}}.',
                { successful, failed }
              )
            : t(
                'templates.import.success',
                '{successful, plural, one {# template imported} other {# templates imported}}.',
                { successful }
              ),
      });
      reloadData();
    } catch (error) {
      toggleNotification({
        type: 'danger',
        message:
          error?.response?.data?.error?.message ||
          t('templates.import.failure', 'The import failed.'),
      });
    } finally {
      // Allow choosing the same file again (UI-M06).
      input.value = '';
      setImporting(false);
    }
  };

  const getCategoryLabel = (category) => {
    switch (category) {
      case 'transactional':
        return t('templates.category.transactional', 'Transactional');
      case 'marketing':
        return t('templates.category.marketing', 'Marketing');
      case 'notification':
        return t('templates.category.notification', 'Notification');
      default:
        return t('templates.category.custom', 'Custom');
    }
  };

  const openImportPicker = () => fileInputRef.current?.click();

  // ---------------------------------------------------------------- states
  if (permissionsLoading) {
    return (
      <Container>
        <Flex justifyContent="center" padding={10}>
          <Loader>{t('templates.permissions.loading', 'Checking permissions...')}</Loader>
        </Flex>
      </Container>
    );
  }

  if (permissionsError) {
    return (
      <Container>
        <EmptyState role="alert">
          <EmptyContent>
            <EmptyIcon $tone="danger">
              <ExclamationTriangleIcon aria-hidden="true" />
            </EmptyIcon>
            <EmptyText variant="omega" textColor="neutral700">
              {t(
                'common.permissions.loadError',
                'Your permissions could not be loaded. Reload the page to try again.'
              )}
            </EmptyText>
          </EmptyContent>
        </EmptyState>
      </Container>
    );
  }

  const showSkeleton = loading && templates.length === 0;
  const statValue = (value) => (showSkeleton || stats === null ? '-' : formatNumber(value || 0));
  const showingFrom = filteredTemplates.length === 0 ? 0 : startIndex + 1;
  const showingTo = Math.min(startIndex + itemsPerPage, filteredTemplates.length);

  const renderEmptyState = () => (
    <EmptyState>
      <EmptyContent>
        <EmptyIcon>
          <SparklesIcon aria-hidden="true" />
        </EmptyIcon>
        <EmptyTitle variant="alpha" textColor="neutral800" tag="h2">
          {t('templates.empty.title', 'No email templates yet')}
        </EmptyTitle>
        <EmptyText variant="omega" textColor="neutral600">
          {canManage
            ? t(
                'templates.empty.description',
                'Start creating professional email templates with the visual designer.'
              )
            : t(
                'templates.empty.readOnlyDescription',
                'Templates created by users with the manage permission appear here.'
              )}
        </EmptyText>

        <EmptyFeatureList>
          <EmptyFeatureItem>
            <CheckCircleIcon aria-hidden="true" />
            <Typography variant="omega" fontWeight="semiBold">
              {t('templates.empty.feature.editor.title', 'Drag-and-drop editor')}
            </Typography>
            <Typography variant="pi" textColor="neutral600">
              {t(
                'templates.empty.feature.editor.text',
                'Build emails visually with the Unlayer editor'
              )}
            </Typography>
          </EmptyFeatureItem>
          <EmptyFeatureItem>
            <CheckCircleIcon aria-hidden="true" />
            <Typography variant="omega" fontWeight="semiBold">
              {t('templates.empty.feature.dynamic.title', 'Dynamic content')}
            </Typography>
            <Typography variant="pi" textColor="neutral600">
              {t(
                'templates.empty.feature.dynamic.text',
                'Use Mustache variables for personalised emails'
              )}
            </Typography>
          </EmptyFeatureItem>
          <EmptyFeatureItem>
            <CheckCircleIcon aria-hidden="true" />
            <Typography variant="omega" fontWeight="semiBold">
              {t('templates.empty.feature.versions.title', 'Version history')}
            </Typography>
            <Typography variant="pi" textColor="neutral600">
              {t(
                'templates.empty.feature.versions.text',
                'Track changes and restore earlier versions'
              )}
            </Typography>
          </EmptyFeatureItem>
        </EmptyFeatureList>

        {(canManage || canImport) && (
          <EmptyButtonGroup>
            {canManage && (
              <CTAButton
                startIcon={<PlusIcon style={{ width: 20, height: 20 }} aria-hidden="true" />}
                onClick={handleCreateTemplate}
              >
                {t('templates.empty.create', 'Create your first template')}
              </CTAButton>
            )}
            {canImport && (
              <SecondaryButton
                startIcon={<ArrowUpTrayIcon style={{ width: 20, height: 20 }} aria-hidden="true" />}
                onClick={openImportPicker}
                loading={importing}
              >
                {t('templates.import.button', 'Import templates')}
              </SecondaryButton>
            )}
          </EmptyButtonGroup>
        )}
      </EmptyContent>
    </EmptyState>
  );

  const renderErrorState = () => (
    <EmptyState role="alert">
      <EmptyContent>
        <EmptyIcon $tone="danger">
          <ExclamationTriangleIcon aria-hidden="true" />
        </EmptyIcon>
        <EmptyTitle variant="alpha" textColor="neutral800" tag="h2">
          {t('templates.error.title', 'Templates could not be loaded')}
        </EmptyTitle>
        <EmptyText variant="omega" textColor="neutral600">
          {t(
            'templates.error.description',
            'Check your connection and permissions, then try again.'
          )}
        </EmptyText>
        <EmptyButtonGroup>
          <GradientButton
            startIcon={<ArrowPathIcon style={iconSize} aria-hidden="true" />}
            onClick={() => {
              setDataLoading(true);
              reloadData();
            }}
            loading={loading}
          >
            {t('templates.retry', 'Try again')}
          </GradientButton>
        </EmptyButtonGroup>
      </EmptyContent>
    </EmptyState>
  );

  const renderTemplateActions = (template) => (
    <Flex gap={2} justifyContent="flex-end" wrap="nowrap" onKeyDown={keepNativeButtonKeys}>
      {canManage ? (
        <IconButtonPrimary
          onClick={() => navigate(`/plugins/magic-mail/designer/${template.templateReferenceId}`)}
          aria-label={t('templates.actions.edit', 'Edit template {name}', { name: template.name })}
        >
          <PencilIcon aria-hidden="true" />
        </IconButtonPrimary>
      ) : (
        <IconButtonPrimary
          onClick={() => navigate(`/plugins/magic-mail/designer/${template.templateReferenceId}`)}
          aria-label={t('templates.actions.view', 'View template {name}', { name: template.name })}
        >
          <EyeIcon aria-hidden="true" />
        </IconButtonPrimary>
      )}
      <IconButton
        onClick={() => handleDownload(template, 'html')}
        aria-label={t('templates.actions.downloadHtml', 'Download as HTML')}
      >
        <DocumentArrowDownIcon aria-hidden="true" />
      </IconButton>
      <IconButton
        onClick={() => handleDownload(template, 'json')}
        aria-label={t('templates.actions.downloadJson', 'Download as JSON')}
      >
        <CodeBracketIcon aria-hidden="true" />
      </IconButton>
      {canManage && (
        <IconButton
          onClick={() => handleDuplicate(template)}
          aria-label={t('templates.actions.duplicate', 'Duplicate template')}
        >
          <DocumentDuplicateIcon aria-hidden="true" />
        </IconButton>
      )}
      <IconButtonPurple
        onClick={() => setCodeTemplate(template)}
        aria-label={t('templates.actions.code', 'Show code snippets')}
      >
        <BoltIcon aria-hidden="true" />
      </IconButtonPurple>
      {canTestSend && (
        <IconButtonSuccess
          onClick={() => openTestSend(template)}
          aria-label={t('templates.actions.testSend', 'Send test email')}
        >
          <PaperAirplaneIcon aria-hidden="true" />
        </IconButtonSuccess>
      )}
      {canManage && (
        <IconButtonDanger
          onClick={() => setPendingDelete(template)}
          aria-label={t('templates.actions.delete', 'Delete template')}
        >
          <TrashIcon aria-hidden="true" />
        </IconButtonDanger>
      )}
    </Flex>
  );

  const renderPagination = () => (
    <PaginationWrapper aria-label={t('templates.pagination.label', 'Template pages')}>
      <Flex gap={3} alignItems="center" wrap="wrap">
        <Typography variant="pi" textColor="neutral600" aria-live="polite">
          {t('templates.pagination.showing', 'Showing {from}-{to} of {total}', {
            from: showingFrom,
            to: showingTo,
            total: filteredTemplates.length,
          })}
        </Typography>
        <Flex gap={2} alignItems="center">
          <Typography
            variant="pi"
            textColor="neutral600"
            tag="label"
            htmlFor="magic-mail-templates-page-size"
          >
            {t('templates.pagination.perPage', 'Per page')}
          </Typography>
          <PageSizeSelect
            id="magic-mail-templates-page-size"
            value={itemsPerPage}
            onChange={(e) => {
              setItemsPerPage(Number(e.target.value));
              setCurrentPage(1);
            }}
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </PageSizeSelect>
        </Flex>
      </Flex>
      {totalPages > 1 && (
        <Flex gap={2} wrap="wrap">
          <PaginationButton
            type="button"
            onClick={() => setCurrentPage(Math.max(1, page - 1))}
            disabled={page === 1}
            aria-label={t('templates.pagination.previous', 'Previous page')}
          >
            {t('templates.pagination.previousShort', 'Previous')}
          </PaginationButton>
          {getPageWindow(page, totalPages).map((pageNum) => (
            <PaginationButton
              type="button"
              key={pageNum}
              $active={page === pageNum}
              aria-current={page === pageNum ? 'page' : undefined}
              aria-label={t('templates.pagination.page', 'Page {page}', { page: pageNum })}
              onClick={() => setCurrentPage(pageNum)}
            >
              {pageNum}
            </PaginationButton>
          ))}
          <PaginationButton
            type="button"
            onClick={() => setCurrentPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            aria-label={t('templates.pagination.next', 'Next page')}
          >
            {t('templates.pagination.nextShort', 'Next')}
          </PaginationButton>
        </Flex>
      )}
    </PaginationWrapper>
  );

  const renderCustomTemplates = () => {
    // Every state keeps the same distance to the tabs as the list.
    if (loadError && templates.length === 0) {
      return <TemplatesContainer>{renderErrorState()}</TemplatesContainer>;
    }
    if (showSkeleton) {
      return (
        <TemplatesContainer>
          <Flex justifyContent="center" padding={10}>
            <Loader>{t('templates.loading', 'Loading templates...')}</Loader>
          </Flex>
        </TemplatesContainer>
      );
    }
    if (templates.length === 0) {
      return <TemplatesContainer>{renderEmptyState()}</TemplatesContainer>;
    }

    return (
      <TemplatesContainer>
        <SectionHeaderRow justifyContent="space-between" alignItems="center">
          <SectionHeading>{t('templates.list.heading', 'Your templates')}</SectionHeading>
          {canManage && (
            <GradientButton
              startIcon={<PlusIcon style={{ width: 20, height: 20 }} aria-hidden="true" />}
              onClick={handleCreateTemplate}
            >
              {t('templates.create', 'Create template')}
            </GradientButton>
          )}
        </SectionHeaderRow>

        <FilterBar>
          <SearchField
            label={t('templates.search.label', 'Search templates')}
            placeholder={t('templates.search.placeholder', 'Search by name, subject, or ID...')}
            value={searchTerm}
            onChange={changeSearch}
          />
          {canImport && (
            <SecondaryButton
              startIcon={<ArrowUpTrayIcon style={iconSize} aria-hidden="true" />}
              onClick={openImportPicker}
              loading={importing}
            >
              {t('templates.import.short', 'Import')}
            </SecondaryButton>
          )}
          {canExport && (
            <TertiaryButton
              startIcon={<ArrowDownTrayIcon style={iconSize} aria-hidden="true" />}
              onClick={handleExport}
              disabled={templates.length === 0}
            >
              {t('templates.export.short', 'Export')}
            </TertiaryButton>
          )}
        </FilterBar>

        {filteredTemplates.length > 0 ? (
          <TableWrapper>
            <StyledTable colCount={5} rowCount={paginatedTemplates.length + 1}>
              <Thead>
                <Tr>
                  <Th style={{ width: '100px' }}>
                    <Typography variant="sigma">{t('templates.table.id', 'ID')}</Typography>
                  </Th>
                  <Th>
                    <Typography variant="sigma">{t('templates.table.name', 'Name')}</Typography>
                  </Th>
                  <Th style={{ width: '140px' }}>
                    <Typography variant="sigma">
                      {t('templates.table.category', 'Category')}
                    </Typography>
                  </Th>
                  <Th style={{ width: '110px' }}>
                    <Typography variant="sigma">{t('templates.table.status', 'Status')}</Typography>
                  </Th>
                  {/* 1% + nowrap actions: the column shrinks to its buttons on one line. */}
                  <Th style={{ width: '1%' }}>
                    <Flex justifyContent="flex-end" width="100%">
                      <Typography variant="sigma">
                        {t('templates.table.actions', 'Actions')}
                      </Typography>
                    </Flex>
                  </Th>
                </Tr>
              </Thead>
              <Tbody>
                {paginatedTemplates.map((template) => (
                  <Tr key={template.templateReferenceId ?? template.id}>
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
                      <Badge {...getCategoryBadgeProps(template.category)}>
                        {getCategoryLabel(template.category)}
                      </Badge>
                    </Td>
                    <Td>
                      <Badge variant={template.isActive ? 'success' : 'neutral'}>
                        {template.isActive
                          ? t('templates.status.active', 'Active')
                          : t('templates.status.inactive', 'Inactive')}
                      </Badge>
                    </Td>
                    <Td>{renderTemplateActions(template)}</Td>
                  </Tr>
                ))}
              </Tbody>
            </StyledTable>
            {renderPagination()}
          </TableWrapper>
        ) : (
          <NoResultsBox>
            <NoResultsIcon aria-hidden="true" />
            <Typography variant="beta" textColor="neutral700" tag="h3">
              {t('templates.noResults.title', 'No templates found')}
            </Typography>
            <Typography variant="omega" textColor="neutral600" tag="p">
              {t('templates.noResults.text', 'Try a different search term.')}
            </Typography>
            <Flex justifyContent="center" marginTop={5}>
              <TertiaryButton onClick={() => changeSearch('')}>
                {t('templates.noResults.clear', 'Clear search')}
              </TertiaryButton>
            </Flex>
          </NoResultsBox>
        )}
      </TemplatesContainer>
    );
  };

  return (
    <Container>
      <Header>
        <HeaderContent justifyContent="flex-start" alignItems="center">
          <div>
            <Title variant="alpha" tag="h1">
              <DocumentTextIcon aria-hidden="true" />
              {t('templates.title', 'Email Templates')}
            </Title>
            {stats && (
              <Subtitle variant="epsilon" tag="p">
                {t(
                  'templates.subtitle',
                  '{count, plural, one {# template created} other {# templates created}}',
                  {
                    count: stats.total || 0,
                  }
                )}
              </Subtitle>
            )}
          </div>
        </HeaderContent>
      </Header>

      <StatsGrid>
        <StatCard $delay="0.1s" $tone="primary">
          <StatIcon className="stat-icon" $bg="rgba(2, 132, 199, 0.12)" $tone="primary">
            <DocumentTextIcon aria-hidden="true" />
          </StatIcon>
          <StatValue className="stat-value" variant="alpha" tag="p">
            {statValue(stats?.total)}
          </StatValue>
          <StatLabel variant="pi" tag="p">
            {t('templates.stats.total', 'Total templates')}
          </StatLabel>
        </StatCard>

        <StatCard $delay="0.2s" $tone="success">
          <StatIcon className="stat-icon" $bg="rgba(22, 163, 74, 0.12)" $tone="success">
            <ChartBarIcon aria-hidden="true" />
          </StatIcon>
          <StatValue className="stat-value" variant="alpha" tag="p">
            {statValue(stats?.active)}
          </StatValue>
          <StatLabel variant="pi" tag="p">
            {t('templates.stats.active', 'Active')}
          </StatLabel>
        </StatCard>
      </StatsGrid>

      <SectionDivider>
        <Divider />
      </SectionDivider>

      <Tabs.Root value={activeTab} onValueChange={setActiveTab}>
        <Tabs.List aria-label={t('templates.tabs.label', 'Template types')}>
          <Tabs.Trigger value="customTemplates">
            {t('templates.tabs.custom', 'Custom templates')}
          </Tabs.Trigger>
          <Tabs.Trigger value="coreEmails">{t('templates.tabs.core', 'Core emails')}</Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="customTemplates" ref={customPanelRef}>
          {renderCustomTemplates()}
        </Tabs.Content>

        <Tabs.Content value="coreEmails">
          <TemplatesContainer>
            <Flex direction="column" alignItems="flex-start" gap={2} marginBottom={6}>
              <SectionHeading>{t('templates.core.heading', 'Core email templates')}</SectionHeading>
              <Typography variant="omega" textColor="neutral600" tag="p">
                {t(
                  'templates.core.description',
                  'Design the default Strapi system emails (password reset and email confirmation).'
                )}
              </Typography>
            </Flex>

            <CoreTableCard>
              <Table colCount={2} rowCount={coreEmailTypes.length + 1}>
                <Thead>
                  <Tr>
                    <Th>
                      <Typography variant="sigma">
                        {t('templates.core.table.type', 'Email type')}
                      </Typography>
                    </Th>
                    <Th>
                      <Flex justifyContent="flex-end" width="100%">
                        <Typography variant="sigma">
                          {t('templates.table.actions', 'Actions')}
                        </Typography>
                      </Flex>
                    </Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {coreEmailTypes.map((coreEmail) => (
                    <Tr key={coreEmail.type}>
                      <Td>
                        <Flex direction="column" alignItems="flex-start" gap={1}>
                          <Typography variant="omega" fontWeight="semiBold">
                            {coreEmail.name}
                          </Typography>
                          <Typography variant="pi" textColor="neutral600">
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
                            aria-label={
                              !canManage
                                ? t('templates.core.view', 'View {name}', { name: coreEmail.name })
                                : t('templates.core.edit', 'Edit {name}', { name: coreEmail.name })
                            }
                          >
                            {canManage ? (
                              <PencilIcon aria-hidden="true" />
                            ) : (
                              <EyeIcon aria-hidden="true" />
                            )}
                          </IconButtonPrimary>
                        </Flex>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </CoreTableCard>
          </TemplatesContainer>
        </Tabs.Content>
      </Tabs.Root>

      <TemplateCodeSnippetsModal
        template={codeTemplate}
        isOpen={codeTemplate !== null}
        onClose={() => setCodeTemplate(null)}
      />

      <TemplateTestSendModal
        template={testTemplate}
        isOpen={canTestSend && showTestSendModal}
        onClose={() => setShowTestSendModal(false)}
      />

      <ConfirmDialog
        isOpen={canManage && pendingDelete !== null}
        title={t('templates.delete.title', 'Delete template?')}
        description={t('templates.delete.body', 'Delete "{name}"? This cannot be undone.', {
          name: pendingDelete?.name ?? '',
        })}
        confirmLabel={t('common.delete', 'Delete')}
        confirmIcon={<TrashIcon style={iconSize} aria-hidden="true" />}
        onConfirm={() => handleDelete(pendingDelete)}
        onClose={() => setPendingDelete(null)}
      >
        {t(
          'templates.delete.hint',
          'Code that sends this template by its ID will fail afterwards.'
        )}
      </ConfirmDialog>

      {canImport && (
        <HiddenFileInput
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          onChange={handleImport}
          aria-hidden="true"
          tabIndex={-1}
        />
      )}
    </Container>
  );
};

export default TemplateList;

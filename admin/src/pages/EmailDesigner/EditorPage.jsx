import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFetchClient, useNotification } from '@strapi/strapi/admin';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTheme } from 'styled-components';
import {
  Typography,
  Button,
  Field,
  Flex,
  Tabs,
  Textarea,
  SingleSelect,
  SingleSelectOption,
  Loader,
  Switch,
} from '@strapi/design-system';
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  CheckIcon,
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  ClockIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  SparklesIcon,
  TrashIcon,
  ArrowUturnLeftIcon,
} from '@heroicons/react/24/outline';
import { EmailEditor } from 'react-email-editor';
import { useMagicMailRBAC } from '../../hooks/useMagicMailRBAC';
import { useMagicMailIntl } from '../../hooks/useMagicMailIntl';
import { useUnsavedChangesGuard } from '../../hooks/useUnsavedChangesGuard';
import { ConfirmDialog } from '../../components/shared/ConfirmDialog';
import { UnsavedChangesDialog } from '../../components/shared/UnsavedChangesDialog';
import { PluginPageTitle } from '../../components/shared/Headings';
import { TertiaryButton } from '../../components/StyledButtons';
import { isDarkTheme } from '../../utils/theme';
import { VersionHistoryDrawer } from './VersionHistoryDrawer';
import {
  DEFAULT_EDITOR_CONFIG,
  UNLAYER_SCRIPT_URL,
  buildUnlayerOptions,
  createMediaLibraryUploader,
  sanitizeEditorConfig,
} from './unlayerOptions';
import {
  buildCoreDesign,
  buildCorePayload,
  buildTemplatePayload,
  downloadBlob,
  getVersionFocusAfterDelete,
  parseDesignFile,
  toFileName,
  validateTemplateFields,
} from './editorUtils';
import { getBackendBaseUrl } from './templateListUtils';
import {
  BackButton,
  Container,
  DesignerLoadingContainer,
  EditorCanvas,
  FieldWrapper,
  Header,
  HeaderLeft,
  HeaderRight,
  HeaderRow,
  HiddenInput,
  LoadingContainer,
  OverlayState,
  ReadOnlyPanel,
  ReadOnlyPreview,
  SaveButton,
  SettingsRow,
  StyledTabsContent,
  StyledTabsRoot,
  SwitchWrapper,
  TabContentWrapper,
  TabListWrapper,
  TabsWrapper,
  TextTabContent,
  TitleContainer,
  ToolbarButton,
} from './editorStyles';

// Named export of react-email-editor 2.x (SUP-M04: no namespace fallback).
const EmailEditorComponent = EmailEditor;

/**
 * Keeps exceptions from the remote Unlayer runtime inside the editor panel.
 * The parent can then show its accessible Plain Text fallback without taking
 * down the entire Strapi plugin route.
 */
class VisualEditorErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  /** @returns {{hasError: boolean}} */
  static getDerivedStateFromError() {
    return { hasError: true };
  }

  /** Notify the parent so it can switch from loading to its fallback state. */
  componentDidCatch() {
    this.props.onError();
  }

  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

const VISUAL_EDITOR_LOAD_TIMEOUT_MS = 15000;
const EXPORT_TIMEOUT_MS = 10000;
const TEMPLATE_LIST_PATH = '/plugins/magic-mail/designer';

const EMPTY_TEMPLATE = Object.freeze({
  templateReferenceId: '',
  name: '',
  subject: '',
  category: 'custom',
  isActive: true,
  design: null,
  bodyHtml: '',
  bodyText: '',
  tags: [],
});

const htmlToText = (html) => {
  try {
    return new DOMParser().parseFromString(html, 'text/html').body.textContent || '';
  } catch {
    return html;
  }
};

const EditorPage = () => {
  const { canManage, isLoading: permissionsLoading, error: permissionsError } = useMagicMailRBAC();
  const { t, locale } = useMagicMailIntl();
  const activeTheme = useTheme();
  const location = useLocation();
  const { get, post, put } = useFetchClient();
  const { toggleNotification } = useNotification();
  const navigate = useNavigate();
  const emailEditorRef = useRef(null);
  const editorReadyRef = useRef(false);
  const latestDesignRef = useRef(null);
  const suppressDirtyRef = useRef(false);
  const designInputRef = useRef(null);

  // Extract ID from pathname
  const pathname = location.pathname;
  const coreMatch = pathname.match(/\/designer\/core\/([^/]+)$/);
  const templateMatch = pathname.match(/\/designer\/([^/]+)$/);

  const isCoreEmail = !!coreMatch;
  const coreEmailType = coreMatch ? coreMatch[1] : null;
  const id = !isCoreEmail && templateMatch ? templateMatch[1] : null;
  const isNewTemplate = id === 'new';

  const [loading, setLoading] = useState(!isNewTemplate);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('html');
  const [editorLoaded, setEditorLoaded] = useState(false);
  const [designerLoadError, setDesignerLoadError] = useState(false);
  const [editorConfig, setEditorConfig] = useState(null);
  const [isDirty, setIsDirty] = useState(false);
  const [errors, setErrors] = useState({});
  const [templateData, setTemplateData] = useState(EMPTY_TEMPLATE);

  // Version history state
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [versions, setVersions] = useState([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [versionsError, setVersionsError] = useState(false);
  const [pendingRestore, setPendingRestore] = useState(null);
  const [pendingVersionDelete, setPendingVersionDelete] = useState(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  // Focus target after a version deletion: the version id whose Restore button
  // gets focus, or null for the drawer heading (see getVersionFocusTarget).
  // The dialog closes first (focus returns to its opener inside the drawer);
  // once the reloaded list is rendered, the effect below moves focus on.
  const versionDrawerRef = useRef(null);
  const versionFocusIdRef = useRef(null);
  const versionFocusPendingRef = useRef(false);
  const [versionFocusRequest, setVersionFocusRequest] = useState(0);
  const getVersionFocusTarget = useCallback(
    () => versionDrawerRef.current?.getFocusTarget(versionFocusIdRef.current) ?? null,
    []
  );

  const guard = useUnsavedChangesGuard(canManage && isDirty);

  const coreEmailName =
    coreEmailType === 'reset-password'
      ? t('editor.core.resetPassword', 'Reset password')
      : t('editor.core.emailConfirmation', 'Email confirmation');

  /** Loads a design into Unlayer without marking the form dirty. */
  const loadDesignIntoEditor = useCallback((design) => {
    latestDesignRef.current = design ?? null;
    const editor = emailEditorRef.current?.editor;
    if (!design || !editor || !editorReadyRef.current) return false;
    suppressDirtyRef.current = true;
    editor.loadDesign(design);
    setTimeout(() => {
      suppressDirtyRef.current = false;
    }, 500);
    return true;
  }, []);

  const updateField = (field, value) => {
    setTemplateData((current) => ({ ...current, [field]: value }));
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
    setIsDirty(true);
  };

  // Reset the form whenever the route changes; the editor remounts per
  // template. State is adjusted while rendering (react.dev "Adjusting some
  // state when a prop changes"), the refs and the request follow in the effect.
  const routeKey = pathname;
  const [handledRouteKey, setHandledRouteKey] = useState(routeKey);
  if (routeKey !== handledRouteKey) {
    setHandledRouteKey(routeKey);
    setEditorLoaded(false);
    setDesignerLoadError(false);
    setErrors({});
    setIsDirty(false);
    setLoadError(false);
    if (isNewTemplate) {
      setTemplateData(EMPTY_TEMPLATE);
      setLoading(false);
    } else {
      setLoading(true);
    }
  }

  // The editor of the previous route is gone; forget its readiness and design.
  useEffect(() => {
    editorReadyRef.current = false;
    latestDesignRef.current = null;
  }, [pathname]);

  // Loads the template (or core email) for the route; `templateReloadKey`
  // reloads it after "Try again" or a version restore. `loading` is set by the
  // caller that wants the loader; the request only sets state once it settled,
  // and `ignore` drops the answer for a route that is no longer shown.
  const [templateReloadKey, setTemplateReloadKey] = useState(0);
  useEffect(() => {
    if (!isCoreEmail && (isNewTemplate || !id)) return undefined;
    let ignore = false;
    const load = async () => {
      try {
        let next;
        if (isCoreEmail) {
          const response = await get(
            `/magic-mail/designer/core/${encodeURIComponent(coreEmailType)}`
          );
          const coreTemplate = response.data?.data;
          const design = coreTemplate?.design || buildCoreDesign(coreTemplate?.message, htmlToText);
          next = {
            ...EMPTY_TEMPLATE,
            category: 'transactional',
            subject: coreTemplate?.subject || '',
            design,
            bodyHtml: coreTemplate?.bodyHtml || coreTemplate?.message || '',
            bodyText: coreTemplate?.bodyText || '',
          };
        } else {
          const response = await get(`/magic-mail/designer/templates/${encodeURIComponent(id)}`);
          next = { ...EMPTY_TEMPLATE, ...(response.data?.data ?? {}) };
        }
        if (ignore) return;
        setTemplateData(next);
        setLoadError(false);
        setIsDirty(false);
        loadDesignIntoEditor(next.design);
      } catch {
        if (ignore) return;
        console.error(
          isCoreEmail
            ? '[MagicMail] Failed to load core template'
            : '[MagicMail] Failed to load template'
        );
        setLoadError(true);
      } finally {
        if (!ignore) setLoading(false);
      }
    };
    load();
    return () => {
      ignore = true;
    };
  }, [coreEmailType, get, id, isCoreEmail, isNewTemplate, loadDesignIntoEditor, templateReloadKey]);

  const reloadTemplate = () => setTemplateReloadKey((key) => key + 1);

  // Operator settings for the visual editor (optional projectId, pinned script/version).
  useEffect(() => {
    if (!canManage || editorConfig) return undefined;
    let cancelled = false;
    get('/magic-mail/designer/editor-config')
      .then((response) => {
        if (!cancelled) setEditorConfig(sanitizeEditorConfig(response?.data?.data));
      })
      .catch(() => {
        if (!cancelled) setEditorConfig(DEFAULT_EDITOR_CONFIG);
      });
    return () => {
      cancelled = true;
    };
  }, [canManage, editorConfig, get]);

  // Options are computed once per configuration: react-email-editor recreates
  // the editor (and drops unsaved work) whenever its options change, so a later
  // theme or locale change must not rebuild them. Kept in state and adjusted
  // while rendering when the configuration changes.
  const [frozenOptions, setFrozenOptions] = useState({ config: null, options: null });
  if (editorConfig && frozenOptions.config !== editorConfig) {
    setFrozenOptions({
      config: editorConfig,
      options: buildUnlayerOptions({
        config: editorConfig,
        isDark: isDarkTheme(activeTheme),
        locale,
        t,
      }),
    });
  }
  const unlayerOptions = frozenOptions.config === editorConfig ? frozenOptions.options : null;

  // Do not leave the visual editor in an indefinite loading state if its
  // external runtime is blocked or unavailable. The Plain Text tab remains
  // usable without that dependency.
  useEffect(() => {
    if (!canManage || activeTab !== 'html' || editorLoaded || designerLoadError) return undefined;

    const loadTimeout = window.setTimeout(() => {
      setDesignerLoadError(true);
    }, VISUAL_EDITOR_LOAD_TIMEOUT_MS);

    return () => window.clearTimeout(loadTimeout);
  }, [activeTab, canManage, designerLoadError, editorLoaded]);

  /** Exports design and HTML from Unlayer. */
  const exportEditor = useCallback(
    () =>
      new Promise((resolve, reject) => {
        const editor = emailEditorRef.current?.editor;
        if (!editor || !editorReadyRef.current) {
          reject(new Error('editor not ready'));
          return;
        }
        const timer = setTimeout(() => reject(new Error('export timeout')), EXPORT_TIMEOUT_MS);
        editor.exportHtml((data) => {
          clearTimeout(timer);
          resolve({ design: data.design, bodyHtml: data.html });
        });
      }),
    []
  );

  /** Mark the visual editor ready, wire uploads and change tracking, load the saved design. */
  const onEditorReady = useCallback(
    (readyEditor) => {
      const editor = readyEditor ?? emailEditorRef.current?.editor;
      editorReadyRef.current = true;
      setDesignerLoadError(false);
      setEditorLoaded(true);
      if (!editor) return;

      editor.registerCallback?.(
        'image',
        createMediaLibraryUploader({
          post,
          baseUrl: getBackendBaseUrl(),
          failureMessage: t(
            'editor.upload.failure',
            'The image could not be uploaded to the Media Library.'
          ),
        })
      );
      editor.addEventListener?.('design:updated', () => {
        if (!suppressDirtyRef.current) setIsDirty(true);
      });
      editor.addEventListener?.('design:loaded', () => {
        suppressDirtyRef.current = false;
      });

      if (latestDesignRef.current) {
        suppressDirtyRef.current = true;
        editor.loadDesign(latestDesignRef.current);
      }
    },
    [post, t]
  );

  // ------------------------------------------------------------ versions
  const fetchVersions = async () => {
    if (!id || isNewTemplate || isCoreEmail) return;
    setLoadingVersions(true);
    setVersionsError(false);
    try {
      const response = await get(
        `/magic-mail/designer/templates/${encodeURIComponent(id)}/versions`
      );
      setVersions(Array.isArray(response.data?.data) ? response.data.data : []);
    } catch {
      console.error('[Version History] Failed to load versions');
      setVersionsError(true);
    } finally {
      setLoadingVersions(false);
    }
  };

  // Runs after the reloaded version list is committed (see handleDeleteVersion).
  useEffect(() => {
    if (!versionFocusRequest || !versionFocusPendingRef.current || loadingVersions) return;
    versionFocusPendingRef.current = false;
    getVersionFocusTarget()?.focus();
  }, [versionFocusRequest, loadingVersions, getVersionFocusTarget]);

  const handleOpenVersionHistory = () => {
    setShowVersionHistory(true);
    fetchVersions();
  };

  /**
   * Restores a saved revision after confirmation (ConfirmDialog). The server
   * route repeats the manage-permission check before changing the template.
   *
   * @param {object} version Stored revision.
   * @param {number} versionNumber Human-readable revision number.
   * @returns {Promise<void>}
   */
  const handleRestoreVersion = async (version, versionNumber) => {
    if (!canManage) return;
    try {
      await post(
        `/magic-mail/designer/templates/${encodeURIComponent(id)}/versions/${encodeURIComponent(version.id)}/restore`
      );
      toggleNotification({
        type: 'success',
        message: t('editor.versions.restore.success', 'Restored version {number}', {
          number: versionNumber,
        }),
      });
      setPendingRestore(null);
      setShowVersionHistory(false);
      reloadTemplate();
      await fetchVersions();
    } catch {
      console.error('[Version History] Failed to restore version');
      toggleNotification({
        type: 'danger',
        message: t('editor.versions.restore.failure', 'The version could not be restored.'),
      });
    }
  };

  /**
   * Deletes one saved revision after confirmation. The admin API enforces
   * the same manage capability independently of this UI guard.
   *
   * @param {object} version Stored revision.
   * @param {number} versionNumber Human-readable revision number.
   * @returns {Promise<void>}
   */
  const handleDeleteVersion = async (version, versionNumber) => {
    if (!canManage) return;
    versionFocusIdRef.current = getVersionFocusAfterDelete(versions, version.id);
    try {
      await post(
        `/magic-mail/designer/templates/${encodeURIComponent(id)}/versions/${encodeURIComponent(version.id)}/delete`
      );
      toggleNotification({
        type: 'success',
        message: t('editor.versions.delete.success', 'Version {number} deleted', {
          number: versionNumber,
        }),
      });
      setPendingVersionDelete(null);
      await fetchVersions();
      versionFocusPendingRef.current = true;
      setVersionFocusRequest((n) => n + 1);
    } catch {
      console.error('[Version History] Failed to delete version');
      toggleNotification({
        type: 'danger',
        message: t('editor.versions.delete.failure', 'The version could not be deleted.'),
      });
    }
  };

  /**
   * Deletes all stored revisions after a count-specific confirmation.
   * The server route remains the authoritative permission boundary.
   *
   * @returns {Promise<void>}
   */
  const handleDeleteAllVersions = async () => {
    if (!canManage) return;
    const count = versions.length;
    versionFocusIdRef.current = null;
    try {
      await post(`/magic-mail/designer/templates/${encodeURIComponent(id)}/versions/delete-all`);
      toggleNotification({
        type: 'success',
        message: t(
          'editor.versions.deleteAll.success',
          '{count, plural, one {# version deleted} other {# versions deleted}}',
          { count }
        ),
      });
      setConfirmDeleteAll(false);
      await fetchVersions();
      versionFocusPendingRef.current = true;
      setVersionFocusRequest((n) => n + 1);
    } catch {
      console.error('[Version History] Failed to delete all versions');
      toggleNotification({
        type: 'danger',
        message: t('editor.versions.deleteAll.failure', 'The versions could not be deleted.'),
      });
    }
  };

  // ---------------------------------------------------------------- save
  /**
   * Persists the template or core email configuration for an admin with the
   * manage capability. The server independently rejects other roles.
   *
   * @returns {Promise<void>}
   */
  const handleSave = async () => {
    if (!canManage) return;
    if (saving) return;

    const fieldErrors = validateTemplateFields(templateData, { isCoreEmail, isNewTemplate });
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length > 0) {
      toggleNotification({
        type: 'warning',
        message: t('editor.save.invalid', 'Please complete the highlighted fields.'),
      });
      return;
    }

    setSaving(true);
    try {
      // Export from the visual editor whenever it is loaded, regardless of the
      // active tab, so visual edits are never lost (FUN-14, UI-M01).
      let design = templateData.design;
      let bodyHtml = templateData.bodyHtml;
      if (editorReadyRef.current && emailEditorRef.current?.editor) {
        ({ design, bodyHtml } = await exportEditor());
      }

      if (isCoreEmail) {
        await put(
          `/magic-mail/designer/core/${encodeURIComponent(coreEmailType)}`,
          buildCorePayload(templateData, { design, bodyHtml })
        );
        setTemplateData((current) => ({ ...current, design, bodyHtml }));
        latestDesignRef.current = design;
        setIsDirty(false);
        toggleNotification({
          type: 'success',
          message: t('editor.save.coreSuccess', 'Core email template saved'),
        });
        return;
      }

      const payload = buildTemplatePayload(templateData, { design, bodyHtml, isNewTemplate });
      const response = isNewTemplate
        ? await post('/magic-mail/designer/templates', payload)
        : await put(`/magic-mail/designer/templates/${encodeURIComponent(id)}`, payload);

      setTemplateData((current) => ({ ...current, design, bodyHtml }));
      latestDesignRef.current = design;
      setIsDirty(false);
      toggleNotification({
        type: 'success',
        message: isNewTemplate
          ? t('editor.save.created', 'Template created')
          : t('editor.save.success', 'Template saved'),
      });

      if (isNewTemplate) {
        // Templates are addressed by their user-visible templateReferenceId.
        const created = response.data?.data;
        const navId = created?.templateReferenceId ?? created?.id;
        if (navId !== undefined && navId !== null) {
          guard.bypass(() => navigate(`${TEMPLATE_LIST_PATH}/${navId}`, { replace: true }));
        }
      }
    } catch (error) {
      toggleNotification({
        type: 'danger',
        message:
          error?.response?.data?.error?.message ||
          error?.response?.data?.message ||
          t('editor.save.failure', 'The template could not be saved.'),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleExportDesign = async () => {
    try {
      const { design } = await exportEditor();
      downloadBlob(
        new Blob([JSON.stringify(design, null, 2)], { type: 'application/json' }),
        `${toFileName(templateData.name || coreEmailType || 'template')}-design.json`
      );
      toggleNotification({
        type: 'success',
        message: t('editor.design.exported', 'Design exported'),
      });
    } catch {
      toggleNotification({
        type: 'warning',
        message: t(
          'editor.design.exportUnavailable',
          'The visual editor is not ready yet. Try again in a moment.'
        ),
      });
    }
  };

  /**
   * Loads a local design file into the editor. Persistence still requires the
   * separately guarded save action and server-side manage permission.
   *
   * @param {React.ChangeEvent<HTMLInputElement>} event File input change.
   * @returns {Promise<void>}
   */
  const handleImportDesign = async (event) => {
    if (!canManage) return;
    const input = event.target;
    const file = input.files?.[0];
    try {
      if (!file) return;
      const design = parseDesignFile(await file.text());
      if (!design) {
        toggleNotification({
          type: 'danger',
          message: t('editor.design.invalid', 'The file is not a valid design export.'),
        });
        return;
      }
      setTemplateData((current) => ({ ...current, design }));
      setIsDirty(true);
      if (loadDesignIntoEditor(design)) {
        toggleNotification({
          type: 'success',
          message: t('editor.design.imported', 'Design imported'),
        });
      } else {
        toggleNotification({
          type: 'info',
          message: t(
            'editor.design.importPending',
            'The design will load when the visual editor is ready.'
          ),
        });
      }
    } catch {
      toggleNotification({
        type: 'danger',
        message: t('editor.design.invalid', 'The file is not a valid design export.'),
      });
    } finally {
      // Allow importing the same file again (UI-M06).
      input.value = '';
    }
  };

  // -------------------------------------------------------------- render
  const pageTitle = isCoreEmail
    ? coreEmailName
    : isNewTemplate
      ? t('editor.newTemplate', 'New template')
      : templateData.name || t('editor.pageTitle', 'Edit template');

  if (permissionsLoading || loading) {
    return (
      <Container>
        <PluginPageTitle>{pageTitle}</PluginPageTitle>
        <LoadingContainer>
          <Loader>
            {permissionsLoading
              ? t('editor.permissions.loading', 'Checking permissions...')
              : t('editor.loading', 'Loading template...')}
          </Loader>
        </LoadingContainer>
      </Container>
    );
  }

  if (permissionsError || loadError) {
    return (
      <Container>
        <PluginPageTitle>{pageTitle}</PluginPageTitle>
        <LoadingContainer role="alert">
          <ExclamationTriangleIcon width={48} height={48} aria-hidden="true" />
          <Typography variant="beta" tag="h1">
            {permissionsError
              ? t(
                  'common.permissions.loadError',
                  'Your permissions could not be loaded. Reload the page to try again.'
                )
              : t('editor.loadError', 'The template could not be loaded.')}
          </Typography>
          <Flex gap={2} wrap="wrap" justifyContent="center">
            <TertiaryButton
              startIcon={<ArrowLeftIcon width={16} height={16} aria-hidden="true" />}
              onClick={() => navigate(TEMPLATE_LIST_PATH)}
            >
              {t('editor.backToList', 'Back to templates')}
            </TertiaryButton>
            {!permissionsError && (
              <Button
                startIcon={<ArrowPathIcon width={16} height={16} aria-hidden="true" />}
                onClick={() => {
                  setLoading(true);
                  reloadTemplate();
                }}
              >
                {t('editor.retry', 'Try again')}
              </Button>
            )}
          </Flex>
        </LoadingContainer>
      </Container>
    );
  }

  const errorText = {
    templateReferenceId:
      errors.templateReferenceId === 'invalid'
        ? t('editor.fields.referenceId.invalid', 'Use a positive whole number.')
        : errors.templateReferenceId
          ? t('editor.fields.required', 'This field is required.')
          : undefined,
    name: errors.name ? t('editor.fields.required', 'This field is required.') : undefined,
    subject: errors.subject ? t('editor.fields.required', 'This field is required.') : undefined,
  };

  return (
    <Container>
      <PluginPageTitle>{pageTitle}</PluginPageTitle>
      <Header>
        <HeaderRow>
          <HeaderLeft>
            <BackButton
              type="button"
              aria-label={t('editor.back', 'Back to email templates')}
              onClick={() => navigate(TEMPLATE_LIST_PATH)}
            >
              <ArrowLeftIcon aria-hidden="true" />
            </BackButton>
            <TitleContainer>
              <Typography variant="alpha" tag="h1">
                {isCoreEmail
                  ? coreEmailName
                  : isNewTemplate
                    ? t('editor.newTemplate', 'New template')
                    : templateData.name}
              </Typography>
              {!isNewTemplate && !isCoreEmail && (
                <Typography variant="pi" textColor="neutral600">
                  {t('editor.versioningEnabled', 'Versioning enabled')}
                </Typography>
              )}
              {isCoreEmail && (
                <Typography variant="pi" textColor="neutral600">
                  {t('editor.coreSubtitle', 'Core Strapi email template')}
                </Typography>
              )}
              {canManage && isDirty && (
                <Typography variant="pi" textColor="neutral600" aria-live="polite">
                  {t('editor.unsavedChanges', 'Unsaved changes')}
                </Typography>
              )}
            </TitleContainer>
          </HeaderLeft>

          <HeaderRight>
            {canManage && (
              <>
                <ToolbarButton type="button" onClick={() => designInputRef.current?.click()}>
                  <ArrowUpTrayIcon aria-hidden="true" />
                  {t('editor.design.import', 'Import design')}
                </ToolbarButton>
                <HiddenInput
                  ref={designInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleImportDesign}
                  aria-hidden="true"
                  tabIndex={-1}
                />
              </>
            )}
            {canManage && editorLoaded && (
              <ToolbarButton type="button" onClick={handleExportDesign}>
                <ArrowDownTrayIcon aria-hidden="true" />
                {t('editor.design.export', 'Export design')}
              </ToolbarButton>
            )}
            {!isCoreEmail && !isNewTemplate && (
              <ToolbarButton
                type="button"
                onClick={handleOpenVersionHistory}
                aria-haspopup="dialog"
              >
                <ClockIcon aria-hidden="true" />
                {t('editor.versions.open', 'Version history')}
              </ToolbarButton>
            )}
            <SaveButton
              startIcon={<CheckIcon aria-hidden="true" />}
              onClick={handleSave}
              loading={saving}
              disabled={saving || !canManage}
              title={
                !canManage
                  ? t(
                      'editor.save.noPermission',
                      'Editing requires the MagicMail manage permission.'
                    )
                  : undefined
              }
            >
              {saving
                ? t('editor.save.saving', 'Saving...')
                : t('editor.save.button', 'Save template')}
            </SaveButton>
          </HeaderRight>
        </HeaderRow>

        <SettingsRow>
          {!isCoreEmail && (
            <FieldWrapper $width="150px">
              <Field.Root
                name="templateReferenceId"
                required={isNewTemplate}
                error={errorText.templateReferenceId}
                hint={
                  isNewTemplate
                    ? undefined
                    : t('editor.fields.referenceId.locked', 'Cannot be changed after creation.')
                }
              >
                <Field.Label>{t('editor.fields.referenceId', 'Reference ID')}</Field.Label>
                <Field.Input
                  type="number"
                  min="1"
                  step="1"
                  value={templateData.templateReferenceId ?? ''}
                  disabled={!canManage || !isNewTemplate}
                  onChange={(e) => updateField('templateReferenceId', e.target.value)}
                  placeholder="100"
                />
                <Field.Hint />
                <Field.Error />
              </Field.Root>
            </FieldWrapper>
          )}

          {!isCoreEmail && (
            <FieldWrapper $flex="1">
              <Field.Root name="name" required error={errorText.name}>
                <Field.Label>{t('editor.fields.name', 'Name')}</Field.Label>
                <Field.Input
                  value={templateData.name ?? ''}
                  disabled={!canManage}
                  onChange={(e) => updateField('name', e.target.value)}
                  placeholder={t('editor.fields.name.placeholder', 'Welcome email')}
                />
                <Field.Error />
              </Field.Root>
            </FieldWrapper>
          )}

          <FieldWrapper $flex="1">
            <Field.Root name="subject" required error={errorText.subject}>
              <Field.Label>{t('editor.fields.subject', 'Subject')}</Field.Label>
              <Field.Input
                value={templateData.subject ?? ''}
                disabled={!canManage}
                onChange={(e) => updateField('subject', e.target.value)}
                placeholder="Welcome {{user.firstName}}!"
              />
              <Field.Error />
            </Field.Root>
          </FieldWrapper>

          {!isCoreEmail && (
            <FieldWrapper $width="180px">
              <Field.Root name="category">
                <Field.Label>{t('editor.fields.category', 'Category')}</Field.Label>
                <SingleSelect
                  value={templateData.category}
                  disabled={!canManage}
                  onChange={(value) => updateField('category', value)}
                >
                  <SingleSelectOption value="transactional">
                    {t('editor.category.transactional', 'Transactional')}
                  </SingleSelectOption>
                  <SingleSelectOption value="marketing">
                    {t('editor.category.marketing', 'Marketing')}
                  </SingleSelectOption>
                  <SingleSelectOption value="notification">
                    {t('editor.category.notification', 'Notification')}
                  </SingleSelectOption>
                  <SingleSelectOption value="custom">
                    {t('editor.category.custom', 'Custom')}
                  </SingleSelectOption>
                </SingleSelect>
              </Field.Root>
            </FieldWrapper>
          )}

          {!isCoreEmail && (
            <SwitchWrapper>
              <Typography
                variant="omega"
                fontWeight="semiBold"
                id="magic-mail-template-active-label"
              >
                {t('editor.fields.active', 'Template active')}
              </Typography>
              <Switch
                checked={templateData.isActive}
                disabled={!canManage}
                onCheckedChange={(checked) => updateField('isActive', checked)}
                aria-label={t('editor.fields.active', 'Template active')}
                onLabel={t('editor.fields.active.on', 'Active')}
                offLabel={t('editor.fields.active.off', 'Inactive')}
                visibleLabels={false}
              />
            </SwitchWrapper>
          )}
        </SettingsRow>
      </Header>

      <TabsWrapper>
        <StyledTabsRoot value={activeTab} onValueChange={setActiveTab}>
          <TabListWrapper>
            <Tabs.List aria-label={t('editor.tabs.label', 'Editor mode')}>
              <Tabs.Trigger value="html">
                <SparklesIcon aria-hidden="true" />
                {t('editor.tabs.visual', 'Visual Designer')}
              </Tabs.Trigger>
              <Tabs.Trigger value="text">
                <DocumentTextIcon aria-hidden="true" />
                {t('editor.tabs.text', 'Plain Text')}
              </Tabs.Trigger>
            </Tabs.List>
          </TabListWrapper>

          <StyledTabsContent value="html" forceMount>
            <TabContentWrapper>
              {canManage && !editorLoaded && !designerLoadError && (
                <OverlayState role="status">
                  <Loader>{t('editor.designer.loading', 'Loading email designer...')}</Loader>
                </OverlayState>
              )}
              {canManage && !editorLoaded && designerLoadError && (
                <OverlayState role="alert" aria-live="assertive">
                  <Typography variant="beta" tag="h2">
                    {t('editor.designer.errorTitle', 'Visual Designer could not load')}
                  </Typography>
                  <Typography variant="omega" textColor="neutral600">
                    {t(
                      'editor.designer.errorText',
                      'The visual editor is unavailable. You can continue in Plain Text.'
                    )}
                  </Typography>
                  <Typography variant="pi" textColor="neutral600">
                    {t(
                      'editor.designer.cspHint',
                      'If your Content Security Policy blocks editor.unlayer.com, see the "Content Security Policy" section of the MagicMail README.'
                    )}
                  </Typography>
                  <Button size="S" onClick={() => setActiveTab('text')}>
                    {t('editor.designer.switchToText', 'Switch to Plain Text')}
                  </Button>
                </OverlayState>
              )}
              {canManage ? (
                <EditorCanvas
                  style={{
                    visibility: editorLoaded ? 'visible' : 'hidden',
                    pointerEvents: editorLoaded ? 'auto' : 'none',
                  }}
                >
                  {unlayerOptions && (
                    <VisualEditorErrorBoundary
                      key={id || coreEmailType || 'new-template'}
                      onError={() => setDesignerLoadError(true)}
                    >
                      <EmailEditorComponent
                        ref={emailEditorRef}
                        onReady={onEditorReady}
                        scriptUrl={editorConfig?.scriptUrl || UNLAYER_SCRIPT_URL}
                        minHeight="calc(100vh - 240px)"
                        options={unlayerOptions}
                      />
                    </VisualEditorErrorBoundary>
                  )}
                </EditorCanvas>
              ) : (
                <ReadOnlyPanel>
                  <DesignerLoadingContainer
                    role="status"
                    style={{ minHeight: 0, padding: '8px 0' }}
                  >
                    <Typography variant="beta" tag="h2">
                      {t('editor.readOnly.title', 'Read-only view')}
                    </Typography>
                    <Typography variant="omega" textColor="neutral600">
                      {t(
                        'editor.readOnly.text',
                        'Editing this template requires the MagicMail manage permission.'
                      )}
                    </Typography>
                  </DesignerLoadingContainer>
                  {templateData.bodyHtml ? (
                    <ReadOnlyPreview
                      title={t('editor.readOnly.previewTitle', 'Email preview')}
                      sandbox=""
                      referrerPolicy="no-referrer"
                      srcDoc={templateData.bodyHtml}
                    />
                  ) : (
                    <Typography variant="omega" textColor="neutral600" textAlign="center">
                      {t('editor.readOnly.noHtml', 'This template has no HTML content yet.')}
                    </Typography>
                  )}
                </ReadOnlyPanel>
              )}
            </TabContentWrapper>
          </StyledTabsContent>

          <StyledTabsContent value="text" forceMount>
            <TextTabContent>
              <Field.Root name="bodyText">
                <Field.Label>{t('editor.text.label', 'Plain text version')}</Field.Label>
                <Textarea
                  value={templateData.bodyText ?? ''}
                  disabled={!canManage}
                  onChange={(e) => updateField('bodyText', e.target.value)}
                  placeholder={`${t('editor.text.placeholder', 'Plain text version of your email...')}\n\n${t(
                    'editor.text.variables',
                    'Use Mustache variables:'
                  )}\n{{user.firstName}}\n{{company.name}}\n{{order.total}}`}
                />
              </Field.Root>
            </TextTabContent>
          </StyledTabsContent>
        </StyledTabsRoot>
      </TabsWrapper>

      <VersionHistoryDrawer
        ref={versionDrawerRef}
        isOpen={showVersionHistory}
        onClose={() => setShowVersionHistory(false)}
        versions={versions}
        loading={loadingVersions}
        loadError={versionsError}
        onRetry={fetchVersions}
        canManage={canManage}
        onRestore={(version, number) =>
          guard.runGuarded(() => setPendingRestore({ version, number }))
        }
        onDelete={(version, number) => setPendingVersionDelete({ version, number })}
        onDeleteAll={() => setConfirmDeleteAll(true)}
      />

      <ConfirmDialog
        isOpen={canManage && pendingRestore !== null}
        variant="default"
        title={t('editor.versions.restore.title', 'Restore this version?')}
        description={t(
          'editor.versions.restore.body',
          'Restore the template to version {number}? The current content is saved as a new version first.',
          { number: pendingRestore?.number ?? '' }
        )}
        confirmLabel={t('editor.versions.restore', 'Restore')}
        confirmIcon={<ArrowUturnLeftIcon width={16} height={16} aria-hidden="true" />}
        onConfirm={() => handleRestoreVersion(pendingRestore.version, pendingRestore.number)}
        onClose={() => setPendingRestore(null)}
      />

      <ConfirmDialog
        isOpen={canManage && pendingVersionDelete !== null}
        title={t('editor.versions.delete.title', 'Delete this version?')}
        description={t(
          'editor.versions.delete.body',
          'Delete version {number}? This cannot be undone.',
          {
            number: pendingVersionDelete?.number ?? '',
          }
        )}
        confirmLabel={t('common.delete', 'Delete')}
        confirmIcon={<TrashIcon width={16} height={16} aria-hidden="true" />}
        onConfirm={() =>
          handleDeleteVersion(pendingVersionDelete.version, pendingVersionDelete.number)
        }
        onClose={() => setPendingVersionDelete(null)}
        getReturnFocusFallback={getVersionFocusTarget}
      />

      <ConfirmDialog
        isOpen={canManage && confirmDeleteAll}
        title={t('editor.versions.deleteAll.title', 'Delete all versions?')}
        description={t(
          'editor.versions.deleteAll.body',
          'Delete all {count, plural, one {# version} other {# versions}}? This cannot be undone.',
          { count: versions.length }
        )}
        confirmLabel={t('editor.versions.deleteAll', 'Delete all')}
        confirmIcon={<TrashIcon width={16} height={16} aria-hidden="true" />}
        onConfirm={handleDeleteAllVersions}
        onClose={() => setConfirmDeleteAll(false)}
        getReturnFocusFallback={getVersionFocusTarget}
      />

      <UnsavedChangesDialog guard={guard} />
    </Container>
  );
};

export default EditorPage;

import React, { useState, useEffect, useRef } from 'react';
import { useFetchClient, useNotification } from '@strapi/strapi/admin';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthRefresh } from '../../hooks/useAuthRefresh';
import styled from 'styled-components';
import {
  Typography,
  Button,
  Field,
  Tabs,
  Textarea,
  SingleSelect,
  SingleSelectOption,
  Loader,
  Toggle,
} from '@strapi/design-system';
import {
  ArrowLeftIcon,
  CheckIcon,
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  ClockIcon,
  ArrowUturnLeftIcon,
  XMarkIcon,
  TrashIcon,
  CodeBracketIcon,
} from '@heroicons/react/24/outline';
import { useLicense } from '../../hooks/useLicense';
import * as ReactEmailEditor from 'react-email-editor';

const EmailEditorComponent =
  ReactEmailEditor.EmailEditor ||
  ReactEmailEditor.default ||
  ReactEmailEditor;

if (!EmailEditorComponent) {
  console.error('[MagicMail] Failed to resolve EmailEditor component export', ReactEmailEditor);
}

// Standard Email Template for Core Emails (when no design exists)
const STANDARD_EMAIL_TEMPLATE = {
  counters: { u_row: 2, u_content_text: 1, u_content_image: 1, u_column: 2 },
  body: {
    values: {
      backgroundColor: '#ffffff',
      linkStyle: {
        body: true,
        linkHoverColor: '#0000ee',
        linkHoverUnderline: true,
        linkColor: '#0000ee',
        linkUnderline: true,
      },
      contentWidth: '500px',
      backgroundImage: { repeat: false, center: true, fullWidth: true, url: '', cover: false },
      contentAlign: 'center',
      textColor: '#000000',
      _meta: { htmlID: 'u_body', htmlClassNames: 'u_body' },
      fontFamily: { label: 'Arial', value: 'arial,helvetica,sans-serif' },
      preheaderText: '',
    },
    rows: [
      {
        cells: [1],
        values: {
          backgroundImage: { cover: false, url: '', repeat: false, fullWidth: true, center: true },
          hideDesktop: false,
          selectable: true,
          columnsBackgroundColor: '',
          hideable: true,
          backgroundColor: '',
          padding: '0px',
          columns: false,
          _meta: { htmlID: 'u_row_2', htmlClassNames: 'u_row' },
          deletable: true,
          displayCondition: null,
          duplicatable: true,
          draggable: true,
        },
        columns: [
          {
            contents: [
              {
                values: {
                  hideDesktop: false,
                  duplicatable: true,
                  deletable: true,
                  linkStyle: {
                    linkHoverUnderline: true,
                    linkColor: '#0000ee',
                    inherit: true,
                    linkUnderline: true,
                    linkHoverColor: '#0000ee',
                  },
                  hideable: true,
                  lineHeight: '140%',
                  draggable: true,
                  containerPadding: '10px',
                  text: '<p style="font-size: 14px; line-height: 140%; text-align: center;"><span style="font-size: 14px; line-height: 19.6px;">__PLACEHOLDER__</span></p>',
                  _meta: { htmlID: 'u_content_text_1', htmlClassNames: 'u_content_text' },
                  textAlign: 'left',
                  selectable: true,
                },
                type: 'text',
              },
            ],
            values: {
              border: {},
              _meta: { htmlClassNames: 'u_column', htmlID: 'u_column_2' },
              backgroundColor: '',
              padding: '0px',
            },
          },
        ],
      },
    ],
  },
  schemaVersion: 6,
};

// Styled components
const Container = styled.div`
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f6f6f9;
`;

const Header = styled.div`
  padding: 24px;
  background: white;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
`;

const HeaderRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
`;

const HeaderLeft = styled.div`
  display: flex;
  gap: 12px;
  align-items: flex-start;
`;

const TitleContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const HeaderRight = styled.div`
  display: flex;
  gap: 8px;
`;

const SettingsRow = styled.div`
  display: flex;
  gap: 16px;
  align-items: flex-end;
`;

const FieldWrapper = styled.div`
  flex: ${(props) => props.flex || 'initial'};
  width: ${(props) => props.width || 'auto'};
`;

const ToggleWrapper = styled.div`
  padding-top: 28px;
  display: flex;
  gap: 12px;
  align-items: center;
  
  /* Custom green styling for active toggle */
  button[aria-checked="true"] {
    background-color: #22C55E !important;
    border-color: #22C55E !important;
    
    span {
      background-color: white !important;
    }
  }
  
  button[aria-checked="false"] {
    background-color: #E5E7EB !important;
    border-color: #D1D5DB !important;
    
    span {
      background-color: white !important;
    }
  }
  
  /* Label styling based on state */
  p {
    color: ${props => props.$isActive ? '#22C55E' : '#6B7280'};
    font-weight: 600;
    transition: color 0.2s;
  }
`;

const TabsWrapper = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
`;

const TabListWrapper = styled.div`
  padding: 0 24px;
  background: white;
  border-bottom: 1px solid #eaeaef;
`;

const StyledTabsRoot = styled(Tabs.Root)`
  display: flex;
  flex-direction: column;
  height: 100%;
`;

const StyledTabsContent = styled(Tabs.Content)`
  flex: 1;
  display: flex;
  flex-direction: column;
`;

const TabContentWrapper = styled.div`
  height: calc(100vh - 240px);
  background: white;
  position: relative;
`;

const TextTabContent = styled.div`
  padding: 20px;
  height: calc(100vh - 240px);
  
  textarea {
    width: 100%;
    height: 100%;
    min-height: 500px;
    font-family: monospace;
  }
`;

const LoadingContainer = styled.div`
  padding: 80px 20px;
  display: flex;
  justify-content: center;
  align-items: center;
`;

const EditorCanvas = styled.div`
  min-height: calc(100vh - 240px);
`;

const DesignerLoadingContainer = styled(LoadingContainer)`
  width: 100%;
  min-height: calc(100vh - 240px);
  padding: 40px 20px;
`;

const HiddenInput = styled.input`
  display: none;
`;

const SaveButton = styled(Button)`
  background: linear-gradient(135deg, #22C55E 0%, #16A34A 100%);
  border: none;
  color: white;
  font-weight: 600;
  font-size: 13px;
  padding: 8px 16px;
  height: 36px;
  box-shadow: 0 2px 8px rgba(34, 197, 94, 0.3);
  transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(34, 197, 94, 0.4);
    background: linear-gradient(135deg, #16A34A 0%, #15803D 100%);
  }

  &:active {
    transform: translateY(0);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    &:hover {
      transform: none;
    }
  }

  svg {
    width: 14px;
    height: 14px;
  }
`;

const ImportExportButton = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 16px;
  height: 36px;
  background: white;
  border: 1px solid #dcdce4;
  border-radius: 4px;
  color: #32324d;
  font-weight: 500;
  font-size: 13px;
  cursor: pointer;
  transition: all 200ms;
  white-space: nowrap;

  &:hover {
    background: #f6f6f9;
    border-color: #0EA5E9;
    color: #0EA5E9;
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(14, 165, 233, 0.15);
  }

  &:active {
    transform: translateY(0);
  }

  svg {
    width: 14px;
    height: 14px;
  }
`;

const ImportLabel = styled.label`
  cursor: pointer;
  display: inline-block;
`;

const BackButton = styled.button`
  background: white;
  border: 1px solid #dcdce4;
  border-radius: 4px;
  padding: 8px 10px;
  height: 36px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 200ms;

  &:hover {
    background: #f6f6f9;
    border-color: #c0c0cf;
    transform: translateY(-1px);
  }

  &:active {
    transform: translateY(0);
  }

  svg {
    width: 16px;
    height: 16px;
  }
`;

const VersionButton = styled.button`
  background: white;
  border: 1px solid #dcdce4;
  border-radius: 4px;
  padding: 8px 16px;
  height: 36px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 200ms;
  font-size: 13px;
  font-weight: 500;
  color: #32324d;
  white-space: nowrap;

  &:hover {
    background: #f6f6f9;
    border-color: #0EA5E9;
    color: #0EA5E9;
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(14, 165, 233, 0.15);
  }

  &:active {
    transform: translateY(0);
  }

  svg {
    width: 14px;
    height: 14px;
  }
`;

// Version History Modal
const VersionModal = styled.div`
  position: fixed;
  top: 0;
  right: ${props => props.$isOpen ? '0' : '-450px'};
  width: 450px;
  height: 100vh;
  background: white;
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.15);
  z-index: 9999;
  transition: right 300ms cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  flex-direction: column;
`;

const VersionModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 9998;
  opacity: ${props => props.$isOpen ? '1' : '0'};
  pointer-events: ${props => props.$isOpen ? 'auto' : 'none'};
  transition: opacity 300ms cubic-bezier(0.4, 0, 0.2, 1);
`;

const VersionModalHeader = styled.div`
  padding: 24px;
  border-bottom: 1px solid #eaeaef;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const VersionModalContent = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 16px;
`;

const VersionItem = styled.div`
  padding: 16px;
  border: 1px solid #eaeaef;
  border-radius: 8px;
  margin-bottom: 12px;
  transition: all 150ms;
  
  &:hover {
    border-color: #0EA5E9;
    box-shadow: 0 2px 8px rgba(14, 165, 233, 0.15);
  }
`;

const VersionItemHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
`;

const VersionNumber = styled.div`
  font-weight: 600;
  color: #32324d;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const VersionBadge = styled.span`
  background: linear-gradient(135deg, #0EA5E9 0%, #0284C7 100%);
  color: white;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
`;

const VersionDate = styled.div`
  font-size: 13px;
  color: #666687;
`;

const VersionMeta = styled.div`
  font-size: 13px;
  color: #666687;
  margin-bottom: 12px;
`;

const VersionActions = styled.div`
  display: flex;
  gap: 8px;
`;

const RestoreButton = styled(Button)`
  background: linear-gradient(135deg, #22C55E 0%, #16A34A 100%);
  border: none;
  color: white;
  font-size: 13px;
  padding: 8px 16px;
  
  &:hover {
    background: linear-gradient(135deg, #4ADE80 0%, #22C55E 100%);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(34, 197, 94, 0.3);
    border-color: transparent;
  }
  
  svg {
    width: 14px;
    height: 14px;
  }
`;

const DeleteButton = styled(Button)`
  background: linear-gradient(135deg, #EF4444 0%, #DC2626 100%);
  border: none;
  color: white;
  font-size: 13px;
  padding: 8px 16px;
  
  &:hover {
    background: linear-gradient(135deg, #F87171 0%, #EF4444 100%);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
    border-color: transparent;
  }
  
  svg {
    width: 14px;
    height: 14px;
  }
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #666687;
  transition: all 150ms;
  
  &:hover {
    color: #32324d;
    background: #f6f6f9;
    border-radius: 4px;
  }
  
  svg {
    width: 20px;
    height: 20px;
  }
`;

const EmptyVersions = styled.div`
  text-align: center;
  padding: 60px 20px;
  color: #666687;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  
  svg {
    width: 64px;
    height: 64px;
    margin-bottom: 16px;
    color: #dcdce4;
  }
`;

const EditorPage = () => {
  useAuthRefresh(); // Initialize token auto-refresh
  const location = useLocation();
  const { get, post, put } = useFetchClient();
  const { toggleNotification } = useNotification();
  const navigate = useNavigate();
  const { hasFeature } = useLicense();
  const emailEditorRef = useRef(null);

  // Extract ID from pathname
  const pathname = location.pathname;
  const coreMatch = pathname.match(/\/designer\/core\/(.+)$/);
  const templateMatch = pathname.match(/\/designer\/(.+)$/);
  
  const isCoreEmail = !!coreMatch;
  const coreEmailType = coreMatch ? coreMatch[1] : null;
  const id = !isCoreEmail && templateMatch ? templateMatch[1] : null;

  const isNewTemplate = id === 'new';

  const [loading, setLoading] = useState(!isNewTemplate && !isCoreEmail);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('html');
  const [editorLoaded, setEditorLoaded] = useState(false);

  const [templateData, setTemplateData] = useState({
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

  const canVersion = hasFeature('email-designer-versioning');

  // Version History State
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [versions, setVersions] = useState([]);
  const [loadingVersions, setLoadingVersions] = useState(false);

  useEffect(() => {
    if (isCoreEmail) {
      fetchCoreTemplate();
    } else if (!isNewTemplate && id) {
      fetchTemplate();
    }
  }, [id, isCoreEmail, coreEmailType]);

  const fetchCoreTemplate = async () => {
    setLoading(true);
    try {
      const response = await get(`/magic-mail/designer/core/${coreEmailType}`);
      const coreTemplate = response.data?.data;
      
      let design = coreTemplate?.design;
      
      // Convert old HTML message to Unlayer design if no design exists
      if (!design && coreTemplate?.message) {
        let message = coreTemplate.message;
        
        // Check if message contains HTML body tag
        if (message.match(/<body/)) {
          const parser = new DOMParser();
          const parsedDocument = parser.parseFromString(message, 'text/html');
          message = parsedDocument.body.innerText;
        }
        
        // Strip HTML tags except for specific ones
        message = message
          .replace(/<(?!\/?(?:a|img|strong|b|i|%|%=)\b)[^>]+>/gi, '')
          .replace(/"/g, "'")
          .replace(/\n/g, '<br />');
        
        // Create design from template
        const templateStr = JSON.stringify(STANDARD_EMAIL_TEMPLATE);
        design = JSON.parse(templateStr.replace('__PLACEHOLDER__', message));
      }
      
      setTemplateData({
        templateReferenceId: '',
        name: coreEmailType === 'reset-password' ? 'Reset Password' : 'Email Confirmation',
        subject: coreTemplate?.subject || '',
        category: 'transactional',
        isActive: true,
        design: design,
        bodyHtml: coreTemplate?.bodyHtml || coreTemplate?.message || '',
        bodyText: coreTemplate?.bodyText || '',
        tags: [],
      });

      // Load design into editor after a short delay
      setTimeout(() => {
        if (design && emailEditorRef.current?.editor) {
          emailEditorRef.current.editor.loadDesign(design);
        }
      }, 600);
    } catch (error) {
      console.error('[MagicMail] Error loading core template:', error);
      toggleNotification({
        type: 'danger',
        message: 'Failed to load core template',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchTemplate = async () => {
    setLoading(true);
    try {
      const response = await get(`/magic-mail/designer/templates/${id}`);
      const template = response.data?.data;
      setTemplateData(template);

      // Load design into editor
      setTimeout(() => {
        if (template.design && emailEditorRef.current?.editor) {
          emailEditorRef.current.editor.loadDesign(template.design);
        }
      }, 500);
    } catch (error) {
      toggleNotification({ type: 'danger', message: 'Failed to load template' });
      navigate('/plugins/magic-mail/designer');
    } finally {
      setLoading(false);
    }
  };

  // Load version history
  const fetchVersions = async () => {
    if (!id || isNewTemplate || isCoreEmail) return;
    
    setLoadingVersions(true);
    try {
      const response = await get(`/magic-mail/designer/templates/${id}/versions`);
      if (response.data?.success) {
        setVersions(response.data.data || []);
      }
    } catch (error) {
      console.error('[Version History] Error loading versions:', error);
      toggleNotification({
        type: 'danger',
        message: 'Failed to load version history',
      });
    } finally {
      setLoadingVersions(false);
    }
  };

  // Restore version
  const handleRestoreVersion = async (versionId, versionNumber) => {
    if (!window.confirm(`Restore template to Version #${versionNumber}? Current content will be saved as a new version.`)) {
      return;
    }

    try {
      const response = await post(`/magic-mail/designer/templates/${id}/versions/${versionId}/restore`);
      
      if (response.data?.success) {
        toggleNotification({
          type: 'success',
          message: `Restored to Version #${versionNumber}`,
        });
        
        // Reload template data
        await fetchTemplate();
        
        // Reload versions
        await fetchVersions();
        
        // Close modal
        setShowVersionHistory(false);
      }
    } catch (error) {
      console.error('[Version History] Error restoring version:', error);
      toggleNotification({
        type: 'danger',
        message: 'Failed to restore version',
      });
    }
  };

  // Delete version
  const handleDeleteVersion = async (versionId, versionNumber) => {
    if (!window.confirm(`Delete Version #${versionNumber}? This action cannot be undone.`)) {
      return;
    }

    try {
      const response = await post(`/magic-mail/designer/templates/${id}/versions/${versionId}/delete`);
      
      if (response.data?.success) {
        toggleNotification({
          type: 'success',
          message: `Version #${versionNumber} deleted`,
        });
        
        // Reload versions
        await fetchVersions();
      }
    } catch (error) {
      console.error('[Version History] Error deleting version:', error);
      toggleNotification({
        type: 'danger',
        message: 'Failed to delete version',
      });
    }
  };

  // Delete all versions
  const handleDeleteAllVersions = async () => {
    if (versions.length === 0) {
      toggleNotification({
        type: 'info',
        message: 'No versions to delete',
      });
      return;
    }

    if (!window.confirm(`Delete ALL ${versions.length} versions? This action cannot be undone.`)) {
      return;
    }

    try {
      const response = await post(`/magic-mail/designer/templates/${id}/versions/delete-all`);
      
      if (response.data?.success) {
        toggleNotification({
          type: 'success',
          message: `Deleted ${versions.length} versions`,
        });
        
        // Reload versions
        await fetchVersions();
      }
    } catch (error) {
      console.error('[Version History] Error deleting all versions:', error);
      toggleNotification({
        type: 'danger',
        message: 'Failed to delete all versions',
      });
    }
  };

  // Open version history and load versions
  const handleOpenVersionHistory = () => {
    setShowVersionHistory(true);
    fetchVersions();
  };

  const handleSave = async () => {
    // Validation (skip for core emails)
    if (!isCoreEmail) {
      if (!templateData.templateReferenceId) {
        toggleNotification({ type: 'warning', message: 'Reference ID is required' });
        return;
      }
      if (!templateData.name) {
        toggleNotification({ type: 'warning', message: 'Name is required' });
        return;
      }
    }
    
    if (!templateData.subject) {
      toggleNotification({ type: 'warning', message: 'Subject is required' });
      return;
    }

    setSaving(true);

    try {
      let design = templateData.design;
      let bodyHtml = templateData.bodyHtml;

      if (activeTab === 'html' && emailEditorRef.current?.editor) {
        await new Promise((resolve) => {
          emailEditorRef.current.editor.exportHtml((data) => {
            design = data.design;
            bodyHtml = data.html;
            resolve();
          });
        });
      }

      // Core emails - save to Strapi config
      if (isCoreEmail) {
        const corePayload = {
          subject: templateData.subject,
          design,
          message: bodyHtml, // Send as 'message' not 'bodyHtml'
          bodyText: activeTab === 'text' ? templateData.bodyText : '', // Include text version
        };

        await put(`/magic-mail/designer/core/${coreEmailType}`, corePayload);

        toggleNotification({
          type: 'success',
          message: 'Core email template saved!',
        });
        
        setSaving(false);
        return;
      }

      const payload = {
        ...templateData,
        design,
        bodyHtml,
        templateReferenceId: parseInt(templateData.templateReferenceId),
      };

      let response;
      if (isNewTemplate) {
        response = await post('/magic-mail/designer/templates', payload);
      } else {
        response = await put(`/magic-mail/designer/templates/${id}`, payload);
      }

      toggleNotification({
        type: 'success',
        message: isNewTemplate ? 'Template created!' : 'Template saved!',
      });

      if (isNewTemplate && response.data?.data?.id) {
        navigate(`/plugins/magic-mail/designer/${response.data.data.id}`);
      }
    } catch (error) {
      toggleNotification({
        type: 'danger',
        message: error.response?.data?.message || 'Failed to save',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleExportDesign = async () => {
    if (!emailEditorRef.current?.editor) return;

    emailEditorRef.current.editor.exportHtml((data) => {
      const dataStr = JSON.stringify(data.design, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${templateData.name || 'template'}-design.json`;
      link.click();
      URL.revokeObjectURL(url);
      toggleNotification({ type: 'success', message: 'Design exported!' });
    });
  };

  const handleImportDesign = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const design = JSON.parse(e.target.result);
        if (emailEditorRef.current?.editor) {
          emailEditorRef.current.editor.loadDesign(design);
          toggleNotification({ type: 'success', message: 'Design imported!' });
        }
      } catch (error) {
        toggleNotification({ type: 'danger', message: 'Invalid design file' });
      }
    };
    reader.readAsText(file);
  };

  const onEditorReady = () => {
    setEditorLoaded(true);
    if (templateData.design && emailEditorRef.current?.editor) {
      setTimeout(() => {
        emailEditorRef.current.editor.loadDesign(templateData.design);
      }, 100);
    }
  };

  if (loading) {
    return (
      <Container>
        <LoadingContainer>
          <Loader>Loading template...</Loader>
        </LoadingContainer>
      </Container>
    );
  }

  return (
    <Container>
      {/* Header */}
      <Header>
        <HeaderRow>
          <HeaderLeft>
            <BackButton onClick={() => navigate('/plugins/magic-mail/designer')}>
              <ArrowLeftIcon />
            </BackButton>
            <TitleContainer>
              <Typography variant="alpha">
                {isCoreEmail 
                  ? `${coreEmailType === 'reset-password' ? 'Reset Password' : 'Email Confirmation'}`
                  : isNewTemplate 
                  ? 'New Template' 
                  : `${templateData.name}`
                }
              </Typography>
              {canVersion && !isNewTemplate && !isCoreEmail && (
                <Typography variant="pi" textColor="neutral600">
                  Versioning enabled
                </Typography>
              )}
              {isCoreEmail && (
                <Typography variant="pi" textColor="neutral600">
                  Core Strapi Email Template
                </Typography>
              )}
            </TitleContainer>
          </HeaderLeft>

          <HeaderRight>
            <ImportLabel>
              <ImportExportButton>
                <ArrowUpTrayIcon />
                Import Design
              </ImportExportButton>
              <HiddenInput type="file" accept=".json" onChange={handleImportDesign} />
            </ImportLabel>
            <ImportExportButton onClick={handleExportDesign} as="button">
              <ArrowDownTrayIcon />
              Export Design
            </ImportExportButton>
            {!isCoreEmail && !isNewTemplate && canVersion && (
              <VersionButton onClick={handleOpenVersionHistory}>
                <ClockIcon />
                Version History
              </VersionButton>
            )}
            <SaveButton
              startIcon={<CheckIcon />}
              onClick={handleSave}
              loading={saving}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Template'}
            </SaveButton>
          </HeaderRight>
        </HeaderRow>

        {/* Settings */}
        <SettingsRow>
          {!isCoreEmail && (
            <FieldWrapper width="150px">
              <Field.Root required>
                <Field.Label>Reference ID</Field.Label>
                <Field.Input
                  type="number"
                  value={templateData.templateReferenceId}
                  onChange={(e) =>
                    setTemplateData({ ...templateData, templateReferenceId: e.target.value })
                  }
                  placeholder="100"
                />
              </Field.Root>
            </FieldWrapper>
          )}

          {!isCoreEmail && (
            <FieldWrapper flex="1">
              <Field.Root required>
                <Field.Label>Name</Field.Label>
                <Field.Input
                  value={templateData.name}
                  onChange={(e) => setTemplateData({ ...templateData, name: e.target.value })}
                  placeholder="Welcome Email"
                />
              </Field.Root>
            </FieldWrapper>
          )}

          <FieldWrapper flex="1">
            <Field.Root required>
              <Field.Label>Subject</Field.Label>
              <Field.Input
                value={templateData.subject}
                onChange={(e) => setTemplateData({ ...templateData, subject: e.target.value })}
                placeholder="Welcome {{user.firstName}}!"
              />
            </Field.Root>
          </FieldWrapper>

          {!isCoreEmail && (
            <FieldWrapper width="180px">
              <Field.Root>
                <Field.Label>Category</Field.Label>
                <SingleSelect
                  value={templateData.category}
                  onChange={(value) => setTemplateData({ ...templateData, category: value })}
                >
                  <SingleSelectOption value="transactional">Transactional</SingleSelectOption>
                  <SingleSelectOption value="marketing">Marketing</SingleSelectOption>
                  <SingleSelectOption value="notification">Notification</SingleSelectOption>
                  <SingleSelectOption value="custom">Custom</SingleSelectOption>
                </SingleSelect>
              </Field.Root>
            </FieldWrapper>
          )}

          {!isCoreEmail && (
            <ToggleWrapper $isActive={templateData.isActive}>
              <Toggle
                checked={templateData.isActive}
                onChange={() =>
                  setTemplateData({ ...templateData, isActive: !templateData.isActive })
                }
              />
              <Typography variant="omega">
                {templateData.isActive ? 'Active' : 'Inactive'}
              </Typography>
            </ToggleWrapper>
          )}
        </SettingsRow>
      </Header>

      {/* Editor */}
      <TabsWrapper>
        <StyledTabsRoot value={activeTab} onValueChange={setActiveTab}>
          <TabListWrapper>
            <Tabs.List>
              <Tabs.Trigger value="html">✨ Visual Designer</Tabs.Trigger>
              <Tabs.Trigger value="text">📝 Plain Text</Tabs.Trigger>
            </Tabs.List>
          </TabListWrapper>

          <StyledTabsContent value="html">
            <TabContentWrapper>
              {!editorLoaded && (
                <DesignerLoadingContainer>
                  <Loader>Loading Email Designer...</Loader>
                </DesignerLoadingContainer>
              )}
              <EditorCanvas
                style={{
                  visibility: editorLoaded ? 'visible' : 'hidden',
                  pointerEvents: editorLoaded ? 'auto' : 'none',
                }}
              >
                <EmailEditorComponent
                  ref={emailEditorRef}
                  onReady={onEditorReady}
                  minHeight="calc(100vh - 240px)"
                  options={{
                    // Display mode
                    displayMode: 'email',
                    locale: 'en',
                    projectId: 1, // Required for some features
                    
                    // Merge Tags Config
                    mergeTagsConfig: {
                      autocompleteTriggerChar: '@',
                      sort: false,
                      delimiter: ['{{', '}}'],
                    },
                    
                    // Appearance
                    appearance: { 
                      theme: 'modern_light',
                      panels: {
                        tools: { dock: 'left' }
                      }
                    },
                    
                    // Features - Enable responsive preview
                    features: {
                      preview: true,
                      previewInBrowser: true,
                      textEditor: {
                        enabled: true,
                        spellChecker: true,
                        tables: true,
                        cleanPaste: true,
                      },
                    },
                    
                    // Fonts
                    fonts: { 
                      showDefaultFonts: true,
                      customFonts: [
                        {
                          label: 'Inter',
                          value: "'Inter', sans-serif",
                          url: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
                        }
                      ]
                    },
                    
                    // Tools configuration - minimal, let Unlayer show all
                    tools: {
                      image: {
                        properties: {
                          src: {
                            value: {
                              url: 'https://picsum.photos/600/350',
                            },
                          },
                        },
                      },
                    },
                    
                    // Merge Tags with extended support
                    mergeTags: {
                      user: {
                        name: 'User',
                        mergeTags: {
                          firstName: {
                            name: 'First Name',
                            value: '{{user.firstName}}',
                            sample: 'John',
                          },
                          lastName: {
                            name: 'Last Name',
                            value: '{{user.lastName}}',
                            sample: 'Doe',
                          },
                          email: {
                            name: 'Email',
                            value: '{{user.email}}',
                            sample: 'john@example.com',
                          },
                          username: {
                            name: 'Username',
                            value: '{{user.username}}',
                            sample: 'johndoe',
                          },
                        },
                      },
                      company: {
                        name: 'Company',
                        mergeTags: {
                          name: {
                            name: 'Name',
                            value: '{{company.name}}',
                            sample: 'ACME Corp',
                          },
                          url: {
                            name: 'Website',
                            value: '{{company.url}}',
                            sample: 'https://acme.com',
                          },
                          address: {
                            name: 'Address',
                            value: '{{company.address}}',
                            sample: '123 Main St, City',
                          },
                        },
                      },
                      order: {
                        name: 'Order',
                        mergeTags: {
                          number: {
                            name: 'Number',
                            value: '{{order.number}}',
                            sample: '#12345',
                          },
                          total: {
                            name: 'Total',
                            value: '{{order.total}}',
                            sample: '$199.99',
                          },
                          date: {
                            name: 'Date',
                            value: '{{order.date}}',
                            sample: '2024-01-15',
                          },
                          status: {
                            name: 'Status',
                            value: '{{order.status}}',
                            sample: 'Shipped',
                          },
                        },
                      },
                      system: {
                        name: 'System',
                        mergeTags: {
                          date: {
                            name: 'Current Date',
                            value: '{{system.date}}',
                            sample: new Date().toLocaleDateString(),
                          },
                          year: {
                            name: 'Current Year',
                            value: '{{system.year}}',
                            sample: new Date().getFullYear().toString(),
                          },
                          unsubscribe: {
                            name: 'Unsubscribe Link',
                            value: '{{system.unsubscribe}}',
                            sample: 'https://example.com/unsubscribe',
                          },
                        },
                      },
                    },
                    
                    // Special links
                    specialLinks: {
                      unsubscribe: {
                        enabled: true,
                        text: 'Unsubscribe',
                        href: '{{system.unsubscribe}}'
                      },
                      webview: {
                        enabled: true,
                        text: 'View in browser',
                        href: '{{system.webview}}'
                      }
                    },
                    
                    // Custom CSS
                    customCSS: [
                      '.blockbuilder-content-email { font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif; }'
                    ],
                    
                    // Validation
                    validator: {
                      enabled: true,
                      rules: {
                        maxImageSize: 1024 * 1024, // 1MB
                      }
                    }
                  }}
                />
              </EditorCanvas>
            </TabContentWrapper>
          </StyledTabsContent>

          <StyledTabsContent value="text">
            <TextTabContent>
              <Textarea
                value={templateData.bodyText}
                onChange={(e) => setTemplateData({ ...templateData, bodyText: e.target.value })}
                placeholder="Plain text version of your email...&#10;&#10;Use Mustache variables:&#10;{{user.firstName}}&#10;{{company.name}}&#10;{{order.total}}"
              />
            </TextTabContent>
          </StyledTabsContent>
        </StyledTabsRoot>
      </TabsWrapper>

      {/* Version History Modal */}
      <VersionModalOverlay $isOpen={showVersionHistory} onClick={() => setShowVersionHistory(false)} />
      <VersionModal $isOpen={showVersionHistory}>
        <VersionModalHeader>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ClockIcon style={{ width: 20, height: 20, color: '#32324d' }} />
            <Typography variant="beta" fontWeight="bold">
              Version History
            </Typography>
            {versions.length > 0 && (
              <span style={{ fontSize: '12px', color: '#666687', marginLeft: '8px' }}>
                ({versions.length})
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {versions.length > 0 && (
              <DeleteButton
                size="S"
                startIcon={<TrashIcon />}
                onClick={handleDeleteAllVersions}
              >
                Delete All
              </DeleteButton>
            )}
            <CloseButton onClick={() => setShowVersionHistory(false)}>
              <XMarkIcon />
            </CloseButton>
          </div>
        </VersionModalHeader>

        <VersionModalContent>
          {loadingVersions ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <Loader />
            </div>
          ) : versions.length === 0 ? (
            <EmptyVersions>
              <ClockIcon />
              <Typography variant="beta">
                No Versions Yet
              </Typography>
              <Typography variant="omega" textColor="neutral600" style={{ maxWidth: '300px' }}>
                Versions are created automatically when you save changes
              </Typography>
            </EmptyVersions>
          ) : (
            versions.map((version, index) => (
              <VersionItem key={version.id}>
                <VersionItemHeader>
                  <VersionNumber>
                    <VersionBadge>#{version.versionNumber || (versions.length - index)}</VersionBadge>
                    {version.name}
                  </VersionNumber>
                  <VersionDate>
                    {new Date(version.createdAt).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </VersionDate>
                </VersionItemHeader>

                <VersionMeta>
                  <strong>Subject:</strong> {version.subject || 'No subject'}
                </VersionMeta>

                <VersionActions>
                  <RestoreButton
                    size="S"
                    startIcon={<ArrowUturnLeftIcon />}
                    onClick={() => handleRestoreVersion(version.id, version.versionNumber || (versions.length - index))}
                  >
                    Restore
                  </RestoreButton>
                  <DeleteButton
                    size="S"
                    startIcon={<TrashIcon />}
                    onClick={() => handleDeleteVersion(version.id, version.versionNumber || (versions.length - index))}
                  >
                    Delete
                  </DeleteButton>
                </VersionActions>
              </VersionItem>
            ))
          )}
        </VersionModalContent>
      </VersionModal>
    </Container>
  );
};

export default EditorPage;

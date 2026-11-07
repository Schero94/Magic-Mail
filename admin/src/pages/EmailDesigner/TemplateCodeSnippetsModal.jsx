import { useEffect, useMemo, useRef, useState } from 'react';
import { Accordion, Box, Flex, Modal, Typography } from '@strapi/design-system';
import { CheckIcon, ClipboardDocumentIcon, SparklesIcon } from '@heroicons/react/24/outline';
import { TertiaryButton } from '../../components/StyledButtons';
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard';
import { useMagicMailIntl } from '../../hooks/useMagicMailIntl';
import { useReturnFocus } from '../../hooks/useReturnFocus';
import { buildCodeSnippets, snippetText } from './codeSnippets';
import {
  AccentText,
  CodeBlock,
  CodeBlockWrapper,
  CodeModalContent,
  CopyButton,
  InfoBox,
  PrimaryTriggerIcon,
  RecommendedBadge,
  ScrollableDialogBody,
  SecondaryTriggerIcon,
  StyledModalFooter,
  StyledModalHeader,
  SuccessTriggerIcon,
  WarningBox,
} from './templateListStyles';

/** Renders snippet tokens as React children (no innerHTML). */
const CodeTokens = ({ tokens }) =>
  tokens.map(([kind, text], index) =>
    kind === 'plain' ? (
      <span key={index}>{text}</span>
    ) : (
      <span key={index} className={kind}>
        {text}
      </span>
    )
  );

/**
 * "Code snippets" dialog for one template.
 *
 * @param {{template: object|null, isOpen: boolean, onClose: () => void}} props
 */
export const TemplateCodeSnippetsModal = ({ template, isOpen, onClose }) => {
  const { t } = useMagicMailIntl();
  const copy = useCopyToClipboard();
  const [copiedKey, setCopiedKey] = useState(null);
  const resetTimer = useRef(null);
  const returnFocus = useReturnFocus(Boolean(isOpen && template));

  useEffect(() => () => clearTimeout(resetTimer.current), []);

  const snippets = useMemo(
    () => buildCodeSnippets({ templateId: template?.templateReferenceId }),
    [template?.templateReferenceId]
  );

  if (!template) return null;

  const sections = {
    native: {
      title: t('templates.code.native.title', 'Native Strapi email service'),
      description: t(
        'templates.code.native.description',
        'Use the standard Strapi email service. MagicMail intercepts it automatically and applies all features.'
      ),
      icon: SuccessTriggerIcon,
      recommended: true,
    },
    plugin: {
      title: t('templates.code.plugin.title', 'MagicMail plugin service'),
      description: t(
        'templates.code.plugin.description',
        'Direct access to the MagicMail service for advanced options.'
      ),
      icon: PrimaryTriggerIcon,
    },
    curl: {
      title: t('templates.code.curl.title', 'REST API (cURL)'),
      description: t(
        'templates.code.curl.description',
        'For external applications and API tests. Authenticate with a Strapi API token.'
      ),
      icon: SecondaryTriggerIcon,
    },
  };

  const handleCopy = async (key, tokens) => {
    const copied = await copy(snippetText(tokens), {
      success: t('templates.code.copied', 'Code copied to clipboard'),
    });
    if (!copied) return;
    setCopiedKey(key);
    clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <Modal.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <CodeModalContent onCloseAutoFocus={returnFocus}>
        <StyledModalHeader closeLabel={t('common.close', 'Close')}>
          <Modal.Title>
            {t('templates.code.title', 'Code snippets: {name}', { name: template.name })}
          </Modal.Title>
        </StyledModalHeader>
        <ScrollableDialogBody>
          <InfoBox>
            <AccentText variant="pi">
              <strong>{t('templates.code.templateId', 'Template ID:')}</strong> #
              {template.templateReferenceId}
            </AccentText>
            <AccentText variant="pi">
              <strong>{t('templates.code.status', 'Status:')}</strong>{' '}
              {template.isActive
                ? t('templates.status.active', 'Active')
                : t('templates.status.inactive', 'Inactive')}
            </AccentText>
          </InfoBox>

          {!template.isActive && (
            <WarningBox role="note">
              <SparklesIcon aria-hidden="true" />
              <AccentText variant="pi" fontWeight="semiBold">
                {t(
                  'templates.code.inactiveWarning',
                  'This template is inactive and will not be sent.'
                )}
              </AccentText>
            </WarningBox>
          )}

          <Accordion.Root defaultValue="native" collapsible>
            {snippets.map(({ key, tokens }) => {
              const section = sections[key];
              const Icon = section.icon;
              const copied = copiedKey === key;
              return (
                <Accordion.Item key={key} value={key}>
                  <Accordion.Header>
                    <Accordion.Trigger icon={() => <Icon aria-hidden="true" />}>
                      <Flex gap={2} alignItems="center" wrap="wrap">
                        {section.title}
                        {section.recommended && (
                          <RecommendedBadge>
                            {t('templates.code.recommended', 'Recommended')}
                          </RecommendedBadge>
                        )}
                      </Flex>
                    </Accordion.Trigger>
                  </Accordion.Header>
                  <Accordion.Content>
                    <Box padding={4}>
                      <Typography
                        variant="pi"
                        textColor="neutral600"
                        tag="p"
                        style={{ marginBottom: '16px' }}
                      >
                        {section.description}
                      </Typography>
                      <CodeBlockWrapper>
                        <CodeBlock>
                          <code>
                            <CodeTokens tokens={tokens} />
                          </code>
                        </CodeBlock>
                        <CopyButton
                          type="button"
                          onClick={() => handleCopy(key, tokens)}
                          aria-label={t('templates.code.copyLabel', 'Copy {section} code', {
                            section: section.title,
                          })}
                        >
                          {copied ? (
                            <CheckIcon aria-hidden="true" />
                          ) : (
                            <ClipboardDocumentIcon aria-hidden="true" />
                          )}
                          <span aria-live="polite">
                            {copied
                              ? t('templates.code.copiedShort', 'Copied')
                              : t('templates.code.copy', 'Copy')}
                          </span>
                        </CopyButton>
                      </CodeBlockWrapper>
                    </Box>
                  </Accordion.Content>
                </Accordion.Item>
              );
            })}
          </Accordion.Root>
        </ScrollableDialogBody>
        <StyledModalFooter>
          <TertiaryButton onClick={onClose}>{t('common.close', 'Close')}</TertiaryButton>
        </StyledModalFooter>
      </CodeModalContent>
    </Modal.Root>
  );
};

export default TemplateCodeSnippetsModal;

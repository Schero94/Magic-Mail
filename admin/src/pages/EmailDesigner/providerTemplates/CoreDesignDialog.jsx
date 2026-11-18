import { useEffect, useState } from 'react';
import { useFetchClient, useNotification } from '@strapi/strapi/admin';
import {
  Box,
  Checkbox,
  Field,
  Flex,
  Modal,
  SingleSelect,
  SingleSelectOption,
  Typography,
} from '@strapi/design-system';
import { GradientButton, TertiaryButton } from '../../../components/StyledButtons';
import { useMagicMailIntl } from '../../../hooks/useMagicMailIntl';
import { useReturnFocus } from '../../../hooks/useReturnFocus';
import {
  ScrollableDialogBody,
  StyledModalContent,
  StyledModalFooter,
  StyledModalHeader,
} from '../templateListStyles';
import { Notice } from './Notice';
import { missingCoreVariables, providerName, statusInfo } from './providerTemplateUtils';
import { VariableItem, VariableList } from './providerTemplateStyles';

const DESIGNER = '__designer__';

/**
 * Chooses the design of one core email: the Magic Mail designer (default) or
 * a synced provider template. One choice, one Save.
 *
 * @param {object} props
 * @param {{type: string, name: string}|null} props.coreEmail - Open for this core email; null closes
 * @param {object|undefined} props.design - Current design entry (GET /designer/core-designs)
 * @param {object[]} props.templates - Synced provider templates (overview.templates)
 * @param {() => void} props.onClose
 * @param {(design: object) => void} props.onSaved
 * @returns {import('react').ReactElement}
 */
export const CoreDesignDialog = ({ coreEmail, design, templates, onClose, onSaved }) => {
  const { t } = useMagicMailIntl();
  const { get, put } = useFetchClient();
  const { toggleNotification } = useNotification();
  const isOpen = Boolean(coreEmail);
  const returnFocus = useReturnFocus(isOpen);

  const initialChoice = design?.providerTemplate ?? DESIGNER;
  const [choice, setChoice] = useState(initialChoice);
  const [fallback, setFallback] = useState(design?.fallbackToDesigner === true);
  const [saving, setSaving] = useState(false);
  const [variables, setVariables] = useState(null);

  // Start from the stored choice each time the dialog opens.
  const [openedFor, setOpenedFor] = useState(null);
  if ((coreEmail?.type ?? null) !== openedFor) {
    setOpenedFor(coreEmail?.type ?? null);
    setChoice(initialChoice);
    setFallback(design?.fallbackToDesigner === true);
    setVariables(null);
  }

  useEffect(() => {
    if (!isOpen || choice === DESIGNER) return undefined;
    let ignore = false;
    get(`/magic-mail/provider-templates/${encodeURIComponent(choice)}`)
      .then((response) => {
        if (!ignore) setVariables(response?.data?.data?.variables ?? []);
      })
      .catch(() => {
        if (!ignore) setVariables([]);
      });
    return () => {
      ignore = true;
    };
  }, [choice, get, isOpen]);

  const selected = templates.find((template) => template.key === choice) ?? null;
  const dirty =
    choice !== initialChoice ||
    (choice !== DESIGNER && fallback !== (design?.fallbackToDesigner === true));
  const sent = design?.variables ?? [];
  const missing = choice !== DESIGNER && variables ? missingCoreVariables(variables, sent) : [];
  // Templates that can be chosen: usable ones, plus the stored one even when stale.
  const options = templates.filter(
    (template) => template.usable || template.key === design?.providerTemplate
  );

  const handleClose = () => {
    if (!saving) onClose();
  };

  /** Saves the choice; the dialog stays open on errors. */
  const save = async (event) => {
    event?.preventDefault?.();
    if (!coreEmail || saving || !dirty) return;
    setSaving(true);
    try {
      const response = await put(
        `/magic-mail/designer/core/${encodeURIComponent(coreEmail.type)}/design`,
        choice === DESIGNER
          ? { providerTemplate: null }
          : { providerTemplate: choice, fallbackToDesigner: fallback }
      );
      toggleNotification({
        type: 'success',
        message:
          choice === DESIGNER
            ? t('templates.coreDesign.savedDesigner', '{name} now uses the Magic Mail designer.', {
                name: coreEmail.name,
              })
            : t('templates.coreDesign.savedProvider', '{name} now uses "{template}".', {
                name: coreEmail.name,
                template: selected?.name ?? choice,
              }),
      });
      onSaved(response?.data?.data);
      onClose();
    } catch (error) {
      toggleNotification({
        type: 'danger',
        message:
          error?.response?.data?.error?.message ||
          t('templates.coreDesign.failure', 'The design could not be saved.'),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal.Root open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <StyledModalContent
        onCloseAutoFocus={returnFocus}
        // The dialog has no separate description; this tells Radix so.
        aria-describedby={undefined}
      >
        <form onSubmit={save} noValidate>
          <StyledModalHeader closeLabel={t('common.close', 'Close')}>
            <Modal.Title>
              {t('templates.coreDesign.title', 'Design of {name}', { name: coreEmail?.name ?? '' })}
            </Modal.Title>
          </StyledModalHeader>
          <ScrollableDialogBody>
            <Flex direction="column" alignItems="stretch" gap={5}>
              <Field.Root
                name="coreDesign"
                hint={t(
                  'templates.coreDesign.hint',
                  'With a provider template, SendGrid or Mailgun renders this email. Routing, failover and logs stay in Magic Mail.'
                )}
              >
                <Field.Label>{t('templates.coreDesign.label', 'Design')}</Field.Label>
                <SingleSelect
                  value={choice}
                  onChange={(value) => setChoice(String(value))}
                  disabled={saving}
                >
                  <SingleSelectOption value={DESIGNER}>
                    {t('templates.coreDesign.designer', 'Magic Mail designer (default)')}
                  </SingleSelectOption>
                  {options.map((template) => (
                    <SingleSelectOption key={template.key} value={template.key}>
                      {t('templates.coreDesign.option', '{name} ({provider})', {
                        name: template.name,
                        provider: providerName(template.provider),
                      })}
                    </SingleSelectOption>
                  ))}
                </SingleSelect>
                <Field.Hint />
              </Field.Root>

              {choice !== DESIGNER && selected && !selected.usable ? (
                <Notice tone="danger" role="alert">
                  {t(
                    'templates.coreDesign.staleSelected',
                    'This template is "{status}". Sends fail until it is available again.',
                    {
                      status: t(statusInfo(selected.status).id, statusInfo(selected.status).label),
                    }
                  )}
                </Notice>
              ) : null}

              {choice !== DESIGNER ? (
                <>
                  <Flex direction="column" alignItems="stretch" gap={2}>
                    <Typography variant="delta" tag="h3">
                      {t('templates.coreDesign.sentHeading', 'Variables Magic Mail sends')}
                    </Typography>
                    <Typography variant="pi" textColor="neutral600">
                      {t(
                        'templates.coreDesign.sentHint',
                        'Use these names in the provider template. "url" is the finished link with the code.'
                      )}
                    </Typography>
                    <VariableList
                      aria-label={t(
                        'templates.coreDesign.sentHeading',
                        'Variables Magic Mail sends'
                      )}
                    >
                      {sent
                        .filter((name) => !name.startsWith('meta.') && !name.startsWith('USER.'))
                        .map((name) => (
                          <VariableItem key={name}>
                            <code>{name}</code>
                          </VariableItem>
                        ))}
                    </VariableList>
                  </Flex>

                  {missing.length > 0 ? (
                    <Notice
                      tone="warning"
                      title={t(
                        'templates.coreDesign.missingTitle',
                        'The template uses variables Magic Mail does not send'
                      )}
                    >
                      {t('templates.coreDesign.missingBody', 'These render empty: {names}', {
                        names: missing.join(', '),
                      })}
                    </Notice>
                  ) : null}

                  <Box>
                    <Checkbox
                      checked={fallback}
                      onCheckedChange={(value) => setFallback(value === true)}
                      disabled={saving}
                    >
                      {t(
                        'templates.coreDesign.fallback',
                        'If the provider template fails, send the Magic Mail designer version instead'
                      )}
                    </Checkbox>
                    <Box paddingTop={1} paddingLeft={6}>
                      <Typography variant="pi" textColor="neutral600">
                        {t(
                          'templates.coreDesign.fallbackHint',
                          'Off: the email fails with a clear error and nothing else is sent.'
                        )}
                      </Typography>
                    </Box>
                  </Box>
                </>
              ) : null}
            </Flex>
          </ScrollableDialogBody>
          <StyledModalFooter>
            <TertiaryButton type="button" onClick={handleClose} disabled={saving}>
              {t('common.cancel', 'Cancel')}
            </TertiaryButton>
            <GradientButton type="submit" loading={saving} disabled={saving || !dirty}>
              {t('common.save', 'Save')}
            </GradientButton>
          </StyledModalFooter>
        </form>
      </StyledModalContent>
    </Modal.Root>
  );
};

export default CoreDesignDialog;

import { useState } from 'react';
import { useFetchClient, useNotification } from '@strapi/strapi/admin';
import {
  Box,
  Field,
  Flex,
  IconButton,
  SingleSelect,
  SingleSelectOption,
  TextInput,
  Typography,
} from '@strapi/design-system';
import { Trash } from '@strapi/icons';
import { useMagicMailIntl } from '../../../hooks/useMagicMailIntl';
import { canonicalLocaleTag, languageVersionCandidates } from './providerTemplateUtils';
import { VariableItem, VariableList } from './providerTemplateStyles';

/**
 * "Language versions" of a provider template: other synced templates of the
 * same provider that are sent instead for a locale. Templates are picked
 * from a list, never typed as ids. Every change is saved right away (like
 * the fallback template).
 *
 * Read-only roles see the list without controls. A template that is itself
 * a language version of another one shows where it belongs instead.
 *
 * @param {object} props
 * @param {{key: string, provider: string, locales?: {locale: string, key: string}[],
 *   localeVariantOf?: string|null}} props.detail - Provider template detail
 * @param {Array<{key: string, name: string, provider: string, locales?: object[],
 *   localeVariantOf?: string|null}>} props.templates - Synced provider templates
 * @param {boolean} props.canManage
 * @param {(locales: {locale: string, key: string}[]) => void} props.onSaved
 * @returns {import('react').ReactElement}
 */
export const LanguageVersions = ({ detail, templates, canManage, onSaved }) => {
  const { t } = useMagicMailIntl();
  const { put } = useFetchClient();
  const { toggleNotification } = useNotification();
  const [locale, setLocale] = useState('');
  const [variantKey, setVariantKey] = useState('');
  const [localeError, setLocaleError] = useState(null);
  const [saving, setSaving] = useState(false);

  const entries = detail.locales ?? [];
  const nameOf = (key) => (templates ?? []).find((item) => item.key === key)?.name ?? key;

  if (detail.localeVariantOf) {
    return (
      <Flex direction="column" alignItems="stretch" gap={2}>
        <Typography variant="delta" tag="h3">
          {t('templates.provider.locales.title', 'Language versions')}
        </Typography>
        <Typography variant="pi" textColor="neutral600">
          {t(
            'templates.provider.locales.isVersionOf',
            'This template is a language version of {name}. Send {name}; Magic Mail picks this version for the matching language.',
            { name: nameOf(detail.localeVariantOf) }
          )}
        </Typography>
      </Flex>
    );
  }

  const candidates = languageVersionCandidates(detail, templates);

  const save = async (next, message) => {
    setSaving(true);
    try {
      const response = await put(
        `/magic-mail/provider-templates/${encodeURIComponent(detail.key)}/settings`,
        { locales: Object.fromEntries(next.map((entry) => [entry.locale, entry.key])) }
      );
      onSaved(response?.data?.data?.locales ?? next);
      toggleNotification({ type: 'success', message });
      return true;
    } catch (error) {
      toggleNotification({
        type: 'danger',
        message:
          error?.response?.data?.error?.details?.locales?.[0] ||
          error?.response?.data?.error?.message ||
          t('templates.provider.locales.failure', 'The language versions could not be saved.'),
      });
      return false;
    } finally {
      setSaving(false);
    }
  };

  /** Saves the version as soon as a template is picked (like the fallback). */
  const add = async (key) => {
    setVariantKey(key);
    const tag = canonicalLocaleTag(locale);
    if (!tag) {
      setLocaleError(
        t(
          'templates.provider.locales.localeInvalid',
          'Enter a language code such as de, fr or pt-BR.'
        )
      );
      return;
    }
    if (entries.some((entry) => entry.locale.toLowerCase() === tag.toLowerCase())) {
      setLocaleError(
        t('templates.provider.locales.duplicate', 'This language already has a version.')
      );
      return;
    }
    setLocaleError(null);
    const saved = await save(
      [...entries, { locale: tag, key }],
      t('templates.provider.locales.added', 'Language version added.')
    );
    if (saved) {
      setLocale('');
      setVariantKey('');
    }
  };

  return (
    <Flex direction="column" alignItems="stretch" gap={2}>
      <Typography variant="delta" tag="h3">
        {t('templates.provider.locales.title', 'Language versions')}
      </Typography>
      <Typography variant="pi" textColor="neutral600">
        {t(
          'templates.provider.locales.hint',
          'Send this template and Magic Mail picks the version for the recipient language: the locale passed to send(), else the locale stored on the user. de-AT falls back to de, then to this template. Enter a language and pick its template; it is saved right away.'
        )}
      </Typography>

      {entries.length > 0 ? (
        <VariableList aria-label={t('templates.provider.locales.title', 'Language versions')}>
          {entries.map((entry) => (
            <VariableItem key={entry.locale}>
              <code>{entry.locale}</code>
              <Typography variant="omega" textColor="neutral800">
                {nameOf(entry.key)}
              </Typography>
              {canManage ? (
                <IconButton
                  variant="ghost"
                  disabled={saving}
                  label={t('templates.provider.locales.remove', 'Remove the {locale} version', {
                    locale: entry.locale,
                  })}
                  onClick={() =>
                    save(
                      entries.filter((item) => item.locale !== entry.locale),
                      t('templates.provider.locales.removed', 'Language version removed.')
                    )
                  }
                >
                  <Trash />
                </IconButton>
              ) : null}
            </VariableItem>
          ))}
        </VariableList>
      ) : (
        <Typography variant="omega" textColor="neutral800">
          {t(
            'templates.provider.locales.none',
            'No language versions. Every recipient gets this template.'
          )}
        </Typography>
      )}

      {canManage && candidates.length > 0 ? (
        <Flex gap={2} wrap="wrap" alignItems="flex-start">
          <Box style={{ flex: '1 1 12rem', minWidth: 0 }}>
            <Field.Root name="providerLocale" error={localeError ?? undefined}>
              <Field.Label>{t('templates.provider.locales.locale', 'Language')}</Field.Label>
              <TextInput
                placeholder="de"
                autoComplete="off"
                value={locale}
                onChange={(event) => setLocale(event.target.value)}
              />
              <Field.Error />
            </Field.Root>
          </Box>
          <Box style={{ flex: '2 1 18rem', minWidth: 0 }}>
            <Field.Root name="providerLocaleTemplate">
              <Field.Label>{t('templates.provider.locales.template', 'Template')}</Field.Label>
              <SingleSelect
                placeholder={t('templates.provider.locales.pick', 'Choose a template')}
                value={variantKey}
                disabled={saving}
                onChange={(value) => add(String(value))}
              >
                {candidates.map((template) => (
                  <SingleSelectOption key={template.key} value={template.key}>
                    {template.name}
                  </SingleSelectOption>
                ))}
              </SingleSelect>
            </Field.Root>
          </Box>
        </Flex>
      ) : null}
      {canManage && candidates.length === 0 && entries.length === 0 ? (
        <Typography variant="pi" textColor="neutral600">
          {t(
            'templates.provider.locales.noCandidates',
            'Create the translated template at the provider and sync; it can then be added here.'
          )}
        </Typography>
      ) : null}
    </Flex>
  );
};

export default LanguageVersions;

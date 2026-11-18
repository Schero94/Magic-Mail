import { useEffect, useState } from 'react';
import { useFetchClient } from '@strapi/strapi/admin';
import { Box, Flex, Loader, Typography } from '@strapi/design-system';
import { TertiaryButton } from '../../../components/StyledButtons';
import { useCopyToClipboard } from '../../../hooks/useCopyToClipboard';
import { useMagicMailIntl } from '../../../hooks/useMagicMailIntl';
import { Notice } from './Notice';
import { conversionWarning } from './providerTemplateUtils';
import { ConvertedCode } from './providerTemplateStyles';

/**
 * "Convert for provider": shows a local template with its Mustache logic
 * translated to Handlebars, ready to paste into a SendGrid or Mailgun
 * template. Read-only; loads when the panel opens.
 *
 * @param {object} props
 * @param {number|string} props.templateReferenceId
 * @returns {import('react').ReactElement}
 */
export const ConvertForProviderPanel = ({ templateReferenceId }) => {
  const { t } = useMagicMailIntl();
  const { get } = useFetchClient();
  const copy = useCopyToClipboard();
  const [result, setResult] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let ignore = false;
    get(`/magic-mail/designer/templates/${encodeURIComponent(templateReferenceId)}/provider-html`)
      .then((response) => {
        if (!ignore) setResult(response?.data?.data ?? null);
      })
      .catch(() => {
        if (!ignore) setFailed(true);
      });
    return () => {
      ignore = true;
    };
  }, [get, templateReferenceId]);

  if (failed) {
    return (
      <Notice tone="danger" role="alert">
        {t('templates.convert.failure', 'The template could not be converted.')}
      </Notice>
    );
  }
  if (!result) {
    return (
      <Flex justifyContent="center" padding={4}>
        <Loader small>{t('templates.convert.loading', 'Converting...')}</Loader>
      </Flex>
    );
  }

  return (
    <Flex direction="column" alignItems="stretch" gap={4}>
      <Typography variant="pi" textColor="neutral600" tag="p">
        {t(
          'templates.convert.description',
          'Paste this HTML into a SendGrid dynamic template or a Mailgun template, then sync. Variables keep their names; only logic blocks change.'
        )}
      </Typography>
      {result.warnings.length > 0 ? (
        <Notice tone="warning" title={t('templates.convert.warningsTitle', 'Check these blocks')}>
          <Box tag="ul" paddingLeft={4}>
            {result.warnings.slice(0, 8).map((warning, index) => {
              const info = conversionWarning(warning.code);
              return (
                <li key={`${warning.code}-${warning.line}-${index}`}>
                  {t('templates.provider.copy.warningLine', 'Line {line}: {message}', {
                    line: warning.line,
                    message: t(info.id, info.label),
                  })}
                </li>
              );
            })}
          </Box>
        </Notice>
      ) : null}
      <Flex direction="column" alignItems="stretch" gap={2}>
        <Typography variant="sigma" textColor="neutral600">
          {t('templates.convert.subject', 'Subject')}
        </Typography>
        <ConvertedCode>{result.subject}</ConvertedCode>
      </Flex>
      <Flex direction="column" alignItems="stretch" gap={2}>
        <Typography variant="sigma" textColor="neutral600">
          {t('templates.convert.html', 'HTML')}
        </Typography>
        <ConvertedCode>{result.html}</ConvertedCode>
      </Flex>
      <Flex gap={2} wrap="wrap">
        <TertiaryButton
          onClick={() =>
            copy(result.html, { success: t('templates.convert.copied', 'HTML copied.') })
          }
        >
          {t('templates.convert.copyHtml', 'Copy HTML')}
        </TertiaryButton>
        <TertiaryButton
          onClick={() =>
            copy(result.subject, {
              success: t('templates.convert.subjectCopied', 'Subject copied.'),
            })
          }
        >
          {t('templates.convert.copySubject', 'Copy subject')}
        </TertiaryButton>
      </Flex>
    </Flex>
  );
};

export default ConvertForProviderPanel;

import { Flex, Loader, Modal, Typography } from '@strapi/design-system';
import { ArrowPathIcon, ArrowUturnLeftIcon, ClockIcon, TrashIcon } from '@heroicons/react/24/outline';
import { TertiaryButton } from '../../components/StyledButtons';
import { useMagicMailIntl } from '../../hooks/useMagicMailIntl';
import { useFormatters } from '../../hooks/useFormatters';
import {
  DeleteButton,
  EmptyVersions,
  RestoreButton,
  VersionActions,
  VersionBadge,
  VersionDate,
  VersionItem,
  VersionItemHeader,
  VersionList,
  VersionMeta,
  VersionModalContent,
  VersionNumber,
  VersionSheet,
  VersionSheetHeader,
  VersionSheetTitle,
} from './editorStyles';

/**
 * Version number shown for a stored revision.
 * @param {{versionNumber?: number}} version
 * @param {number} index
 * @param {number} total
 */
export const getVersionNumber = (version, index, total) => version?.versionNumber || total - index;

/**
 * Version history side sheet (UI-13). Built on the DS Modal (Radix dialog), so
 * it has dialog semantics, a focus trap, Esc to close, a labelled close button
 * and nothing focusable while it is closed. It fits narrow screens.
 *
 * @param {object} props
 * @param {boolean} props.isOpen
 * @param {() => void} props.onClose
 * @param {Array<object>} props.versions
 * @param {boolean} props.loading
 * @param {boolean} props.loadError
 * @param {() => void} props.onRetry
 * @param {boolean} props.canManage
 * @param {(version: object, versionNumber: number) => void} props.onRestore
 * @param {(version: object, versionNumber: number) => void} props.onDelete
 * @param {() => void} props.onDeleteAll
 */
export const VersionHistoryDrawer = ({
  isOpen,
  onClose,
  versions,
  loading,
  loadError,
  onRetry,
  canManage,
  onRestore,
  onDelete,
  onDeleteAll,
}) => {
  const { t } = useMagicMailIntl();
  const { formatDateTime } = useFormatters();

  return (
    <Modal.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <VersionSheet>
        <VersionSheetHeader closeLabel={t('editor.versions.close', 'Close version history')}>
          <VersionSheetTitle>
            <ClockIcon aria-hidden="true" />
            <Modal.Title>{t('editor.versions.title', 'Version history')}</Modal.Title>
            {versions.length > 0 && (
              <Typography variant="pi" textColor="neutral600">
                {t('editor.versions.count', '({count})', { count: versions.length })}
              </Typography>
            )}
          </VersionSheetTitle>
          {canManage && versions.length > 0 && (
            <DeleteButton size="S" startIcon={<TrashIcon aria-hidden="true" />} onClick={onDeleteAll}>
              {t('editor.versions.deleteAll', 'Delete all')}
            </DeleteButton>
          )}
        </VersionSheetHeader>

        <VersionModalContent aria-busy={loading}>
          {loading ? (
            <Flex justifyContent="center" padding={8}>
              <Loader>{t('editor.versions.loading', 'Loading versions...')}</Loader>
            </Flex>
          ) : loadError ? (
            <EmptyVersions role="alert">
              <ClockIcon aria-hidden="true" />
              <Typography variant="beta" tag="p">
                {t('editor.versions.error', 'Version history could not be loaded')}
              </Typography>
              <TertiaryButton startIcon={<ArrowPathIcon width={16} height={16} aria-hidden="true" />} onClick={onRetry}>
                {t('editor.retry', 'Try again')}
              </TertiaryButton>
            </EmptyVersions>
          ) : versions.length === 0 ? (
            <EmptyVersions>
              <ClockIcon aria-hidden="true" />
              <Typography variant="beta" tag="p">
                {t('editor.versions.empty.title', 'No versions yet')}
              </Typography>
              <Typography variant="omega" textColor="neutral600" style={{ maxWidth: '300px' }}>
                {t('editor.versions.empty.text', 'A version is created automatically each time you save changes.')}
              </Typography>
            </EmptyVersions>
          ) : (
            <VersionList>
              {versions.map((version, index) => {
                const number = getVersionNumber(version, index, versions.length);
                return (
                  <VersionItem key={version.id}>
                    <VersionItemHeader>
                      <VersionNumber>
                        <VersionBadge>#{number}</VersionBadge>
                        {version.name}
                      </VersionNumber>
                      <VersionDate>{formatDateTime(version.createdAt)}</VersionDate>
                    </VersionItemHeader>

                    <VersionMeta>
                      <strong>{t('editor.versions.subject', 'Subject:')}</strong>{' '}
                      {version.subject || t('editor.versions.noSubject', 'No subject')}
                    </VersionMeta>

                    {canManage && (
                      <VersionActions>
                        <RestoreButton
                          size="S"
                          startIcon={<ArrowUturnLeftIcon aria-hidden="true" />}
                          onClick={() => onRestore(version, number)}
                          aria-label={t('editor.versions.restoreLabel', 'Restore version {number}', { number })}
                        >
                          {t('editor.versions.restore', 'Restore')}
                        </RestoreButton>
                        <DeleteButton
                          size="S"
                          startIcon={<TrashIcon aria-hidden="true" />}
                          onClick={() => onDelete(version, number)}
                          aria-label={t('editor.versions.deleteLabel', 'Delete version {number}', { number })}
                        >
                          {t('common.delete', 'Delete')}
                        </DeleteButton>
                      </VersionActions>
                    )}
                  </VersionItem>
                );
              })}
            </VersionList>
          )}
        </VersionModalContent>
      </VersionSheet>
    </Modal.Root>
  );
};

export default VersionHistoryDrawer;

import { useCallback, useEffect, useRef, useState } from 'react';
import { useFetchClient, useNotification } from '@strapi/strapi/admin';
import { useMagicMailIntl } from '../../../hooks/useMagicMailIntl';

/**
 * Loads the provider-template overview and keeps it fresh.
 *
 * - Loads once when `enabled` (read permission) is true.
 * - When the server reports `stale` (no sync in the last ten minutes) and a
 *   SendGrid or Mailgun account exists, one background sync runs.
 * - `sync()` re-reads all provider accounts (the "Sync" button).
 *
 * @param {{enabled: boolean}} options
 * @returns {{overview: object|null, loading: boolean, error: boolean, syncing: boolean, sync: () => Promise<void>, reload: () => void}}
 * @sideeffect GET /magic-mail/provider-templates; POST /magic-mail/provider-templates/sync
 */
export const useProviderTemplates = ({ enabled }) => {
  const { get, post } = useFetchClient();
  const { toggleNotification } = useNotification();
  const { t } = useMagicMailIntl();
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const autoSynced = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const runSync = useCallback(
    async ({ force, quiet }) => {
      setSyncing(true);
      try {
        const response = await post('/magic-mail/provider-templates/sync', { force });
        if (!mounted.current) return;
        const data = response?.data?.data ?? null;
        setOverview(data);
        setError(false);
        if (!quiet) {
          const failed = (data?.accounts ?? []).filter((account) => account.error).length;
          toggleNotification({
            type: failed > 0 ? 'warning' : 'success',
            message:
              failed > 0
                ? t(
                    'templates.provider.sync.partial',
                    'Synced. {count, plural, one {# account} other {# accounts}} could not be read.',
                    { count: failed }
                  )
                : t('templates.provider.sync.success', 'Provider templates synced.'),
          });
        }
      } catch (syncError) {
        if (!mounted.current) return;
        const status = syncError?.response?.status;
        toggleNotification({
          type: 'danger',
          message:
            status === 429
              ? t(
                  'templates.provider.sync.rateLimited',
                  'Too many syncs in a short time. Try again in a minute.'
                )
              : t('templates.provider.sync.failure', 'Provider templates could not be synced.'),
        });
      } finally {
        if (mounted.current) setSyncing(false);
      }
    },
    [post, t, toggleNotification]
  );

  useEffect(() => {
    if (!enabled) return undefined;
    let ignore = false;
    get('/magic-mail/provider-templates')
      .then((response) => {
        if (ignore) return;
        const data = response?.data?.data ?? null;
        setOverview(data);
        setError(false);
        setLoading(false);
        if (data?.enabled && data?.stale && !autoSynced.current) {
          autoSynced.current = true;
          runSync({ force: false, quiet: true });
        }
      })
      .catch(() => {
        if (ignore) return;
        setError(true);
        setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [enabled, get, reloadKey, runSync]);

  const sync = useCallback(() => runSync({ force: true, quiet: false }), [runSync]);
  const reload = useCallback(() => {
    setLoading(true);
    setReloadKey((key) => key + 1);
  }, []);

  return { overview, loading: enabled && loading, error, syncing, sync, reload };
};

export default useProviderTemplates;

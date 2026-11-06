import { useCallback, useEffect, useRef, useState } from 'react';
import {
  OAUTH_API_PROVIDER,
  buildOAuthAuthQuery,
  getAllowedMessageOrigins,
  parseOAuthMessage,
} from './wizardState';

const POPUP_WIDTH = 600;
const POPUP_HEIGHT = 700;
const POLL_MS = 500;

const getBackendURL = () => (typeof window !== 'undefined' ? window.strapi?.backendURL : undefined);

/**
 * One OAuth popup flow for Gmail, Microsoft and Yahoo.
 *
 * - Reports a blocked popup instead of polling a null window forever.
 * - Accepts only well-formed messages for the provider that was started,
 *   from the admin origin or the configured backend origin.
 * - Does not claim "window closed, try again" after a successful message.
 * - Clears the poll interval and the listener on reset and on unmount.
 *
 * @param {object} options
 * @param {(path: string) => Promise<{data: any}>} options.get - useFetchClient().get
 * @param {(event: {type: 'blocked'|'started'|'success'|'closed'|'failed', provider?: string}) => void} options.onEvent
 */
export const useOAuthPopup = ({ get, onEvent }) => {
  const [authorization, setAuthorization] = useState(null); // { provider, code, state }
  const [isStarting, setIsStarting] = useState(false);
  const [serverRedirectUris, setServerRedirectUris] = useState({});
  const intervalRef = useRef(null);
  const completedRef = useRef(false);
  const expectedProviderRef = useRef(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    const allowedOrigins = getAllowedMessageOrigins({
      backendURL: getBackendURL(),
      origin: window.location.origin,
    });

    const handleMessage = (event) => {
      if (!expectedProviderRef.current) return;
      const result = parseOAuthMessage(event, {
        allowedOrigins,
        expectedProvider: expectedProviderRef.current,
      });
      if (!result) return;
      completedRef.current = true;
      expectedProviderRef.current = null;
      setAuthorization(result);
      onEventRef.current?.({ type: 'success', provider: result.provider });
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
      stopPolling();
    };
  }, [stopPolling]);

  /** Forgets a code (provider/client changed, wizard closed). */
  const reset = useCallback(() => {
    stopPolling();
    completedRef.current = false;
    expectedProviderRef.current = null;
    setAuthorization(null);
    setIsStarting(false);
  }, [stopPolling]);

  /**
   * @param {string} provider - wizard provider value, e.g. 'gmail-oauth'
   * @param {{clientId?: string, tenantId?: string, accountId?: string}} params -
   *   `accountId` reconnects an existing account with its stored app credentials.
   */
  const start = useCallback(
    async (provider, { clientId, tenantId, accountId }) => {
      const apiProvider = OAUTH_API_PROVIDER[provider];
      const queryString = buildOAuthAuthQuery(provider, { clientId, tenantId, accountId });
      if (!apiProvider || !queryString) return;

      reset();
      setIsStarting(true);

      // Open the window synchronously-ish to keep the user gesture where
      // possible; navigate it once the authorize URL is known.
      const left = Math.max(0, (window.screen.width - POPUP_WIDTH) / 2);
      const top = Math.max(0, (window.screen.height - POPUP_HEIGHT) / 2);
      const popup = window.open(
        'about:blank',
        `${apiProvider}-oauth`,
        `width=${POPUP_WIDTH},height=${POPUP_HEIGHT},left=${left},top=${top},toolbar=no,menubar=no,location=no,status=no`
      );

      if (!popup) {
        setIsStarting(false);
        onEventRef.current?.({ type: 'blocked', provider });
        return;
      }

      try {
        const { data } = await get(`/magic-mail/oauth/${apiProvider}/auth?${queryString}`);

        if (!data?.authUrl || !/^https:\/\//i.test(data.authUrl)) {
          throw new Error('missing authorize URL');
        }
        if (typeof data.redirectUri === 'string') {
          setServerRedirectUris((previous) => ({ ...previous, [apiProvider]: data.redirectUri }));
        }

        expectedProviderRef.current = provider;
        popup.location.href = data.authUrl;
        onEventRef.current?.({ type: 'started', provider });

        intervalRef.current = setInterval(() => {
          let closed = true;
          try {
            closed = popup.closed;
          } catch {
            closed = true;
          }
          if (!closed) return;
          stopPolling();
          if (!completedRef.current) {
            expectedProviderRef.current = null;
            onEventRef.current?.({ type: 'closed', provider });
          }
        }, POLL_MS);
      } catch {
        try {
          popup.close();
        } catch {
          // ignore
        }
        expectedProviderRef.current = null;
        onEventRef.current?.({ type: 'failed', provider });
      } finally {
        setIsStarting(false);
      }
    },
    [get, reset, stopPolling]
  );

  return { authorization, isStarting, start, reset, serverRedirectUris };
};

export default useOAuthPopup;

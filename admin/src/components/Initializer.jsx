import { useEffect, useRef } from 'react';
import { useFetchClient } from '@strapi/strapi/admin';
import pluginId from '../pluginId';

/**
 * Initializer component that sets up the plugin and maintains session
 * Includes a heartbeat to keep the admin session alive
 */
const Initializer = ({ setPlugin }) => {
  const ref = useRef(setPlugin);
  const { get } = useFetchClient();

  useEffect(() => {
    ref.current(pluginId);
  }, []);

  // Session heartbeat - keeps token alive by making periodic requests
  useEffect(() => {
    const HEARTBEAT_INTERVAL = 4 * 60 * 1000; // 4 minutes
    
    /**
     * Sends a lightweight request to keep the session active
     */
    const heartbeat = async () => {
      try {
        // Use license status endpoint as heartbeat (lightweight, authenticated)
        await get(`/${pluginId}/license/status`);
      } catch (error) {
        // Silently ignore errors - this is just a keep-alive
      }
    };

    // Initial heartbeat after 1 minute
    const initialTimeout = setTimeout(heartbeat, 60 * 1000);
    
    // Regular heartbeat every 4 minutes
    const interval = setInterval(heartbeat, HEARTBEAT_INTERVAL);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [get]);

  return null;
};

export default Initializer;

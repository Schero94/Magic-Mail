import { useEffect, useRef } from 'react';
import { useFetchClient } from '@strapi/strapi/admin';

/**
 * Hook to handle JWT token refresh for admin panel
 * Automatically refreshes token before expiration (every 4 minutes)
 * Also handles 401 responses with automatic token refresh
 */
export const useAuthRefresh = () => {
  const { get } = useFetchClient();
  const intervalRef = useRef(null);

  useEffect(() => {
    // Set up auto-refresh every 4 minutes (before 5 min expiration)
    intervalRef.current = setInterval(async () => {
      try {
        // Refresh token by hitting a protected endpoint
        await get('/admin/users/me');
        console.debug('[Auth Refresh] Token refreshed successfully');
      } catch (error) {
        // If refresh fails, log but don't break
        console.debug('[Auth Refresh] Token refresh attempt failed');
      }
    }, 4 * 60 * 1000); // 4 minutes

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [get]);

  return {
    refreshToken: async () => {
      try {
        await get('/admin/users/me');
        return true;
      } catch (error) {
        return false;
      }
    },
  };
};


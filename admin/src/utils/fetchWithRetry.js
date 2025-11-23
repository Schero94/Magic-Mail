/**
 * Fetch wrapper with automatic token refresh on 401
 * Retries failed requests after token refresh
 */
export const createFetchWithRetry = (fetchClient) => {
  let isRefreshing = false;
  let refreshPromise = null;

  const refresh = async () => {
    if (isRefreshing) {
      // Wait for ongoing refresh
      return refreshPromise;
    }

    isRefreshing = true;
    refreshPromise = (async () => {
      try {
        // Hit a protected endpoint to trigger token refresh
        const response = await fetch('/admin/users/me', {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          console.debug('[Fetch Retry] Token refreshed successfully');
          return true;
        }
        return false;
      } catch (error) {
        console.error('[Fetch Retry] Token refresh failed:', error);
        // Redirect to login on persistent failure
        window.location.href = '/admin/auth/login';
        return false;
      } finally {
        isRefreshing = false;
        refreshPromise = null;
      }
    })();

    return refreshPromise;
  };

  return {
    get: async (url, options = {}) => {
      try {
        return await fetchClient.get(url, options);
      } catch (error) {
        if (error.response?.status === 401) {
          const refreshed = await refresh();
          if (refreshed) {
            return await fetchClient.get(url, options);
          }
          throw error;
        }
        throw error;
      }
    },

    post: async (url, data, options = {}) => {
      try {
        return await fetchClient.post(url, data, options);
      } catch (error) {
        if (error.response?.status === 401) {
          const refreshed = await refresh();
          if (refreshed) {
            return await fetchClient.post(url, data, options);
          }
          throw error;
        }
        throw error;
      }
    },

    put: async (url, data, options = {}) => {
      try {
        return await fetchClient.put(url, data, options);
      } catch (error) {
        if (error.response?.status === 401) {
          const refreshed = await refresh();
          if (refreshed) {
            return await fetchClient.put(url, data, options);
          }
          throw error;
        }
        throw error;
      }
    },

    patch: async (url, data, options = {}) => {
      try {
        return await fetchClient.patch(url, data, options);
      } catch (error) {
        if (error.response?.status === 401) {
          const refreshed = await refresh();
          if (refreshed) {
            return await fetchClient.patch(url, data, options);
          }
          throw error;
        }
        throw error;
      }
    },

    del: async (url, options = {}) => {
      try {
        return await fetchClient.del(url, options);
      } catch (error) {
        if (error.response?.status === 401) {
          const refreshed = await refresh();
          if (refreshed) {
            return await fetchClient.del(url, options);
          }
          throw error;
        }
        throw error;
      }
    },
  };
};


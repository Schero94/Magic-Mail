import { useRBAC } from '@strapi/strapi/admin';
import pluginPermissions from '../permissions';

const ROUTE_CAPABILITIES = [
  ...pluginPermissions.read,
  ...pluginPermissions.manage,
  ...pluginPermissions.testSend,
];

/**
 * Resolves the server-registered capabilities used by MagicMail UI actions.
 * The API routes remain authoritative; this hook only keeps unavailable
 * controls out of the admin interface.
 *
 * @returns {{canRead: boolean, canManage: boolean, canTestSend: boolean, isLoading: boolean, error?: unknown}}
 */
export const useMagicMailRBAC = () => {
  const { allowedActions = {}, isLoading, error } = useRBAC(ROUTE_CAPABILITIES);

  return {
    canRead: allowedActions.canRead === true,
    canManage: allowedActions.canManage === true,
    canTestSend: allowedActions.canTestSend === true,
    isLoading,
    error,
  };
};

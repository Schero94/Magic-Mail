import { useRBAC } from '@strapi/strapi/admin';
import pluginPermissions from '../permissions';

const ROUTE_CAPABILITIES = [
  ...pluginPermissions.read,
  ...pluginPermissions.manage,
  ...pluginPermissions.testSend,
];

/**
 * Outbox grants are checked in their own useRBAC call: useRBAC names each
 * capability after the last dot-separated segment of the action, so
 * `queue.read` would collide with `read` (`canRead`).
 */
const QUEUE_CAPABILITIES = [...pluginPermissions.queueRead, ...pluginPermissions.queueManage];

/**
 * Single source of truth for MagicMail UI gating.
 *
 * The API routes remain authoritative; this hook only keeps unavailable
 * controls out of the admin interface. While permissions load, and when the
 * permission request fails, every capability is false so write controls never
 * flash in. Views should render a loading state while `isLoading` and an
 * error state when `error` is set, instead of treating both as "no rights".
 *
 *   const { canRead, canManage, canTestSend, canReadQueue, canManageQueue } = useMagicMailRBAC();
 *
 * Route-level protection keeps using `<Page.Protect permissions={permissions.read}>`
 * with the `permissions` object returned here.
 *
 * @returns {{
 *   canRead: boolean,
 *   canManage: boolean,
 *   canTestSend: boolean,
 *   canReadQueue: boolean,
 *   canManageQueue: boolean,
 *   isQueueLoading: boolean,
 *   isReadOnly: boolean,
 *   isLoading: boolean,
 *   error?: unknown,
 *   permissions: typeof pluginPermissions,
 * }}
 */
export const useMagicMailRBAC = () => {
  const { allowedActions = {}, isLoading = false, error } = useRBAC(ROUTE_CAPABILITIES) ?? {};
  const queueRbac = useRBAC(QUEUE_CAPABILITIES) ?? {};
  const settled = !isLoading && !error;
  const allowed = (key) => settled && allowedActions?.[key] === true;
  const queueSettled = !queueRbac.isLoading && !queueRbac.error;
  const queueAllowed = (key) => queueSettled && queueRbac.allowedActions?.[key] === true;

  const canRead = allowed('canRead');
  const canManage = allowed('canManage');

  return {
    canRead,
    canManage,
    canTestSend: allowed('canTestSend'),
    canReadQueue: queueAllowed('canRead'),
    canManageQueue: queueAllowed('canManage'),
    isQueueLoading: Boolean(queueRbac.isLoading),
    isReadOnly: canRead && !canManage,
    isLoading: Boolean(isLoading),
    error,
    permissions: pluginPermissions,
  };
};

export default useMagicMailRBAC;

import { useAuthRefresh } from '../hooks/useAuthRefresh';

/**
 * License gate for MagicMail.
 *
 * MagicMail is free & fully unlocked — just like Magic Link. No license is
 * required, so this guard simply keeps the admin token auto-refresh running
 * and always renders its children (the previous "Activate MagicMail" modal
 * has been removed).
 */
const LicenseGuard = ({ children }) => {
  useAuthRefresh(); // keep admin token auto-refresh running
  return <>{children}</>;
};

export default LicenseGuard;

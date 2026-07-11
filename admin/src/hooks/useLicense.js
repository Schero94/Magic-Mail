/**
 * Hook to check license status for MagicMail.
 *
 * MagicMail is free & fully unlocked — just like Magic Link. This hook no
 * longer contacts the license server; it always reports every tier and
 * feature as available so the admin UI is never gated.
 *
 * Returns: { isPremium, isAdvanced, isEnterprise, loading, error, licenseData, features, hasFeature, refetch }
 */
export const useLicense = () => {
  /**
   * Check if a specific feature is available.
   * Always true — every feature is unlocked.
   * @returns {boolean}
   */
  const hasFeature = () => true;

  return {
    isPremium: true,
    isAdvanced: true,
    isEnterprise: true,
    loading: false,
    error: null,
    licenseData: null,
    features: {
      premium: true,
      advanced: true,
      enterprise: true,
    },
    hasFeature,
    refetch: () => {},
  };
};

import { useState, useEffect } from 'react';
import { useFetchClient } from '@strapi/strapi/admin';

/**
 * Hook to check license status for MagicMail
 * Returns: { isPremium, loading, error, licenseData, refetch }
 */
export const useLicense = () => {
  const { get } = useFetchClient();
  const [isPremium, setIsPremium] = useState(false);
  const [isAdvanced, setIsAdvanced] = useState(false);
  const [isEnterprise, setIsEnterprise] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [licenseData, setLicenseData] = useState(null);

  useEffect(() => {
    let mounted = true;
    
    const fetchLicense = async () => {
      if (mounted) {
        await checkLicense();
      }
    };
    
    fetchLicense();
    
    // Auto-refresh every 1 hour
    const interval = setInterval(() => {
      if (mounted) {
        checkLicense(true); // Silent refresh
      }
    }, 60 * 60 * 1000);
    
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const checkLicense = async (silent = false) => {
    if (!silent) {
      setLoading(true);
    }
    
    try {
      const response = await get('/magic-mail/license/status');
      
      const isValid = response.data?.valid || false;
      const hasPremiumFeature = response.data?.data?.features?.premium || false;
      const hasAdvancedFeature = response.data?.data?.features?.advanced || false;
      const hasEnterpriseFeature = response.data?.data?.features?.enterprise || false;
      
      setIsPremium(isValid && hasPremiumFeature);
      setIsAdvanced(isValid && hasAdvancedFeature);
      setIsEnterprise(isValid && hasEnterpriseFeature);
      setLicenseData(response.data?.data || null);
      setError(null);
    } catch (err) {
      // Ignore AbortError (happens on unmount)
      if (err.name === 'AbortError') {
        return;
      }
      
      if (!silent) {
        console.error('[MagicMail] License check error:', err);
      }
      setIsPremium(false);
      setIsAdvanced(false);
      setIsEnterprise(false);
      setLicenseData(null);
      setError(err);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  /**
   * Check if a specific feature is available
   * @param {string} featureName - Name of the feature to check
   * @returns {boolean}
   */
  const hasFeature = (featureName) => {
    if (!featureName) return false;
    
    // Free tier features (always available)
    const freeFeatures = [
      'basic-smtp',
      'oauth-gmail',
      'oauth-microsoft',
      'oauth-yahoo',
      'basic-routing',
      'email-logging',
      'account-testing',
      'strapi-service-override',
      'email-designer-basic',
    ];
    
    if (freeFeatures.includes(featureName)) return true;
    
    // Premium+ features
    const premiumFeatures = [
      'email-designer-templates',
    ];
    
    if (premiumFeatures.includes(featureName) && isPremium) return true;
    
    // Advanced+ features
    const advancedFeatures = [
      'sendgrid',
      'mailgun',
      'dkim-signing',
      'priority-headers',
      'list-unsubscribe',
      'security-validation',
      'analytics-dashboard',
      'advanced-routing',
      'email-designer-versioning',
      'email-designer-import-export',
    ];
    
    if (advancedFeatures.includes(featureName) && isAdvanced) return true;
    
    // Enterprise features
    const enterpriseFeatures = [
      'multi-tenant',
      'compliance-reports',
      'custom-security-rules',
      'priority-support',
      'email-designer-custom-blocks',
      'email-designer-team-library',
      'email-designer-a-b-testing',
    ];
    
    if (enterpriseFeatures.includes(featureName) && isEnterprise) return true;
    
    return false;
  };

  return { 
    isPremium, 
    isAdvanced,
    isEnterprise,
    loading, 
    error, 
    licenseData,
    features: {
      premium: isPremium,
      advanced: isAdvanced,
      enterprise: isEnterprise,
    },
    hasFeature,
    refetch: checkLicense 
  };
};


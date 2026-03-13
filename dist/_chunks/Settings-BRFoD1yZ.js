"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const jsxRuntime = require("react/jsx-runtime");
const React = require("react");
const designSystem = require("@strapi/design-system");
const admin = require("@strapi/strapi/admin");
const outline = require("@heroicons/react/24/outline");
const styled = require("styled-components");
const StyledButtons = require("./StyledButtons-DVGuFoqy.js");
const _interopDefault = (e) => e && e.__esModule ? e : { default: e };
const styled__default = /* @__PURE__ */ _interopDefault(styled);
const fadeIn = styled.keyframes`
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
`;
const shimmer = styled.keyframes`
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
`;
const Container = styled__default.default(designSystem.Box)`
  ${styled.css`animation: ${fadeIn} 0.5s;`}
  max-width: 1400px;
  margin: 0 auto;
`;
const StickySaveBar = styled__default.default(designSystem.Box)`
  position: sticky;
  top: 0;
  z-index: 10;
  background: ${(p) => p.theme.colors.neutral0};
  border-bottom: 1px solid rgba(128, 128, 128, 0.2);
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
`;
const LicenseKeyBanner = styled__default.default(designSystem.Box)`
  background: linear-gradient(135deg, var(--colors-primary600, #0EA5E9) 0%, var(--colors-secondary500, #A855F7) 100%);
  border-radius: 12px;
  padding: 28px 32px;
  color: white;
  position: relative;
  overflow: hidden;
  box-shadow: 0 4px 20px rgba(14, 165, 233, 0.25);
  margin-bottom: 24px;
  
  &::after {
    content: '';
    position: absolute;
    top: -50%;
    right: -50%;
    width: 200%;
    height: 200%;
    background: linear-gradient(
      45deg,
      transparent,
      rgba(255, 255, 255, 0.08),
      transparent
    );
    ${styled.css`animation: ${shimmer} 3s infinite;`}
    pointer-events: none;
    z-index: 0;
  }
  
  & > * {
    position: relative;
    z-index: 1;
  }
`;
const LoaderContainer = styled__default.default(designSystem.Flex)`
  min-height: 400px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 16px;
`;
const LicenseDetailsPage = () => {
  const { get } = admin.useFetchClient();
  const { toggleNotification } = admin.useNotification();
  const [loading, setLoading] = React.useState(true);
  const [licenseData, setLicenseData] = React.useState(null);
  const [error, setError] = React.useState(null);
  const fetchLicenseStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await get("/magic-mail/license/status");
      setLicenseData(response.data);
    } catch (err) {
      console.error("[MagicMail] Error fetching license:", err);
      setError("Failed to load license information");
    } finally {
      setLoading(false);
    }
  };
  const handleCopyLicenseKey = async () => {
    try {
      await navigator.clipboard.writeText(licenseData?.data?.licenseKey || "");
      toggleNotification({
        type: "success",
        message: "License key copied to clipboard!"
      });
    } catch (err) {
      toggleNotification({
        type: "danger",
        message: "Failed to copy license key"
      });
    }
  };
  const handleDownloadLicenseKey = () => {
    try {
      const data2 = licenseData?.data || {};
      const licenseKey = data2.licenseKey || "";
      const email = data2.email || "N/A";
      const firstName = data2.firstName || "";
      const lastName = data2.lastName || "";
      const fullName = `${firstName} ${lastName}`.trim() || "N/A";
      const content = `MagicMail - Email Business Suite - License Key
===============================================

License Key: ${licenseKey}

License Holder Information:
----------------------------------------------
Name:        ${fullName}
Email:       ${email}

License Status:
----------------------------------------------
Status:      ${data2.isActive ? "ACTIVE" : "INACTIVE"}
Expires:     ${data2.expiresAt ? new Date(data2.expiresAt).toLocaleDateString() : "Never"}

Features:
----------------------------------------------
Premium:     ${data2.features?.premium ? "Enabled" : "Disabled"}
Advanced:    ${data2.features?.advanced ? "Enabled" : "Disabled"}
Enterprise:  ${data2.features?.enterprise ? "Enabled" : "Disabled"}

===============================================
Generated:   ${(/* @__PURE__ */ new Date()).toLocaleString()}
`;
      const blob = new Blob([content], { type: "text/plain" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `magicmail-license-${licenseKey.substring(0, 8)}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toggleNotification({
        type: "success",
        message: "License key downloaded successfully!"
      });
    } catch (err) {
      toggleNotification({
        type: "danger",
        message: "Failed to download license key"
      });
    }
  };
  React.useEffect(() => {
    fetchLicenseStatus();
  }, []);
  if (loading) {
    return /* @__PURE__ */ jsxRuntime.jsx(Container, { children: /* @__PURE__ */ jsxRuntime.jsx(LoaderContainer, { children: /* @__PURE__ */ jsxRuntime.jsx(designSystem.Loader, { children: "Loading license information..." }) }) });
  }
  if (error) {
    return /* @__PURE__ */ jsxRuntime.jsx(Container, { children: /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { padding: 8, children: /* @__PURE__ */ jsxRuntime.jsx(designSystem.Alert, { variant: "danger", title: "Error", closeLabel: "Close", children: error }) }) });
  }
  const isValid = licenseData?.valid;
  const isDemo = licenseData?.demo;
  const data = licenseData?.data || {};
  return /* @__PURE__ */ jsxRuntime.jsxs(Container, { children: [
    /* @__PURE__ */ jsxRuntime.jsx(StickySaveBar, { paddingTop: 5, paddingBottom: 5, paddingLeft: 6, paddingRight: 6, children: /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { justifyContent: "space-between", alignItems: "flex-start", children: [
      /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { direction: "column", gap: 1, alignItems: "flex-start", children: [
        /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "alpha", fontWeight: "bold", children: "License Management" }),
        /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "epsilon", textColor: "neutral600", children: "View your MagicMail plugin license" })
      ] }),
      /* @__PURE__ */ jsxRuntime.jsx(
        StyledButtons.SecondaryButton,
        {
          startIcon: /* @__PURE__ */ jsxRuntime.jsx(outline.ArrowPathIcon, { style: { width: 18, height: 18 } }),
          onClick: fetchLicenseStatus,
          children: "Refresh Status"
        }
      )
    ] }) }),
    /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { paddingTop: 6, paddingLeft: 6, paddingRight: 6, paddingBottom: 10, children: [
      isDemo ? /* @__PURE__ */ jsxRuntime.jsx(designSystem.Alert, { variant: "warning", title: "Demo Mode", closeLabel: "Close", children: "You're using the demo version. Create a license to unlock all features." }) : isValid ? /* @__PURE__ */ jsxRuntime.jsx(designSystem.Alert, { variant: "success", title: "License Active", closeLabel: "Close", children: "Your license is active and all features are unlocked." }) : /* @__PURE__ */ jsxRuntime.jsx(designSystem.Alert, { variant: "danger", title: "License Issue", closeLabel: "Close", children: "There's an issue with your license. Please check your license status." }),
      data.licenseKey && /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { marginTop: 6, children: /* @__PURE__ */ jsxRuntime.jsx(LicenseKeyBanner, { children: /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { justifyContent: "space-between", alignItems: "flex-start", children: [
        /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { style: { flex: 1 }, children: [
          /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "pi", style: { color: "rgba(255,255,255,0.8)", marginBottom: "12px", textTransform: "uppercase", fontSize: "11px", letterSpacing: "0.5px", display: "block" }, children: "License Key" }),
          /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { style: { color: "white", fontFamily: "monospace", fontSize: "28px", fontWeight: "bold", wordBreak: "break-all", marginBottom: "16px" }, children: data.licenseKey }),
          /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { gap: 2, children: [
            /* @__PURE__ */ jsxRuntime.jsx(
              StyledButtons.WhiteOutlineButton,
              {
                onClick: handleCopyLicenseKey,
                startIcon: /* @__PURE__ */ jsxRuntime.jsx(outline.DocumentDuplicateIcon, { style: { width: 16, height: 16 } }),
                size: "S",
                children: "Copy Key"
              }
            ),
            /* @__PURE__ */ jsxRuntime.jsx(
              StyledButtons.WhiteOutlineButton,
              {
                onClick: handleDownloadLicenseKey,
                startIcon: /* @__PURE__ */ jsxRuntime.jsx(outline.ArrowDownTrayIcon, { style: { width: 16, height: 16 } }),
                size: "S",
                children: "Download as TXT"
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntime.jsx(
          designSystem.Badge,
          {
            backgroundColor: data.isActive ? "success100" : "danger100",
            textColor: data.isActive ? "success700" : "danger700",
            style: { fontSize: "11px", fontWeight: "700", padding: "6px 12px", marginLeft: "16px", flexShrink: 0 },
            children: data.isActive ? "ACTIVE" : "INACTIVE"
          }
        )
      ] }) }) }),
      /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { marginTop: 6, children: /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Accordion.Root, { defaultValue: "account", collapsible: true, children: [
        /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Accordion.Item, { value: "account", children: [
          /* @__PURE__ */ jsxRuntime.jsx(designSystem.Accordion.Header, { children: /* @__PURE__ */ jsxRuntime.jsx(designSystem.Accordion.Trigger, { icon: () => /* @__PURE__ */ jsxRuntime.jsx(outline.UserIcon, { style: { width: 16, height: 16 } }), children: "Account Information" }) }),
          /* @__PURE__ */ jsxRuntime.jsx(designSystem.Accordion.Content, { children: /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { padding: 6, children: /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { gap: 8, wrap: "wrap", children: [
            /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { style: { flex: "1", minWidth: "200px" }, children: [
              /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "sigma", textColor: "neutral600", textTransform: "uppercase", style: { marginBottom: "8px", display: "block" }, children: "Email Address" }),
              /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "omega", fontWeight: "semiBold", children: data.email || "Not provided" })
            ] }),
            /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { style: { flex: "1", minWidth: "200px" }, children: [
              /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "sigma", textColor: "neutral600", textTransform: "uppercase", style: { marginBottom: "8px", display: "block" }, children: "License Holder" }),
              /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "omega", fontWeight: "semiBold", children: data.firstName && data.lastName ? `${data.firstName} ${data.lastName}` : "Not specified" })
            ] })
          ] }) }) })
        ] }),
        /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Accordion.Item, { value: "details", children: [
          /* @__PURE__ */ jsxRuntime.jsx(designSystem.Accordion.Header, { children: /* @__PURE__ */ jsxRuntime.jsx(designSystem.Accordion.Trigger, { icon: () => /* @__PURE__ */ jsxRuntime.jsx(outline.ShieldCheckIcon, { style: { width: 16, height: 16 } }), children: "License Details" }) }),
          /* @__PURE__ */ jsxRuntime.jsx(designSystem.Accordion.Content, { children: /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { padding: 6, children: /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { gap: 8, wrap: "wrap", children: [
            /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { style: { flex: "1", minWidth: "180px" }, children: [
              /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "sigma", textColor: "neutral600", textTransform: "uppercase", style: { marginBottom: "8px", display: "block" }, children: data.isExpired ? "Expired On" : "Expires On" }),
              /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "omega", fontWeight: "semiBold", children: data.expiresAt ? new Date(data.expiresAt).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric"
              }) : "Never" })
            ] }),
            /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { style: { flex: "1", minWidth: "180px" }, children: [
              /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "sigma", textColor: "neutral600", textTransform: "uppercase", style: { marginBottom: "8px", display: "block" }, children: "Device Name" }),
              /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "omega", fontWeight: "semiBold", children: data.deviceName || "Unknown" })
            ] }),
            /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { style: { flex: "1", minWidth: "180px" }, children: [
              /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "sigma", textColor: "neutral600", textTransform: "uppercase", style: { marginBottom: "8px", display: "block" }, children: "IP Address" }),
              /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "omega", fontWeight: "semiBold", children: data.ipAddress || "Not detected" })
            ] })
          ] }) }) })
        ] }),
        /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Accordion.Item, { value: "features", children: [
          /* @__PURE__ */ jsxRuntime.jsx(designSystem.Accordion.Header, { children: /* @__PURE__ */ jsxRuntime.jsx(designSystem.Accordion.Trigger, { icon: () => /* @__PURE__ */ jsxRuntime.jsx(outline.SparklesIcon, { style: { width: 16, height: 16 } }), children: "Features & Capabilities" }) }),
          /* @__PURE__ */ jsxRuntime.jsx(designSystem.Accordion.Content, { children: /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { padding: 6, children: [
            /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { gap: 3, style: { marginBottom: "32px" }, children: [
              /* @__PURE__ */ jsxRuntime.jsxs(
                designSystem.Badge,
                {
                  backgroundColor: data.features?.premium ? "success100" : "neutral100",
                  textColor: data.features?.premium ? "success700" : "neutral600",
                  style: { fontSize: "13px", fontWeight: "700", padding: "8px 16px" },
                  children: [
                    data.features?.premium ? "[OK]" : "[X]",
                    " PREMIUM"
                  ]
                }
              ),
              /* @__PURE__ */ jsxRuntime.jsxs(
                designSystem.Badge,
                {
                  backgroundColor: data.features?.advanced ? "primary100" : "neutral100",
                  textColor: data.features?.advanced ? "primary700" : "neutral600",
                  style: { fontSize: "13px", fontWeight: "700", padding: "8px 16px" },
                  children: [
                    data.features?.advanced ? "[OK]" : "[X]",
                    " ADVANCED"
                  ]
                }
              ),
              /* @__PURE__ */ jsxRuntime.jsxs(
                designSystem.Badge,
                {
                  backgroundColor: data.features?.enterprise ? "secondary100" : "neutral100",
                  textColor: data.features?.enterprise ? "secondary700" : "neutral600",
                  style: { fontSize: "13px", fontWeight: "700", padding: "8px 16px" },
                  children: [
                    data.features?.enterprise ? "[OK]" : "[X]",
                    " ENTERPRISE"
                  ]
                }
              )
            ] }),
            data.features?.premium && /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { marginBottom: 5, padding: 5, background: "success50", hasRadius: true, children: [
              /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "delta", fontWeight: "bold", textColor: "success700", style: { marginBottom: "16px" }, children: "Premium Features Active" }),
              /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { direction: "column", gap: 2, children: [
                /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "omega", textColor: "success700", children: "[OK] Gmail OAuth 2.0" }),
                /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "omega", textColor: "success700", children: "[OK] Microsoft 365 OAuth" }),
                /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "omega", textColor: "success700", children: "[OK] Smart Routing Rules" }),
                /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "omega", textColor: "success700", children: "[OK] Email Analytics" })
              ] })
            ] }),
            data.features?.advanced && /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { marginBottom: 5, padding: 5, background: "primary50", hasRadius: true, children: [
              /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "delta", fontWeight: "bold", textColor: "primary700", style: { marginBottom: "16px" }, children: "Advanced Features Active" }),
              /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { direction: "column", gap: 2, children: [
                /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "omega", textColor: "primary700", children: "[OK] DKIM Signing" }),
                /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "omega", textColor: "primary700", children: "[OK] Email Designer" }),
                /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "omega", textColor: "primary700", children: "[OK] List-Unsubscribe Headers" })
              ] })
            ] }),
            data.features?.enterprise && /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { padding: 5, background: "secondary50", hasRadius: true, children: [
              /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "delta", fontWeight: "bold", textColor: "secondary700", style: { marginBottom: "16px" }, children: "Enterprise Features Active" }),
              /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { direction: "column", gap: 2, children: [
                /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "omega", textColor: "secondary700", children: "[OK] Multi-tenant Management" }),
                /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "omega", textColor: "secondary700", children: "[OK] Compliance Reports" }),
                /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "omega", textColor: "secondary700", children: "[OK] Priority Support" })
              ] })
            ] })
          ] }) })
        ] }),
        /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Accordion.Item, { value: "status", children: [
          /* @__PURE__ */ jsxRuntime.jsx(designSystem.Accordion.Header, { children: /* @__PURE__ */ jsxRuntime.jsx(designSystem.Accordion.Trigger, { icon: () => /* @__PURE__ */ jsxRuntime.jsx(outline.ChartBarIcon, { style: { width: 16, height: 16 } }), children: "System Status" }) }),
          /* @__PURE__ */ jsxRuntime.jsx(designSystem.Accordion.Content, { children: /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { padding: 6, children: /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { gap: 8, wrap: "wrap", children: [
            /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { style: { flex: "1", minWidth: "150px" }, children: [
              /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "sigma", textColor: "neutral600", textTransform: "uppercase", style: { marginBottom: "8px", display: "block" }, children: "License Status" }),
              /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "omega", fontWeight: "semiBold", children: data.isActive ? "Active" : "Inactive" })
            ] }),
            /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { style: { flex: "1", minWidth: "150px" }, children: [
              /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "sigma", textColor: "neutral600", textTransform: "uppercase", style: { marginBottom: "8px", display: "block" }, children: "Connection" }),
              /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "omega", fontWeight: "semiBold", children: data.isOnline ? "Online" : "Offline" })
            ] }),
            /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { style: { flex: "1", minWidth: "150px" }, children: [
              /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "sigma", textColor: "neutral600", textTransform: "uppercase", style: { marginBottom: "8px", display: "block" }, children: "Last Sync" }),
              /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "omega", fontWeight: "semiBold", children: data.lastPingAt ? new Date(data.lastPingAt).toLocaleTimeString() : "Never" })
            ] }),
            /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { style: { flex: "1", minWidth: "150px" }, children: [
              /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "sigma", textColor: "neutral600", textTransform: "uppercase", style: { marginBottom: "8px", display: "block" }, children: "Device Limit" }),
              /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Typography, { variant: "omega", fontWeight: "semiBold", children: [
                data.currentDevices || 0,
                " / ",
                data.maxDevices || 1
              ] })
            ] })
          ] }) }) })
        ] })
      ] }) })
    ] })
  ] });
};
exports.default = LicenseDetailsPage;

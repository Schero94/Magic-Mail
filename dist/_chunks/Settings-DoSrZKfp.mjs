import { jsx, jsxs } from "react/jsx-runtime";
import { useState, useEffect } from "react";
import { Loader, Box, Alert, Flex, Typography, Badge, Accordion } from "@strapi/design-system";
import { useFetchClient, useNotification } from "@strapi/strapi/admin";
import { ArrowPathIcon, DocumentDuplicateIcon, ArrowDownTrayIcon, UserIcon, ShieldCheckIcon, SparklesIcon, ChartBarIcon } from "@heroicons/react/24/outline";
import styled, { css, keyframes } from "styled-components";
import { S as SecondaryButton, W as WhiteOutlineButton } from "./StyledButtons-CdOf4Sps.mjs";
const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
`;
const shimmer = keyframes`
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
`;
const Container = styled(Box)`
  ${css`animation: ${fadeIn} 0.5s;`}
  max-width: 1400px;
  margin: 0 auto;
`;
const StickySaveBar = styled(Box)`
  position: sticky;
  top: 0;
  z-index: 10;
  background: ${(p) => p.theme.colors.neutral0};
  border-bottom: 1px solid rgba(128, 128, 128, 0.2);
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
`;
const LicenseKeyBanner = styled(Box)`
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
    ${css`animation: ${shimmer} 3s infinite;`}
    pointer-events: none;
    z-index: 0;
  }
  
  & > * {
    position: relative;
    z-index: 1;
  }
`;
const LoaderContainer = styled(Flex)`
  min-height: 400px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 16px;
`;
const LicenseDetailsPage = () => {
  const { get } = useFetchClient();
  const { toggleNotification } = useNotification();
  const [loading, setLoading] = useState(true);
  const [licenseData, setLicenseData] = useState(null);
  const [error, setError] = useState(null);
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
  useEffect(() => {
    fetchLicenseStatus();
  }, []);
  if (loading) {
    return /* @__PURE__ */ jsx(Container, { children: /* @__PURE__ */ jsx(LoaderContainer, { children: /* @__PURE__ */ jsx(Loader, { children: "Loading license information..." }) }) });
  }
  if (error) {
    return /* @__PURE__ */ jsx(Container, { children: /* @__PURE__ */ jsx(Box, { padding: 8, children: /* @__PURE__ */ jsx(Alert, { variant: "danger", title: "Error", closeLabel: "Close", children: error }) }) });
  }
  const isValid = licenseData?.valid;
  const isDemo = licenseData?.demo;
  const data = licenseData?.data || {};
  return /* @__PURE__ */ jsxs(Container, { children: [
    /* @__PURE__ */ jsx(StickySaveBar, { paddingTop: 5, paddingBottom: 5, paddingLeft: 6, paddingRight: 6, children: /* @__PURE__ */ jsxs(Flex, { justifyContent: "space-between", alignItems: "flex-start", children: [
      /* @__PURE__ */ jsxs(Flex, { direction: "column", gap: 1, alignItems: "flex-start", children: [
        /* @__PURE__ */ jsx(Typography, { variant: "alpha", fontWeight: "bold", children: "License Management" }),
        /* @__PURE__ */ jsx(Typography, { variant: "epsilon", textColor: "neutral600", children: "View your MagicMail plugin license" })
      ] }),
      /* @__PURE__ */ jsx(
        SecondaryButton,
        {
          startIcon: /* @__PURE__ */ jsx(ArrowPathIcon, { style: { width: 18, height: 18 } }),
          onClick: fetchLicenseStatus,
          children: "Refresh Status"
        }
      )
    ] }) }),
    /* @__PURE__ */ jsxs(Box, { paddingTop: 6, paddingLeft: 6, paddingRight: 6, paddingBottom: 10, children: [
      isDemo ? /* @__PURE__ */ jsx(Alert, { variant: "warning", title: "Demo Mode", closeLabel: "Close", children: "You're using the demo version. Create a license to unlock all features." }) : isValid ? /* @__PURE__ */ jsx(Alert, { variant: "success", title: "License Active", closeLabel: "Close", children: "Your license is active and all features are unlocked." }) : /* @__PURE__ */ jsx(Alert, { variant: "danger", title: "License Issue", closeLabel: "Close", children: "There's an issue with your license. Please check your license status." }),
      data.licenseKey && /* @__PURE__ */ jsx(Box, { marginTop: 6, children: /* @__PURE__ */ jsx(LicenseKeyBanner, { children: /* @__PURE__ */ jsxs(Flex, { justifyContent: "space-between", alignItems: "flex-start", children: [
        /* @__PURE__ */ jsxs(Box, { style: { flex: 1 }, children: [
          /* @__PURE__ */ jsx(Typography, { variant: "pi", style: { color: "rgba(255,255,255,0.8)", marginBottom: "12px", textTransform: "uppercase", fontSize: "11px", letterSpacing: "0.5px", display: "block" }, children: "License Key" }),
          /* @__PURE__ */ jsx(Typography, { style: { color: "white", fontFamily: "monospace", fontSize: "28px", fontWeight: "bold", wordBreak: "break-all", marginBottom: "16px" }, children: data.licenseKey }),
          /* @__PURE__ */ jsxs(Flex, { gap: 2, children: [
            /* @__PURE__ */ jsx(
              WhiteOutlineButton,
              {
                onClick: handleCopyLicenseKey,
                startIcon: /* @__PURE__ */ jsx(DocumentDuplicateIcon, { style: { width: 16, height: 16 } }),
                size: "S",
                children: "Copy Key"
              }
            ),
            /* @__PURE__ */ jsx(
              WhiteOutlineButton,
              {
                onClick: handleDownloadLicenseKey,
                startIcon: /* @__PURE__ */ jsx(ArrowDownTrayIcon, { style: { width: 16, height: 16 } }),
                size: "S",
                children: "Download as TXT"
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsx(
          Badge,
          {
            backgroundColor: data.isActive ? "success100" : "danger100",
            textColor: data.isActive ? "success700" : "danger700",
            style: { fontSize: "11px", fontWeight: "700", padding: "6px 12px", marginLeft: "16px", flexShrink: 0 },
            children: data.isActive ? "ACTIVE" : "INACTIVE"
          }
        )
      ] }) }) }),
      /* @__PURE__ */ jsx(Box, { marginTop: 6, children: /* @__PURE__ */ jsxs(Accordion.Root, { defaultValue: "account", collapsible: true, children: [
        /* @__PURE__ */ jsxs(Accordion.Item, { value: "account", children: [
          /* @__PURE__ */ jsx(Accordion.Header, { children: /* @__PURE__ */ jsx(Accordion.Trigger, { icon: () => /* @__PURE__ */ jsx(UserIcon, { style: { width: 16, height: 16 } }), children: "Account Information" }) }),
          /* @__PURE__ */ jsx(Accordion.Content, { children: /* @__PURE__ */ jsx(Box, { padding: 6, children: /* @__PURE__ */ jsxs(Flex, { gap: 8, wrap: "wrap", children: [
            /* @__PURE__ */ jsxs(Box, { style: { flex: "1", minWidth: "200px" }, children: [
              /* @__PURE__ */ jsx(Typography, { variant: "sigma", textColor: "neutral600", textTransform: "uppercase", style: { marginBottom: "8px", display: "block" }, children: "Email Address" }),
              /* @__PURE__ */ jsx(Typography, { variant: "omega", fontWeight: "semiBold", children: data.email || "Not provided" })
            ] }),
            /* @__PURE__ */ jsxs(Box, { style: { flex: "1", minWidth: "200px" }, children: [
              /* @__PURE__ */ jsx(Typography, { variant: "sigma", textColor: "neutral600", textTransform: "uppercase", style: { marginBottom: "8px", display: "block" }, children: "License Holder" }),
              /* @__PURE__ */ jsx(Typography, { variant: "omega", fontWeight: "semiBold", children: data.firstName && data.lastName ? `${data.firstName} ${data.lastName}` : "Not specified" })
            ] })
          ] }) }) })
        ] }),
        /* @__PURE__ */ jsxs(Accordion.Item, { value: "details", children: [
          /* @__PURE__ */ jsx(Accordion.Header, { children: /* @__PURE__ */ jsx(Accordion.Trigger, { icon: () => /* @__PURE__ */ jsx(ShieldCheckIcon, { style: { width: 16, height: 16 } }), children: "License Details" }) }),
          /* @__PURE__ */ jsx(Accordion.Content, { children: /* @__PURE__ */ jsx(Box, { padding: 6, children: /* @__PURE__ */ jsxs(Flex, { gap: 8, wrap: "wrap", children: [
            /* @__PURE__ */ jsxs(Box, { style: { flex: "1", minWidth: "180px" }, children: [
              /* @__PURE__ */ jsx(Typography, { variant: "sigma", textColor: "neutral600", textTransform: "uppercase", style: { marginBottom: "8px", display: "block" }, children: data.isExpired ? "Expired On" : "Expires On" }),
              /* @__PURE__ */ jsx(Typography, { variant: "omega", fontWeight: "semiBold", children: data.expiresAt ? new Date(data.expiresAt).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric"
              }) : "Never" })
            ] }),
            /* @__PURE__ */ jsxs(Box, { style: { flex: "1", minWidth: "180px" }, children: [
              /* @__PURE__ */ jsx(Typography, { variant: "sigma", textColor: "neutral600", textTransform: "uppercase", style: { marginBottom: "8px", display: "block" }, children: "Device Name" }),
              /* @__PURE__ */ jsx(Typography, { variant: "omega", fontWeight: "semiBold", children: data.deviceName || "Unknown" })
            ] }),
            /* @__PURE__ */ jsxs(Box, { style: { flex: "1", minWidth: "180px" }, children: [
              /* @__PURE__ */ jsx(Typography, { variant: "sigma", textColor: "neutral600", textTransform: "uppercase", style: { marginBottom: "8px", display: "block" }, children: "IP Address" }),
              /* @__PURE__ */ jsx(Typography, { variant: "omega", fontWeight: "semiBold", children: data.ipAddress || "Not detected" })
            ] })
          ] }) }) })
        ] }),
        /* @__PURE__ */ jsxs(Accordion.Item, { value: "features", children: [
          /* @__PURE__ */ jsx(Accordion.Header, { children: /* @__PURE__ */ jsx(Accordion.Trigger, { icon: () => /* @__PURE__ */ jsx(SparklesIcon, { style: { width: 16, height: 16 } }), children: "Features & Capabilities" }) }),
          /* @__PURE__ */ jsx(Accordion.Content, { children: /* @__PURE__ */ jsxs(Box, { padding: 6, children: [
            /* @__PURE__ */ jsxs(Flex, { gap: 3, style: { marginBottom: "32px" }, children: [
              /* @__PURE__ */ jsxs(
                Badge,
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
              /* @__PURE__ */ jsxs(
                Badge,
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
              /* @__PURE__ */ jsxs(
                Badge,
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
            data.features?.premium && /* @__PURE__ */ jsxs(Box, { marginBottom: 5, padding: 5, background: "success50", hasRadius: true, children: [
              /* @__PURE__ */ jsx(Typography, { variant: "delta", fontWeight: "bold", textColor: "success700", style: { marginBottom: "16px" }, children: "Premium Features Active" }),
              /* @__PURE__ */ jsxs(Flex, { direction: "column", gap: 2, children: [
                /* @__PURE__ */ jsx(Typography, { variant: "omega", textColor: "success700", children: "[OK] Gmail OAuth 2.0" }),
                /* @__PURE__ */ jsx(Typography, { variant: "omega", textColor: "success700", children: "[OK] Microsoft 365 OAuth" }),
                /* @__PURE__ */ jsx(Typography, { variant: "omega", textColor: "success700", children: "[OK] Smart Routing Rules" }),
                /* @__PURE__ */ jsx(Typography, { variant: "omega", textColor: "success700", children: "[OK] Email Analytics" })
              ] })
            ] }),
            data.features?.advanced && /* @__PURE__ */ jsxs(Box, { marginBottom: 5, padding: 5, background: "primary50", hasRadius: true, children: [
              /* @__PURE__ */ jsx(Typography, { variant: "delta", fontWeight: "bold", textColor: "primary700", style: { marginBottom: "16px" }, children: "Advanced Features Active" }),
              /* @__PURE__ */ jsxs(Flex, { direction: "column", gap: 2, children: [
                /* @__PURE__ */ jsx(Typography, { variant: "omega", textColor: "primary700", children: "[OK] DKIM Signing" }),
                /* @__PURE__ */ jsx(Typography, { variant: "omega", textColor: "primary700", children: "[OK] Email Designer" }),
                /* @__PURE__ */ jsx(Typography, { variant: "omega", textColor: "primary700", children: "[OK] List-Unsubscribe Headers" })
              ] })
            ] }),
            data.features?.enterprise && /* @__PURE__ */ jsxs(Box, { padding: 5, background: "secondary50", hasRadius: true, children: [
              /* @__PURE__ */ jsx(Typography, { variant: "delta", fontWeight: "bold", textColor: "secondary700", style: { marginBottom: "16px" }, children: "Enterprise Features Active" }),
              /* @__PURE__ */ jsxs(Flex, { direction: "column", gap: 2, children: [
                /* @__PURE__ */ jsx(Typography, { variant: "omega", textColor: "secondary700", children: "[OK] Multi-tenant Management" }),
                /* @__PURE__ */ jsx(Typography, { variant: "omega", textColor: "secondary700", children: "[OK] Compliance Reports" }),
                /* @__PURE__ */ jsx(Typography, { variant: "omega", textColor: "secondary700", children: "[OK] Priority Support" })
              ] })
            ] })
          ] }) })
        ] }),
        /* @__PURE__ */ jsxs(Accordion.Item, { value: "status", children: [
          /* @__PURE__ */ jsx(Accordion.Header, { children: /* @__PURE__ */ jsx(Accordion.Trigger, { icon: () => /* @__PURE__ */ jsx(ChartBarIcon, { style: { width: 16, height: 16 } }), children: "System Status" }) }),
          /* @__PURE__ */ jsx(Accordion.Content, { children: /* @__PURE__ */ jsx(Box, { padding: 6, children: /* @__PURE__ */ jsxs(Flex, { gap: 8, wrap: "wrap", children: [
            /* @__PURE__ */ jsxs(Box, { style: { flex: "1", minWidth: "150px" }, children: [
              /* @__PURE__ */ jsx(Typography, { variant: "sigma", textColor: "neutral600", textTransform: "uppercase", style: { marginBottom: "8px", display: "block" }, children: "License Status" }),
              /* @__PURE__ */ jsx(Typography, { variant: "omega", fontWeight: "semiBold", children: data.isActive ? "Active" : "Inactive" })
            ] }),
            /* @__PURE__ */ jsxs(Box, { style: { flex: "1", minWidth: "150px" }, children: [
              /* @__PURE__ */ jsx(Typography, { variant: "sigma", textColor: "neutral600", textTransform: "uppercase", style: { marginBottom: "8px", display: "block" }, children: "Connection" }),
              /* @__PURE__ */ jsx(Typography, { variant: "omega", fontWeight: "semiBold", children: data.isOnline ? "Online" : "Offline" })
            ] }),
            /* @__PURE__ */ jsxs(Box, { style: { flex: "1", minWidth: "150px" }, children: [
              /* @__PURE__ */ jsx(Typography, { variant: "sigma", textColor: "neutral600", textTransform: "uppercase", style: { marginBottom: "8px", display: "block" }, children: "Last Sync" }),
              /* @__PURE__ */ jsx(Typography, { variant: "omega", fontWeight: "semiBold", children: data.lastPingAt ? new Date(data.lastPingAt).toLocaleTimeString() : "Never" })
            ] }),
            /* @__PURE__ */ jsxs(Box, { style: { flex: "1", minWidth: "150px" }, children: [
              /* @__PURE__ */ jsx(Typography, { variant: "sigma", textColor: "neutral600", textTransform: "uppercase", style: { marginBottom: "8px", display: "block" }, children: "Device Limit" }),
              /* @__PURE__ */ jsxs(Typography, { variant: "omega", fontWeight: "semiBold", children: [
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
export {
  LicenseDetailsPage as default
};

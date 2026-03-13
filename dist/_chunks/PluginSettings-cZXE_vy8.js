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
const PageContainer = styled__default.default(designSystem.Box)`
  ${styled.css`animation: ${fadeIn} 0.4s ease-out;`}
  max-width: 900px;
  margin: 0 auto;
  padding: 40px 32px;
`;
const PageHeader = styled__default.default(designSystem.Flex)`
  margin-bottom: 32px;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
`;
const PageTitle = styled__default.default(designSystem.Typography)`
  font-size: 28px;
  font-weight: 700;
  color: var(--colors-neutral800);
  display: block;
`;
const PageSubtitle = styled__default.default(designSystem.Typography)`
  font-size: 14px;
  color: var(--colors-neutral600);
  display: block;
`;
const ActionBar = styled__default.default(designSystem.Flex)`
  margin-bottom: 32px;
  padding: 16px 20px;
  background: ${(p) => p.theme.colors.neutral0};
  border: 1px solid rgba(128, 128, 128, 0.2);
  border-radius: 8px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
`;
const SettingsSection = styled__default.default(designSystem.Box)`
  background: ${(p) => p.theme.colors.neutral0};
  border: 1px solid rgba(128, 128, 128, 0.2);
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 24px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
`;
const SectionHeader = styled__default.default(designSystem.Flex)`
  padding: 20px 24px;
  background: var(--colors-neutral100);
  border-bottom: 1px solid rgba(128, 128, 128, 0.2);
`;
const SectionIcon = styled__default.default(designSystem.Box)`
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 16px;
  background: ${(props) => props.bgColor || "rgba(14, 165, 233, 0.12)"};
  flex-shrink: 0;
`;
const SectionContent = styled__default.default(designSystem.Box)`
  padding: 24px;
`;
const SettingRow = styled__default.default(designSystem.Flex)`
  padding: 16px 0;
  border-bottom: 1px solid rgba(128, 128, 128, 0.15);
  
  &:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }
  
  &:first-child {
    padding-top: 0;
  }
`;
const SettingInfo = styled__default.default(designSystem.Flex)`
  flex: 1;
  padding-right: 24px;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
`;
const SettingLabel = styled__default.default(designSystem.Typography)`
  font-size: 14px;
  font-weight: 600;
  color: var(--colors-neutral800);
  display: block;
`;
const SettingDescription = styled__default.default(designSystem.Typography)`
  font-size: 13px;
  color: var(--colors-neutral500);
  line-height: 1.5;
  display: block;
`;
const ToggleWrapper = styled__default.default(designSystem.Box)`
  flex-shrink: 0;
  display: flex;
  align-items: center;
`;
const LoaderContainer = styled__default.default(designSystem.Flex)`
  min-height: 400px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 16px;
`;
const InfoBox = styled__default.default(designSystem.Box)`
  background: rgba(14, 165, 233, 0.08);
  border: 1px solid rgba(14, 165, 233, 0.3);
  border-radius: 8px;
  padding: 12px 16px;
  margin-top: 16px;
`;
const CodeSnippet = styled__default.default.code`
  background: #1E293B;
  color: rgba(128, 128, 128, 0.3);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-family: 'Monaco', 'Menlo', monospace;
`;
const PluginSettingsPage = () => {
  const { get, put } = admin.useFetchClient();
  const { toggleNotification } = admin.useNotification();
  const [loading, setLoading] = React.useState(true);
  const [settings, setSettings] = React.useState({
    enableLinkTracking: true,
    enableOpenTracking: true,
    trackingBaseUrl: "",
    defaultFromName: "",
    defaultFromEmail: "",
    unsubscribeUrl: "",
    enableUnsubscribeHeader: true
  });
  const [hasChanges, setHasChanges] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const fetchSettings = async () => {
    setLoading(true);
    try {
      const response = await get("/magic-mail/settings");
      if (response.data?.data) {
        setSettings({
          enableLinkTracking: response.data.data.enableLinkTracking ?? true,
          enableOpenTracking: response.data.data.enableOpenTracking ?? true,
          trackingBaseUrl: response.data.data.trackingBaseUrl || "",
          defaultFromName: response.data.data.defaultFromName || "",
          defaultFromEmail: response.data.data.defaultFromEmail || "",
          unsubscribeUrl: response.data.data.unsubscribeUrl || "",
          enableUnsubscribeHeader: response.data.data.enableUnsubscribeHeader ?? true
        });
        setHasChanges(false);
      }
    } catch (err) {
      console.error("[MagicMail] Error fetching settings:", err);
      toggleNotification({
        type: "danger",
        message: "Failed to load settings"
      });
    } finally {
      setLoading(false);
    }
  };
  const saveSettings = async () => {
    setSaving(true);
    try {
      await put("/magic-mail/settings", settings);
      toggleNotification({
        type: "success",
        message: "Settings saved successfully!"
      });
      setHasChanges(false);
    } catch (err) {
      console.error("[MagicMail] Error saving settings:", err);
      toggleNotification({
        type: "danger",
        message: "Failed to save settings"
      });
    } finally {
      setSaving(false);
    }
  };
  const handleChange = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };
  React.useEffect(() => {
    fetchSettings();
  }, []);
  if (loading) {
    return /* @__PURE__ */ jsxRuntime.jsx(PageContainer, { children: /* @__PURE__ */ jsxRuntime.jsx(LoaderContainer, { children: /* @__PURE__ */ jsxRuntime.jsx(designSystem.Loader, { children: "Loading settings..." }) }) });
  }
  return /* @__PURE__ */ jsxRuntime.jsxs(PageContainer, { children: [
    /* @__PURE__ */ jsxRuntime.jsxs(PageHeader, { children: [
      /* @__PURE__ */ jsxRuntime.jsx(PageTitle, { children: "Plugin Settings" }),
      /* @__PURE__ */ jsxRuntime.jsx(PageSubtitle, { children: "Configure email tracking, analytics, and default sender information" })
    ] }),
    /* @__PURE__ */ jsxRuntime.jsxs(ActionBar, { justifyContent: "space-between", alignItems: "center", children: [
      /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "omega", textColor: "neutral600", children: hasChanges ? "You have unsaved changes" : "All changes saved" }),
      /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { gap: 2, children: [
        /* @__PURE__ */ jsxRuntime.jsx(
          StyledButtons.TertiaryButton,
          {
            startIcon: /* @__PURE__ */ jsxRuntime.jsx(outline.ArrowPathIcon, { style: { width: 18, height: 18 } }),
            onClick: fetchSettings,
            children: "Refresh"
          }
        ),
        /* @__PURE__ */ jsxRuntime.jsx(
          StyledButtons.GradientButton,
          {
            onClick: saveSettings,
            loading: saving,
            disabled: !hasChanges,
            children: "Save Changes"
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntime.jsxs(SettingsSection, { children: [
      /* @__PURE__ */ jsxRuntime.jsxs(SectionHeader, { alignItems: "center", children: [
        /* @__PURE__ */ jsxRuntime.jsx(SectionIcon, { bgColor: "rgba(37, 99, 235, 0.15)", children: /* @__PURE__ */ jsxRuntime.jsx(outline.LinkIcon, { style: { width: 22, height: 22, color: "var(--colors-primary600, #2563EB)" } }) }),
        /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { direction: "column", alignItems: "flex-start", gap: 1, children: [
          /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "delta", fontWeight: "bold", children: "Link Tracking" }),
          /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "pi", textColor: "neutral600", children: "Track when recipients click links in your emails" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntime.jsxs(SectionContent, { children: [
        /* @__PURE__ */ jsxRuntime.jsxs(SettingRow, { alignItems: "center", children: [
          /* @__PURE__ */ jsxRuntime.jsxs(SettingInfo, { children: [
            /* @__PURE__ */ jsxRuntime.jsx(SettingLabel, { children: "Enable Link Tracking" }),
            /* @__PURE__ */ jsxRuntime.jsx(SettingDescription, { children: "Rewrite all links in outgoing emails to track click-through rates. This helps measure email engagement and campaign effectiveness." })
          ] }),
          /* @__PURE__ */ jsxRuntime.jsx(ToggleWrapper, { children: /* @__PURE__ */ jsxRuntime.jsx(
            designSystem.Toggle,
            {
              checked: settings.enableLinkTracking,
              onChange: (e) => handleChange("enableLinkTracking", e.target.checked)
            }
          ) })
        ] }),
        settings.enableLinkTracking && /* @__PURE__ */ jsxRuntime.jsxs(jsxRuntime.Fragment, { children: [
          /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { style: { marginTop: "20px" }, children: /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Field.Root, { children: [
            /* @__PURE__ */ jsxRuntime.jsx(designSystem.Field.Label, { children: "Tracking Base URL" }),
            /* @__PURE__ */ jsxRuntime.jsx(
              designSystem.TextInput,
              {
                placeholder: "https://api.yoursite.com",
                value: settings.trackingBaseUrl,
                onChange: (e) => handleChange("trackingBaseUrl", e.target.value),
                style: { marginTop: "8px" }
              }
            ),
            /* @__PURE__ */ jsxRuntime.jsx(designSystem.Field.Hint, { style: { marginTop: "8px" }, children: "The base URL for tracking links. Leave empty to use the server URL. Must be the public URL where your Strapi API is accessible." })
          ] }) }),
          /* @__PURE__ */ jsxRuntime.jsxs(InfoBox, { children: [
            /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "pi", textColor: "primary700", fontWeight: "medium", children: "Per-Email Override" }),
            /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Typography, { variant: "pi", textColor: "primary600", style: { marginTop: "4px" }, children: [
              "Disable tracking for sensitive emails (password resets, magic links) by passing",
              " ",
              /* @__PURE__ */ jsxRuntime.jsx(CodeSnippet, { children: "skipLinkTracking: true" }),
              " when sending."
            ] })
          ] })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntime.jsxs(SettingsSection, { children: [
      /* @__PURE__ */ jsxRuntime.jsxs(SectionHeader, { alignItems: "center", children: [
        /* @__PURE__ */ jsxRuntime.jsx(SectionIcon, { bgColor: "rgba(34, 197, 94, 0.15)", children: /* @__PURE__ */ jsxRuntime.jsx(outline.EyeIcon, { style: { width: 22, height: 22, color: "var(--colors-success600, #16A34A)" } }) }),
        /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { direction: "column", alignItems: "flex-start", gap: 1, children: [
          /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "delta", fontWeight: "bold", children: "Open Tracking" }),
          /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "pi", textColor: "neutral600", children: "Track when recipients open your emails" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntime.jsx(SectionContent, { children: /* @__PURE__ */ jsxRuntime.jsxs(SettingRow, { alignItems: "center", children: [
        /* @__PURE__ */ jsxRuntime.jsxs(SettingInfo, { children: [
          /* @__PURE__ */ jsxRuntime.jsx(SettingLabel, { children: "Enable Open Tracking" }),
          /* @__PURE__ */ jsxRuntime.jsx(SettingDescription, { children: "Inject an invisible tracking pixel into emails to detect when they are opened. Note: Some email clients block tracking pixels." })
        ] }),
        /* @__PURE__ */ jsxRuntime.jsx(ToggleWrapper, { children: /* @__PURE__ */ jsxRuntime.jsx(
          designSystem.Toggle,
          {
            checked: settings.enableOpenTracking,
            onChange: (e) => handleChange("enableOpenTracking", e.target.checked)
          }
        ) })
      ] }) })
    ] }),
    /* @__PURE__ */ jsxRuntime.jsxs(SettingsSection, { children: [
      /* @__PURE__ */ jsxRuntime.jsxs(SectionHeader, { alignItems: "center", children: [
        /* @__PURE__ */ jsxRuntime.jsx(SectionIcon, { bgColor: "rgba(245, 158, 11, 0.15)", children: /* @__PURE__ */ jsxRuntime.jsx(outline.EnvelopeIcon, { style: { width: 22, height: 22, color: "var(--colors-warning600, #D97706)" } }) }),
        /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { direction: "column", alignItems: "flex-start", gap: 1, children: [
          /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "delta", fontWeight: "bold", children: "Unsubscribe Settings" }),
          /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "pi", textColor: "neutral600", children: "GDPR-compliant List-Unsubscribe headers" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntime.jsxs(SectionContent, { children: [
        /* @__PURE__ */ jsxRuntime.jsxs(SettingRow, { alignItems: "center", children: [
          /* @__PURE__ */ jsxRuntime.jsxs(SettingInfo, { children: [
            /* @__PURE__ */ jsxRuntime.jsx(SettingLabel, { children: "Enable List-Unsubscribe Header" }),
            /* @__PURE__ */ jsxRuntime.jsx(SettingDescription, { children: 'Add RFC 8058 compliant unsubscribe headers. This enables the "Unsubscribe" button in email clients like Gmail and Outlook.' })
          ] }),
          /* @__PURE__ */ jsxRuntime.jsx(ToggleWrapper, { children: /* @__PURE__ */ jsxRuntime.jsx(
            designSystem.Toggle,
            {
              checked: settings.enableUnsubscribeHeader,
              onChange: (e) => handleChange("enableUnsubscribeHeader", e.target.checked)
            }
          ) })
        ] }),
        settings.enableUnsubscribeHeader && /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { style: { marginTop: "20px" }, children: /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Field.Root, { children: [
          /* @__PURE__ */ jsxRuntime.jsx(designSystem.Field.Label, { children: "Unsubscribe URL" }),
          /* @__PURE__ */ jsxRuntime.jsx(
            designSystem.TextInput,
            {
              placeholder: "https://yoursite.com/unsubscribe?email={{email}}",
              value: settings.unsubscribeUrl,
              onChange: (e) => handleChange("unsubscribeUrl", e.target.value),
              style: { marginTop: "8px" }
            }
          ),
          /* @__PURE__ */ jsxRuntime.jsx(designSystem.Field.Hint, { style: { marginTop: "8px" }, children: "The URL where users are directed when clicking unsubscribe. Leave empty to disable the header." })
        ] }) })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntime.jsxs(SettingsSection, { children: [
      /* @__PURE__ */ jsxRuntime.jsxs(SectionHeader, { alignItems: "center", children: [
        /* @__PURE__ */ jsxRuntime.jsx(SectionIcon, { bgColor: "rgba(147, 51, 234, 0.12)", children: /* @__PURE__ */ jsxRuntime.jsx(outline.UserIcon, { style: { width: 22, height: 22, color: "var(--colors-secondary600, #9333EA)" } }) }),
        /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { direction: "column", alignItems: "flex-start", gap: 1, children: [
          /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "delta", fontWeight: "bold", children: "Default Sender" }),
          /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "pi", textColor: "neutral600", children: "Fallback sender information when not specified per email" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntime.jsx(SectionContent, { children: /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { children: [
        /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Field.Root, { style: { marginBottom: "20px" }, children: [
          /* @__PURE__ */ jsxRuntime.jsx(designSystem.Field.Label, { children: "Default From Name" }),
          /* @__PURE__ */ jsxRuntime.jsx(
            designSystem.TextInput,
            {
              placeholder: "Your Company",
              value: settings.defaultFromName,
              onChange: (e) => handleChange("defaultFromName", e.target.value),
              style: { marginTop: "8px" }
            }
          ),
          /* @__PURE__ */ jsxRuntime.jsx(designSystem.Field.Hint, { style: { marginTop: "8px" }, children: "The sender name shown in recipients' inboxes" })
        ] }),
        /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Field.Root, { children: [
          /* @__PURE__ */ jsxRuntime.jsx(designSystem.Field.Label, { children: "Default From Email" }),
          /* @__PURE__ */ jsxRuntime.jsx(
            designSystem.TextInput,
            {
              placeholder: "noreply@yourcompany.com",
              value: settings.defaultFromEmail,
              onChange: (e) => handleChange("defaultFromEmail", e.target.value),
              style: { marginTop: "8px" }
            }
          ),
          /* @__PURE__ */ jsxRuntime.jsx(designSystem.Field.Hint, { style: { marginTop: "8px" }, children: "Must be a verified sender address" })
        ] })
      ] }) })
    ] })
  ] });
};
exports.default = PluginSettingsPage;

import { jsx, jsxs, Fragment } from "react/jsx-runtime";
import React, { useRef, useEffect, useState, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Modal, Typography, Flex, Box, Field, TextInput, Alert, Textarea, NumberInput, Divider, Toggle, Badge, Button, Loader, SingleSelect, SingleSelectOption, Thead, Tr, Th, Tbody, Td, Table, Tabs, Accordion } from "@strapi/design-system";
import { EnvelopeIcon, ServerIcon, SparklesIcon, PlusIcon, PencilIcon, PlayIcon, TrashIcon, MagnifyingGlassIcon, FunnelIcon, CheckIcon, Cog6ToothIcon, DocumentTextIcon, ChartBarIcon, BoltIcon, CheckCircleIcon, ArrowUpTrayIcon, ArrowDownTrayIcon, DocumentArrowDownIcon, CodeBracketIcon, DocumentDuplicateIcon, PaperAirplaneIcon, ClipboardDocumentIcon, ArrowLeftIcon, ClockIcon, XMarkIcon, ArrowUturnLeftIcon, EnvelopeOpenIcon, CursorArrowRaysIcon, ExclamationTriangleIcon, XCircleIcon, KeyIcon, ChatBubbleLeftIcon } from "@heroicons/react/24/outline";
import { useFetchClient, useNotification } from "@strapi/strapi/admin";
import styled, { css, keyframes } from "styled-components";
import { Star, Mail, Server, Lock, Cog, Check, Cloud, Key, ArrowLeft, ArrowRight, ArrowClockwise, Play, Cross } from "@strapi/icons";
import { T as TertiaryButton, G as GradientButton$1, C as CTAButton, I as IconButton, a as IconButtonPrimary, b as IconButtonDanger, S as SecondaryButton, c as IconButtonPurple, d as IconButtonSuccess, D as DangerButton } from "./StyledButtons-CdOf4Sps.mjs";
import * as ReactEmailEditor from "react-email-editor";
const useAuthRefresh = () => {
  const { get } = useFetchClient();
  const intervalRef = useRef(null);
  useEffect(() => {
    intervalRef.current = setInterval(async () => {
      try {
        await get("/admin/users/me");
        console.debug("[Auth Refresh] Token refreshed successfully");
      } catch (error) {
        console.debug("[Auth Refresh] Token refresh attempt failed");
      }
    }, 4 * 60 * 1e3);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [get]);
  return {
    refreshToken: async () => {
      try {
        await get("/admin/users/me");
        return true;
      } catch (error) {
        return false;
      }
    }
  };
};
const theme$3 = {
  shadows: {
    sm: "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)",
    xl: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)"
  },
  transitions: {
    fast: "150ms cubic-bezier(0.4, 0, 0.2, 1)",
    normal: "300ms cubic-bezier(0.4, 0, 0.2, 1)",
    slow: "500ms cubic-bezier(0.4, 0, 0.2, 1)"
  },
  spacing: {
    xs: "4px",
    sm: "8px",
    md: "16px",
    lg: "24px",
    xl: "32px",
    "2xl": "48px"
  },
  borderRadius: {
    md: "8px",
    lg: "12px",
    xl: "16px"
  }
};
const fadeIn$6 = keyframes`
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;
const pulse$3 = keyframes`
  0%, 100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.05);
  }
`;
const slideIn = keyframes`
  from {
    transform: translateX(-20px);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
`;
const colors$1 = {
  primary: "#4945ff",
  // Strapi Primary Blue
  primaryLight: "rgba(73, 69, 255, 0.06)",
  // Light Blue Background
  success: "#5cb176",
  // Green for completed
  successLight: "rgba(92, 177, 118, 0.12)",
  // Gray
  neutralLight: "rgba(142, 142, 169, 0.08)",
  border: "rgba(128, 128, 128, 0.2)",
  text: "var(--colors-neutral800, #32324d)",
  textLight: "var(--colors-neutral600, #666687)"
};
const StepHeader = styled(Box)`
  padding-bottom: 24px;
  margin-bottom: 32px;
  position: relative;
  animation: ${fadeIn$6} 0.4s ease;
  
  &::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: -24px;
    right: -24px;
    height: 1px;
    background: linear-gradient(90deg, transparent, ${colors$1.border}, transparent);
  }
`;
const StepTitle = styled(Typography)`
  color: ${colors$1.text};
  font-size: 24px;
  font-weight: 600;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 12px;
`;
const StepSubtitle = styled(Typography)`
  color: ${colors$1.textLight};
  font-size: 14px;
  line-height: 1.5;
`;
const StepperContainer$1 = styled(Box)`
  display: flex;
  align-items: flex-start;
  justify-content: center;
  gap: 0;
  margin-bottom: 48px;
  margin-top: 8px;
  position: relative;
  padding: 0 40px;
`;
const StepWrapper$1 = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  
  &:not(:last-child)::after {
    content: '';
    position: absolute;
    top: 28px;
    left: 50%;
    width: 100%;
    height: 3px;
    background: ${(props) => props.$completed ? colors$1.success : colors$1.neutralLight};
    transition: all 0.4s ease;
    z-index: 0;
  }
`;
const StepDot$1 = styled.div`
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: ${(props) => props.$active ? colors$1.primary : props.$completed ? colors$1.success : props.theme.colors.neutral0};
  color: ${(props) => props.$active || props.$completed ? "#ffffff" : colors$1.textLight};
  border: 4px solid ${(props) => props.$active ? colors$1.primary : props.$completed ? colors$1.success : colors$1.border};
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 18px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  z-index: 1;
  cursor: ${(props) => props.$completed ? "pointer" : "default"};
  box-shadow: ${(props) => props.$active ? `0 4px 16px ${colors$1.primary}40, 0 0 0 8px ${colors$1.primaryLight}` : props.$completed ? `0 4px 12px ${colors$1.success}30` : "0 2px 8px rgba(0,0,0,0.08)"};
  
  ${(props) => props.$active && css`
    animation: ${pulse$3} 2s infinite;
  `}
  
  &:hover {
    transform: ${(props) => props.$completed ? "scale(1.1)" : props.$active ? "scale(1.05)" : "scale(1)"};
  }
`;
const StepLabel$1 = styled(Typography)`
  margin-top: 12px;
  font-size: 13px;
  color: ${(props) => props.$active ? colors$1.primary : props.$completed ? colors$1.success : colors$1.textLight};
  white-space: nowrap;
  font-weight: ${(props) => props.$active ? 600 : 500};
  text-align: center;
  transition: all 0.3s ease;
`;
const ProvidersGrid = styled(Box)`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
  margin-bottom: 24px;
  animation: ${slideIn} 0.5s ease;
  max-width: 800px;
  margin-left: auto;
  margin-right: auto;
`;
const ProviderCard = styled(Box)`
  background: ${(props) => props.$selected ? colors$1.successLight : props.theme.colors.neutral0};
  border: 2px solid ${(props) => props.$selected ? colors$1.success : colors$1.border};
  border-radius: 12px;
  padding: 24px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  text-align: center;
  aspect-ratio: 1;
  min-height: 180px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  position: relative;
  overflow: hidden;
  
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(135deg, transparent, rgba(73, 69, 255, 0.05));
    opacity: 0;
    transition: opacity 0.3s;
  }
  
  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 24px rgba(73, 69, 255, 0.12);
    border-color: ${(props) => props.$selected ? colors$1.success : colors$1.primary};
    
    &::before {
      opacity: 1;
    }
  }
  
  ${(props) => props.$selected && `
    &::after {
      content: '✓';
      position: absolute;
      top: 8px;
      right: 8px;
      width: 24px;
      height: 24px;
      background: ${colors$1.success};
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: bold;
    }
  `}
`;
const ProviderIcon = styled.div`
  width: 56px;
  height: 56px;
  border-radius: ${(props) => props.$round ? "50%" : "12px"};
  background: ${(props) => props.$bgColor || colors$1.primaryLight};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: ${(props) => props.$fontSize || "24px"};
  font-weight: bold;
  color: ${(props) => props.$color || colors$1.primary};
  box-shadow: 0 4px 12px ${(props) => props.$shadowColor || "rgba(73, 69, 255, 0.15)"};
`;
const ProviderName = styled(Typography)`
  font-weight: 600;
  font-size: 15px;
  color: ${colors$1.text};
  margin: 0;
`;
styled(Typography)`
  font-size: 12px;
  color: ${colors$1.textLight};
  margin: 0;
`;
const InfoAlert = styled(Alert)`
  background: ${colors$1.primaryLight};
  border: 1px solid ${colors$1.primary}33;
  animation: ${fadeIn$6} 0.4s ease;
  
  svg {
    color: ${colors$1.primary};
  }
`;
const FormSection = styled(Box)`
  animation: ${slideIn} 0.4s ease;
  width: 100%;
  max-width: 100%;
`;
const FullWidthField = styled(Box)`
  width: 100%;
  
  & > * {
    width: 100%;
  }
  
  input, textarea {
    width: 100% !important;
  }
`;
const SectionTitle = styled(Typography)`
  color: ${colors$1.text};
  font-weight: 600;
  font-size: 16px;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
`;
styled(Box)`
  background: linear-gradient(135deg, ${colors$1.primaryLight}, ${colors$1.successLight});
  border: 2px solid ${colors$1.primary}33;
  border-radius: 12px;
  padding: 20px;
  transition: all 0.3s;
  
  &:hover {
    border-color: ${colors$1.primary}66;
    box-shadow: 0 4px 12px rgba(73, 69, 255, 0.1);
  }
`;
const AddAccountModal = ({ isOpen, onClose, onAccountAdded, editAccount = null }) => {
  const { post, get, put } = useFetchClient();
  const { toggleNotification } = useNotification();
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [provider, setProvider] = useState("");
  const [oauthCode, setOauthCode] = useState(null);
  const [oauthState, setOauthState] = useState(null);
  const isEditMode = !!editAccount;
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    fromEmail: "",
    fromName: "",
    replyTo: "",
    isActive: true,
    isPrimary: false,
    priority: 5,
    dailyLimit: 500,
    hourlyLimit: 50,
    host: "",
    port: 587,
    user: "",
    pass: "",
    secure: false,
    apiKey: "",
    oauthClientId: "",
    oauthClientSecret: ""
  });
  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };
  React.useEffect(() => {
    const loadAccountData = async () => {
      if (isEditMode && editAccount && isOpen) {
        try {
          const { data } = await get(`/magic-mail/accounts/${editAccount.id}`);
          const accountData = data.data;
          setProvider(accountData.provider);
          setCurrentStep(2);
          setFormData({
            name: accountData.name || "",
            description: accountData.description || "",
            fromEmail: accountData.fromEmail || "",
            fromName: accountData.fromName || "",
            replyTo: accountData.replyTo || "",
            isActive: accountData.isActive !== void 0 ? accountData.isActive : true,
            isPrimary: accountData.isPrimary || false,
            priority: accountData.priority || 5,
            dailyLimit: accountData.dailyLimit || 500,
            hourlyLimit: accountData.hourlyLimit || 50,
            host: accountData.config?.host || "",
            port: accountData.config?.port || 587,
            user: accountData.config?.user || "",
            pass: accountData.config?.pass || "",
            // Now populated from decrypted data
            secure: accountData.config?.secure || false,
            apiKey: accountData.config?.apiKey || "",
            // Now populated from decrypted data
            mailgunDomain: accountData.config?.domain || "",
            microsoftTenantId: accountData.config?.tenantId || "",
            oauthClientId: accountData.config?.clientId || "",
            oauthClientSecret: accountData.config?.clientSecret || ""
            // Now populated from decrypted data
          });
        } catch (err) {
          console.error("[magic-mail] Error loading account:", err);
          toggleNotification({
            type: "danger",
            message: "Failed to load account data"
          });
        }
      } else if (!isEditMode) {
        setCurrentStep(1);
        setProvider("");
        setFormData({
          name: "",
          description: "",
          fromEmail: "",
          fromName: "",
          replyTo: "",
          isActive: true,
          isPrimary: false,
          priority: 5,
          dailyLimit: 500,
          hourlyLimit: 50,
          host: "",
          port: 587,
          user: "",
          pass: "",
          secure: false,
          apiKey: "",
          mailgunDomain: "",
          microsoftTenantId: "",
          oauthClientId: "",
          oauthClientSecret: ""
        });
      }
    };
    loadAccountData();
  }, [isEditMode, editAccount, isOpen]);
  React.useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("oauth_code");
    const state = urlParams.get("oauth_state");
    if (code && state) {
      setOauthCode(code);
      setOauthState(state);
      window.history.replaceState({}, document.title, window.location.pathname);
      toggleNotification({
        type: "success",
        message: "✅ Gmail OAuth authorized! Please complete the account setup."
      });
    }
    const handleMessage = (event) => {
      if (event.origin !== window.location.origin) return;
      if (event.data.type === "gmail-oauth-success") {
        setOauthCode(event.data.code);
        setOauthState(event.data.state);
        toggleNotification({
          type: "success",
          message: "✅ Gmail OAuth authorized! Please complete the account setup."
        });
      }
      if (event.data.type === "microsoft-oauth-success") {
        setOauthCode(event.data.code);
        setOauthState(event.data.state);
        toggleNotification({
          type: "success",
          message: "✅ Microsoft OAuth authorized! Please complete the account setup."
        });
      }
      if (event.data.type === "yahoo-oauth-success") {
        setOauthCode(event.data.code);
        setOauthState(event.data.state);
        toggleNotification({
          type: "success",
          message: "✅ Yahoo Mail OAuth authorized! Please complete the account setup."
        });
      }
    };
    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, []);
  const startGmailOAuth = async () => {
    if (!formData.oauthClientId) {
      toggleNotification({
        type: "warning",
        message: "Please enter your OAuth Client ID first"
      });
      return;
    }
    try {
      const { data } = await get(`/magic-mail/oauth/gmail/auth?clientId=${encodeURIComponent(formData.oauthClientId)}`);
      if (data.authUrl) {
        const width = 600;
        const height = 700;
        const left = (window.screen.width - width) / 2;
        const top = (window.screen.height - height) / 2;
        const popup = window.open(
          data.authUrl,
          "gmail-oauth",
          `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,location=no,status=no`
        );
        const checkPopup = setInterval(() => {
          try {
            if (popup.closed) {
              clearInterval(checkPopup);
              const urlParams = new URLSearchParams(window.location.search);
              const code = urlParams.get("oauth_code");
              if (!code) {
                toggleNotification({
                  type: "info",
                  message: "OAuth window closed. Please try again if not completed."
                });
              }
            }
          } catch (err) {
          }
        }, 500);
        toggleNotification({
          type: "info",
          message: "🔐 Please authorize in the popup window..."
        });
      }
    } catch (err) {
      toggleNotification({
        type: "danger",
        message: "Failed to start OAuth flow"
      });
    }
  };
  const startMicrosoftOAuth = async () => {
    if (!formData.microsoftTenantId) {
      toggleNotification({
        type: "warning",
        message: "Please enter your Tenant (Directory) ID first"
      });
      return;
    }
    if (!formData.oauthClientId) {
      toggleNotification({
        type: "warning",
        message: "Please enter your Application (Client) ID"
      });
      return;
    }
    try {
      const { data } = await get(`/magic-mail/oauth/microsoft/auth?clientId=${encodeURIComponent(formData.oauthClientId)}&tenantId=${encodeURIComponent(formData.microsoftTenantId)}`);
      if (data.authUrl) {
        const width = 600;
        const height = 700;
        const left = (window.screen.width - width) / 2;
        const top = (window.screen.height - height) / 2;
        const popup = window.open(
          data.authUrl,
          "microsoft-oauth",
          `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,location=no,status=no`
        );
        const checkPopup = setInterval(() => {
          try {
            if (popup.closed) {
              clearInterval(checkPopup);
              const urlParams = new URLSearchParams(window.location.search);
              const code = urlParams.get("oauth_code");
              if (!code) {
                toggleNotification({
                  type: "info",
                  message: "OAuth window closed. Please try again if not completed."
                });
              }
            }
          } catch (err) {
          }
        }, 500);
        toggleNotification({
          type: "info",
          message: "🔐 Please authorize in the popup window..."
        });
      }
    } catch (err) {
      toggleNotification({
        type: "danger",
        message: "Failed to start Microsoft OAuth flow"
      });
    }
  };
  const startYahooOAuth = async () => {
    if (!formData.oauthClientId) {
      toggleNotification({
        type: "warning",
        message: "Please enter your Yahoo Client ID first"
      });
      return;
    }
    try {
      const { data } = await get(`/magic-mail/oauth/yahoo/auth?clientId=${encodeURIComponent(formData.oauthClientId)}`);
      if (data.authUrl) {
        const width = 600;
        const height = 700;
        const left = (window.screen.width - width) / 2;
        const top = (window.screen.height - height) / 2;
        const popup = window.open(
          data.authUrl,
          "yahoo-oauth",
          `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,location=no,status=no`
        );
        const checkPopup = setInterval(() => {
          try {
            if (popup.closed) {
              clearInterval(checkPopup);
              const urlParams = new URLSearchParams(window.location.search);
              const code = urlParams.get("oauth_code");
              if (!code) {
                toggleNotification({
                  type: "info",
                  message: "OAuth window closed. Please try again if not completed."
                });
              }
            }
          } catch (err) {
          }
        }, 500);
        toggleNotification({
          type: "info",
          message: "🔐 Please authorize in the popup window..."
        });
      }
    } catch (err) {
      toggleNotification({
        type: "danger",
        message: "Failed to start Yahoo OAuth flow"
      });
    }
  };
  const canProceed = () => {
    if (currentStep === 1) return provider !== "";
    if (currentStep === 2) {
      if (provider === "gmail-oauth" || provider === "microsoft-oauth" || provider === "yahoo-oauth") return formData.name;
      return formData.name && formData.fromEmail;
    }
    if (currentStep === 3) {
      if (provider === "smtp") {
        return formData.host && formData.user && formData.pass;
      }
      if (provider === "gmail-oauth" || provider === "yahoo-oauth") {
        if (isEditMode && formData.oauthClientId && formData.oauthClientSecret) {
          return true;
        }
        return !!oauthCode;
      }
      if (provider === "microsoft-oauth") {
        if (isEditMode && formData.oauthClientId && formData.oauthClientSecret && formData.microsoftTenantId) {
          return true;
        }
        return !!oauthCode;
      }
      if (provider === "sendgrid") {
        return !!formData.apiKey;
      }
      if (provider === "mailgun") {
        return !!formData.apiKey && !!formData.mailgunDomain;
      }
    }
    return true;
  };
  const handleSubmit = async () => {
    setLoading(true);
    try {
      let config = {};
      if (!isEditMode && (provider === "gmail-oauth" || provider === "microsoft-oauth" || provider === "yahoo-oauth") && oauthCode && oauthState) {
        const accountDetails = {
          name: formData.name,
          description: formData.description,
          fromEmail: "oauth@placeholder.com",
          // Will be replaced by provider email
          fromName: formData.fromName,
          replyTo: formData.replyTo,
          isPrimary: formData.isPrimary,
          priority: formData.priority,
          dailyLimit: formData.dailyLimit,
          hourlyLimit: formData.hourlyLimit,
          config: provider === "microsoft-oauth" ? {
            clientId: formData.oauthClientId,
            clientSecret: formData.oauthClientSecret,
            tenantId: formData.microsoftTenantId
          } : {
            clientId: formData.oauthClientId,
            clientSecret: formData.oauthClientSecret
          }
        };
        const providerMap = {
          "gmail-oauth": "gmail",
          "microsoft-oauth": "microsoft",
          "yahoo-oauth": "yahoo"
        };
        await post("/magic-mail/oauth/create-account", {
          provider: providerMap[provider],
          code: oauthCode,
          state: oauthState,
          accountDetails
        });
        const providerNames = {
          "gmail-oauth": "Gmail",
          "microsoft-oauth": "Microsoft",
          "yahoo-oauth": "Yahoo Mail"
        };
        toggleNotification({
          type: "success",
          message: `✅ ${formData.name} created successfully with ${providerNames[provider]} OAuth!`
        });
        onAccountAdded();
        onClose();
        setCurrentStep(1);
        setOauthCode(null);
        setOauthState(null);
        return;
      }
      if (provider === "smtp") {
        config = {
          host: formData.host,
          port: formData.port,
          user: formData.user,
          pass: formData.pass,
          // Now always available (decrypted in edit mode)
          secure: formData.secure
        };
      } else if (provider === "sendgrid") {
        config = {
          apiKey: formData.apiKey
          // Now always available (decrypted in edit mode)
        };
      } else if (provider === "mailgun") {
        config = {
          apiKey: formData.apiKey,
          // Now always available (decrypted in edit mode)
          domain: formData.mailgunDomain
        };
      } else if (provider === "gmail-oauth" || provider === "yahoo-oauth") {
        config = {
          clientId: formData.oauthClientId,
          clientSecret: formData.oauthClientSecret
          // Now always available (decrypted in edit mode)
        };
      } else if (provider === "microsoft-oauth") {
        config = {
          clientId: formData.oauthClientId,
          clientSecret: formData.oauthClientSecret,
          // Now always available (decrypted in edit mode)
          tenantId: formData.microsoftTenantId
        };
      }
      const payload = {
        name: formData.name,
        description: formData.description,
        provider,
        config,
        fromEmail: formData.fromEmail,
        fromName: formData.fromName,
        replyTo: formData.replyTo,
        isActive: formData.isActive,
        isPrimary: formData.isPrimary,
        priority: formData.priority,
        dailyLimit: formData.dailyLimit,
        hourlyLimit: formData.hourlyLimit
      };
      if (isEditMode) {
        await put(`/magic-mail/accounts/${editAccount.id}`, payload);
        toggleNotification({
          type: "success",
          message: `✅ ${formData.name} updated successfully!`
        });
      } else {
        await post("/magic-mail/accounts", payload);
        toggleNotification({
          type: "success",
          message: `✅ ${formData.name} created successfully!`
        });
      }
      onAccountAdded();
      onClose();
      setCurrentStep(1);
    } catch (err) {
      toggleNotification({
        type: "danger",
        message: err.response?.data?.error?.message || `Failed to ${isEditMode ? "update" : "create"} account`
      });
    } finally {
      setLoading(false);
    }
  };
  const getProviderLabel = () => {
    switch (provider) {
      case "gmail-oauth":
        return "Gmail OAuth";
      case "microsoft-oauth":
        return "Microsoft OAuth";
      case "yahoo-oauth":
        return "Yahoo Mail OAuth";
      case "smtp":
        return "SMTP";
      case "sendgrid":
        return "SendGrid";
      case "mailgun":
        return "Mailgun";
      default:
        return "";
    }
  };
  const stepTitles = ["Provider", "Details", "Credentials", "Settings"];
  return /* @__PURE__ */ jsx(Modal.Root, { open: isOpen, onOpenChange: onClose, children: /* @__PURE__ */ jsxs(Modal.Content, { size: "XL", children: [
    /* @__PURE__ */ jsx(Modal.Header, { children: /* @__PURE__ */ jsxs(Typography, { variant: "beta", children: [
      /* @__PURE__ */ jsx(Star, { style: { marginRight: 8 } }),
      isEditMode ? "Edit Email Account" : "Add Email Account"
    ] }) }),
    /* @__PURE__ */ jsx(Modal.Body, { children: /* @__PURE__ */ jsxs(Flex, { direction: "column", gap: 0, children: [
      /* @__PURE__ */ jsxs(StepHeader, { children: [
        /* @__PURE__ */ jsxs(StepTitle, { children: [
          currentStep === 1 && /* @__PURE__ */ jsx(Mail, {}),
          currentStep === 2 && /* @__PURE__ */ jsx(Server, {}),
          currentStep === 3 && /* @__PURE__ */ jsx(Lock, {}),
          currentStep === 4 && /* @__PURE__ */ jsx(Cog, {}),
          currentStep === 1 && "Choose Email Provider",
          currentStep === 2 && "Account Details",
          currentStep === 3 && "Authentication",
          currentStep === 4 && "Configuration"
        ] }),
        /* @__PURE__ */ jsxs(StepSubtitle, { children: [
          currentStep === 1 && "Select your preferred email service provider",
          currentStep === 2 && "Configure how emails will appear to recipients",
          currentStep === 3 && `Enter your ${getProviderLabel()} credentials securely`,
          currentStep === 4 && "Set rate limits and priority for this account"
        ] })
      ] }),
      /* @__PURE__ */ jsx(StepperContainer$1, { children: [1, 2, 3, 4].map((step) => /* @__PURE__ */ jsxs(
        StepWrapper$1,
        {
          $completed: currentStep > step,
          children: [
            /* @__PURE__ */ jsx(
              StepDot$1,
              {
                $active: currentStep === step,
                $completed: currentStep > step,
                onClick: () => currentStep > step && setCurrentStep(step),
                children: currentStep > step ? /* @__PURE__ */ jsx(Check, {}) : step
              }
            ),
            /* @__PURE__ */ jsx(
              StepLabel$1,
              {
                $active: currentStep === step,
                $completed: currentStep > step,
                children: stepTitles[step - 1]
              }
            )
          ]
        },
        step
      )) }),
      currentStep === 1 && /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsxs(ProvidersGrid, { children: [
        /* @__PURE__ */ jsxs(
          ProviderCard,
          {
            $selected: provider === "gmail-oauth",
            onClick: () => setProvider("gmail-oauth"),
            children: [
              /* @__PURE__ */ jsx(
                ProviderIcon,
                {
                  $round: true,
                  $bgColor: "#4285F433",
                  $color: "#4285F4",
                  $shadowColor: "rgba(66, 133, 244, 0.2)",
                  children: "G"
                }
              ),
              /* @__PURE__ */ jsx(ProviderName, { children: "Gmail OAuth" })
            ]
          }
        ),
        /* @__PURE__ */ jsxs(
          ProviderCard,
          {
            $selected: provider === "microsoft-oauth",
            onClick: () => setProvider("microsoft-oauth"),
            children: [
              /* @__PURE__ */ jsx(
                ProviderIcon,
                {
                  $round: true,
                  $bgColor: "#00A4EF33",
                  $color: "#00A4EF",
                  $shadowColor: "rgba(0, 164, 239, 0.2)",
                  children: "M"
                }
              ),
              /* @__PURE__ */ jsx(ProviderName, { children: "Microsoft OAuth" })
            ]
          }
        ),
        /* @__PURE__ */ jsxs(
          ProviderCard,
          {
            $selected: provider === "yahoo-oauth",
            onClick: () => setProvider("yahoo-oauth"),
            children: [
              /* @__PURE__ */ jsx(
                ProviderIcon,
                {
                  $round: true,
                  $bgColor: "#6001D233",
                  $color: "#6001D2",
                  $shadowColor: "rgba(96, 1, 210, 0.2)",
                  children: "Y"
                }
              ),
              /* @__PURE__ */ jsx(ProviderName, { children: "Yahoo Mail OAuth" })
            ]
          }
        ),
        /* @__PURE__ */ jsxs(
          ProviderCard,
          {
            $selected: provider === "smtp",
            onClick: () => setProvider("smtp"),
            children: [
              /* @__PURE__ */ jsx(ProviderIcon, { children: /* @__PURE__ */ jsx(Server, { style: { width: 28, height: 28 } }) }),
              /* @__PURE__ */ jsx(ProviderName, { children: "SMTP" })
            ]
          }
        ),
        /* @__PURE__ */ jsxs(
          ProviderCard,
          {
            $selected: provider === "sendgrid",
            onClick: () => setProvider("sendgrid"),
            children: [
              /* @__PURE__ */ jsx(ProviderIcon, { $bgColor: "#1E90FF22", $color: "#1E90FF", $shadowColor: "rgba(30, 144, 255, 0.2)", children: /* @__PURE__ */ jsx(Cloud, { style: { width: 28, height: 28 } }) }),
              /* @__PURE__ */ jsx(ProviderName, { children: "SendGrid" })
            ]
          }
        ),
        /* @__PURE__ */ jsxs(
          ProviderCard,
          {
            $selected: provider === "mailgun",
            onClick: () => setProvider("mailgun"),
            children: [
              /* @__PURE__ */ jsx(ProviderIcon, { $bgColor: "#FF6B6B22", $color: "#FF6B6B", $shadowColor: "rgba(255, 107, 107, 0.2)", children: /* @__PURE__ */ jsx(Mail, { style: { width: 28, height: 28 } }) }),
              /* @__PURE__ */ jsx(ProviderName, { children: "Mailgun" })
            ]
          }
        )
      ] }) }),
      currentStep === 2 && /* @__PURE__ */ jsx(FormSection, { children: /* @__PURE__ */ jsxs(Flex, { direction: "column", gap: 4, style: { width: "100%" }, children: [
        /* @__PURE__ */ jsx(FullWidthField, { children: /* @__PURE__ */ jsxs(Field.Root, { required: true, children: [
          /* @__PURE__ */ jsx(Field.Label, { children: "Account Name" }),
          /* @__PURE__ */ jsx(
            TextInput,
            {
              placeholder: "e.g., Company Gmail, Marketing SendGrid, Transactional Emails",
              value: formData.name,
              onChange: (e) => handleChange("name", e.target.value)
            }
          ),
          /* @__PURE__ */ jsx(Field.Hint, { children: "Give this email account a unique, descriptive name so you can easily identify it later" })
        ] }) }),
        provider === "gmail-oauth" ? /* @__PURE__ */ jsx(Alert, { variant: "default", title: "📧 Email Address", children: /* @__PURE__ */ jsx(Typography, { variant: "pi", children: "Your Gmail address will be automatically retrieved from Google after OAuth authorization. You don't need to enter it manually." }) }) : /* @__PURE__ */ jsx(FullWidthField, { children: /* @__PURE__ */ jsxs(Field.Root, { required: true, children: [
          /* @__PURE__ */ jsx(Field.Label, { children: "From Email Address" }),
          /* @__PURE__ */ jsx(
            TextInput,
            {
              placeholder: "noreply@company.com",
              type: "email",
              value: formData.fromEmail,
              onChange: (e) => handleChange("fromEmail", e.target.value)
            }
          ),
          /* @__PURE__ */ jsx(Field.Hint, { children: "The email address that will appear as the sender. Recipients will see this in their inbox" })
        ] }) }),
        /* @__PURE__ */ jsx(FullWidthField, { children: /* @__PURE__ */ jsxs(Field.Root, { children: [
          /* @__PURE__ */ jsx(Field.Label, { children: "From Display Name" }),
          /* @__PURE__ */ jsx(
            TextInput,
            {
              placeholder: "Company Name",
              value: formData.fromName,
              onChange: (e) => handleChange("fromName", e.target.value)
            }
          ),
          /* @__PURE__ */ jsx(Field.Hint, { children: "The friendly name shown next to the email address (e.g., 'ACME Corp' instead of just 'noreply@acme.com')" })
        ] }) }),
        /* @__PURE__ */ jsx(FullWidthField, { children: /* @__PURE__ */ jsxs(Field.Root, { children: [
          /* @__PURE__ */ jsx(Field.Label, { children: "Reply-To Email Address" }),
          /* @__PURE__ */ jsx(
            TextInput,
            {
              placeholder: "support@company.com",
              type: "email",
              value: formData.replyTo,
              onChange: (e) => handleChange("replyTo", e.target.value)
            }
          ),
          /* @__PURE__ */ jsx(Field.Hint, { children: "When recipients hit 'Reply', their response will go to this address. Leave empty to use the From Email" })
        ] }) }),
        /* @__PURE__ */ jsx(FullWidthField, { children: /* @__PURE__ */ jsxs(Field.Root, { children: [
          /* @__PURE__ */ jsx(Field.Label, { children: "Account Description" }),
          /* @__PURE__ */ jsx(
            Textarea,
            {
              placeholder: "What is this account used for? (e.g., 'Marketing campaigns', 'Order confirmations', 'Password resets')",
              value: formData.description,
              onChange: (e) => handleChange("description", e.target.value)
            }
          ),
          /* @__PURE__ */ jsx(Field.Hint, { children: "Add notes about this account's purpose, usage limits, or any special configuration. Only visible to admins" })
        ] }) })
      ] }) }),
      currentStep === 3 && /* @__PURE__ */ jsxs(FormSection, { children: [
        provider === "smtp" && /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(InfoAlert, { variant: "success", title: "🔒 Secure Storage", marginBottom: 4, children: "All credentials are encrypted with AES-256-GCM before storage. No plain text passwords in the database." }),
          /* @__PURE__ */ jsxs(Flex, { direction: "column", gap: 4, style: { width: "100%" }, children: [
            /* @__PURE__ */ jsxs(SectionTitle, { children: [
              /* @__PURE__ */ jsx(Server, {}),
              "Server Connection"
            ] }),
            /* @__PURE__ */ jsx(FullWidthField, { children: /* @__PURE__ */ jsxs(Field.Root, { required: true, children: [
              /* @__PURE__ */ jsx(Field.Label, { children: "SMTP Host Server" }),
              /* @__PURE__ */ jsx(
                TextInput,
                {
                  placeholder: "smtp.gmail.com",
                  value: formData.host,
                  onChange: (e) => handleChange("host", e.target.value)
                }
              ),
              /* @__PURE__ */ jsx(Field.Hint, { children: "The address of your email server. Common examples: smtp.gmail.com (Gmail), smtp-mail.outlook.com (Outlook), smtp.sendgrid.net (SendGrid)" })
            ] }) }),
            /* @__PURE__ */ jsx(FullWidthField, { children: /* @__PURE__ */ jsxs(Field.Root, { required: true, children: [
              /* @__PURE__ */ jsx(Field.Label, { children: "Port Number" }),
              /* @__PURE__ */ jsx(
                NumberInput,
                {
                  value: formData.port,
                  onValueChange: (value) => handleChange("port", value)
                }
              ),
              /* @__PURE__ */ jsx(Field.Hint, { children: "Standard ports: 587 (recommended - STARTTLS), 465 (SSL/TLS), or 25 (unencrypted - not recommended)" })
            ] }) }),
            /* @__PURE__ */ jsx(Divider, {}),
            /* @__PURE__ */ jsxs(SectionTitle, { children: [
              /* @__PURE__ */ jsx(Lock, {}),
              "Authentication Credentials"
            ] }),
            /* @__PURE__ */ jsx(FullWidthField, { children: /* @__PURE__ */ jsxs(Field.Root, { required: true, children: [
              /* @__PURE__ */ jsx(Field.Label, { children: "Username / Email" }),
              /* @__PURE__ */ jsx(
                TextInput,
                {
                  placeholder: "your-email@gmail.com",
                  value: formData.user,
                  onChange: (e) => handleChange("user", e.target.value)
                }
              ),
              /* @__PURE__ */ jsx(Field.Hint, { children: "Usually your full email address. Some providers may use just the username part before the @" })
            ] }) }),
            /* @__PURE__ */ jsx(FullWidthField, { children: /* @__PURE__ */ jsxs(Field.Root, { required: true, children: [
              /* @__PURE__ */ jsx(Field.Label, { children: "Password / App Password" }),
              /* @__PURE__ */ jsx(
                TextInput,
                {
                  type: "password",
                  placeholder: "Enter your password",
                  value: formData.pass,
                  onChange: (e) => handleChange("pass", e.target.value)
                }
              ),
              /* @__PURE__ */ jsx(Field.Hint, { children: "For Gmail: Create an App Password in Google Account → Security → 2-Step Verification → App passwords. Regular passwords won't work with 2FA enabled" })
            ] }) }),
            /* @__PURE__ */ jsx(
              Box,
              {
                padding: 4,
                background: formData.secure ? "rgba(34, 197, 94, 0.15)" : "rgba(245, 158, 11, 0.15)",
                hasRadius: true,
                style: {
                  border: formData.secure ? "2px solid var(--colors-success600, #22C55E)" : "2px solid var(--colors-warning600, #F59E0B)",
                  borderRadius: "8px",
                  transition: "all 0.2s ease"
                },
                children: /* @__PURE__ */ jsxs(Flex, { gap: 3, alignItems: "center", children: [
                  /* @__PURE__ */ jsx(
                    Toggle,
                    {
                      checked: formData.secure,
                      onChange: () => handleChange("secure", !formData.secure)
                    }
                  ),
                  /* @__PURE__ */ jsxs(Flex, { direction: "column", gap: 1, style: { flex: 1 }, children: [
                    /* @__PURE__ */ jsxs(Flex, { alignItems: "center", gap: 2, children: [
                      /* @__PURE__ */ jsxs(Typography, { fontWeight: "semiBold", style: { fontSize: "14px" }, children: [
                        formData.secure ? "🔒" : "⚠️",
                        " Use SSL/TLS Encryption"
                      ] }),
                      /* @__PURE__ */ jsx(
                        Badge,
                        {
                          backgroundColor: formData.secure ? "success600" : "warning600",
                          textColor: "neutral0",
                          size: "S",
                          children: formData.secure ? "ENABLED" : "DISABLED"
                        }
                      )
                    ] }),
                    /* @__PURE__ */ jsx(Typography, { variant: "pi", textColor: "neutral600", style: { fontSize: "13px", lineHeight: "1.5" }, children: formData.secure ? "SSL/TLS enabled - Use this for port 465" : "SSL/TLS disabled - Port 587 will use STARTTLS instead" })
                  ] })
                ] })
              }
            )
          ] })
        ] }),
        provider === "gmail-oauth" && /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(InfoAlert, { variant: "success", title: "🔒 OAuth 2.0 Security", marginBottom: 4, children: "No passwords stored. Users authenticate directly with Google for maximum security." }),
          /* @__PURE__ */ jsxs(Flex, { direction: "column", gap: 4, style: { width: "100%" }, children: [
            /* @__PURE__ */ jsxs(SectionTitle, { children: [
              /* @__PURE__ */ jsx(Lock, {}),
              "Google OAuth Application"
            ] }),
            /* @__PURE__ */ jsx(FullWidthField, { children: /* @__PURE__ */ jsxs(Field.Root, { required: true, children: [
              /* @__PURE__ */ jsx(Field.Label, { children: "OAuth Client ID" }),
              /* @__PURE__ */ jsx(
                TextInput,
                {
                  placeholder: "123456789-abc123xyz.apps.googleusercontent.com",
                  value: formData.oauthClientId,
                  onChange: (e) => handleChange("oauthClientId", e.target.value)
                }
              ),
              /* @__PURE__ */ jsx(Field.Hint, { children: "Found in Google Cloud Console → APIs & Services → Credentials. Looks like a long string ending in .apps.googleusercontent.com" })
            ] }) }),
            /* @__PURE__ */ jsx(FullWidthField, { children: /* @__PURE__ */ jsxs(Field.Root, { required: true, children: [
              /* @__PURE__ */ jsx(Field.Label, { children: "OAuth Client Secret" }),
              /* @__PURE__ */ jsx(
                TextInput,
                {
                  type: "password",
                  placeholder: "GOCSPX-abcdefghijklmnop",
                  value: formData.oauthClientSecret,
                  onChange: (e) => handleChange("oauthClientSecret", e.target.value)
                }
              ),
              /* @__PURE__ */ jsx(Field.Hint, { children: "Keep this secret! Found in the same OAuth 2.0 Client ID settings. Never share or commit to git" })
            ] }) }),
            /* @__PURE__ */ jsx(Divider, {}),
            oauthCode ? /* @__PURE__ */ jsx(Alert, { variant: "success", title: "✅ OAuth Authorized!", children: /* @__PURE__ */ jsx(Typography, { variant: "pi", children: `You've successfully authorized with Google! Click "Continue" to proceed to settings.` }) }) : /* @__PURE__ */ jsxs(Box, { children: [
              /* @__PURE__ */ jsx(Typography, { variant: "omega", textColor: "neutral600", marginBottom: 3, children: "After entering your credentials above, click the button below to connect with Gmail:" }),
              /* @__PURE__ */ jsx(
                Button,
                {
                  onClick: startGmailOAuth,
                  variant: "secondary",
                  size: "L",
                  disabled: !formData.oauthClientId,
                  style: {
                    width: "100%",
                    background: "#4285F4",
                    color: "white",
                    fontWeight: 600
                  },
                  children: "🔐 Connect with Google"
                }
              )
            ] }),
            /* @__PURE__ */ jsxs(
              Box,
              {
                padding: 4,
                background: "neutral100",
                hasRadius: true,
                style: {
                  border: `1px solid ${colors$1.border}`,
                  borderRadius: "8px"
                },
                children: [
                  /* @__PURE__ */ jsx(
                    Typography,
                    {
                      fontWeight: "semiBold",
                      marginBottom: 3,
                      style: { fontSize: "15px" },
                      children: "📋 Setup Guide"
                    }
                  ),
                  /* @__PURE__ */ jsxs(Flex, { direction: "column", gap: 2, style: { fontSize: "14px", lineHeight: "1.6" }, children: [
                    /* @__PURE__ */ jsxs(Box, { children: [
                      /* @__PURE__ */ jsx("strong", { children: "1." }),
                      " Go to ",
                      /* @__PURE__ */ jsx("a", { href: "https://console.cloud.google.com", target: "_blank", rel: "noopener noreferrer", style: { color: colors$1.primary, textDecoration: "underline" }, children: "console.cloud.google.com" })
                    ] }),
                    /* @__PURE__ */ jsxs(Box, { children: [
                      /* @__PURE__ */ jsx("strong", { children: "2." }),
                      " Enable Gmail API (search and click Enable)"
                    ] }),
                    /* @__PURE__ */ jsxs(Box, { children: [
                      /* @__PURE__ */ jsx("strong", { children: "3." }),
                      " Create Credentials → OAuth Client ID"
                    ] }),
                    /* @__PURE__ */ jsxs(Box, { children: [
                      /* @__PURE__ */ jsx("strong", { children: "4." }),
                      " Add this redirect URI:"
                    ] }),
                    /* @__PURE__ */ jsxs(Flex, { gap: 2, alignItems: "center", children: [
                      /* @__PURE__ */ jsxs(
                        Box,
                        {
                          padding: 2,
                          background: "neutral0",
                          hasRadius: true,
                          style: {
                            flex: 1,
                            fontFamily: "monospace",
                            fontSize: "13px",
                            wordBreak: "break-all",
                            border: `1px solid ${colors$1.border}`
                          },
                          children: [
                            window.location.origin,
                            "/magic-mail/oauth/gmail/callback"
                          ]
                        }
                      ),
                      /* @__PURE__ */ jsx(
                        Button,
                        {
                          variant: "secondary",
                          size: "S",
                          onClick: () => {
                            navigator.clipboard.writeText(`${window.location.origin}/magic-mail/oauth/gmail/callback`);
                            toggleNotification({
                              type: "success",
                              message: "Redirect URI copied to clipboard!"
                            });
                          },
                          children: "Copy"
                        }
                      )
                    ] })
                  ] })
                ]
              }
            )
          ] })
        ] }),
        provider === "microsoft-oauth" && /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(InfoAlert, { variant: "success", title: "🔒 OAuth 2.0 Security", marginBottom: 4, children: "No passwords stored. Users authenticate directly with Microsoft for maximum security." }),
          /* @__PURE__ */ jsxs(Flex, { direction: "column", gap: 4, style: { width: "100%" }, children: [
            /* @__PURE__ */ jsxs(SectionTitle, { children: [
              /* @__PURE__ */ jsx(Lock, {}),
              "Microsoft Azure Application"
            ] }),
            /* @__PURE__ */ jsx(FullWidthField, { children: /* @__PURE__ */ jsxs(Field.Root, { required: true, children: [
              /* @__PURE__ */ jsx(Field.Label, { children: "Tenant (Directory) ID" }),
              /* @__PURE__ */ jsx(
                TextInput,
                {
                  placeholder: "87654321-4321-4321-4321-987654321abc",
                  value: formData.microsoftTenantId,
                  onChange: (e) => handleChange("microsoftTenantId", e.target.value)
                }
              ),
              /* @__PURE__ */ jsx(Field.Hint, { children: "Found in Azure Portal → App Registrations → Your App → Overview (next to Application ID). Also a GUID format. Required for OAuth!" })
            ] }) }),
            /* @__PURE__ */ jsx(FullWidthField, { children: /* @__PURE__ */ jsxs(Field.Root, { required: true, children: [
              /* @__PURE__ */ jsx(Field.Label, { children: "Application (Client) ID" }),
              /* @__PURE__ */ jsx(
                TextInput,
                {
                  placeholder: "12345678-1234-1234-1234-123456789abc",
                  value: formData.oauthClientId,
                  onChange: (e) => handleChange("oauthClientId", e.target.value)
                }
              ),
              /* @__PURE__ */ jsx(Field.Hint, { children: "Found in Azure Portal → App Registrations → Your App → Overview. It's a GUID format." })
            ] }) }),
            /* @__PURE__ */ jsx(FullWidthField, { children: /* @__PURE__ */ jsxs(Field.Root, { required: true, children: [
              /* @__PURE__ */ jsx(Field.Label, { children: "Client Secret Value" }),
              /* @__PURE__ */ jsx(
                TextInput,
                {
                  type: "password",
                  placeholder: "abc~123XYZ...",
                  value: formData.oauthClientSecret,
                  onChange: (e) => handleChange("oauthClientSecret", e.target.value)
                }
              ),
              /* @__PURE__ */ jsx(Field.Hint, { children: "From Azure Portal → Certificates & secrets → Client secrets. Copy the VALUE, not the Secret ID. Keep this secret!" })
            ] }) }),
            /* @__PURE__ */ jsx(Divider, {}),
            oauthCode ? /* @__PURE__ */ jsx(Alert, { variant: "success", title: "✅ OAuth Authorized!", children: /* @__PURE__ */ jsx(Typography, { variant: "pi", children: `You've successfully authorized with Microsoft! Click "Continue" to proceed to settings.` }) }) : /* @__PURE__ */ jsxs(Box, { children: [
              /* @__PURE__ */ jsx(Typography, { variant: "omega", textColor: "neutral600", marginBottom: 3, children: "After entering your credentials above, click the button below to connect with Microsoft:" }),
              /* @__PURE__ */ jsx(
                Button,
                {
                  onClick: startMicrosoftOAuth,
                  variant: "secondary",
                  size: "L",
                  disabled: !formData.oauthClientId,
                  style: {
                    width: "100%",
                    background: "#00A4EF",
                    color: "white",
                    fontWeight: 600
                  },
                  children: "🔐 Connect with Microsoft"
                }
              )
            ] }),
            /* @__PURE__ */ jsxs(
              Box,
              {
                padding: 4,
                background: "neutral100",
                hasRadius: true,
                style: {
                  border: `1px solid ${colors$1.border}`,
                  borderRadius: "8px"
                },
                children: [
                  /* @__PURE__ */ jsx(
                    Typography,
                    {
                      fontWeight: "semiBold",
                      marginBottom: 3,
                      style: { fontSize: "15px" },
                      children: "📋 Setup Guide"
                    }
                  ),
                  /* @__PURE__ */ jsxs(Flex, { direction: "column", gap: 2, style: { fontSize: "14px", lineHeight: "1.6" }, children: [
                    /* @__PURE__ */ jsxs(Box, { children: [
                      /* @__PURE__ */ jsx("strong", { children: "1." }),
                      " Go to ",
                      /* @__PURE__ */ jsx("a", { href: "https://portal.azure.com", target: "_blank", rel: "noopener noreferrer", style: { color: colors$1.primary, textDecoration: "underline" }, children: "portal.azure.com" })
                    ] }),
                    /* @__PURE__ */ jsxs(Box, { children: [
                      /* @__PURE__ */ jsx("strong", { children: "2." }),
                      " Navigate to Azure Active Directory → App registrations → New registration"
                    ] }),
                    /* @__PURE__ */ jsxs(Box, { children: [
                      /* @__PURE__ */ jsx("strong", { children: "3." }),
                      ' Name your app (e.g., "MagicMail") and select "Accounts in this organizational directory only"'
                    ] }),
                    /* @__PURE__ */ jsxs(Box, { children: [
                      /* @__PURE__ */ jsx("strong", { children: "Important:" }),
                      " Copy both ",
                      /* @__PURE__ */ jsx("strong", { children: "Application (client) ID" }),
                      " AND ",
                      /* @__PURE__ */ jsx("strong", { children: "Directory (tenant) ID" }),
                      " from the Overview page!"
                    ] }),
                    /* @__PURE__ */ jsxs(Box, { children: [
                      /* @__PURE__ */ jsx("strong", { children: "4." }),
                      " Add this redirect URI:"
                    ] }),
                    /* @__PURE__ */ jsxs(Flex, { gap: 2, alignItems: "center", children: [
                      /* @__PURE__ */ jsx(
                        Box,
                        {
                          padding: 2,
                          background: "neutral0",
                          hasRadius: true,
                          style: {
                            flex: 1,
                            fontFamily: "monospace",
                            fontSize: "13px",
                            wordBreak: "break-all",
                            color: colors$1.textSecondary,
                            border: `1px solid ${colors$1.border}`
                          },
                          children: `${window.location.origin}/magic-mail/oauth/microsoft/callback`
                        }
                      ),
                      /* @__PURE__ */ jsx(
                        Button,
                        {
                          variant: "secondary",
                          size: "S",
                          onClick: () => {
                            navigator.clipboard.writeText(`${window.location.origin}/magic-mail/oauth/microsoft/callback`);
                            toggleNotification({
                              type: "success",
                              message: "Redirect URI copied to clipboard!"
                            });
                          },
                          children: "Copy"
                        }
                      )
                    ] }),
                    /* @__PURE__ */ jsxs(Box, { children: [
                      /* @__PURE__ */ jsx("strong", { children: "5." }),
                      " Under API permissions → Add a permission → Microsoft Graph → Delegated permissions:"
                    ] }),
                    /* @__PURE__ */ jsxs(Box, { style: { marginLeft: "20px", marginTop: "8px" }, children: [
                      "• ",
                      /* @__PURE__ */ jsx("code", { children: "Mail.Send" }),
                      " - Send emails as the signed-in user",
                      /* @__PURE__ */ jsx("br", {}),
                      "• ",
                      /* @__PURE__ */ jsx("code", { children: "User.Read" }),
                      " - Read user profile (email address)",
                      /* @__PURE__ */ jsx("br", {}),
                      "• ",
                      /* @__PURE__ */ jsx("code", { children: "offline_access" }),
                      " - Maintain access to data (refresh tokens)",
                      /* @__PURE__ */ jsx("br", {}),
                      "• ",
                      /* @__PURE__ */ jsx("code", { children: "openid" }),
                      " - Sign users in",
                      /* @__PURE__ */ jsx("br", {}),
                      "• ",
                      /* @__PURE__ */ jsx("code", { children: "email" }),
                      " - View users' email address"
                    ] }),
                    /* @__PURE__ */ jsxs(Box, { children: [
                      /* @__PURE__ */ jsx("strong", { children: "6." }),
                      ' Click "Grant admin consent" for your organization (Required!)'
                    ] }),
                    /* @__PURE__ */ jsxs(Box, { children: [
                      /* @__PURE__ */ jsx("strong", { children: "7." }),
                      " Under Certificates & secrets → Client secrets → New client secret"
                    ] }),
                    /* @__PURE__ */ jsxs(Box, { children: [
                      /* @__PURE__ */ jsx("strong", { children: "8." }),
                      " Copy the ",
                      /* @__PURE__ */ jsx("strong", { children: "Value" }),
                      " (not Secret ID) immediately - it won't be shown again"
                    ] })
                  ] })
                ]
              }
            )
          ] })
        ] }),
        provider === "yahoo-oauth" && /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(InfoAlert, { variant: "success", title: "🔒 OAuth 2.0 Security", marginBottom: 4, children: "No passwords stored. Users authenticate directly with Yahoo for maximum security." }),
          /* @__PURE__ */ jsxs(Flex, { direction: "column", gap: 4, style: { width: "100%" }, children: [
            /* @__PURE__ */ jsxs(SectionTitle, { children: [
              /* @__PURE__ */ jsx(Lock, {}),
              "Yahoo Developer Application"
            ] }),
            /* @__PURE__ */ jsx(FullWidthField, { children: /* @__PURE__ */ jsxs(Field.Root, { required: true, children: [
              /* @__PURE__ */ jsx(Field.Label, { children: "Yahoo Client ID" }),
              /* @__PURE__ */ jsx(
                TextInput,
                {
                  placeholder: "dj0yJmk9...",
                  value: formData.oauthClientId,
                  onChange: (e) => handleChange("oauthClientId", e.target.value)
                }
              ),
              /* @__PURE__ */ jsx(Field.Hint, { children: 'Found in Yahoo Developer Console → Your App → App Information. Starts with "dj0y..."' })
            ] }) }),
            /* @__PURE__ */ jsx(FullWidthField, { children: /* @__PURE__ */ jsxs(Field.Root, { required: true, children: [
              /* @__PURE__ */ jsx(Field.Label, { children: "Yahoo Client Secret" }),
              /* @__PURE__ */ jsx(
                TextInput,
                {
                  type: "password",
                  placeholder: "abc123def456...",
                  value: formData.oauthClientSecret,
                  onChange: (e) => handleChange("oauthClientSecret", e.target.value)
                }
              ),
              /* @__PURE__ */ jsx(Field.Hint, { children: "Keep this secret! Found in the same App Information section. Never share or commit to git." })
            ] }) }),
            /* @__PURE__ */ jsx(Divider, {}),
            oauthCode ? /* @__PURE__ */ jsx(Alert, { variant: "success", title: "✅ OAuth Authorized!", children: /* @__PURE__ */ jsx(Typography, { variant: "pi", children: `You've successfully authorized with Yahoo Mail! Click "Continue" to proceed to settings.` }) }) : /* @__PURE__ */ jsxs(Box, { children: [
              /* @__PURE__ */ jsx(Typography, { variant: "omega", textColor: "neutral600", marginBottom: 3, children: "After entering your credentials above, click the button below to connect with Yahoo:" }),
              /* @__PURE__ */ jsx(
                Button,
                {
                  onClick: startYahooOAuth,
                  variant: "secondary",
                  size: "L",
                  disabled: !formData.oauthClientId,
                  style: {
                    width: "100%",
                    background: "#6001D2",
                    color: "white",
                    fontWeight: 600
                  },
                  children: "🔐 Connect with Yahoo"
                }
              )
            ] }),
            /* @__PURE__ */ jsxs(
              Box,
              {
                padding: 4,
                background: "neutral100",
                hasRadius: true,
                style: {
                  border: `1px solid ${colors$1.border}`,
                  borderRadius: "8px"
                },
                children: [
                  /* @__PURE__ */ jsx(
                    Typography,
                    {
                      fontWeight: "semiBold",
                      marginBottom: 3,
                      style: { fontSize: "15px" },
                      children: "📋 Setup Guide"
                    }
                  ),
                  /* @__PURE__ */ jsxs(Flex, { direction: "column", gap: 2, style: { fontSize: "14px", lineHeight: "1.6" }, children: [
                    /* @__PURE__ */ jsxs(Box, { children: [
                      /* @__PURE__ */ jsx("strong", { children: "1." }),
                      " Go to ",
                      /* @__PURE__ */ jsx("a", { href: "https://developer.yahoo.com/apps/", target: "_blank", rel: "noopener noreferrer", style: { color: colors$1.primary, textDecoration: "underline" }, children: "developer.yahoo.com/apps" })
                    ] }),
                    /* @__PURE__ */ jsxs(Box, { children: [
                      /* @__PURE__ */ jsx("strong", { children: "2." }),
                      ' Click "Create an App"'
                    ] }),
                    /* @__PURE__ */ jsxs(Box, { children: [
                      /* @__PURE__ */ jsx("strong", { children: "3." }),
                      " Fill in app details (name, description)"
                    ] }),
                    /* @__PURE__ */ jsxs(Box, { children: [
                      /* @__PURE__ */ jsx("strong", { children: "4." }),
                      " Add this redirect URI:"
                    ] }),
                    /* @__PURE__ */ jsxs(Flex, { gap: 2, alignItems: "center", children: [
                      /* @__PURE__ */ jsx(
                        Box,
                        {
                          padding: 2,
                          background: "neutral0",
                          hasRadius: true,
                          style: {
                            flex: 1,
                            fontFamily: "monospace",
                            fontSize: "13px",
                            wordBreak: "break-all",
                            color: colors$1.textSecondary,
                            border: `1px solid ${colors$1.border}`
                          },
                          children: `${window.location.origin}/magic-mail/oauth/yahoo/callback`
                        }
                      ),
                      /* @__PURE__ */ jsx(
                        Button,
                        {
                          variant: "secondary",
                          size: "S",
                          onClick: () => {
                            navigator.clipboard.writeText(`${window.location.origin}/magic-mail/oauth/yahoo/callback`);
                            toggleNotification({
                              type: "success",
                              message: "Redirect URI copied to clipboard!"
                            });
                          },
                          children: "Copy"
                        }
                      )
                    ] }),
                    /* @__PURE__ */ jsxs(Box, { children: [
                      /* @__PURE__ */ jsx("strong", { children: "5." }),
                      " Under API Permissions, enable:"
                    ] }),
                    /* @__PURE__ */ jsxs(Box, { style: { marginLeft: "20px" }, children: [
                      "• ",
                      /* @__PURE__ */ jsx("code", { children: "Mail" }),
                      " - Send and manage emails",
                      /* @__PURE__ */ jsx("br", {}),
                      "• ",
                      /* @__PURE__ */ jsx("code", { children: "OpenID Connect" }),
                      " - User authentication"
                    ] }),
                    /* @__PURE__ */ jsxs(Box, { children: [
                      /* @__PURE__ */ jsx("strong", { children: "6." }),
                      " Note your Client ID and Client Secret from the app settings"
                    ] })
                  ] })
                ]
              }
            )
          ] })
        ] }),
        provider === "sendgrid" && /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(InfoAlert, { variant: "success", title: "🔒 API Key Security", marginBottom: 4, children: "Your API key will be encrypted with AES-256-GCM before storage." }),
          /* @__PURE__ */ jsxs(Flex, { direction: "column", gap: 4, style: { width: "100%" }, children: [
            /* @__PURE__ */ jsxs(SectionTitle, { children: [
              /* @__PURE__ */ jsx(Key, {}),
              "SendGrid API Configuration"
            ] }),
            /* @__PURE__ */ jsx(FullWidthField, { children: /* @__PURE__ */ jsxs(Field.Root, { required: true, children: [
              /* @__PURE__ */ jsx(Field.Label, { children: "SendGrid API Key" }),
              /* @__PURE__ */ jsx(
                TextInput,
                {
                  type: "password",
                  placeholder: "SG.xxxxxxxxxxxxxxxxxxxxxx",
                  value: formData.apiKey,
                  onChange: (e) => handleChange("apiKey", e.target.value)
                }
              ),
              /* @__PURE__ */ jsx(Field.Hint, { children: 'Found in SendGrid Dashboard → Settings → API Keys. Create a new key with "Mail Send" permission' })
            ] }) }),
            /* @__PURE__ */ jsx(Alert, { variant: "default", title: "📖 SendGrid Resources", children: /* @__PURE__ */ jsxs(Typography, { variant: "pi", children: [
              /* @__PURE__ */ jsx("strong", { children: "Dashboard:" }),
              " ",
              /* @__PURE__ */ jsx("a", { href: "https://app.sendgrid.com", target: "_blank", rel: "noopener noreferrer", style: { color: "var(--colors-primary600, #0284c7)" }, children: "app.sendgrid.com" }),
              /* @__PURE__ */ jsx("br", {}),
              /* @__PURE__ */ jsx("strong", { children: "API Keys:" }),
              " Settings → API Keys → Create API Key",
              /* @__PURE__ */ jsx("br", {}),
              /* @__PURE__ */ jsx("strong", { children: "Required Scope:" }),
              " Mail Send (Full Access)",
              /* @__PURE__ */ jsx("br", {}),
              /* @__PURE__ */ jsx("strong", { children: "Docs:" }),
              " ",
              /* @__PURE__ */ jsx("a", { href: "https://docs.sendgrid.com", target: "_blank", rel: "noopener noreferrer", style: { color: "var(--colors-primary600, #0284c7)" }, children: "docs.sendgrid.com" })
            ] }) })
          ] })
        ] }),
        provider === "mailgun" && /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(InfoAlert, { variant: "success", title: "🔒 API Key Security", marginBottom: 4, children: "Your API key will be encrypted with AES-256-GCM before storage." }),
          /* @__PURE__ */ jsxs(Flex, { direction: "column", gap: 4, style: { width: "100%" }, children: [
            /* @__PURE__ */ jsxs(SectionTitle, { children: [
              /* @__PURE__ */ jsx(Key, {}),
              "Mailgun API Configuration"
            ] }),
            /* @__PURE__ */ jsx(FullWidthField, { children: /* @__PURE__ */ jsxs(Field.Root, { required: true, children: [
              /* @__PURE__ */ jsx(Field.Label, { children: "Mailgun Domain" }),
              /* @__PURE__ */ jsx(
                TextInput,
                {
                  placeholder: "mg.yourdomain.com or sandbox-xxx.mailgun.org",
                  value: formData.mailgunDomain,
                  onChange: (e) => handleChange("mailgunDomain", e.target.value)
                }
              ),
              /* @__PURE__ */ jsx(Field.Hint, { children: "Your verified Mailgun domain (e.g., mg.yourdomain.com) or sandbox domain for testing" })
            ] }) }),
            /* @__PURE__ */ jsx(FullWidthField, { children: /* @__PURE__ */ jsxs(Field.Root, { required: true, children: [
              /* @__PURE__ */ jsx(Field.Label, { children: "Mailgun API Key" }),
              /* @__PURE__ */ jsx(
                TextInput,
                {
                  type: "password",
                  placeholder: "key-xxxxxxxxxxxxxxxxxxxxxxxx",
                  value: formData.apiKey,
                  onChange: (e) => handleChange("apiKey", e.target.value)
                }
              ),
              /* @__PURE__ */ jsx(Field.Hint, { children: "Found in Mailgun Dashboard → Settings → API Keys. Use your Private API key, not the Public Validation key" })
            ] }) }),
            /* @__PURE__ */ jsx(Alert, { variant: "default", title: "📖 Mailgun Resources", children: /* @__PURE__ */ jsxs(Typography, { variant: "pi", children: [
              /* @__PURE__ */ jsx("strong", { children: "Dashboard:" }),
              " ",
              /* @__PURE__ */ jsx("a", { href: "https://app.mailgun.com", target: "_blank", rel: "noopener noreferrer", style: { color: "var(--colors-primary600, #0284c7)" }, children: "app.mailgun.com" }),
              /* @__PURE__ */ jsx("br", {}),
              /* @__PURE__ */ jsx("strong", { children: "API Keys:" }),
              " Settings → API Security → Private API Key",
              /* @__PURE__ */ jsx("br", {}),
              /* @__PURE__ */ jsx("strong", { children: "Domains:" }),
              " Sending → Domains (verify your domain or use sandbox)",
              /* @__PURE__ */ jsx("br", {}),
              /* @__PURE__ */ jsx("strong", { children: "Docs:" }),
              " ",
              /* @__PURE__ */ jsx("a", { href: "https://documentation.mailgun.com", target: "_blank", rel: "noopener noreferrer", style: { color: "var(--colors-primary600, #0284c7)" }, children: "documentation.mailgun.com" })
            ] }) })
          ] })
        ] })
      ] }),
      currentStep === 4 && /* @__PURE__ */ jsx(FormSection, { children: /* @__PURE__ */ jsxs(Flex, { direction: "column", gap: 5, style: { width: "100%" }, children: [
        /* @__PURE__ */ jsxs(Box, { children: [
          /* @__PURE__ */ jsx(Typography, { fontWeight: "semiBold", marginBottom: 2, style: { fontSize: "15px" }, children: "Daily Email Limit" }),
          /* @__PURE__ */ jsx(
            NumberInput,
            {
              value: formData.dailyLimit,
              onValueChange: (value) => handleChange("dailyLimit", value)
            }
          ),
          /* @__PURE__ */ jsx(Typography, { variant: "pi", textColor: "neutral600", marginTop: 2, style: { fontSize: "13px", lineHeight: "1.5" }, children: "Maximum number of emails this account can send per day. Set to 0 for unlimited." })
        ] }),
        /* @__PURE__ */ jsxs(Box, { children: [
          /* @__PURE__ */ jsx(Typography, { fontWeight: "semiBold", marginBottom: 2, style: { fontSize: "15px" }, children: "Hourly Email Limit" }),
          /* @__PURE__ */ jsx(
            NumberInput,
            {
              value: formData.hourlyLimit,
              onValueChange: (value) => handleChange("hourlyLimit", value)
            }
          ),
          /* @__PURE__ */ jsx(Typography, { variant: "pi", textColor: "neutral600", marginTop: 2, style: { fontSize: "13px", lineHeight: "1.5" }, children: "Maximum number of emails this account can send per hour. Set to 0 for unlimited." })
        ] }),
        /* @__PURE__ */ jsxs(Box, { children: [
          /* @__PURE__ */ jsx(Typography, { fontWeight: "semiBold", marginBottom: 2, style: { fontSize: "15px" }, children: "Account Priority" }),
          /* @__PURE__ */ jsx(
            NumberInput,
            {
              value: formData.priority,
              onValueChange: (value) => handleChange("priority", value),
              min: 1,
              max: 10
            }
          ),
          /* @__PURE__ */ jsx(Typography, { variant: "pi", textColor: "neutral600", marginTop: 2, style: { fontSize: "13px", lineHeight: "1.5" }, children: "When routing emails, accounts with higher priority (1-10) are preferred. Use 10 for your most reliable account." })
        ] }),
        /* @__PURE__ */ jsx(Divider, {}),
        /* @__PURE__ */ jsx(
          Box,
          {
            padding: 4,
            background: formData.isActive ? "rgba(34, 197, 94, 0.15)" : "rgba(220, 38, 38, 0.12)",
            hasRadius: true,
            style: {
              border: formData.isActive ? "2px solid var(--colors-success600, #22C55E)" : "2px solid var(--colors-danger600, #EF4444)",
              borderRadius: "8px",
              transition: "all 0.2s ease"
            },
            children: /* @__PURE__ */ jsxs(Flex, { gap: 3, alignItems: "flex-start", children: [
              /* @__PURE__ */ jsx(Box, { style: { paddingTop: "2px" }, children: /* @__PURE__ */ jsx(
                Toggle,
                {
                  checked: formData.isActive,
                  onChange: () => handleChange("isActive", !formData.isActive)
                }
              ) }),
              /* @__PURE__ */ jsxs(Box, { style: { flex: 1 }, children: [
                /* @__PURE__ */ jsxs(Flex, { alignItems: "center", gap: 2, marginBottom: 1, children: [
                  /* @__PURE__ */ jsxs(Typography, { fontWeight: "semiBold", style: { fontSize: "15px" }, children: [
                    formData.isActive ? "✅" : "❌",
                    " Account Active"
                  ] }),
                  formData.isActive ? /* @__PURE__ */ jsx(Badge, { backgroundColor: "success600", textColor: "neutral0", size: "S", children: "ENABLED" }) : /* @__PURE__ */ jsx(Badge, { backgroundColor: "danger600", textColor: "neutral0", size: "S", children: "DISABLED" })
                ] }),
                /* @__PURE__ */ jsx(Typography, { variant: "pi", textColor: "neutral600", style: { lineHeight: "1.6" }, children: formData.isActive ? "This account is enabled and can send emails. Disable it to prevent sending without deleting the account." : "This account is disabled and will not send any emails. Enable it to start sending again." })
              ] })
            ] })
          }
        ),
        /* @__PURE__ */ jsx(
          Box,
          {
            padding: 4,
            background: formData.isPrimary ? "rgba(245, 158, 11, 0.15)" : "neutral100",
            hasRadius: true,
            style: {
              border: formData.isPrimary ? "2px solid var(--colors-warning600, #F59E0B)" : `1px solid ${colors$1.border}`,
              borderRadius: "8px",
              transition: "all 0.2s ease"
            },
            children: /* @__PURE__ */ jsxs(Flex, { gap: 3, alignItems: "flex-start", children: [
              /* @__PURE__ */ jsx(Box, { style: { paddingTop: "2px" }, children: /* @__PURE__ */ jsx(
                Toggle,
                {
                  checked: formData.isPrimary,
                  onChange: () => handleChange("isPrimary", !formData.isPrimary)
                }
              ) }),
              /* @__PURE__ */ jsxs(Box, { style: { flex: 1 }, children: [
                /* @__PURE__ */ jsxs(Flex, { alignItems: "center", gap: 2, marginBottom: 1, children: [
                  /* @__PURE__ */ jsx(Typography, { fontWeight: "semiBold", style: { fontSize: "15px" }, children: "⭐ Set as Primary Account" }),
                  formData.isPrimary && /* @__PURE__ */ jsx(Badge, { backgroundColor: "warning600", textColor: "neutral0", size: "S", children: "PRIMARY" })
                ] }),
                /* @__PURE__ */ jsx(Typography, { variant: "pi", textColor: "neutral600", style: { lineHeight: "1.6" }, children: "This account will be used by default when sending emails if no specific account is selected. Only one account can be primary at a time." })
              ] })
            ] })
          }
        )
      ] }) })
    ] }) }),
    /* @__PURE__ */ jsx(Modal.Footer, { children: /* @__PURE__ */ jsxs(Flex, { justifyContent: "space-between", style: { width: "100%" }, children: [
      /* @__PURE__ */ jsx("div", { children: currentStep > 1 && /* @__PURE__ */ jsx(
        TertiaryButton,
        {
          startIcon: /* @__PURE__ */ jsx(ArrowLeft, {}),
          onClick: () => setCurrentStep(currentStep - 1),
          children: "Back"
        }
      ) }),
      /* @__PURE__ */ jsxs(Flex, { gap: 2, children: [
        /* @__PURE__ */ jsx(TertiaryButton, { onClick: onClose, children: "Cancel" }),
        currentStep < 4 ? /* @__PURE__ */ jsx(
          GradientButton$1,
          {
            endIcon: /* @__PURE__ */ jsx(ArrowRight, {}),
            onClick: () => setCurrentStep(currentStep + 1),
            disabled: !canProceed(),
            children: "Continue"
          }
        ) : /* @__PURE__ */ jsx(
          GradientButton$1,
          {
            onClick: handleSubmit,
            loading,
            disabled: !canProceed(),
            startIcon: /* @__PURE__ */ jsx(Check, {}),
            children: isEditMode ? "Update Account" : "Create Account"
          }
        )
      ] })
    ] }) })
  ] }) });
};
const fadeIn$5 = keyframes`
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
`;
const shimmer$3 = keyframes`
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
`;
const float$3 = keyframes`
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-5px); }
`;
const pulse$2 = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
`;
const FloatingEmoji$1 = styled.div`
  position: absolute;
  bottom: 40px;
  right: 40px;
  font-size: 72px;
  opacity: 0.08;
  ${css`animation: ${float$3} 4s ease-in-out infinite;`}
`;
const breakpoints$3 = {
  mobile: "768px"
};
const Container$4 = styled(Box)`
  ${css`animation: ${fadeIn$5} ${theme$3.transitions.slow};`}
  min-height: 100vh;
  max-width: 1440px;
  margin: 0 auto;
  padding: ${theme$3.spacing.xl} ${theme$3.spacing.lg} 0;
  
  @media screen and (max-width: ${breakpoints$3.mobile}) {
    padding: 16px 12px 0;
  }
`;
const Header$4 = styled(Box)`
  background: linear-gradient(135deg, 
    ${"var(--colors-primary600, #0284C7)"} 0%, 
    var(--colors-secondary600, #7C3AED) 100%
  );
  border-radius: ${theme$3.borderRadius.xl};
  padding: ${theme$3.spacing.xl} ${theme$3.spacing["2xl"]};
  margin-bottom: ${theme$3.spacing.xl};
  position: relative;
  overflow: hidden;
  box-shadow: ${theme$3.shadows.xl};
  
  @media screen and (max-width: ${breakpoints$3.mobile}) {
    padding: 24px 20px;
    border-radius: 12px;
  }
  
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 200%;
    height: 100%;
    background: linear-gradient(
      90deg, 
      transparent, 
      rgba(255, 255, 255, 0.15), 
      transparent
    );
    ${css`animation: ${shimmer$3} 3s infinite;`}
  }
  
  &::after {
    content: '';
    position: absolute;
    top: 0;
    right: 0;
    width: 100%;
    height: 100%;
    background-image: radial-gradient(circle at 20% 80%, transparent 50%, rgba(255, 255, 255, 0.1) 50%);
    background-size: 15px 15px;
    opacity: 0.3;
  }
`;
const HeaderContent$3 = styled(Flex)`
  position: relative;
  z-index: 1;
`;
const Title$3 = styled(Typography)`
  color: white;
  font-size: 2rem;
  font-weight: 700;
  letter-spacing: -0.025em;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  display: flex;
  align-items: center;
  gap: ${theme$3.spacing.sm};
  
  svg {
    width: 28px;
    height: 28px;
    ${css`animation: ${float$3} 3s ease-in-out infinite;`}
  }
  
  @media screen and (max-width: ${breakpoints$3.mobile}) {
    font-size: 1.5rem;
    
    svg {
      width: 22px;
      height: 22px;
    }
  }
`;
const Subtitle$3 = styled(Typography)`
  color: rgba(255, 255, 255, 0.95);
  font-size: 0.95rem;
  font-weight: 400;
  margin-top: ${theme$3.spacing.xs};
  letter-spacing: 0.01em;
  
  @media screen and (max-width: ${breakpoints$3.mobile}) {
    font-size: 0.85rem;
  }
`;
const StatsGrid$3 = styled.div`
  margin-bottom: ${theme$3.spacing.xl};
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: ${theme$3.spacing.lg};
  justify-content: center;
  max-width: 1200px;
  margin-left: auto;
  margin-right: auto;
  
  @media screen and (max-width: ${breakpoints$3.mobile}) {
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
    margin-bottom: 24px;
  }
`;
const StatCard$3 = styled(Box)`
  background: ${(p) => p.theme.colors.neutral0};
  border-radius: ${theme$3.borderRadius.lg};
  padding: 28px ${theme$3.spacing.lg};
  position: relative;
  overflow: hidden;
  transition: all ${theme$3.transitions.normal};
  ${css`animation: ${fadeIn$5} ${theme$3.transitions.slow} backwards;`}
  animation-delay: ${(props) => props.$delay || "0s"};
  box-shadow: ${theme$3.shadows.sm};
  border: 1px solid rgba(128, 128, 128, 0.2);
  min-width: 200px;
  flex: 1;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  
  @media screen and (max-width: ${breakpoints$3.mobile}) {
    min-width: unset;
    padding: 20px 12px;
    
    &:hover {
      transform: none;
    }
  }
  
  &:hover {
    transform: translateY(-6px);
    box-shadow: ${theme$3.shadows.xl};
    border-color: ${(props) => props.$color || "var(--colors-primary600, #0EA5E9)"};
    
    .stat-icon {
      transform: scale(1.15) rotate(5deg);
    }
    
    .stat-value {
      transform: scale(1.08);
      color: ${(props) => props.$color || "var(--colors-primary600, #0284C7)"};
    }
  }
`;
const StatIcon$3 = styled(Box)`
  width: 68px;
  height: 68px;
  border-radius: ${theme$3.borderRadius.lg};
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${(props) => props.$bg || "rgba(2, 132, 199, 0.12)"};
  transition: all ${theme$3.transitions.normal};
  margin: 0 auto 20px;
  box-shadow: ${theme$3.shadows.sm};
  
  svg {
    width: 34px;
    height: 34px;
    color: ${(props) => props.$color || "var(--colors-primary600, #0284C7)"};
  }
  
  @media screen and (max-width: ${breakpoints$3.mobile}) {
    width: 48px;
    height: 48px;
    margin-bottom: 12px;
    
    svg {
      width: 24px;
      height: 24px;
    }
  }
`;
const StatValue$3 = styled(Typography)`
  font-size: 2.75rem;
  font-weight: 700;
  color: var(--colors-neutral800);
  line-height: 1;
  margin-bottom: 10px;
  transition: all ${theme$3.transitions.normal};
  text-align: center;
  
  @media screen and (max-width: ${breakpoints$3.mobile}) {
    font-size: 2rem;
    margin-bottom: 6px;
  }
`;
const StatLabel$3 = styled(Typography)`
  font-size: 0.95rem;
  color: var(--colors-neutral600);
  font-weight: 500;
  letter-spacing: 0.025em;
  text-align: center;
  
  @media screen and (max-width: ${breakpoints$3.mobile}) {
    font-size: 0.8rem;
  }
`;
const AccountsContainer = styled(Box)`
  margin-top: ${theme$3.spacing.xl};
`;
const EmptyState$3 = styled(Box)`
  background: ${(p) => p.theme.colors.neutral0};
  border-radius: ${theme$3.borderRadius.xl};
  border: 2px dashed rgba(128, 128, 128, 0.3);
  padding: 80px 32px;
  text-align: center;
  position: relative;
  overflow: hidden;
  min-height: 400px;
  display: flex;
  align-items: center;
  justify-content: center;
  
  /* Background Gradient */
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(135deg, ${"rgba(2, 132, 199, 0.06)"} 0%, rgba(168, 85, 247, 0.06) 100%);
    opacity: 0.3;
    z-index: 0;
  }
`;
const OnlineBadge$1 = styled.div`
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: ${(props) => props.$active ? "var(--colors-success600, #22C55E)" : "rgba(128, 128, 128, 0.4)"};
  display: inline-block;
  margin-right: 8px;
  ${css`animation: ${(props) => props.$active ? pulse$2 : "none"} 2s ease-in-out infinite;`}
`;
const StyledTable$3 = styled(Table)`
  thead {
    background: var(--colors-neutral100);
    border-bottom: 2px solid rgba(128, 128, 128, 0.2);
    
    th {
      font-weight: 600;
      color: var(--colors-neutral800);
      font-size: 0.875rem;
      text-transform: uppercase;
      letter-spacing: 0.025em;
      padding: ${theme$3.spacing.lg} ${theme$3.spacing.lg};
    }
  }
  
  tbody tr {
    transition: all ${theme$3.transitions.fast};
    border-bottom: 1px solid rgba(128, 128, 128, 0.15);
    
    &:last-child {
      border-bottom: none;
    }
    
    &:hover {
      background: rgba(2, 132, 199, 0.12);
    }
    
    td {
      padding: ${theme$3.spacing.lg} ${theme$3.spacing.lg};
      color: var(--colors-neutral800);
      vertical-align: middle;
    }
  }
`;
const FilterBar$3 = styled(Flex)`
  background: ${(p) => p.theme.colors.neutral0};
  padding: ${theme$3.spacing.md} ${theme$3.spacing.lg};
  border-radius: ${theme$3.borderRadius.lg};
  margin-bottom: ${theme$3.spacing.lg};
  box-shadow: ${theme$3.shadows.sm};
  border: 1px solid rgba(128, 128, 128, 0.2);
  gap: ${theme$3.spacing.md};
  align-items: center;
`;
const SearchInputWrapper$2 = styled.div`
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
`;
const SearchIcon$2 = styled(MagnifyingGlassIcon)`
  position: absolute;
  left: 12px;
  width: 16px;
  height: 16px;
  color: var(--colors-neutral600);
  pointer-events: none;
`;
const StyledSearchInput$2 = styled.input`
  width: 100%;
  padding: 10px 12px 10px 40px;
  border: 1px solid rgba(128, 128, 128, 0.2);
  border-radius: ${theme$3.borderRadius.md};
  font-size: 0.875rem;
  transition: all ${theme$3.transitions.fast};
  background: ${(p) => p.theme.colors.neutral0};
  color: var(--colors-neutral800);
  
  &:focus {
    outline: none;
    border-color: ${"var(--colors-primary600, #0EA5E9)"};
    box-shadow: 0 0 0 2px ${"rgba(2, 132, 199, 0.12)"};
  }
  
  &::placeholder {
    color: var(--colors-neutral500);
  }
`;
const StyledModalContent$1 = styled(Modal.Content)`
  && {
    border-radius: 16px;
    overflow: hidden;
    max-width: 560px;
    width: 90vw;
  }
`;
const StyledModalHeader$1 = styled(Modal.Header)`
  && {
    background: linear-gradient(135deg, ${"var(--colors-primary600, #0EA5E9)"} 0%, var(--colors-secondary600, #A855F7) 100%);
    padding: 24px 28px;
    border-bottom: none;
    
    h2 {
      color: white;
      font-size: 1.25rem;
      font-weight: 700;
    }
    
    button {
      color: white !important;
      opacity: 0.9;
      background: rgba(255, 255, 255, 0.15) !important;
      border-radius: 8px;
      
      &:hover {
        opacity: 1;
        background: rgba(255, 255, 255, 0.25) !important;
      }
      
      svg {
        fill: white !important;
        color: white !important;
        path { fill: white !important; }
      }
    }
  }
`;
const StyledModalBody$1 = styled(Modal.Body)`
  && {
    padding: 24px 28px;
    background: ${(p) => p.theme.colors.neutral0};
    width: 100%;
    box-sizing: border-box;
  }
`;
const StyledModalFooter$1 = styled(Modal.Footer)`
  && {
    padding: 20px 28px;
    border-top: 1px solid rgba(128, 128, 128, 0.2);
    background: var(--colors-neutral100);
  }
`;
const AccountInfoCard = styled(Box)`
  background: linear-gradient(135deg, ${"rgba(2, 132, 199, 0.06)"} 0%, rgba(168, 85, 247, 0.06) 100%);
  border: 1px solid ${"rgba(2, 132, 199, 0.2)"};
  border-radius: 12px;
  padding: 16px 20px;
  text-align: center;
  width: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
`;
const TestOptionCard = styled(Box)`
  padding: 16px 20px;
  border: 2px solid ${(props) => props.$selected ? "var(--colors-primary600, #0EA5E9)" : "rgba(128, 128, 128, 0.2)"};
  border-radius: 12px;
  cursor: pointer;
  transition: all ${theme$3.transitions.fast};
  background: ${(props) => props.$selected ? "rgba(2, 132, 199, 0.06)" : "${(p) => p.theme.colors.neutral0}"};
  
  &:hover {
    border-color: ${"rgba(2, 132, 199, 0.4)"};
    background: ${"rgba(2, 132, 199, 0.06)"};
  }
`;
const ModalFieldLabel = styled(Typography)`
  font-size: 13px;
  font-weight: 600;
  color: var(--colors-neutral700);
  margin-bottom: 8px;
  display: block;
`;
const ModalHint$1 = styled(Typography)`
  font-size: 12px;
  color: var(--colors-neutral500);
  margin-top: 6px;
`;
const StyledModalSelect = styled.select`
  width: 100%;
  padding: 12px 14px;
  border: 1px solid rgba(128, 128, 128, 0.2);
  border-radius: 8px;
  font-size: 14px;
  background: ${(p) => p.theme.colors.neutral0};
  color: var(--colors-neutral800);
  cursor: pointer;
  transition: all ${theme$3.transitions.fast};
  box-sizing: border-box;
  
  &:focus {
    outline: none;
    border-color: ${"var(--colors-primary600, #0EA5E9)"};
    box-shadow: 0 0 0 3px ${"rgba(2, 132, 199, 0.12)"};
  }
`;
const StyledModalInput = styled.input`
  width: 100%;
  padding: 12px 14px;
  border: 1px solid rgba(128, 128, 128, 0.2);
  border-radius: 8px;
  font-size: 14px;
  background: ${(p) => p.theme.colors.neutral0};
  color: var(--colors-neutral800);
  transition: all ${theme$3.transitions.fast};
  box-sizing: border-box;
  
  &:focus {
    outline: none;
    border-color: ${"var(--colors-primary600, #0EA5E9)"};
    box-shadow: 0 0 0 3px ${"rgba(2, 132, 199, 0.12)"};
  }
  
  &::placeholder {
    color: rgba(128, 128, 128, 0.4);
  }
`;
const HomePage = () => {
  useAuthRefresh();
  const { get, post, del } = useFetchClient();
  const { toggleNotification } = useNotification();
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [testingAccount, setTestingAccount] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterProvider, setFilterProvider] = useState("all");
  useEffect(() => {
    fetchAccounts();
  }, []);
  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const { data } = await get("/magic-mail/accounts");
      setAccounts(data.data || []);
    } catch (err) {
      console.error("[magic-mail] Error fetching accounts:", err);
      toggleNotification({
        type: "danger",
        message: "Failed to load email accounts"
      });
    } finally {
      setLoading(false);
    }
  };
  const testAccount = async (accountId, accountName, testEmail, testOptions = {}) => {
    toggleNotification({
      type: "info",
      message: `Testing ${accountName}...`
    });
    try {
      const { data } = await post(`/magic-mail/accounts/${accountId}/test`, {
        testEmail,
        priority: testOptions.priority || "normal",
        type: testOptions.type || "transactional",
        unsubscribeUrl: testOptions.unsubscribeUrl || null
      });
      toggleNotification({
        type: data.success ? "success" : "danger",
        message: data.message
      });
    } catch (err) {
      toggleNotification({
        type: "danger",
        message: "Test email failed"
      });
    }
  };
  const deleteAccount = async (accountId, accountName) => {
    if (!confirm(`Delete "${accountName}"?`)) return;
    try {
      await del(`/magic-mail/accounts/${accountId}`);
      toggleNotification({
        type: "success",
        message: "Account deleted successfully"
      });
      fetchAccounts();
    } catch (err) {
      toggleNotification({
        type: "danger",
        message: "Failed to delete account"
      });
    }
  };
  if (loading) {
    return /* @__PURE__ */ jsx(Flex, { justifyContent: "center", alignItems: "center", style: { minHeight: "400px" }, children: /* @__PURE__ */ jsx(Loader, { children: "Loading MagicMail..." }) });
  }
  const totalSentToday = accounts.reduce((sum, acc) => sum + (acc.emailsSentToday || 0), 0);
  const totalSent = accounts.reduce((sum, acc) => sum + (acc.totalEmailsSent || 0), 0);
  const activeAccounts = accounts.filter((a) => a.isActive).length;
  const filteredAccounts = accounts.filter((account) => {
    const matchesSearch = account.name.toLowerCase().includes(searchQuery.toLowerCase()) || account.fromEmail.toLowerCase().includes(searchQuery.toLowerCase()) || (account.provider || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === "all" || filterStatus === "active" && account.isActive || filterStatus === "inactive" && !account.isActive || filterStatus === "primary" && account.isPrimary;
    const matchesProvider = filterProvider === "all" || account.provider === filterProvider;
    return matchesSearch && matchesStatus && matchesProvider;
  });
  const uniqueProviders = [...new Set(accounts.map((a) => a.provider))].filter(Boolean);
  return /* @__PURE__ */ jsxs(Container$4, { children: [
    /* @__PURE__ */ jsx(Header$4, { children: /* @__PURE__ */ jsx(HeaderContent$3, { justifyContent: "space-between", alignItems: "center", children: /* @__PURE__ */ jsxs(Flex, { direction: "column", alignItems: "flex-start", gap: 2, children: [
      /* @__PURE__ */ jsxs(Title$3, { children: [
        /* @__PURE__ */ jsx(EnvelopeIcon, {}),
        "MagicMail - Email Business Suite"
      ] }),
      /* @__PURE__ */ jsx(Subtitle$3, { children: "Multi-account email management with smart routing and OAuth support" })
    ] }) }) }),
    /* @__PURE__ */ jsxs(StatsGrid$3, { children: [
      /* @__PURE__ */ jsxs(StatCard$3, { $delay: "0.1s", $color: "var(--colors-primary600, #0284C7)", children: [
        /* @__PURE__ */ jsx(StatIcon$3, { className: "stat-icon", $bg: "rgba(2, 132, 199, 0.12)", $color: "var(--colors-primary600, #0284C7)", children: /* @__PURE__ */ jsx(EnvelopeIcon, {}) }),
        /* @__PURE__ */ jsx(StatValue$3, { className: "stat-value", children: totalSentToday }),
        /* @__PURE__ */ jsx(StatLabel$3, { children: "Emails Today" })
      ] }),
      /* @__PURE__ */ jsxs(StatCard$3, { $delay: "0.2s", $color: "var(--colors-success600, #16A34A)", children: [
        /* @__PURE__ */ jsx(StatIcon$3, { className: "stat-icon", $bg: "rgba(22, 163, 74, 0.12)", $color: "var(--colors-success600, #16A34A)", children: /* @__PURE__ */ jsx(ServerIcon, {}) }),
        /* @__PURE__ */ jsx(StatValue$3, { className: "stat-value", children: totalSent }),
        /* @__PURE__ */ jsx(StatLabel$3, { children: "Total Sent" })
      ] }),
      /* @__PURE__ */ jsxs(StatCard$3, { $delay: "0.3s", $color: "var(--colors-warning600, #D97706)", children: [
        /* @__PURE__ */ jsx(StatIcon$3, { className: "stat-icon", $bg: "rgba(234, 179, 8, 0.12)", $color: "var(--colors-warning600, #D97706)", children: /* @__PURE__ */ jsx(SparklesIcon, {}) }),
        /* @__PURE__ */ jsxs(StatValue$3, { className: "stat-value", children: [
          activeAccounts,
          " / ",
          accounts.length
        ] }),
        /* @__PURE__ */ jsx(StatLabel$3, { children: "Active Accounts" })
      ] })
    ] }),
    accounts.length === 0 ? /* @__PURE__ */ jsxs(EmptyState$3, { children: [
      /* @__PURE__ */ jsx(FloatingEmoji$1, { children: "✉️" }),
      /* @__PURE__ */ jsxs(Flex, { direction: "column", alignItems: "center", gap: 6, style: { position: "relative", zIndex: 1 }, children: [
        /* @__PURE__ */ jsx(
          Box,
          {
            style: {
              width: "120px",
              height: "120px",
              borderRadius: "50%",
              background: `linear-gradient(135deg, ${"rgba(2, 132, 199, 0.12)"} 0%, rgba(168, 85, 247, 0.12) 100%)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: theme$3.shadows.xl
            },
            children: /* @__PURE__ */ jsx(EnvelopeIcon, { style: { width: "60px", height: "60px", color: "var(--colors-primary600, #0284C7)" } })
          }
        ),
        /* @__PURE__ */ jsx(
          Typography,
          {
            variant: "alpha",
            textColor: "neutral800",
            style: {
              fontSize: "1.75rem",
              fontWeight: "700",
              marginBottom: "8px"
            },
            children: "No Email Accounts Yet"
          }
        ),
        /* @__PURE__ */ jsx(
          Typography,
          {
            variant: "omega",
            textColor: "neutral600",
            style: {
              fontSize: "1rem",
              maxWidth: "500px",
              lineHeight: "1.6"
            },
            children: "Add your first email account to start sending emails through MagicMail's multi-account routing system"
          }
        ),
        /* @__PURE__ */ jsx(
          CTAButton,
          {
            startIcon: /* @__PURE__ */ jsx(PlusIcon, { style: { width: 20, height: 20 } }),
            onClick: () => setShowAddModal(true),
            children: "Add First Account"
          }
        )
      ] })
    ] }) : /* @__PURE__ */ jsxs(AccountsContainer, { children: [
      /* @__PURE__ */ jsx(Box, { style: { marginBottom: theme$3.spacing.md }, children: /* @__PURE__ */ jsxs(Flex, { justifyContent: "space-between", alignItems: "center", marginBottom: 4, children: [
        /* @__PURE__ */ jsx(Typography, { variant: "delta", textColor: "neutral700", style: { fontSize: "1.5rem", fontWeight: 600 }, children: "📧 Email Accounts" }),
        /* @__PURE__ */ jsx(GradientButton$1, { startIcon: /* @__PURE__ */ jsx(PlusIcon, { style: { width: 16, height: 16 } }), onClick: () => setShowAddModal(true), children: "Add Account" })
      ] }) }),
      /* @__PURE__ */ jsxs(FilterBar$3, { children: [
        /* @__PURE__ */ jsxs(SearchInputWrapper$2, { children: [
          /* @__PURE__ */ jsx(SearchIcon$2, {}),
          /* @__PURE__ */ jsx(
            StyledSearchInput$2,
            {
              value: searchQuery,
              onChange: (e) => setSearchQuery(e.target.value),
              placeholder: "Search by name, email, or provider...",
              type: "text"
            }
          )
        ] }),
        /* @__PURE__ */ jsx(Box, { style: { minWidth: "160px" }, children: /* @__PURE__ */ jsxs(
          SingleSelect,
          {
            value: filterStatus,
            onChange: setFilterStatus,
            placeholder: "Status",
            size: "S",
            children: [
              /* @__PURE__ */ jsx(SingleSelectOption, { value: "all", children: "All Accounts" }),
              /* @__PURE__ */ jsx(SingleSelectOption, { value: "active", children: "✅ Active" }),
              /* @__PURE__ */ jsx(SingleSelectOption, { value: "inactive", children: "❌ Inactive" }),
              /* @__PURE__ */ jsx(SingleSelectOption, { value: "primary", children: "⭐ Primary" })
            ]
          }
        ) }),
        /* @__PURE__ */ jsx(Box, { style: { minWidth: "160px" }, children: /* @__PURE__ */ jsxs(
          SingleSelect,
          {
            value: filterProvider,
            onChange: setFilterProvider,
            placeholder: "Provider",
            size: "S",
            children: [
              /* @__PURE__ */ jsx(SingleSelectOption, { value: "all", children: "All Providers" }),
              uniqueProviders.map((provider) => /* @__PURE__ */ jsx(SingleSelectOption, { value: provider, children: provider }, provider))
            ]
          }
        ) })
      ] }),
      filteredAccounts.length > 0 ? /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsxs(StyledTable$3, { children: [
        /* @__PURE__ */ jsx(Thead, { children: /* @__PURE__ */ jsxs(Tr, { children: [
          /* @__PURE__ */ jsx(Th, { children: "Status" }),
          /* @__PURE__ */ jsx(Th, { children: "Account" }),
          /* @__PURE__ */ jsx(Th, { children: "Provider" }),
          /* @__PURE__ */ jsx(Th, { title: "Routing Priority (higher = preferred)", children: "Priority" }),
          /* @__PURE__ */ jsx(Th, { children: "Usage Today" }),
          /* @__PURE__ */ jsx(Th, { children: "Total Sent" }),
          /* @__PURE__ */ jsx(Th, { children: "Last Used" }),
          /* @__PURE__ */ jsx(Th, { children: "Actions" })
        ] }) }),
        /* @__PURE__ */ jsx(Tbody, { children: filteredAccounts.map((account) => {
          const usagePercent = account.dailyLimit > 0 ? Math.round(account.emailsSentToday / account.dailyLimit * 100) : 0;
          const isNearLimit = usagePercent > 80;
          return /* @__PURE__ */ jsxs(Tr, { children: [
            /* @__PURE__ */ jsx(Td, { children: /* @__PURE__ */ jsxs(Flex, { alignItems: "center", gap: 2, children: [
              /* @__PURE__ */ jsx(OnlineBadge$1, { $active: account.isActive }),
              account.isActive ? /* @__PURE__ */ jsx(Badge, { backgroundColor: "success600", textColor: "neutral0", size: "S", children: "Active" }) : /* @__PURE__ */ jsx(Badge, { backgroundColor: "neutral600", textColor: "neutral0", size: "S", children: "Inactive" })
            ] }) }),
            /* @__PURE__ */ jsx(Td, { children: /* @__PURE__ */ jsxs(Flex, { direction: "column", alignItems: "flex-start", gap: 1, children: [
              /* @__PURE__ */ jsxs(Flex, { alignItems: "center", gap: 2, children: [
                /* @__PURE__ */ jsx(Typography, { fontWeight: "semiBold", children: account.name }),
                account.isPrimary && /* @__PURE__ */ jsx(Badge, { backgroundColor: "warning600", textColor: "neutral0", size: "S", children: "⭐ Primary" })
              ] }),
              /* @__PURE__ */ jsx(Typography, { variant: "pi", textColor: "neutral600", children: account.fromEmail })
            ] }) }),
            /* @__PURE__ */ jsx(Td, { children: /* @__PURE__ */ jsxs(Badge, { size: "S", children: [
              /* @__PURE__ */ jsx(ServerIcon, { style: { width: 12, height: 12, marginRight: 4 } }),
              account.provider
            ] }) }),
            /* @__PURE__ */ jsx(Td, { children: /* @__PURE__ */ jsxs(Badge, { size: "S", variant: "secondary", children: [
              account.priority,
              "/10"
            ] }) }),
            /* @__PURE__ */ jsx(Td, { children: /* @__PURE__ */ jsxs(Flex, { direction: "column", alignItems: "flex-start", gap: 1, children: [
              /* @__PURE__ */ jsxs(Typography, { fontWeight: "semiBold", children: [
                account.emailsSentToday || 0,
                account.dailyLimit > 0 && /* @__PURE__ */ jsxs(Typography, { variant: "pi", textColor: "neutral500", as: "span", children: [
                  " ",
                  "/ ",
                  account.dailyLimit
                ] })
              ] }),
              account.dailyLimit > 0 && /* @__PURE__ */ jsx(Box, { style: { width: "100%", minWidth: "80px" }, children: /* @__PURE__ */ jsx(
                Box,
                {
                  background: "neutral100",
                  style: {
                    width: "100%",
                    height: "6px",
                    borderRadius: "999px",
                    overflow: "hidden"
                  },
                  children: /* @__PURE__ */ jsx(
                    Box,
                    {
                      style: {
                        width: `${Math.min(usagePercent, 100)}%`,
                        height: "100%",
                        background: isNearLimit ? "var(--colors-danger600, #DC2626)" : "var(--colors-success600, #16A34A)",
                        borderRadius: "999px"
                      }
                    }
                  )
                }
              ) })
            ] }) }),
            /* @__PURE__ */ jsx(Td, { children: /* @__PURE__ */ jsx(Typography, { fontWeight: "semiBold", children: (account.totalEmailsSent || 0).toLocaleString() }) }),
            /* @__PURE__ */ jsx(Td, { children: account.lastUsed ? /* @__PURE__ */ jsx(Typography, { variant: "pi", textColor: "neutral600", children: new Date(account.lastUsed).toLocaleString("de-DE", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit"
            }) }) : /* @__PURE__ */ jsx(Typography, { variant: "pi", textColor: "neutral500", children: "Never" }) }),
            /* @__PURE__ */ jsx(Td, { children: /* @__PURE__ */ jsxs(Flex, { gap: 2, children: [
              /* @__PURE__ */ jsx(
                IconButton,
                {
                  onClick: (e) => {
                    e.stopPropagation();
                    setEditingAccount(account);
                  },
                  "aria-label": "Edit Account",
                  children: /* @__PURE__ */ jsx(PencilIcon, {})
                }
              ),
              /* @__PURE__ */ jsx(
                IconButtonPrimary,
                {
                  onClick: (e) => {
                    e.stopPropagation();
                    setTestingAccount(account);
                  },
                  "aria-label": "Test Account",
                  children: /* @__PURE__ */ jsx(PlayIcon, {})
                }
              ),
              /* @__PURE__ */ jsx(
                IconButtonDanger,
                {
                  onClick: (e) => {
                    e.stopPropagation();
                    deleteAccount(account.id, account.name);
                  },
                  "aria-label": "Delete Account",
                  children: /* @__PURE__ */ jsx(TrashIcon, {})
                }
              )
            ] }) })
          ] }, account.id);
        }) })
      ] }) }) : /* @__PURE__ */ jsx(Box, { padding: 8, style: { textAlign: "center" }, children: /* @__PURE__ */ jsx(Typography, { variant: "beta", textColor: "neutral600", children: "No accounts found matching your filters" }) })
    ] }),
    /* @__PURE__ */ jsx(
      AddAccountModal,
      {
        isOpen: showAddModal,
        onClose: () => setShowAddModal(false),
        onAccountAdded: fetchAccounts
      }
    ),
    /* @__PURE__ */ jsx(
      AddAccountModal,
      {
        isOpen: !!editingAccount,
        onClose: () => setEditingAccount(null),
        onAccountAdded: () => {
          fetchAccounts();
          setEditingAccount(null);
        },
        editAccount: editingAccount
      }
    ),
    testingAccount && /* @__PURE__ */ jsx(
      TestEmailModal,
      {
        account: testingAccount,
        onClose: () => setTestingAccount(null),
        onTest: (email, testOptions) => {
          testAccount(testingAccount.id, testingAccount.name, email, testOptions);
          setTestingAccount(null);
        }
      }
    )
  ] });
};
const TestEmailModal = ({ account, onClose, onTest }) => {
  const { post } = useFetchClient();
  const { toggleNotification } = useNotification();
  const [testEmail, setTestEmail] = useState("");
  const [priority, setPriority] = useState("normal");
  const [emailType, setEmailType] = useState("transactional");
  const [unsubscribeUrl, setUnsubscribeUrl] = useState("");
  const [testingStrapiService, setTestingStrapiService] = useState(false);
  const testStrapiService = async () => {
    setTestingStrapiService(true);
    try {
      const { data } = await post("/magic-mail/test-strapi-service", {
        testEmail,
        accountName: account.name
        // Force this specific account!
      });
      if (data.success) {
        toggleNotification({
          type: "success",
          message: `✅ Strapi Email Service Test: Email sent via ${account.name}!`
        });
        onClose();
      } else {
        toggleNotification({
          type: "warning",
          message: data.message || "Test completed with warnings"
        });
      }
    } catch (err) {
      toggleNotification({
        type: "danger",
        message: "Strapi Email Service test failed"
      });
    } finally {
      setTestingStrapiService(false);
    }
  };
  const handleInputChange = (e) => {
    e.stopPropagation();
    setTestEmail(e.target.value);
  };
  const handleKeyDown = (e) => {
    e.stopPropagation();
  };
  const [testMode, setTestMode] = useState("strapi");
  return /* @__PURE__ */ jsx(Modal.Root, { open: true, onOpenChange: onClose, children: /* @__PURE__ */ jsxs(StyledModalContent$1, { children: [
    /* @__PURE__ */ jsx(StyledModalHeader$1, { children: /* @__PURE__ */ jsx(Modal.Title, { children: "Test Email Account" }) }),
    /* @__PURE__ */ jsxs(StyledModalBody$1, { children: [
      /* @__PURE__ */ jsxs(AccountInfoCard, { children: [
        /* @__PURE__ */ jsx(Typography, { variant: "pi", style: { color: "var(--colors-primary600, #0284C7)", fontWeight: 500 }, children: "Testing Account" }),
        /* @__PURE__ */ jsx(Typography, { variant: "beta", textColor: "neutral800", style: { fontSize: "1.125rem", fontWeight: 700, marginTop: "4px" }, children: account.name }),
        /* @__PURE__ */ jsx(Typography, { variant: "pi", textColor: "neutral600", style: { marginTop: "2px" }, children: account.fromEmail })
      ] }),
      /* @__PURE__ */ jsxs(Box, { style: { marginTop: "20px" }, children: [
        /* @__PURE__ */ jsx(ModalFieldLabel, { children: "Recipient Email *" }),
        /* @__PURE__ */ jsx(
          StyledModalInput,
          {
            placeholder: "test@example.com",
            value: testEmail,
            onChange: handleInputChange,
            onKeyDown: handleKeyDown,
            onClick: (e) => e.stopPropagation(),
            type: "email",
            autoFocus: true
          }
        )
      ] }),
      /* @__PURE__ */ jsxs(Box, { style: { marginTop: "20px" }, children: [
        /* @__PURE__ */ jsx(ModalFieldLabel, { children: "Test Mode" }),
        /* @__PURE__ */ jsx(
          TestOptionCard,
          {
            $selected: testMode === "direct",
            onClick: () => setTestMode("direct"),
            style: { marginBottom: "10px" },
            children: /* @__PURE__ */ jsxs(Flex, { alignItems: "center", gap: 3, children: [
              /* @__PURE__ */ jsx(PlayIcon, { style: { width: 20, height: 20, color: testMode === "direct" ? "var(--colors-primary600, #0284C7)" : "var(--colors-neutral600)", flexShrink: 0 } }),
              /* @__PURE__ */ jsxs(Box, { style: { flex: 1 }, children: [
                /* @__PURE__ */ jsx(Typography, { fontWeight: "semiBold", style: { fontSize: "14px", color: testMode === "direct" ? "var(--colors-primary600, #075985)" : "var(--colors-neutral800)" }, children: "Direct Test" }),
                /* @__PURE__ */ jsx(Typography, { variant: "pi", textColor: "neutral500", style: { fontSize: "12px" }, children: "Send directly through this account" })
              ] })
            ] })
          }
        ),
        /* @__PURE__ */ jsx(
          TestOptionCard,
          {
            $selected: testMode === "strapi",
            onClick: () => setTestMode("strapi"),
            children: /* @__PURE__ */ jsxs(Flex, { alignItems: "center", gap: 3, children: [
              /* @__PURE__ */ jsx(SparklesIcon, { style: { width: 20, height: 20, color: testMode === "strapi" ? "var(--colors-primary600, #0284C7)" : "var(--colors-neutral600)", flexShrink: 0 } }),
              /* @__PURE__ */ jsxs(Box, { style: { flex: 1 }, children: [
                /* @__PURE__ */ jsx(Typography, { fontWeight: "semiBold", style: { fontSize: "14px", color: testMode === "strapi" ? "var(--colors-primary600, #075985)" : "var(--colors-neutral800)" }, children: "Strapi Service Test" }),
                /* @__PURE__ */ jsx(Typography, { variant: "pi", textColor: "neutral500", style: { fontSize: "12px" }, children: "Verify MagicMail intercepts Strapi's email service" })
              ] })
            ] })
          }
        )
      ] }),
      testMode === "direct" && /* @__PURE__ */ jsxs(Box, { style: { marginTop: "20px", padding: "16px", background: "var(--colors-neutral100, #F9FAFB)", borderRadius: "12px" }, children: [
        /* @__PURE__ */ jsx(ModalFieldLabel, { style: { marginBottom: "16px", fontSize: "14px" }, children: "Advanced Options" }),
        /* @__PURE__ */ jsxs(Box, { style: { marginBottom: "12px" }, children: [
          /* @__PURE__ */ jsx(ModalFieldLabel, { children: "Priority" }),
          /* @__PURE__ */ jsxs(
            StyledModalSelect,
            {
              value: priority,
              onChange: (e) => setPriority(e.target.value),
              children: [
                /* @__PURE__ */ jsx("option", { value: "normal", children: "Normal" }),
                /* @__PURE__ */ jsx("option", { value: "high", children: "High Priority" })
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsxs(Box, { style: { marginBottom: emailType === "marketing" ? "12px" : "0" }, children: [
          /* @__PURE__ */ jsx(ModalFieldLabel, { children: "Email Type" }),
          /* @__PURE__ */ jsxs(
            StyledModalSelect,
            {
              value: emailType,
              onChange: (e) => setEmailType(e.target.value),
              children: [
                /* @__PURE__ */ jsx("option", { value: "transactional", children: "Transactional" }),
                /* @__PURE__ */ jsx("option", { value: "marketing", children: "Marketing" }),
                /* @__PURE__ */ jsx("option", { value: "notification", children: "Notification" })
              ]
            }
          )
        ] }),
        emailType === "marketing" && /* @__PURE__ */ jsxs(Box, { children: [
          /* @__PURE__ */ jsx(ModalFieldLabel, { children: "Unsubscribe URL *" }),
          /* @__PURE__ */ jsx(
            StyledModalInput,
            {
              placeholder: "https://yoursite.com/unsubscribe",
              value: unsubscribeUrl,
              onChange: (e) => setUnsubscribeUrl(e.target.value)
            }
          ),
          /* @__PURE__ */ jsx(ModalHint$1, { children: "Required for GDPR/CAN-SPAM compliance" })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx(StyledModalFooter$1, { children: /* @__PURE__ */ jsxs(Flex, { justifyContent: "space-between", style: { width: "100%" }, children: [
      /* @__PURE__ */ jsx(TertiaryButton, { onClick: onClose, children: "Cancel" }),
      testMode === "direct" ? /* @__PURE__ */ jsx(
        GradientButton$1,
        {
          onClick: () => onTest(testEmail, { priority, type: emailType, unsubscribeUrl }),
          disabled: !testEmail || !testEmail.includes("@") || emailType === "marketing" && !unsubscribeUrl,
          startIcon: /* @__PURE__ */ jsx(PlayIcon, { style: { width: 16, height: 16 } }),
          children: "Send Test Email"
        }
      ) : /* @__PURE__ */ jsx(
        GradientButton$1,
        {
          onClick: testStrapiService,
          disabled: !testEmail || !testEmail.includes("@"),
          loading: testingStrapiService,
          startIcon: /* @__PURE__ */ jsx(SparklesIcon, { style: { width: 16, height: 16 } }),
          children: "Test Strapi Service"
        }
      )
    ] }) })
  ] }) });
};
const theme$2 = {
  shadows: {
    sm: "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)",
    xl: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)"
  },
  transitions: {
    fast: "150ms cubic-bezier(0.4, 0, 0.2, 1)",
    normal: "300ms cubic-bezier(0.4, 0, 0.2, 1)",
    slow: "500ms cubic-bezier(0.4, 0, 0.2, 1)"
  },
  spacing: {
    xs: "4px",
    sm: "8px",
    md: "16px",
    lg: "24px",
    xl: "32px",
    "2xl": "48px"
  },
  borderRadius: {
    md: "8px",
    lg: "12px",
    xl: "16px"
  }
};
const fadeIn$4 = keyframes`
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
`;
const shimmer$2 = keyframes`
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
`;
const float$2 = keyframes`
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-5px); }
`;
const pulse$1 = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
`;
const FloatingEmoji = styled.div`
  position: absolute;
  bottom: 40px;
  right: 40px;
  font-size: 72px;
  opacity: 0.08;
  ${css`animation: ${float$2} 4s ease-in-out infinite;`}
`;
const breakpoints$2 = {
  mobile: "768px"
};
const Container$3 = styled(Box)`
  ${css`animation: ${fadeIn$4} ${theme$2.transitions.slow};`}
  min-height: 100vh;
  max-width: 1440px;
  margin: 0 auto;
  padding: ${theme$2.spacing.xl} ${theme$2.spacing.lg} 0;
  
  @media screen and (max-width: ${breakpoints$2.mobile}) {
    padding: 16px 12px 0;
  }
`;
const Header$3 = styled(Box)`
  background: linear-gradient(135deg, 
    var(--colors-secondary600, #7C3AED) 0%, 
    ${"var(--colors-primary600, #0284C7)"} 100%
  );
  border-radius: ${theme$2.borderRadius.xl};
  padding: ${theme$2.spacing.xl} ${theme$2.spacing["2xl"]};
  margin-bottom: ${theme$2.spacing.xl};
  position: relative;
  overflow: hidden;
  box-shadow: ${theme$2.shadows.xl};
  
  @media screen and (max-width: ${breakpoints$2.mobile}) {
    padding: 24px 20px;
    border-radius: 12px;
  }
  
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 200%;
    height: 100%;
    background: linear-gradient(
      90deg, 
      transparent, 
      rgba(255, 255, 255, 0.15), 
      transparent
    );
    ${css`animation: ${shimmer$2} 3s infinite;`}
  }
  
  &::after {
    content: '';
    position: absolute;
    top: 0;
    right: 0;
    width: 100%;
    height: 100%;
    background-image: radial-gradient(circle at 20% 80%, transparent 50%, rgba(255, 255, 255, 0.1) 50%);
    background-size: 15px 15px;
    opacity: 0.3;
  }
`;
const HeaderContent$2 = styled(Flex)`
  position: relative;
  z-index: 1;
`;
const Title$2 = styled(Typography)`
  color: white;
  font-size: 2rem;
  font-weight: 700;
  letter-spacing: -0.025em;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  display: flex;
  align-items: center;
  gap: ${theme$2.spacing.sm};
  
  svg {
    width: 28px;
    height: 28px;
    ${css`animation: ${float$2} 3s ease-in-out infinite;`}
  }
  
  @media screen and (max-width: ${breakpoints$2.mobile}) {
    font-size: 1.5rem;
    
    svg {
      width: 22px;
      height: 22px;
    }
  }
`;
const Subtitle$2 = styled(Typography)`
  color: rgba(255, 255, 255, 0.95);
  font-size: 0.95rem;
  font-weight: 400;
  margin-top: ${theme$2.spacing.xs};
  letter-spacing: 0.01em;
  
  @media screen and (max-width: ${breakpoints$2.mobile}) {
    font-size: 0.85rem;
  }
`;
const StatsGrid$2 = styled.div`
  margin-bottom: ${theme$2.spacing.xl};
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: ${theme$2.spacing.lg};
  justify-content: center;
  max-width: 1200px;
  margin-left: auto;
  margin-right: auto;
  
  @media screen and (max-width: ${breakpoints$2.mobile}) {
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
    margin-bottom: 24px;
  }
`;
const StatCard$2 = styled(Box)`
  background: ${(p) => p.theme.colors.neutral0};
  border-radius: ${theme$2.borderRadius.lg};
  padding: 28px ${theme$2.spacing.lg};
  position: relative;
  overflow: hidden;
  transition: all ${theme$2.transitions.normal};
  ${css`animation: ${fadeIn$4} ${theme$2.transitions.slow} backwards;`}
  animation-delay: ${(props) => props.$delay || "0s"};
  box-shadow: ${theme$2.shadows.sm};
  border: 1px solid rgba(128, 128, 128, 0.2);
  min-width: 200px;
  flex: 1;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  
  @media screen and (max-width: ${breakpoints$2.mobile}) {
    min-width: unset;
    padding: 20px 12px;
    
    &:hover {
      transform: none;
    }
  }
  
  &:hover {
    transform: translateY(-6px);
    box-shadow: ${theme$2.shadows.xl};
    border-color: ${(props) => props.$color || "var(--colors-primary600, #0EA5E9)"};
    
    .stat-icon {
      transform: scale(1.15) rotate(5deg);
    }
    
    .stat-value {
      transform: scale(1.08);
      color: ${(props) => props.$color || "var(--colors-primary600, #0284C7)"};
    }
  }
`;
const StatIcon$2 = styled(Box)`
  width: 68px;
  height: 68px;
  border-radius: ${theme$2.borderRadius.lg};
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${(props) => props.$bg || "rgba(2, 132, 199, 0.12)"};
  transition: all ${theme$2.transitions.normal};
  margin: 0 auto 20px;
  box-shadow: ${theme$2.shadows.sm};
  
  svg {
    width: 34px;
    height: 34px;
    color: ${(props) => props.$color || "var(--colors-primary600, #0284C7)"};
  }
  
  @media screen and (max-width: ${breakpoints$2.mobile}) {
    width: 48px;
    height: 48px;
    margin-bottom: 12px;
    
    svg {
      width: 24px;
      height: 24px;
    }
  }
`;
const StatValue$2 = styled(Typography)`
  font-size: 2.75rem;
  font-weight: 700;
  color: var(--colors-neutral800);
  line-height: 1;
  margin-bottom: 10px;
  transition: all ${theme$2.transitions.normal};
  text-align: center;
  
  @media screen and (max-width: ${breakpoints$2.mobile}) {
    font-size: 2rem;
    margin-bottom: 6px;
  }
`;
const StatLabel$2 = styled(Typography)`
  font-size: 0.95rem;
  color: var(--colors-neutral600);
  font-weight: 500;
  letter-spacing: 0.025em;
  text-align: center;
  
  @media screen and (max-width: ${breakpoints$2.mobile}) {
    font-size: 0.8rem;
  }
`;
const RulesContainer = styled(Box)`
  margin-top: ${theme$2.spacing.xl};
`;
const EmptyState$2 = styled(Box)`
  background: ${(p) => p.theme.colors.neutral0};
  border-radius: ${theme$2.borderRadius.xl};
  border: 2px dashed rgba(128, 128, 128, 0.3);
  padding: 80px 32px;
  text-align: center;
  position: relative;
  overflow: hidden;
  min-height: 400px;
  display: flex;
  align-items: center;
  justify-content: center;
  
  /* Background Gradient */
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(135deg, rgba(168, 85, 247, 0.06) 0%, ${"rgba(2, 132, 199, 0.06)"} 100%);
    opacity: 0.3;
    z-index: 0;
  }
`;
const OnlineBadge = styled.div`
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: ${(props) => props.$active ? "var(--colors-success600, #22C55E)" : "rgba(128, 128, 128, 0.4)"};
  display: inline-block;
  margin-right: 8px;
  ${css`animation: ${(props) => props.$active ? pulse$1 : "none"} 2s ease-in-out infinite;`}
`;
const StyledTable$2 = styled(Table)`
  thead {
    background: var(--colors-neutral100);
    border-bottom: 2px solid rgba(128, 128, 128, 0.2);
    
    th {
      font-weight: 600;
      color: var(--colors-neutral800);
      font-size: 0.875rem;
      text-transform: uppercase;
      letter-spacing: 0.025em;
      padding: ${theme$2.spacing.lg} ${theme$2.spacing.lg};
    }
  }
  
  tbody tr {
    transition: all ${theme$2.transitions.fast};
    border-bottom: 1px solid rgba(128, 128, 128, 0.15);
    
    &:last-child {
      border-bottom: none;
    }
    
    &:hover {
      background: rgba(2, 132, 199, 0.12);
    }
    
    td {
      padding: ${theme$2.spacing.lg} ${theme$2.spacing.lg};
      color: var(--colors-neutral800);
      vertical-align: middle;
    }
  }
`;
const FilterBar$2 = styled(Flex)`
  background: ${(p) => p.theme.colors.neutral0};
  padding: ${theme$2.spacing.md} ${theme$2.spacing.lg};
  border-radius: ${theme$2.borderRadius.lg};
  margin-bottom: ${theme$2.spacing.lg};
  box-shadow: ${theme$2.shadows.sm};
  border: 1px solid rgba(128, 128, 128, 0.2);
  gap: ${theme$2.spacing.md};
  align-items: center;
`;
const SearchInputWrapper$1 = styled.div`
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
`;
const SearchIcon$1 = styled(MagnifyingGlassIcon)`
  position: absolute;
  left: 12px;
  width: 16px;
  height: 16px;
  color: var(--colors-neutral600);
  pointer-events: none;
`;
const StyledSearchInput$1 = styled.input`
  width: 100%;
  padding: 10px 12px 10px 40px;
  border: 1px solid rgba(128, 128, 128, 0.2);
  border-radius: ${theme$2.borderRadius.md};
  font-size: 0.875rem;
  transition: all ${theme$2.transitions.fast};
  
  &:focus {
    outline: none;
    border-color: ${"var(--colors-primary600, #0EA5E9)"};
    box-shadow: 0 0 0 2px ${"rgba(2, 132, 199, 0.12)"};
  }
  
  &::placeholder {
    color: var(--colors-neutral500);
  }
`;
const RoutingRulesPage = () => {
  useAuthRefresh();
  const { get, post, put, del } = useFetchClient();
  const { toggleNotification } = useNotification();
  const [loading, setLoading] = useState(true);
  const [rules, setRules] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterMatchType, setFilterMatchType] = useState("all");
  useEffect(() => {
    fetchData();
  }, []);
  const fetchData = async () => {
    setLoading(true);
    try {
      const [rulesRes, accountsRes] = await Promise.all([
        get("/magic-mail/routing-rules"),
        get("/magic-mail/accounts")
      ]);
      setRules(rulesRes.data.data || []);
      setAccounts(accountsRes.data.data || []);
    } catch (err) {
      console.error("[magic-mail] Error fetching data:", err);
      toggleNotification({
        type: "danger",
        message: "Failed to load routing rules"
      });
    } finally {
      setLoading(false);
    }
  };
  const deleteRule = async (ruleId, ruleName) => {
    if (!confirm(`Delete routing rule "${ruleName}"?`)) return;
    try {
      await del(`/magic-mail/routing-rules/${ruleId}`);
      toggleNotification({
        type: "success",
        message: "Routing rule deleted successfully"
      });
      fetchData();
    } catch (err) {
      toggleNotification({
        type: "danger",
        message: "Failed to delete routing rule"
      });
    }
  };
  if (loading) {
    return /* @__PURE__ */ jsx(Flex, { justifyContent: "center", alignItems: "center", style: { minHeight: "400px" }, children: /* @__PURE__ */ jsx(Loader, { children: "Loading Routing Rules..." }) });
  }
  const totalRules = rules.length;
  const activeRules = rules.filter((r) => r.isActive).length;
  const highPriorityRules = rules.filter((r) => r.priority >= 5).length;
  const filteredRules = rules.filter((rule) => {
    const matchesSearch = rule.name.toLowerCase().includes(searchQuery.toLowerCase()) || (rule.description || "").toLowerCase().includes(searchQuery.toLowerCase()) || rule.matchValue.toLowerCase().includes(searchQuery.toLowerCase()) || (rule.accountName || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === "all" || filterStatus === "active" && rule.isActive || filterStatus === "inactive" && !rule.isActive;
    const matchesType = filterMatchType === "all" || rule.matchType === filterMatchType;
    return matchesSearch && matchesStatus && matchesType;
  });
  const uniqueMatchTypes = [...new Set(rules.map((r) => r.matchType))].filter(Boolean);
  return /* @__PURE__ */ jsxs(Container$3, { children: [
    /* @__PURE__ */ jsx(Header$3, { children: /* @__PURE__ */ jsx(HeaderContent$2, { justifyContent: "space-between", alignItems: "center", children: /* @__PURE__ */ jsxs(Flex, { direction: "column", alignItems: "flex-start", gap: 2, children: [
      /* @__PURE__ */ jsxs(Title$2, { children: [
        /* @__PURE__ */ jsx(FunnelIcon, {}),
        "Email Routing Rules"
      ] }),
      /* @__PURE__ */ jsx(Subtitle$2, { children: "Define intelligent routing rules to send emails through specific accounts based on conditions" })
    ] }) }) }),
    /* @__PURE__ */ jsxs(StatsGrid$2, { children: [
      /* @__PURE__ */ jsxs(StatCard$2, { $delay: "0.1s", $color: "var(--colors-secondary600, #7C3AED)", children: [
        /* @__PURE__ */ jsx(StatIcon$2, { className: "stat-icon", $bg: "rgba(168, 85, 247, 0.12)", $color: "var(--colors-secondary600, #7C3AED)", children: /* @__PURE__ */ jsx(FunnelIcon, {}) }),
        /* @__PURE__ */ jsx(StatValue$2, { className: "stat-value", children: totalRules }),
        /* @__PURE__ */ jsx(StatLabel$2, { children: "Total Rules" })
      ] }),
      /* @__PURE__ */ jsxs(StatCard$2, { $delay: "0.2s", $color: "var(--colors-success600, #16A34A)", children: [
        /* @__PURE__ */ jsx(StatIcon$2, { className: "stat-icon", $bg: "rgba(22, 163, 74, 0.12)", $color: "var(--colors-success600, #16A34A)", children: /* @__PURE__ */ jsx(CheckIcon, {}) }),
        /* @__PURE__ */ jsx(StatValue$2, { className: "stat-value", children: activeRules }),
        /* @__PURE__ */ jsx(StatLabel$2, { children: "Active Rules" })
      ] }),
      /* @__PURE__ */ jsxs(StatCard$2, { $delay: "0.3s", $color: "var(--colors-warning600, #D97706)", children: [
        /* @__PURE__ */ jsx(StatIcon$2, { className: "stat-icon", $bg: "rgba(234, 179, 8, 0.12)", $color: "var(--colors-warning600, #D97706)", children: /* @__PURE__ */ jsx(SparklesIcon, {}) }),
        /* @__PURE__ */ jsx(StatValue$2, { className: "stat-value", children: highPriorityRules }),
        /* @__PURE__ */ jsx(StatLabel$2, { children: "High Priority" })
      ] })
    ] }),
    rules.length === 0 ? /* @__PURE__ */ jsxs(EmptyState$2, { children: [
      /* @__PURE__ */ jsx(FloatingEmoji, { children: "🎯" }),
      /* @__PURE__ */ jsxs(Flex, { direction: "column", alignItems: "center", gap: 6, style: { position: "relative", zIndex: 1 }, children: [
        /* @__PURE__ */ jsx(
          Box,
          {
            style: {
              width: "120px",
              height: "120px",
              borderRadius: "50%",
              background: `linear-gradient(135deg, rgba(168, 85, 247, 0.12) 0%, ${"rgba(2, 132, 199, 0.12)"} 100%)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: theme$2.shadows.xl
            },
            children: /* @__PURE__ */ jsx(FunnelIcon, { style: { width: "60px", height: "60px", color: "var(--colors-secondary600, #7C3AED)" } })
          }
        ),
        /* @__PURE__ */ jsx(
          Typography,
          {
            variant: "alpha",
            textColor: "neutral800",
            style: {
              fontSize: "1.75rem",
              fontWeight: "700",
              marginBottom: "8px"
            },
            children: "No Routing Rules Yet"
          }
        ),
        /* @__PURE__ */ jsx(
          Typography,
          {
            variant: "omega",
            textColor: "neutral600",
            style: {
              fontSize: "1rem",
              maxWidth: "500px",
              lineHeight: "1.6"
            },
            children: "Create your first routing rule to intelligently route emails based on type, recipient, subject, or custom conditions"
          }
        ),
        /* @__PURE__ */ jsx(
          CTAButton,
          {
            startIcon: /* @__PURE__ */ jsx(PlusIcon, { style: { width: 20, height: 20 } }),
            onClick: () => setShowModal(true),
            children: "Create First Rule"
          }
        )
      ] })
    ] }) : /* @__PURE__ */ jsxs(RulesContainer, { children: [
      /* @__PURE__ */ jsx(Box, { style: { marginBottom: theme$2.spacing.md }, children: /* @__PURE__ */ jsxs(Flex, { justifyContent: "space-between", alignItems: "center", marginBottom: 4, children: [
        /* @__PURE__ */ jsx(Typography, { variant: "delta", textColor: "neutral700", style: { fontSize: "1.5rem", fontWeight: 600 }, children: "🎯 Routing Rules" }),
        /* @__PURE__ */ jsx(GradientButton$1, { startIcon: /* @__PURE__ */ jsx(PlusIcon, { style: { width: 16, height: 16 } }), onClick: () => setShowModal(true), children: "Create Rule" })
      ] }) }),
      /* @__PURE__ */ jsxs(FilterBar$2, { children: [
        /* @__PURE__ */ jsxs(SearchInputWrapper$1, { children: [
          /* @__PURE__ */ jsx(SearchIcon$1, {}),
          /* @__PURE__ */ jsx(
            StyledSearchInput$1,
            {
              value: searchQuery,
              onChange: (e) => setSearchQuery(e.target.value),
              placeholder: "Search by name, description, or value...",
              type: "text"
            }
          )
        ] }),
        /* @__PURE__ */ jsx(Box, { style: { minWidth: "160px" }, children: /* @__PURE__ */ jsxs(
          SingleSelect,
          {
            value: filterStatus,
            onChange: setFilterStatus,
            placeholder: "Status",
            size: "S",
            children: [
              /* @__PURE__ */ jsx(SingleSelectOption, { value: "all", children: "All Rules" }),
              /* @__PURE__ */ jsx(SingleSelectOption, { value: "active", children: "✅ Active" }),
              /* @__PURE__ */ jsx(SingleSelectOption, { value: "inactive", children: "❌ Inactive" })
            ]
          }
        ) }),
        /* @__PURE__ */ jsx(Box, { style: { minWidth: "160px" }, children: /* @__PURE__ */ jsxs(
          SingleSelect,
          {
            value: filterMatchType,
            onChange: setFilterMatchType,
            placeholder: "Match Type",
            size: "S",
            children: [
              /* @__PURE__ */ jsx(SingleSelectOption, { value: "all", children: "All Types" }),
              uniqueMatchTypes.map((type) => /* @__PURE__ */ jsx(SingleSelectOption, { value: type, children: type }, type))
            ]
          }
        ) })
      ] }),
      filteredRules.length > 0 ? /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsxs(StyledTable$2, { children: [
        /* @__PURE__ */ jsx(Thead, { children: /* @__PURE__ */ jsxs(Tr, { children: [
          /* @__PURE__ */ jsx(Th, { children: "Status" }),
          /* @__PURE__ */ jsx(Th, { children: "Rule Name" }),
          /* @__PURE__ */ jsx(Th, { children: "Match Type" }),
          /* @__PURE__ */ jsx(Th, { children: "Match Value" }),
          /* @__PURE__ */ jsx(Th, { children: "Target Account" }),
          /* @__PURE__ */ jsx(Th, { children: "Priority" }),
          /* @__PURE__ */ jsx(Th, { children: "Actions" })
        ] }) }),
        /* @__PURE__ */ jsx(Tbody, { children: filteredRules.map((rule) => /* @__PURE__ */ jsxs(Tr, { children: [
          /* @__PURE__ */ jsx(Td, { children: /* @__PURE__ */ jsxs(Flex, { alignItems: "center", gap: 2, children: [
            /* @__PURE__ */ jsx(OnlineBadge, { $active: rule.isActive }),
            rule.isActive ? /* @__PURE__ */ jsx(Badge, { backgroundColor: "success600", textColor: "neutral0", size: "S", children: "Active" }) : /* @__PURE__ */ jsx(Badge, { backgroundColor: "neutral600", textColor: "neutral0", size: "S", children: "Inactive" })
          ] }) }),
          /* @__PURE__ */ jsx(Td, { children: /* @__PURE__ */ jsxs(Flex, { direction: "column", alignItems: "flex-start", gap: 1, children: [
            /* @__PURE__ */ jsx(Typography, { fontWeight: "semiBold", children: rule.name }),
            rule.description && /* @__PURE__ */ jsx(Typography, { variant: "pi", textColor: "neutral600", children: rule.description })
          ] }) }),
          /* @__PURE__ */ jsx(Td, { children: /* @__PURE__ */ jsxs(Badge, { size: "S", variant: "secondary", children: [
            rule.matchType === "emailType" && "📧 Email Type",
            rule.matchType === "recipient" && "👤 Recipient",
            rule.matchType === "subject" && "📝 Subject",
            rule.matchType === "template" && "🎨 Template",
            rule.matchType === "custom" && "⚙️ Custom"
          ] }) }),
          /* @__PURE__ */ jsx(Td, { children: /* @__PURE__ */ jsx(Typography, { variant: "pi", style: { fontFamily: "monospace", fontSize: "0.85rem" }, children: rule.matchValue }) }),
          /* @__PURE__ */ jsx(Td, { children: /* @__PURE__ */ jsxs(Flex, { direction: "column", alignItems: "flex-start", gap: 1, children: [
            /* @__PURE__ */ jsx(Typography, { fontWeight: "semiBold", children: rule.accountName }),
            rule.fallbackAccountName && /* @__PURE__ */ jsxs(Typography, { variant: "pi", textColor: "neutral600", children: [
              "Fallback: ",
              rule.fallbackAccountName
            ] }),
            rule.whatsappFallback && /* @__PURE__ */ jsx(Badge, { backgroundColor: "success100", textColor: "success700", size: "S", children: "+ WhatsApp" })
          ] }) }),
          /* @__PURE__ */ jsx(Td, { children: /* @__PURE__ */ jsxs(
            Badge,
            {
              size: "S",
              variant: "secondary",
              backgroundColor: rule.priority >= 5 ? "warning100" : "neutral100",
              textColor: rule.priority >= 5 ? "warning700" : "neutral700",
              children: [
                rule.priority >= 5 && "⭐ ",
                rule.priority
              ]
            }
          ) }),
          /* @__PURE__ */ jsx(Td, { children: /* @__PURE__ */ jsxs(Flex, { gap: 2, children: [
            /* @__PURE__ */ jsx(
              IconButton,
              {
                onClick: () => setEditingRule(rule),
                "aria-label": "Edit Rule",
                children: /* @__PURE__ */ jsx(PencilIcon, {})
              }
            ),
            /* @__PURE__ */ jsx(
              IconButtonDanger,
              {
                onClick: () => deleteRule(rule.id, rule.name),
                "aria-label": "Delete Rule",
                children: /* @__PURE__ */ jsx(TrashIcon, {})
              }
            )
          ] }) })
        ] }, rule.id)) })
      ] }) }) : /* @__PURE__ */ jsx(Box, { padding: 8, style: { textAlign: "center" }, children: /* @__PURE__ */ jsx(Typography, { variant: "beta", textColor: "neutral600", children: "No rules found matching your filters" }) })
    ] }),
    (showModal || editingRule) && /* @__PURE__ */ jsx(
      RuleModal,
      {
        rule: editingRule,
        accounts,
        onClose: () => {
          setShowModal(false);
          setEditingRule(null);
        },
        onSave: fetchData
      }
    )
  ] });
};
const RuleModal = ({ rule, accounts, onClose, onSave }) => {
  const { post, put } = useFetchClient();
  const { toggleNotification } = useNotification();
  const [loading, setLoading] = useState(false);
  const isEditMode = !!rule;
  const [formData, setFormData] = useState({
    name: rule?.name || "",
    description: rule?.description || "",
    isActive: rule?.isActive !== void 0 ? rule.isActive : true,
    priority: rule?.priority || 1,
    matchType: rule?.matchType || "emailType",
    matchValue: rule?.matchValue || "",
    accountName: rule?.accountName || "",
    fallbackAccountName: rule?.fallbackAccountName || "",
    whatsappFallback: rule?.whatsappFallback || false
  });
  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };
  const handleSubmit = async () => {
    setLoading(true);
    try {
      if (isEditMode) {
        await put(`/magic-mail/routing-rules/${rule.id}`, formData);
        toggleNotification({
          type: "success",
          message: "Routing rule updated successfully"
        });
      } else {
        await post("/magic-mail/routing-rules", formData);
        toggleNotification({
          type: "success",
          message: "Routing rule created successfully"
        });
      }
      onSave();
      onClose();
    } catch (err) {
      toggleNotification({
        type: "danger",
        message: err.response?.data?.error?.message || `Failed to ${isEditMode ? "update" : "create"} routing rule`
      });
    } finally {
      setLoading(false);
    }
  };
  const canSubmit = formData.name && formData.matchType && formData.matchValue && formData.accountName;
  const getMatchTypeHelp = () => {
    switch (formData.matchType) {
      case "emailType":
        return 'Match based on email type (e.g., "transactional", "marketing", "notification")';
      case "recipient":
        return 'Match if recipient email contains this value (e.g., "@vip-customers.com")';
      case "subject":
        return 'Match if subject line contains this value (e.g., "Invoice", "Password Reset")';
      case "template":
        return "Match if email uses this template name (exact match)";
      case "custom":
        return "Match based on custom field value passed in emailData.customField";
      default:
        return "";
    }
  };
  return /* @__PURE__ */ jsx(Modal.Root, { open: true, onOpenChange: onClose, children: /* @__PURE__ */ jsxs(Modal.Content, { size: "L", children: [
    /* @__PURE__ */ jsx(Modal.Header, { children: /* @__PURE__ */ jsxs(Typography, { variant: "beta", children: [
      /* @__PURE__ */ jsx(Cog6ToothIcon, { style: { marginRight: 8, width: 24, height: 24 } }),
      isEditMode ? "Edit Routing Rule" : "Create Routing Rule"
    ] }) }),
    /* @__PURE__ */ jsx(Modal.Body, { children: /* @__PURE__ */ jsx(Box, { style: { width: "100%" }, children: /* @__PURE__ */ jsxs(Flex, { direction: "column", gap: 6, style: { width: "100%" }, children: [
      /* @__PURE__ */ jsxs(Field.Root, { required: true, style: { width: "100%" }, children: [
        /* @__PURE__ */ jsx(Field.Label, { children: "Rule Name" }),
        /* @__PURE__ */ jsx(
          TextInput,
          {
            placeholder: "Marketing emails via SendGrid",
            value: formData.name,
            onChange: (e) => handleChange("name", e.target.value),
            style: { width: "100%" }
          }
        ),
        /* @__PURE__ */ jsx(Field.Hint, { children: "A descriptive name for this routing rule" })
      ] }),
      /* @__PURE__ */ jsxs(Field.Root, { style: { width: "100%" }, children: [
        /* @__PURE__ */ jsx(Field.Label, { children: "Description (Optional)" }),
        /* @__PURE__ */ jsx(
          Textarea,
          {
            placeholder: "Route all marketing emails through SendGrid for better deliverability...",
            value: formData.description,
            onChange: (e) => handleChange("description", e.target.value),
            rows: 3,
            style: { width: "100%" }
          }
        )
      ] }),
      /* @__PURE__ */ jsxs(Field.Root, { required: true, style: { width: "100%" }, children: [
        /* @__PURE__ */ jsx(Field.Label, { children: "Match Type" }),
        /* @__PURE__ */ jsxs(
          SingleSelect,
          {
            value: formData.matchType,
            onChange: (value) => handleChange("matchType", value),
            style: { width: "100%" },
            children: [
              /* @__PURE__ */ jsx(SingleSelectOption, { value: "emailType", children: "📧 Email Type" }),
              /* @__PURE__ */ jsx(SingleSelectOption, { value: "recipient", children: "👤 Recipient" }),
              /* @__PURE__ */ jsx(SingleSelectOption, { value: "subject", children: "📝 Subject" }),
              /* @__PURE__ */ jsx(SingleSelectOption, { value: "template", children: "🎨 Template" }),
              /* @__PURE__ */ jsx(SingleSelectOption, { value: "custom", children: "⚙️ Custom Field" })
            ]
          }
        ),
        /* @__PURE__ */ jsx(Field.Hint, { children: getMatchTypeHelp() })
      ] }),
      /* @__PURE__ */ jsxs(Field.Root, { required: true, style: { width: "100%" }, children: [
        /* @__PURE__ */ jsx(Field.Label, { children: "Match Value" }),
        /* @__PURE__ */ jsx(
          TextInput,
          {
            placeholder: formData.matchType === "emailType" ? "marketing" : formData.matchType === "recipient" ? "@vip-customers.com" : formData.matchType === "subject" ? "Invoice" : formData.matchType === "template" ? "welcome-email" : "custom-value",
            value: formData.matchValue,
            onChange: (e) => handleChange("matchValue", e.target.value),
            style: { width: "100%" }
          }
        ),
        /* @__PURE__ */ jsx(Field.Hint, { children: "The value to match against. Case-insensitive for recipient and subject." })
      ] }),
      /* @__PURE__ */ jsxs(Field.Root, { required: true, style: { width: "100%" }, children: [
        /* @__PURE__ */ jsx(Field.Label, { children: "Target Account" }),
        /* @__PURE__ */ jsxs(
          SingleSelect,
          {
            value: formData.accountName,
            onChange: (value) => handleChange("accountName", value),
            style: { width: "100%" },
            children: [
              /* @__PURE__ */ jsx(SingleSelectOption, { value: "", children: "Select account..." }),
              accounts.filter((a) => a.isActive).map((account) => /* @__PURE__ */ jsxs(SingleSelectOption, { value: account.name, children: [
                account.name,
                " (",
                account.provider,
                ")"
              ] }, account.name))
            ]
          }
        ),
        /* @__PURE__ */ jsx(Field.Hint, { children: "The email account to use when this rule matches" })
      ] }),
      /* @__PURE__ */ jsxs(Field.Root, { style: { width: "100%" }, children: [
        /* @__PURE__ */ jsx(Field.Label, { children: "Fallback Account (Optional)" }),
        /* @__PURE__ */ jsxs(
          SingleSelect,
          {
            value: formData.fallbackAccountName,
            onChange: (value) => handleChange("fallbackAccountName", value),
            style: { width: "100%" },
            children: [
              /* @__PURE__ */ jsx(SingleSelectOption, { value: "", children: "No fallback" }),
              accounts.filter((a) => a.isActive && a.name !== formData.accountName).map((account) => /* @__PURE__ */ jsxs(SingleSelectOption, { value: account.name, children: [
                account.name,
                " (",
                account.provider,
                ")"
              ] }, account.name))
            ]
          }
        ),
        /* @__PURE__ */ jsx(Field.Hint, { children: "Use this account if the target account is unavailable or rate-limited" })
      ] }),
      /* @__PURE__ */ jsx(
        Box,
        {
          padding: 4,
          background: formData.whatsappFallback ? "rgba(22, 163, 74, 0.12)" : "var(--colors-neutral100)",
          hasRadius: true,
          style: {
            width: "100%",
            border: formData.whatsappFallback ? `2px solid ${"var(--colors-success600, #16A34A)"}` : `1px solid ${"rgba(128, 128, 128, 0.2)"}`,
            borderRadius: theme$2.borderRadius.md,
            transition: "all 0.2s ease"
          },
          children: /* @__PURE__ */ jsxs(Flex, { gap: 3, alignItems: "center", children: [
            /* @__PURE__ */ jsx(
              Toggle,
              {
                checked: formData.whatsappFallback,
                onChange: () => handleChange("whatsappFallback", !formData.whatsappFallback)
              }
            ),
            /* @__PURE__ */ jsxs(Box, { style: { flex: 1 }, children: [
              /* @__PURE__ */ jsxs(Flex, { alignItems: "center", gap: 2, children: [
                /* @__PURE__ */ jsx(Typography, { fontWeight: "semiBold", children: "WhatsApp Fallback" }),
                formData.whatsappFallback && /* @__PURE__ */ jsx(Badge, { backgroundColor: "success600", textColor: "neutral0", size: "S", children: "ENABLED" })
              ] }),
              /* @__PURE__ */ jsx(Typography, { variant: "pi", textColor: "neutral600", marginTop: 1, children: formData.whatsappFallback ? "If ALL email accounts fail, message will be sent via WhatsApp (requires connected WhatsApp & phone number in email data)" : "Enable to use WhatsApp as last-resort fallback when email delivery fails" })
            ] })
          ] })
        }
      ),
      /* @__PURE__ */ jsxs(Field.Root, { style: { width: "100%" }, children: [
        /* @__PURE__ */ jsx(Field.Label, { children: "Rule Priority" }),
        /* @__PURE__ */ jsx(
          NumberInput,
          {
            value: formData.priority,
            onValueChange: (value) => handleChange("priority", value),
            min: 1,
            max: 10,
            style: { width: "100%" }
          }
        ),
        /* @__PURE__ */ jsx(Field.Hint, { children: "Higher priority rules are evaluated first (1-10). Use high priority for more specific rules." })
      ] }),
      /* @__PURE__ */ jsx(
        Box,
        {
          padding: 4,
          background: formData.isActive ? "rgba(22, 163, 74, 0.12)" : "rgba(220, 38, 38, 0.12)",
          hasRadius: true,
          style: {
            width: "100%",
            border: formData.isActive ? `2px solid ${"var(--colors-success600, #16A34A)"}` : `2px solid ${"var(--colors-danger600, #DC2626)"}`,
            borderRadius: theme$2.borderRadius.md,
            transition: "all 0.2s ease"
          },
          children: /* @__PURE__ */ jsxs(Flex, { gap: 3, alignItems: "center", children: [
            /* @__PURE__ */ jsx(
              Toggle,
              {
                checked: formData.isActive,
                onChange: () => handleChange("isActive", !formData.isActive)
              }
            ),
            /* @__PURE__ */ jsxs(Box, { style: { flex: 1 }, children: [
              /* @__PURE__ */ jsxs(Flex, { alignItems: "center", gap: 2, children: [
                /* @__PURE__ */ jsx(Typography, { fontWeight: "semiBold", children: formData.isActive ? "✅ Rule Active" : "❌ Rule Inactive" }),
                /* @__PURE__ */ jsx(
                  Badge,
                  {
                    backgroundColor: formData.isActive ? "success600" : "danger600",
                    textColor: "neutral0",
                    size: "S",
                    children: formData.isActive ? "ENABLED" : "DISABLED"
                  }
                )
              ] }),
              /* @__PURE__ */ jsx(Typography, { variant: "pi", textColor: "neutral600", marginTop: 1, children: formData.isActive ? "This rule is active and will be used for email routing" : "This rule is disabled and will be ignored" })
            ] })
          ] })
        }
      )
    ] }) }) }),
    /* @__PURE__ */ jsx(Modal.Footer, { children: /* @__PURE__ */ jsxs(Flex, { justifyContent: "flex-end", gap: 2, style: { width: "100%" }, children: [
      /* @__PURE__ */ jsx(TertiaryButton, { onClick: onClose, children: "Cancel" }),
      /* @__PURE__ */ jsx(
        GradientButton$1,
        {
          onClick: handleSubmit,
          loading,
          disabled: !canSubmit,
          startIcon: /* @__PURE__ */ jsx(CheckIcon, { style: { width: 16, height: 16 } }),
          children: isEditMode ? "Update Rule" : "Create Rule"
        }
      )
    ] }) })
  ] }) });
};
const useLicense = () => {
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
    const interval = setInterval(() => {
      if (mounted) {
        checkLicense(true);
      }
    }, 60 * 60 * 1e3);
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
      const response = await get("/magic-mail/license/status");
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
      if (err.name === "AbortError") {
        return;
      }
      if (!silent) {
        console.error("[MagicMail] License check error:", err);
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
  const hasFeature = (featureName) => {
    if (!featureName) return false;
    const freeFeatures = [
      "basic-smtp",
      "oauth-gmail",
      "oauth-microsoft",
      "oauth-yahoo",
      "basic-routing",
      "email-logging",
      "account-testing",
      "strapi-service-override",
      "email-designer-basic"
    ];
    if (freeFeatures.includes(featureName)) return true;
    const premiumFeatures = [
      "email-designer-templates"
    ];
    if (premiumFeatures.includes(featureName) && isPremium) return true;
    const advancedFeatures = [
      "sendgrid",
      "mailgun",
      "dkim-signing",
      "priority-headers",
      "list-unsubscribe",
      "security-validation",
      "analytics-dashboard",
      "advanced-routing",
      "email-designer-versioning",
      "email-designer-import-export"
    ];
    if (advancedFeatures.includes(featureName) && isAdvanced) return true;
    const enterpriseFeatures = [
      "multi-tenant",
      "compliance-reports",
      "custom-security-rules",
      "priority-support",
      "email-designer-custom-blocks",
      "email-designer-team-library",
      "email-designer-a-b-testing"
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
      enterprise: isEnterprise
    },
    hasFeature,
    refetch: checkLicense
  };
};
const theme$1 = {
  shadows: {
    sm: "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)",
    md: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)",
    lg: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)",
    xl: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)"
  },
  transitions: { fast: "150ms cubic-bezier(0.4, 0, 0.2, 1)", normal: "300ms cubic-bezier(0.4, 0, 0.2, 1)", slow: "500ms cubic-bezier(0.4, 0, 0.2, 1)" },
  spacing: { xs: "4px", sm: "8px", md: "16px", lg: "24px", xl: "32px", "2xl": "48px" },
  borderRadius: { md: "8px", lg: "12px", xl: "16px" }
};
const fadeIn$3 = keyframes`
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
`;
const shimmer$1 = keyframes`
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
`;
const float$1 = keyframes`
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-5px); }
`;
styled.div`
  position: absolute;
  bottom: 40px;
  right: 40px;
  font-size: 72px;
  opacity: 0.08;
  ${css`animation: ${float$1} 4s ease-in-out infinite;`}
`;
const ScrollableDialogBody = styled(Box)`
  overflow-y: auto;
  max-height: calc(85vh - 160px);
  padding: 24px 28px 28px 28px;
  background: ${(p) => p.theme.colors.neutral0};

  /* Custom Scrollbar */
  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(128, 128, 128, 0.2);
    border-radius: 3px;
  }
  
  &::-webkit-scrollbar-thumb:hover {
    background: rgba(128, 128, 128, 0.3);
  }
`;
styled(Box)`
  margin-bottom: 32px;
  
  &:last-child {
    margin-bottom: 0;
  }
`;
styled(Flex)`
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
`;
styled(Typography)`
  font-size: 15px;
  font-weight: 600;
  color: var(--colors-neutral800);
  display: flex;
  align-items: center;
  gap: 8px;
`;
const RecommendedBadge = styled(Badge)`
  background: linear-gradient(135deg, ${"var(--colors-success600, #22C55E)"}, ${"var(--colors-success600, #16A34A)"});
  color: white;
  padding: 4px 12px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;
const CodeBlockWrapper = styled(Box)`
  position: relative;
  background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: ${theme$1.shadows.lg};
  border: 1px solid rgba(255, 255, 255, 0.1);
`;
const CodeBlock = styled.pre`
  margin: 0;
  padding: 20px;
  color: #e2e8f0;
  font-family: 'Monaco', 'Consolas', 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.7;
  overflow-x: auto;
  max-height: 320px;
  
  &::-webkit-scrollbar {
    height: 6px;
    width: 6px;
  }
  
  &::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.05);
  }
  
  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 3px;
  }
  
  &::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.3);
  }

  /* Syntax highlighting */
  .comment {
    color: #94a3b8;
    font-style: italic;
  }
  
  .string {
    color: #86efac;
  }
  
  .keyword {
    color: #c084fc;
  }
  
  .function {
    color: #67e8f9;
  }
  
  .number {
    color: #fbbf24;
  }
`;
const CopyButton = styled(Button)`
  position: absolute;
  top: 12px;
  right: 12px;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: white;
  padding: 6px 12px;
  font-size: 12px;
  transition: all 0.2s;
  
  &:hover {
    background: rgba(255, 255, 255, 0.15);
    border-color: rgba(255, 255, 255, 0.3);
    transform: translateY(-1px);
  }
  
  svg {
    width: 14px;
    height: 14px;
  }
`;
const InfoBox$2 = styled(Box)`
  background: linear-gradient(135deg, ${"rgba(2, 132, 199, 0.06)"}, ${"rgba(2, 132, 199, 0.12)"});
  border-left: 4px solid ${"var(--colors-primary600, #0EA5E9)"};
  border-radius: 8px;
  padding: 16px;
  margin-top: 24px;
`;
const WarningBox = styled(Box)`
  background: linear-gradient(135deg, ${"rgba(234, 179, 8, 0.06)"}, ${"rgba(234, 179, 8, 0.12)"});
  border-left: 4px solid ${"var(--colors-warning600, #F59E0B)"};
  border-radius: 8px;
  padding: 12px 16px;
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
`;
const LimitWarning = styled(Box)`
  background: linear-gradient(135deg, ${"rgba(234, 179, 8, 0.06)"}, rgba(251, 191, 36, 0.1));
  border: 1px solid rgba(234, 179, 8, 0.2);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
`;
const UpgradeButton = styled(Button)`
  background: linear-gradient(135deg, ${"var(--colors-warning600, #F59E0B)"}, ${"var(--colors-warning600, #D97706)"});
  color: white;
  font-weight: 600;
  padding: 8px 16px;
  font-size: 13px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  
  &:hover {
    background: linear-gradient(135deg, ${"var(--colors-warning600, #D97706)"}, ${"var(--colors-warning600, #A16207)"});
    transform: translateY(-1px);
  }
`;
const breakpoints$1 = {
  mobile: "768px",
  tablet: "1024px"
};
const Container$2 = styled(Box)`
  ${css`animation: ${fadeIn$3} ${theme$1.transitions.slow};`}
  min-height: 100vh;
  max-width: 1440px;
  margin: 0 auto;
  padding: ${theme$1.spacing.xl} ${theme$1.spacing.lg} 0;
  
  @media screen and (max-width: ${breakpoints$1.mobile}) {
    padding: 16px 12px 0;
  }
`;
const Header$2 = styled(Box)`
  background: linear-gradient(135deg, 
    var(--colors-secondary600, #7C3AED) 0%, 
    ${"var(--colors-primary600, #0284C7)"} 100%
  );
  border-radius: ${theme$1.borderRadius.xl};
  padding: ${theme$1.spacing.xl} ${theme$1.spacing["2xl"]};
  margin-bottom: ${theme$1.spacing.xl};
  position: relative;
  overflow: hidden;
  box-shadow: ${theme$1.shadows.xl};
  
  @media screen and (max-width: ${breakpoints$1.mobile}) {
    padding: 24px 20px;
    border-radius: 12px;
  }
  
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 200%;
    height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.15), transparent);
    ${css`animation: ${shimmer$1} 3s infinite;`}
  }
  
  &::after {
    content: '';
    position: absolute;
    top: 0;
    right: 0;
    width: 100%;
    height: 100%;
    background-image: radial-gradient(circle at 20% 80%, transparent 50%, rgba(255, 255, 255, 0.1) 50%);
    background-size: 15px 15px;
    opacity: 0.3;
  }
`;
const HeaderContent$1 = styled(Flex)`
  position: relative;
  z-index: 1;
`;
const Title$1 = styled(Typography)`
  color: white;
  font-size: 2rem;
  font-weight: 700;
  letter-spacing: -0.025em;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  display: flex;
  align-items: center;
  gap: ${theme$1.spacing.sm};
  
  svg {
    width: 28px;
    height: 28px;
    ${css`animation: ${float$1} 3s ease-in-out infinite;`}
  }
  
  @media screen and (max-width: ${breakpoints$1.mobile}) {
    font-size: 1.5rem;
    
    svg {
      width: 22px;
      height: 22px;
    }
  }
`;
const Subtitle$1 = styled(Typography)`
  color: rgba(255, 255, 255, 0.95);
  font-size: 0.95rem;
  font-weight: 500;
  margin-top: ${theme$1.spacing.xs};
  letter-spacing: 0.01em;
  
  @media screen and (max-width: ${breakpoints$1.mobile}) {
    font-size: 0.85rem;
  }
`;
const StatsGrid$1 = styled.div`
  margin-bottom: ${theme$1.spacing.xl};
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: ${theme$1.spacing.lg};
  justify-content: center;
  max-width: 1200px;
  margin-left: auto;
  margin-right: auto;
  
  @media screen and (max-width: ${breakpoints$1.mobile}) {
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
    margin-bottom: 24px;
  }
`;
const StatCard$1 = styled(Box)`
  background: ${(p) => p.theme.colors.neutral0};
  border-radius: ${theme$1.borderRadius.lg};
  padding: 28px ${theme$1.spacing.lg};
  position: relative;
  overflow: hidden;
  transition: all ${theme$1.transitions.normal};
  ${css`animation: ${fadeIn$3} ${theme$1.transitions.slow} backwards;`}
  animation-delay: ${(props) => props.$delay || "0s"};
  box-shadow: ${theme$1.shadows.sm};
  border: 1px solid rgba(128, 128, 128, 0.2);
  min-width: 200px;
  flex: 1;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  
  @media screen and (max-width: ${breakpoints$1.mobile}) {
    min-width: unset;
    padding: 20px 12px;
    
    &:hover {
      transform: none;
    }
  }
  
  &:hover {
    transform: translateY(-6px);
    box-shadow: ${theme$1.shadows.xl};
    border-color: ${(props) => props.$color || "var(--colors-primary600, #0EA5E9)"};
    
    .stat-icon {
      transform: scale(1.15) rotate(5deg);
    }
    
    .stat-value {
      transform: scale(1.08);
      color: ${(props) => props.$color || "var(--colors-primary600, #0284C7)"};
    }
  }
`;
const StatIcon$1 = styled(Box)`
  width: 68px;
  height: 68px;
  border-radius: ${theme$1.borderRadius.lg};
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${(props) => props.$bg || "rgba(2, 132, 199, 0.12)"};
  transition: all ${theme$1.transitions.normal};
  margin: 0 auto 20px;
  box-shadow: ${theme$1.shadows.sm};
  
  svg {
    width: 34px;
    height: 34px;
    color: ${(props) => props.$color || "var(--colors-primary600, #0284C7)"};
  }
  
  @media screen and (max-width: ${breakpoints$1.mobile}) {
    width: 48px;
    height: 48px;
    margin-bottom: 12px;
    
    svg {
      width: 24px;
      height: 24px;
    }
  }
`;
const StatValue$1 = styled(Typography)`
  font-size: 2.75rem;
  font-weight: 700;
  color: var(--colors-neutral800);
  line-height: 1;
  margin-bottom: 10px;
  transition: all ${theme$1.transitions.normal};
  text-align: center;
  
  @media screen and (max-width: ${breakpoints$1.mobile}) {
    font-size: 2rem;
    margin-bottom: 6px;
  }
`;
const StatLabel$1 = styled(Typography)`
  font-size: 0.95rem;
  color: var(--colors-neutral600);
  font-weight: 500;
  letter-spacing: 0.025em;
  text-align: center;
  
  @media screen and (max-width: ${breakpoints$1.mobile}) {
    font-size: 0.8rem;
  }
`;
const TemplatesContainer = styled(Box)`
  margin-top: ${theme$1.spacing.xl};
`;
const SectionHeader = styled(Box)`
  margin-bottom: ${theme$1.spacing.md};
`;
const FilterBar$1 = styled(Flex)`
  background: ${(p) => p.theme.colors.neutral0};
  padding: ${theme$1.spacing.md} ${theme$1.spacing.lg};
  border-radius: ${theme$1.borderRadius.lg};
  margin-bottom: ${theme$1.spacing.lg};
  box-shadow: ${theme$1.shadows.sm};
  border: 1px solid rgba(128, 128, 128, 0.2);
  gap: ${theme$1.spacing.md};
  align-items: center;
`;
const SearchInputWrapper = styled.div`
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
`;
const SearchIcon = styled(MagnifyingGlassIcon)`
  position: absolute;
  left: 12px;
  width: 16px;
  height: 16px;
  color: var(--colors-neutral600);
  pointer-events: none;
  z-index: 1;
`;
const StyledSearchInput = styled(TextInput)`
  width: 100%;
  padding-left: 36px;
`;
const TableWrapper = styled(Box)`
  overflow-x: auto;
  border-radius: ${theme$1.borderRadius.lg};
  border: 1px solid rgba(128, 128, 128, 0.2);
  background: ${(p) => p.theme.colors.neutral0};
  
  &::-webkit-scrollbar {
    height: 8px;
  }
  
  &::-webkit-scrollbar-track {
    background: var(--colors-neutral100);
    border-radius: 4px;
  }
  
  &::-webkit-scrollbar-thumb {
    background: rgba(128, 128, 128, 0.3);
    border-radius: 4px;
    
    &:hover {
      background: rgba(128, 128, 128, 0.4);
    }
  }
`;
const StyledTable$1 = styled(Table)`
  width: 100%;
  min-width: 900px;
  
  thead {
    background: var(--colors-neutral100);
    border-bottom: 2px solid rgba(128, 128, 128, 0.2);
    
    th {
      font-weight: 600;
      color: var(--colors-neutral800);
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.025em;
      padding: 12px 16px;
      white-space: nowrap;
    }
  }
  
  tbody tr {
    transition: all ${theme$1.transitions.fast};
    border-bottom: 1px solid rgba(128, 128, 128, 0.15);
    
    &:last-child {
      border-bottom: none;
    }
    
    &:hover {
      background: rgba(2, 132, 199, 0.12);
    }
    
    td {
      padding: 10px 12px;
      color: var(--colors-neutral800);
      vertical-align: middle;
      font-size: 13px;
    }
  }
`;
const PaginationWrapper = styled(Flex)`
  padding: 16px 20px;
  background: var(--colors-neutral100);
  border-top: 1px solid rgba(128, 128, 128, 0.2);
  border-radius: 0 0 ${theme$1.borderRadius.lg} ${theme$1.borderRadius.lg};
`;
const PaginationButton = styled.button`
  background: ${(props) => props.active ? "linear-gradient(135deg, var(--colors-primary600, #0EA5E9) 0%, var(--colors-secondary500, #A855F7) 100%)" : "${(p) => p.theme.colors.neutral0}"};
  color: ${(props) => props.active ? "white" : "var(--colors-neutral700)"};
  border: 1px solid ${(props) => props.active ? "transparent" : "rgba(128, 128, 128, 0.3)"};
  padding: 6px 12px;
  min-width: 36px;
  height: 36px;
  border-radius: 8px;
  font-weight: 500;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover:not(:disabled) {
    background: ${(props) => props.active ? "linear-gradient(135deg, var(--colors-primary700, #0284C7) 0%, var(--colors-secondary600, #9333EA) 100%)" : "var(--colors-neutral100)"};
    border-color: ${(props) => props.active ? "transparent" : "rgba(128, 128, 128, 0.4)"};
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;
const EmptyState$1 = styled(Box)`
  background: ${(p) => p.theme.colors.neutral0};
  border-radius: ${theme$1.borderRadius.xl};
  border: 2px dashed rgba(128, 128, 128, 0.3);
  padding: 80px 32px;
  text-align: center;
  position: relative;
  overflow: hidden;
  min-height: 500px;
  display: flex;
  align-items: center;
  justify-content: center;
  
  /* Background Gradient */
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(135deg, rgba(168, 85, 247, 0.06) 0%, ${"rgba(2, 132, 199, 0.06)"} 100%);
    opacity: 0.3;
    z-index: 0;
  }
`;
const EmptyContent$1 = styled.div`
  position: relative;
  z-index: 1;
  max-width: 600px;
  margin: 0 auto;
`;
const EmptyIcon$1 = styled.div`
  width: 120px;
  height: 120px;
  margin: 0 auto ${theme$1.spacing.lg};
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(168, 85, 247, 0.12) 0%, ${"rgba(2, 132, 199, 0.12)"} 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: ${theme$1.shadows.xl};
  
  svg {
    width: 60px;
    height: 60px;
    color: ${"var(--colors-primary600, #0284C7)"};
  }
`;
const EmptyFeatureList = styled.div`
  margin: ${theme$1.spacing.xl} 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: ${theme$1.spacing.md};
  
  @media screen and (max-width: ${breakpoints$1.tablet}) {
    grid-template-columns: 1fr;
  }
`;
const EmptyFeatureItem = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: ${theme$1.spacing.sm};
  padding: ${theme$1.spacing.lg};
  background: ${(p) => p.theme.colors.neutral0};
  border-radius: ${theme$1.borderRadius.md};
  box-shadow: ${theme$1.shadows.sm};
  transition: ${theme$1.transitions.fast};
  
  &:hover {
    transform: translateY(-2px);
    box-shadow: ${theme$1.shadows.md};
  }
  
  svg {
    width: 28px;
    height: 28px;
    color: ${"var(--colors-success600, #22C55E)"};
    flex-shrink: 0;
    margin-bottom: ${theme$1.spacing.xs};
  }
`;
const EmptyButtonGroup = styled.div`
  display: flex;
  gap: ${theme$1.spacing.md};
  justify-content: center;
  margin-top: ${theme$1.spacing.xl};
  flex-wrap: wrap;
`;
const HiddenFileInput = styled.input`
  display: none;
`;
const StyledModalContent = styled(Modal.Content)`
  && {
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    max-width: 480px;
  }
`;
const StyledModalHeader = styled(Modal.Header)`
  && {
    background: linear-gradient(135deg, ${"var(--colors-primary600, #0EA5E9)"} 0%, var(--colors-secondary600, #A855F7) 100%);
    padding: 24px 28px;
    border-bottom: none;
    
    h2 {
      color: white;
      font-size: 1.25rem;
      font-weight: 700;
    }
    
    /* Close button styling */
    button {
      color: white !important;
      opacity: 0.9;
      background: rgba(255, 255, 255, 0.15) !important;
      border-radius: 8px;
      
      &:hover {
        opacity: 1;
        background: rgba(255, 255, 255, 0.25) !important;
      }
      
      svg {
        fill: white !important;
        color: white !important;
        
        path {
          fill: white !important;
        }
      }
    }
  }
`;
const StyledModalBody = styled(Modal.Body)`
  && {
    padding: 28px;
    background: ${(p) => p.theme.colors.neutral0};
  }
`;
const ModalField = styled(Box)`
  margin-bottom: 20px;
  
  &:last-child {
    margin-bottom: 0;
  }
`;
const ModalLabel = styled(Typography)`
  && {
    font-weight: 600;
    font-size: 13px;
    color: var(--colors-neutral700);
    margin-bottom: 8px;
    display: block;
  }
`;
const ModalHint = styled(Typography)`
  && {
    font-size: 12px;
    color: var(--colors-neutral600);
    margin-top: 6px;
    display: block;
  }
`;
const ModalTemplateInfo = styled(Box)`
  background: linear-gradient(135deg, ${"rgba(2, 132, 199, 0.06)"} 0%, rgba(168, 85, 247, 0.06) 100%);
  border: 1px solid ${"rgba(2, 132, 199, 0.12)"};
  border-radius: 10px;
  padding: 14px 16px;
  
  p {
    margin: 0;
    font-weight: 500;
    color: var(--colors-neutral800);
  }
`;
const StyledSelect = styled.select`
  width: 100%;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid rgba(128, 128, 128, 0.2);
  font-size: 14px;
  background: ${(p) => p.theme.colors.neutral0};
  cursor: pointer;
  transition: all ${theme$1.transitions.fast};
  color: var(--colors-neutral700);
  
  &:hover {
    border-color: ${"var(--colors-primary600, #0EA5E9)"};
  }
  
  &:focus {
    outline: none;
    border-color: ${"var(--colors-primary600, #0EA5E9)"};
    box-shadow: 0 0 0 3px ${"rgba(2, 132, 199, 0.12)"};
  }
`;
const StyledModalFooter = styled(Modal.Footer)`
  && {
    padding: 20px 28px;
    background: var(--colors-neutral100);
    border-top: 1px solid rgba(128, 128, 128, 0.2);
    gap: 12px;
  }
`;
const TemplateList = () => {
  const { get, del, post } = useFetchClient();
  const { toggleNotification } = useNotification();
  const navigate = useNavigate();
  useLicense();
  useAuthRefresh();
  const [templates, setTemplates] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("customTemplates");
  const [showCodeExample, setShowCodeExample] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [copiedCode, setCopiedCode] = useState(null);
  const [limits, setLimits] = useState(null);
  const [showTestSendModal, setShowTestSendModal] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [testAccount, setTestAccount] = useState("");
  const [accounts, setAccounts] = useState([]);
  const fileInputRef = useRef(null);
  const coreEmailTypes = [
    {
      type: "reset-password",
      name: "Reset Password",
      description: "Email sent when user requests password reset"
    },
    {
      type: "email-confirmation",
      name: "Email Address Confirmation",
      description: "Email sent to confirm user email address"
    }
  ];
  useEffect(() => {
    fetchData();
    fetchLimits();
    fetchAccounts();
  }, []);
  const fetchData = async () => {
    setLoading(true);
    try {
      const [templatesResponse, statsResponse] = await Promise.all([
        get("/magic-mail/designer/templates").catch(() => ({ data: { data: [] } })),
        get("/magic-mail/designer/stats").catch(() => ({ data: { data: null } }))
      ]);
      setTemplates(templatesResponse.data?.data || []);
      setStats(statsResponse.data?.data || null);
    } catch (error) {
      toggleNotification({ type: "danger", message: "Failed to load templates" });
    } finally {
      setLoading(false);
    }
  };
  const fetchLimits = async () => {
    try {
      const response = await get("/magic-mail/license/limits");
      console.log("[DEBUG] License limits response:", response.data);
      try {
        const debugResponse = await get("/magic-mail/license/debug");
        console.log("[DEBUG] License debug data:", debugResponse.data);
      } catch (debugError) {
        console.error("[DEBUG] Failed to fetch debug data:", debugError);
      }
      setLimits({
        ...response.data?.limits,
        tier: response.data?.tier || "free"
      });
    } catch (error) {
      console.error("Failed to fetch license limits:", error);
    }
  };
  const fetchAccounts = async () => {
    try {
      const response = await get("/magic-mail/accounts");
      setAccounts(response.data?.data || []);
    } catch (error) {
      console.error("Failed to fetch accounts:", error);
    }
  };
  const handleTestSend = (template) => {
    setSelectedTemplate(template);
    setShowTestSendModal(true);
    setTestEmail("");
    setTestAccount("");
  };
  const sendTestEmail = async () => {
    if (!testEmail) {
      toggleNotification({
        type: "warning",
        message: "Please enter an email address"
      });
      return;
    }
    try {
      const response = await post(`/magic-mail/designer/templates/${selectedTemplate.id}/test-send`, {
        to: testEmail,
        accountName: testAccount || null
      });
      toggleNotification({
        type: "success",
        message: `Test email sent to ${testEmail}!`
      });
      setShowTestSendModal(false);
      setTestEmail("");
      setTestAccount("");
    } catch (error) {
      console.error("Failed to send test email:", error);
      toggleNotification({
        type: "danger",
        message: error?.response?.data?.error?.message || "Failed to send test email"
      });
    }
  };
  const getTierInfo = () => {
    const tier = limits?.tier || "free";
    const tierInfo = {
      free: {
        name: "FREE",
        color: "neutral",
        next: "PREMIUM",
        nextTemplates: 50,
        features: ["10 Templates", "1 Account", "Import/Export"]
      },
      premium: {
        name: "PREMIUM",
        color: "secondary",
        next: "ADVANCED",
        nextTemplates: 200,
        features: ["50 Templates", "5 Accounts", "Versioning", "Basic Analytics"]
      },
      advanced: {
        name: "ADVANCED",
        color: "primary",
        next: "ENTERPRISE",
        nextTemplates: -1,
        features: ["200 Templates", "Unlimited Accounts", "Advanced Analytics", "API Integrations"]
      },
      enterprise: {
        name: "ENTERPRISE",
        color: "warning",
        features: ["Unlimited Everything", "Priority Support", "Custom Features", "SLA"]
      }
    };
    return tierInfo[tier] || tierInfo.free;
  };
  const fetchTemplates = async () => {
    try {
      const response = await get("/magic-mail/designer/templates");
      setTemplates(response.data?.data || []);
    } catch (error) {
      console.error("Failed to reload templates:", error);
    }
  };
  const fetchStats = async () => {
    try {
      const response = await get("/magic-mail/designer/stats");
      setStats(response.data?.data || null);
    } catch (error) {
      console.error("Failed to reload stats:", error);
    }
  };
  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete template "${name}"?`)) return;
    try {
      await del(`/magic-mail/designer/templates/${id}`);
      toggleNotification({ type: "success", message: "Template deleted successfully" });
      fetchTemplates();
      fetchStats();
    } catch (error) {
      toggleNotification({ type: "danger", message: "Failed to delete template" });
    }
  };
  const handleDownload = async (id, type) => {
    try {
      const response = await get(`/magic-mail/designer/templates/${id}/download?type=${type}`, {
        responseType: "blob"
      });
      const blob = new Blob([response.data], {
        type: type === "html" ? "text/html" : "application/json"
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `template-${id}.${type}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toggleNotification({
        type: "success",
        message: `Template downloaded as ${type.toUpperCase()}`
      });
    } catch (error) {
      toggleNotification({
        type: "danger",
        message: "Failed to download template"
      });
    }
  };
  const handleDuplicate = async (id, name) => {
    try {
      const response = await post(`/magic-mail/designer/templates/${id}/duplicate`);
      const duplicated = response.data?.data;
      toggleNotification({
        type: "success",
        message: `Template "${name}" duplicated successfully`
      });
      fetchTemplates();
      fetchStats();
      if (duplicated?.templateReferenceId) {
        navigate(`/plugins/magic-mail/designer/${duplicated.templateReferenceId}`);
      }
    } catch (error) {
      toggleNotification({
        type: "danger",
        message: "Failed to duplicate template"
      });
    }
  };
  const handleCopyCode = (code, type) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(type);
    toggleNotification({
      type: "success",
      message: "Code copied to clipboard!"
    });
    setTimeout(() => setCopiedCode(null), 2e3);
  };
  const handleCreateTemplate = () => {
    if (limits?.emailTemplates && !limits.emailTemplates.canCreate) {
      const max = limits.emailTemplates.max;
      let upgradeMessage = "";
      if (max === 10) {
        upgradeMessage = `You've reached the FREE tier limit of ${max} templates. Upgrade to PREMIUM for 50 templates, versioning, and more!`;
      } else if (max === 50) {
        upgradeMessage = `You've reached the PREMIUM tier limit of ${max} templates. Upgrade to ADVANCED for 200 templates and advanced features!`;
      } else if (max === 200) {
        upgradeMessage = `You've reached the ADVANCED tier limit of ${max} templates. Upgrade to ENTERPRISE for unlimited templates!`;
      }
      toggleNotification({
        type: "warning",
        title: "🚀 Time to Upgrade!",
        message: upgradeMessage
      });
      return;
    }
    navigate("/plugins/magic-mail/designer/new");
  };
  const handleExport = async () => {
    try {
      const response = await post("/magic-mail/designer/export", { templateIds: [] });
      const dataStr = JSON.stringify(response.data?.data || [], null, 2);
      const dataBlob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `magic-mail-templates-${(/* @__PURE__ */ new Date()).toISOString().split("T")[0]}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toggleNotification({ type: "success", message: "Templates exported successfully" });
    } catch (error) {
      toggleNotification({
        type: "danger",
        message: error.response?.data?.message || "Export failed"
      });
    }
  };
  const handleImport = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const importedTemplates = JSON.parse(text);
      const response = await post("/magic-mail/designer/import", {
        templates: importedTemplates
      });
      const results = response.data?.data || [];
      const successful = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;
      toggleNotification({
        type: "success",
        message: `Imported ${successful} templates${failed > 0 ? `. ${failed} failed.` : ""}`
      });
      fetchTemplates();
      fetchStats();
    } catch (error) {
      toggleNotification({ type: "danger", message: "Import failed" });
    }
  };
  const getCategoryBadge = (category) => {
    const configs = {
      transactional: { bg: "primary", label: "TRANSACTIONAL" },
      marketing: { bg: "success", label: "MARKETING" },
      notification: { bg: "secondary", label: "NOTIFICATION" },
      custom: { bg: "neutral", label: "CUSTOM" }
    };
    const config = configs[category] || configs.custom;
    return /* @__PURE__ */ jsx(Badge, { backgroundColor: config.bg, children: config.label });
  };
  const filteredTemplates = templates.filter(
    (t) => t.name.toLowerCase().includes(searchTerm.toLowerCase()) || t.subject.toLowerCase().includes(searchTerm.toLowerCase()) || t.templateReferenceId.toString().includes(searchTerm)
  );
  const totalPages = Math.ceil(filteredTemplates.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedTemplates = filteredTemplates.slice(startIndex, startIndex + itemsPerPage);
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);
  const showSkeleton = loading && templates.length === 0;
  return /* @__PURE__ */ jsxs(Container$2, { children: [
    /* @__PURE__ */ jsx(Header$2, { children: /* @__PURE__ */ jsx(HeaderContent$1, { justifyContent: "flex-start", alignItems: "center", children: /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx(Flex, { alignItems: "center", justifyContent: "space-between", style: { width: "100%" }, children: /* @__PURE__ */ jsxs(Title$1, { variant: "alpha", children: [
        /* @__PURE__ */ jsx(DocumentTextIcon, {}),
        "Email Templates"
      ] }) }),
      stats && limits && /* @__PURE__ */ jsx(Subtitle$1, { variant: "epsilon", children: /* @__PURE__ */ jsxs("span", { style: { display: "inline-flex", alignItems: "center", gap: "8px" }, children: [
        /* @__PURE__ */ jsxs("span", { children: [
          stats.total,
          " template",
          stats.total !== 1 ? "s" : "",
          " created"
        ] }),
        /* @__PURE__ */ jsx("span", { style: { opacity: 0.8 }, children: "•" }),
        !limits.emailTemplates.unlimited ? /* @__PURE__ */ jsxs("span", { style: {
          background: "rgba(255, 255, 255, 0.2)",
          padding: "2px 10px",
          borderRadius: "12px",
          fontWeight: "600"
        }, children: [
          limits.emailTemplates.max - limits.emailTemplates.current,
          " of ",
          limits.emailTemplates.max,
          " slots remaining"
        ] }) : /* @__PURE__ */ jsx("span", { style: {
          background: "rgba(255, 255, 255, 0.2)",
          padding: "2px 10px",
          borderRadius: "12px",
          fontWeight: "600"
        }, children: "Unlimited templates" })
      ] }) })
    ] }) }) }),
    /* @__PURE__ */ jsxs(StatsGrid$1, { children: [
      /* @__PURE__ */ jsxs(StatCard$1, { $delay: "0.1s", $color: "var(--colors-primary600, #0EA5E9)", children: [
        /* @__PURE__ */ jsx(StatIcon$1, { className: "stat-icon", $bg: "rgba(2, 132, 199, 0.12)", $color: "var(--colors-primary600, #0284C7)", children: /* @__PURE__ */ jsx(DocumentTextIcon, {}) }),
        /* @__PURE__ */ jsx(StatValue$1, { className: "stat-value", variant: "alpha", children: showSkeleton ? "..." : stats?.total || 0 }),
        /* @__PURE__ */ jsx(StatLabel$1, { variant: "pi", children: "Total Templates" })
      ] }),
      /* @__PURE__ */ jsxs(StatCard$1, { $delay: "0.2s", $color: "var(--colors-success600, #22C55E)", children: [
        /* @__PURE__ */ jsx(StatIcon$1, { className: "stat-icon", $bg: "rgba(22, 163, 74, 0.12)", $color: "var(--colors-success600, #16A34A)", children: /* @__PURE__ */ jsx(ChartBarIcon, {}) }),
        /* @__PURE__ */ jsx(StatValue$1, { className: "stat-value", variant: "alpha", children: showSkeleton ? "..." : stats?.active || 0 }),
        /* @__PURE__ */ jsx(StatLabel$1, { variant: "pi", children: "Active" })
      ] }),
      limits?.emailTemplates && !limits.emailTemplates.unlimited && /* @__PURE__ */ jsxs(StatCard$1, { $delay: "0.3s", $color: "var(--colors-warning600, #F59E0B)", children: [
        /* @__PURE__ */ jsx(StatIcon$1, { className: "stat-icon", $bg: "rgba(234, 179, 8, 0.12)", $color: "var(--colors-warning600, #D97706)", children: /* @__PURE__ */ jsx(SparklesIcon, {}) }),
        /* @__PURE__ */ jsx(StatValue$1, { className: "stat-value", variant: "alpha", children: showSkeleton ? "..." : limits.emailTemplates.max - limits.emailTemplates.current }),
        /* @__PURE__ */ jsx(StatLabel$1, { variant: "pi", children: "Remaining" })
      ] })
    ] }),
    /* @__PURE__ */ jsx(Box, { style: { margin: "0 -32px 32px -32px" }, children: /* @__PURE__ */ jsx(Divider, {}) }),
    limits?.emailTemplates && !limits.emailTemplates.unlimited && limits.emailTemplates.current >= limits.emailTemplates.max * 0.8 && /* @__PURE__ */ jsxs(LimitWarning, { children: [
      /* @__PURE__ */ jsxs(Flex, { alignItems: "center", gap: 3, children: [
        /* @__PURE__ */ jsx(SparklesIcon, { style: { width: 24, height: 24, color: "var(--colors-warning600, #D97706)" } }),
        /* @__PURE__ */ jsxs(Box, { children: [
          /* @__PURE__ */ jsx(Typography, { variant: "omega", fontWeight: "bold", textColor: "neutral800", children: limits.emailTemplates.current >= limits.emailTemplates.max ? `You've reached your ${getTierInfo().name} limit!` : `You're approaching your ${getTierInfo().name} limit!` }),
          /* @__PURE__ */ jsxs(Typography, { variant: "pi", textColor: "neutral600", style: { marginTop: "4px" }, children: [
            "Using ",
            limits.emailTemplates.current,
            " of ",
            limits.emailTemplates.max,
            " templates.",
            getTierInfo().next && ` Upgrade to ${getTierInfo().next} for ${getTierInfo().nextTemplates === -1 ? "unlimited" : getTierInfo().nextTemplates} templates!`
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs(
        UpgradeButton,
        {
          onClick: () => navigate("/admin/settings/magic-mail/upgrade"),
          children: [
            /* @__PURE__ */ jsx(BoltIcon, { style: { width: 16, height: 16, marginRight: "6px" } }),
            "Upgrade Now"
          ]
        }
      )
    ] }),
    /* @__PURE__ */ jsxs(Tabs.Root, { value: activeTab, onValueChange: setActiveTab, children: [
      /* @__PURE__ */ jsxs(Tabs.List, { children: [
        /* @__PURE__ */ jsx(Tabs.Trigger, { value: "customTemplates", children: "Custom Templates" }),
        /* @__PURE__ */ jsx(Tabs.Trigger, { value: "coreEmails", children: "Core Emails" })
      ] }),
      /* @__PURE__ */ jsx(Tabs.Content, { value: "customTemplates", children: templates.length === 0 ? /* @__PURE__ */ jsx(EmptyState$1, { children: /* @__PURE__ */ jsxs(EmptyContent$1, { children: [
        /* @__PURE__ */ jsx(EmptyIcon$1, { children: /* @__PURE__ */ jsx(SparklesIcon, {}) }),
        /* @__PURE__ */ jsx(
          Typography,
          {
            variant: "alpha",
            textColor: "neutral800",
            style: {
              fontSize: "1.75rem",
              fontWeight: "700",
              textAlign: "center",
              display: "block"
            },
            children: "No Email Templates Yet"
          }
        ),
        /* @__PURE__ */ jsx(
          Typography,
          {
            variant: "omega",
            textColor: "neutral600",
            style: {
              marginTop: "24px",
              lineHeight: "1.8",
              textAlign: "center",
              maxWidth: "500px",
              margin: "24px auto 0",
              display: "block"
            },
            children: "Start creating beautiful, professional email templates with our visual designer"
          }
        ),
        /* @__PURE__ */ jsxs(EmptyFeatureList, { children: [
          /* @__PURE__ */ jsxs(EmptyFeatureItem, { children: [
            /* @__PURE__ */ jsx(CheckCircleIcon, {}),
            /* @__PURE__ */ jsx(Typography, { variant: "omega", fontWeight: "semiBold", children: "Drag & Drop Editor" }),
            /* @__PURE__ */ jsx(Typography, { variant: "pi", textColor: "neutral600", style: { marginTop: "4px" }, children: "Build emails visually with Unlayer's powerful editor" })
          ] }),
          /* @__PURE__ */ jsxs(EmptyFeatureItem, { children: [
            /* @__PURE__ */ jsx(CheckCircleIcon, {}),
            /* @__PURE__ */ jsx(Typography, { variant: "omega", fontWeight: "semiBold", children: "Dynamic Content" }),
            /* @__PURE__ */ jsx(Typography, { variant: "pi", textColor: "neutral600", style: { marginTop: "4px" }, children: "Use Mustache variables for personalized emails" })
          ] }),
          /* @__PURE__ */ jsxs(EmptyFeatureItem, { children: [
            /* @__PURE__ */ jsx(CheckCircleIcon, {}),
            /* @__PURE__ */ jsx(Typography, { variant: "omega", fontWeight: "semiBold", children: "Version Control" }),
            /* @__PURE__ */ jsx(Typography, { variant: "pi", textColor: "neutral600", style: { marginTop: "4px" }, children: "Track changes and restore previous versions" })
          ] })
        ] }),
        /* @__PURE__ */ jsxs(EmptyButtonGroup, { children: [
          /* @__PURE__ */ jsx(
            CTAButton,
            {
              startIcon: /* @__PURE__ */ jsx(PlusIcon, { style: { width: 20, height: 20 } }),
              onClick: handleCreateTemplate,
              children: "Create Your First Template"
            }
          ),
          /* @__PURE__ */ jsx(
            SecondaryButton,
            {
              startIcon: /* @__PURE__ */ jsx(ArrowUpTrayIcon, { style: { width: 20, height: 20 } }),
              onClick: () => fileInputRef.current?.click(),
              children: "Import Template"
            }
          )
        ] })
      ] }) }) : /* @__PURE__ */ jsxs(TemplatesContainer, { children: [
        /* @__PURE__ */ jsx(SectionHeader, { children: /* @__PURE__ */ jsxs(Flex, { justifyContent: "space-between", alignItems: "center", marginBottom: 4, children: [
          /* @__PURE__ */ jsx(Typography, { variant: "delta", textColor: "neutral700", style: { fontSize: "1.5rem", fontWeight: 600 }, children: "Email Templates" }),
          /* @__PURE__ */ jsx(
            GradientButton$1,
            {
              startIcon: /* @__PURE__ */ jsx(PlusIcon, { style: { width: 20, height: 20 } }),
              onClick: handleCreateTemplate,
              children: "Create Template"
            }
          )
        ] }) }),
        /* @__PURE__ */ jsxs(FilterBar$1, { children: [
          /* @__PURE__ */ jsxs(SearchInputWrapper, { children: [
            /* @__PURE__ */ jsx(SearchIcon, {}),
            /* @__PURE__ */ jsx(
              StyledSearchInput,
              {
                value: searchTerm,
                onChange: (e) => setSearchTerm(e.target.value),
                placeholder: "Search by name, subject, or ID...",
                type: "text"
              }
            )
          ] }),
          /* @__PURE__ */ jsx(
            SecondaryButton,
            {
              startIcon: /* @__PURE__ */ jsx(ArrowUpTrayIcon, { style: { width: 16, height: 16 } }),
              onClick: () => fileInputRef.current?.click(),
              children: "Import"
            }
          ),
          /* @__PURE__ */ jsx(
            TertiaryButton,
            {
              startIcon: /* @__PURE__ */ jsx(ArrowDownTrayIcon, { style: { width: 16, height: 16 } }),
              onClick: handleExport,
              disabled: templates.length === 0,
              children: "Export"
            }
          )
        ] }),
        filteredTemplates.length > 0 ? /* @__PURE__ */ jsxs(TableWrapper, { children: [
          /* @__PURE__ */ jsxs(StyledTable$1, { colCount: 5, rowCount: paginatedTemplates.length, children: [
            /* @__PURE__ */ jsx(Thead, { children: /* @__PURE__ */ jsxs(Tr, { children: [
              /* @__PURE__ */ jsx(Th, { style: { width: "100px" }, children: /* @__PURE__ */ jsx(Typography, { variant: "sigma", children: "ID" }) }),
              /* @__PURE__ */ jsx(Th, { children: /* @__PURE__ */ jsx(Typography, { variant: "sigma", children: "Name" }) }),
              /* @__PURE__ */ jsx(Th, { style: { width: "100px" }, children: /* @__PURE__ */ jsx(Typography, { variant: "sigma", children: "Category" }) }),
              /* @__PURE__ */ jsx(Th, { style: { width: "80px" }, children: /* @__PURE__ */ jsx(Typography, { variant: "sigma", children: "Status" }) }),
              /* @__PURE__ */ jsx(Th, { style: { width: "260px" }, children: /* @__PURE__ */ jsx(Box, { style: { textAlign: "right", width: "100%" }, children: /* @__PURE__ */ jsx(Typography, { variant: "sigma", children: "Actions" }) }) })
            ] }) }),
            /* @__PURE__ */ jsx(Tbody, { children: paginatedTemplates.map((template) => /* @__PURE__ */ jsxs(Tr, { children: [
              /* @__PURE__ */ jsx(Td, { children: /* @__PURE__ */ jsxs(Typography, { variant: "omega", fontWeight: "bold", style: { fontSize: "13px" }, children: [
                "#",
                template.templateReferenceId
              ] }) }),
              /* @__PURE__ */ jsx(Td, { children: /* @__PURE__ */ jsx(Typography, { variant: "omega", fontWeight: "semiBold", style: { fontSize: "13px" }, children: template.name }) }),
              /* @__PURE__ */ jsx(Td, { children: getCategoryBadge(template.category) }),
              /* @__PURE__ */ jsx(Td, { children: /* @__PURE__ */ jsx(Badge, { backgroundColor: template.isActive ? "success" : "neutral", children: template.isActive ? "ACTIVE" : "INACTIVE" }) }),
              /* @__PURE__ */ jsx(Td, { children: /* @__PURE__ */ jsxs(Flex, { gap: 2, justifyContent: "flex-end", children: [
                /* @__PURE__ */ jsx(
                  IconButtonPrimary,
                  {
                    onClick: () => navigate(`/plugins/magic-mail/designer/${template.templateReferenceId}`),
                    "aria-label": "Edit Template",
                    title: "Edit Template",
                    children: /* @__PURE__ */ jsx(PencilIcon, {})
                  }
                ),
                /* @__PURE__ */ jsx(
                  IconButton,
                  {
                    onClick: () => handleDownload(template.templateReferenceId, "html"),
                    "aria-label": "Download HTML",
                    title: "Download as HTML",
                    children: /* @__PURE__ */ jsx(DocumentArrowDownIcon, {})
                  }
                ),
                /* @__PURE__ */ jsx(
                  IconButton,
                  {
                    onClick: () => handleDownload(template.templateReferenceId, "json"),
                    "aria-label": "Download JSON",
                    title: "Download as JSON",
                    children: /* @__PURE__ */ jsx(CodeBracketIcon, {})
                  }
                ),
                /* @__PURE__ */ jsx(
                  IconButton,
                  {
                    onClick: () => handleDuplicate(template.templateReferenceId, template.name),
                    "aria-label": "Duplicate Template",
                    title: "Duplicate Template",
                    children: /* @__PURE__ */ jsx(DocumentDuplicateIcon, {})
                  }
                ),
                /* @__PURE__ */ jsx(
                  IconButtonPurple,
                  {
                    onClick: () => {
                      setSelectedTemplate(template);
                      setShowCodeExample(true);
                    },
                    "aria-label": "Code Example",
                    title: "View Code Example",
                    children: /* @__PURE__ */ jsx(BoltIcon, {})
                  }
                ),
                /* @__PURE__ */ jsx(
                  IconButtonSuccess,
                  {
                    onClick: () => handleTestSend(template),
                    "aria-label": "Send Test Email",
                    title: "Send Test Email",
                    children: /* @__PURE__ */ jsx(PaperAirplaneIcon, {})
                  }
                ),
                /* @__PURE__ */ jsx(
                  IconButtonDanger,
                  {
                    onClick: () => handleDelete(template.templateReferenceId, template.name),
                    "aria-label": "Delete Template",
                    title: "Delete Template",
                    children: /* @__PURE__ */ jsx(TrashIcon, {})
                  }
                )
              ] }) })
            ] }, template.templateReferenceId)) })
          ] }),
          totalPages > 1 && /* @__PURE__ */ jsxs(PaginationWrapper, { justifyContent: "space-between", alignItems: "center", children: [
            /* @__PURE__ */ jsxs(Flex, { gap: 3, alignItems: "center", children: [
              /* @__PURE__ */ jsxs(Typography, { variant: "pi", textColor: "neutral600", children: [
                "Showing ",
                startIndex + 1,
                "-",
                Math.min(startIndex + itemsPerPage, filteredTemplates.length),
                " of ",
                filteredTemplates.length
              ] }),
              /* @__PURE__ */ jsxs(Flex, { gap: 2, alignItems: "center", children: [
                /* @__PURE__ */ jsx(Typography, { variant: "pi", textColor: "neutral600", children: "per page:" }),
                /* @__PURE__ */ jsxs(
                  StyledSelect,
                  {
                    value: itemsPerPage,
                    onChange: (e) => {
                      setItemsPerPage(Number(e.target.value));
                      setCurrentPage(1);
                    },
                    style: { width: "70px", padding: "4px 8px", fontSize: "12px" },
                    children: [
                      /* @__PURE__ */ jsx("option", { value: 5, children: "5" }),
                      /* @__PURE__ */ jsx("option", { value: 10, children: "10" }),
                      /* @__PURE__ */ jsx("option", { value: 25, children: "25" }),
                      /* @__PURE__ */ jsx("option", { value: 50, children: "50" })
                    ]
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ jsxs(Flex, { gap: 2, children: [
              /* @__PURE__ */ jsx(
                PaginationButton,
                {
                  onClick: () => setCurrentPage((p) => Math.max(1, p - 1)),
                  disabled: currentPage === 1,
                  children: "Previous"
                }
              ),
              Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                return /* @__PURE__ */ jsx(
                  PaginationButton,
                  {
                    active: currentPage === pageNum,
                    onClick: () => setCurrentPage(pageNum),
                    children: pageNum
                  },
                  pageNum
                );
              }),
              /* @__PURE__ */ jsx(
                PaginationButton,
                {
                  onClick: () => setCurrentPage((p) => Math.min(totalPages, p + 1)),
                  disabled: currentPage === totalPages,
                  children: "Next"
                }
              )
            ] })
          ] })
        ] }) : /* @__PURE__ */ jsxs(
          Box,
          {
            background: "neutral100",
            style: {
              padding: "80px 32px",
              textAlign: "center",
              borderRadius: theme$1.borderRadius.lg,
              border: "1px dashed rgba(128, 128, 128, 0.2)"
            },
            children: [
              /* @__PURE__ */ jsx(MagnifyingGlassIcon, { style: { width: "64px", height: "64px", margin: "0 auto 16px", color: "var(--colors-neutral500)" } }),
              /* @__PURE__ */ jsx(Typography, { variant: "beta", textColor: "neutral700", style: { marginBottom: "8px" }, children: "No templates found" }),
              /* @__PURE__ */ jsx(Typography, { variant: "omega", textColor: "neutral600", children: "Try adjusting your search or filters" }),
              /* @__PURE__ */ jsx(
                Button,
                {
                  variant: "secondary",
                  onClick: () => {
                    setSearchTerm("");
                    setActiveCategory("all");
                  },
                  style: { marginTop: "20px" },
                  children: "Clear Filters"
                }
              )
            ]
          }
        )
      ] }) }),
      /* @__PURE__ */ jsx(Tabs.Content, { value: "coreEmails", children: /* @__PURE__ */ jsxs(Box, { style: { marginTop: "24px" }, children: [
        /* @__PURE__ */ jsxs(Flex, { direction: "column", gap: 2, style: { marginBottom: "24px" }, children: [
          /* @__PURE__ */ jsx(Typography, { variant: "delta", textColor: "neutral700", style: { fontSize: "1.5rem", fontWeight: 600 }, children: "Core Email Templates" }),
          /* @__PURE__ */ jsx(Typography, { variant: "omega", textColor: "neutral600", children: "Design the default Strapi system emails (Password Reset & Email Confirmation)" })
        ] }),
        /* @__PURE__ */ jsx(Box, { background: "neutral0", borderRadius: theme$1.borderRadius.lg, shadow: "md", style: { border: "1px solid rgba(128, 128, 128, 0.2)", overflow: "hidden" }, children: /* @__PURE__ */ jsxs(Table, { colCount: 2, rowCount: 2, children: [
          /* @__PURE__ */ jsx(Thead, { children: /* @__PURE__ */ jsxs(Tr, { children: [
            /* @__PURE__ */ jsx(Th, { children: /* @__PURE__ */ jsx(Typography, { variant: "sigma", children: "Email Type" }) }),
            /* @__PURE__ */ jsx(Th, { children: /* @__PURE__ */ jsx(Box, { style: { textAlign: "right", width: "100%" }, children: /* @__PURE__ */ jsx(Typography, { variant: "sigma", children: "Actions" }) }) })
          ] }) }),
          /* @__PURE__ */ jsx(Tbody, { children: coreEmailTypes.map((coreEmail) => /* @__PURE__ */ jsxs(Tr, { children: [
            /* @__PURE__ */ jsx(Td, { children: /* @__PURE__ */ jsxs(Flex, { direction: "column", alignItems: "flex-start", gap: 1, children: [
              /* @__PURE__ */ jsx(Typography, { variant: "omega", fontWeight: "semiBold", style: { fontSize: "14px" }, children: coreEmail.name }),
              /* @__PURE__ */ jsx(Typography, { variant: "pi", textColor: "neutral600", style: { fontSize: "12px" }, children: coreEmail.description })
            ] }) }),
            /* @__PURE__ */ jsx(Td, { children: /* @__PURE__ */ jsx(Flex, { gap: 2, justifyContent: "flex-end", children: /* @__PURE__ */ jsx(
              IconButtonPrimary,
              {
                onClick: () => navigate(`/plugins/magic-mail/designer/core/${coreEmail.type}`),
                "aria-label": "Edit Core Email",
                title: "Edit Template",
                children: /* @__PURE__ */ jsx(PencilIcon, {})
              }
            ) }) })
          ] }, coreEmail.type)) })
        ] }) })
      ] }) })
    ] }),
    selectedTemplate && /* @__PURE__ */ jsx(Modal.Root, { open: showCodeExample, onOpenChange: setShowCodeExample, children: /* @__PURE__ */ jsxs(Modal.Content, { style: {
      maxWidth: "900px",
      width: "90vw",
      maxHeight: "85vh",
      display: "flex",
      flexDirection: "column",
      borderRadius: "16px",
      overflow: "hidden"
    }, children: [
      /* @__PURE__ */ jsx(StyledModalHeader, { children: /* @__PURE__ */ jsxs(Modal.Title, { children: [
        "Code Snippets: ",
        selectedTemplate.name
      ] }) }),
      /* @__PURE__ */ jsxs(ScrollableDialogBody, { children: [
        /* @__PURE__ */ jsx(InfoBox$2, { style: { marginTop: 0, marginBottom: "20px" }, children: /* @__PURE__ */ jsxs(Flex, { alignItems: "center", justifyContent: "space-between", children: [
          /* @__PURE__ */ jsxs(Typography, { variant: "pi", style: { color: "var(--colors-primary600, #075985)" }, children: [
            /* @__PURE__ */ jsx("strong", { children: "Template ID:" }),
            " #",
            selectedTemplate.templateReferenceId
          ] }),
          /* @__PURE__ */ jsxs(Typography, { variant: "pi", style: { color: "var(--colors-primary600, #075985)" }, children: [
            /* @__PURE__ */ jsx("strong", { children: "Status:" }),
            " ",
            selectedTemplate.isActive ? "Active" : "Inactive"
          ] })
        ] }) }),
        !selectedTemplate.isActive && /* @__PURE__ */ jsxs(WarningBox, { style: { marginTop: 0, marginBottom: "20px" }, children: [
          /* @__PURE__ */ jsx(SparklesIcon, { style: { width: 20, height: 20, color: "var(--colors-warning600, #D97706)" } }),
          /* @__PURE__ */ jsxs(Typography, { variant: "pi", style: { color: "var(--colors-warning600, #A16207)", fontWeight: 500 }, children: [
            "This template is currently ",
            /* @__PURE__ */ jsx("strong", { children: "INACTIVE" }),
            " and will not be sent."
          ] })
        ] }),
        /* @__PURE__ */ jsxs(Accordion.Root, { defaultValue: "native", collapsible: true, children: [
          /* @__PURE__ */ jsxs(Accordion.Item, { value: "native", children: [
            /* @__PURE__ */ jsx(Accordion.Header, { children: /* @__PURE__ */ jsx(Accordion.Trigger, { icon: () => /* @__PURE__ */ jsx(CheckCircleIcon, { style: { width: 16, height: 16, color: "var(--colors-success600, #16A34A)" } }), children: /* @__PURE__ */ jsxs(Flex, { gap: 2, alignItems: "center", children: [
              "Native Strapi Email Service",
              /* @__PURE__ */ jsx(RecommendedBadge, { children: "Recommended" })
            ] }) }) }),
            /* @__PURE__ */ jsx(Accordion.Content, { children: /* @__PURE__ */ jsxs(Box, { padding: 4, children: [
              /* @__PURE__ */ jsx(Typography, { variant: "pi", textColor: "neutral600", style: { marginBottom: "16px", display: "block" }, children: "Use the standard Strapi Email function. MagicMail intercepts it automatically and applies all features." }),
              /* @__PURE__ */ jsxs(CodeBlockWrapper, { children: [
                /* @__PURE__ */ jsx(CodeBlock, { dangerouslySetInnerHTML: {
                  __html: `<span class="comment">// Anywhere in your Strapi backend:</span>
<span class="keyword">await</span> strapi.plugins.email.services.email.<span class="function">send</span>({
  <span class="keyword">to</span>: <span class="string">'user@example.com'</span>,
  <span class="keyword">subject</span>: <span class="string">'Your Subject'</span>, <span class="comment">// Optional (overridden by template)</span>
  <span class="keyword">templateId</span>: <span class="number">${selectedTemplate.templateReferenceId}</span>, <span class="comment">// Template ID</span>
  <span class="keyword">data</span>: {
    <span class="keyword">name</span>: <span class="string">'John Doe'</span>,
    <span class="keyword">code</span>: <span class="string">'123456'</span>,
    <span class="comment">// ... your dynamic variables</span>
  }
});`
                } }),
                /* @__PURE__ */ jsx(
                  CopyButton,
                  {
                    size: "S",
                    variant: "ghost",
                    onClick: () => handleCopyCode(
                      `await strapi.plugins.email.services.email.send({
  to: 'user@example.com',
  subject: 'Your Subject',
  templateId: ${selectedTemplate.templateReferenceId},
  data: {
    name: 'John Doe',
    code: '123456'
  }
});`,
                      "native"
                    ),
                    children: copiedCode === "native" ? /* @__PURE__ */ jsxs(Fragment, { children: [
                      /* @__PURE__ */ jsx(CheckIcon, {}),
                      " Copied!"
                    ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
                      /* @__PURE__ */ jsx(ClipboardDocumentIcon, {}),
                      " Copy"
                    ] })
                  }
                )
              ] })
            ] }) })
          ] }),
          /* @__PURE__ */ jsxs(Accordion.Item, { value: "plugin", children: [
            /* @__PURE__ */ jsx(Accordion.Header, { children: /* @__PURE__ */ jsx(Accordion.Trigger, { icon: () => /* @__PURE__ */ jsx(CodeBracketIcon, { style: { width: 16, height: 16, color: "var(--colors-primary600, #0284C7)" } }), children: "MagicMail Plugin Service" }) }),
            /* @__PURE__ */ jsx(Accordion.Content, { children: /* @__PURE__ */ jsxs(Box, { padding: 4, children: [
              /* @__PURE__ */ jsx(Typography, { variant: "pi", textColor: "neutral600", style: { marginBottom: "16px", display: "block" }, children: "Direct access to the MagicMail service for advanced options." }),
              /* @__PURE__ */ jsxs(CodeBlockWrapper, { children: [
                /* @__PURE__ */ jsx(CodeBlock, { dangerouslySetInnerHTML: {
                  __html: `<span class="comment">// Inside Strapi backend</span>
<span class="keyword">await</span> strapi.<span class="function">plugin</span>(<span class="string">'magic-mail'</span>)
  .<span class="function">service</span>(<span class="string">'email-router'</span>)
  .<span class="function">send</span>({
    <span class="keyword">to</span>: <span class="string">'user@example.com'</span>,
    <span class="keyword">templateId</span>: <span class="number">${selectedTemplate.templateReferenceId}</span>,
    <span class="keyword">templateData</span>: {
      <span class="keyword">name</span>: <span class="string">'John Doe'</span>,
      <span class="keyword">code</span>: <span class="string">'123456'</span>
    }
  });`
                } }),
                /* @__PURE__ */ jsx(
                  CopyButton,
                  {
                    size: "S",
                    variant: "ghost",
                    onClick: () => handleCopyCode(
                      `await strapi.plugin('magic-mail')
  .service('email-router')
  .send({
    to: 'user@example.com',
    templateId: ${selectedTemplate.templateReferenceId},
    templateData: {
      name: 'John Doe',
      code: '123456'
    }
  });`,
                      "plugin"
                    ),
                    children: copiedCode === "plugin" ? /* @__PURE__ */ jsxs(Fragment, { children: [
                      /* @__PURE__ */ jsx(CheckIcon, {}),
                      " Copied!"
                    ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
                      /* @__PURE__ */ jsx(ClipboardDocumentIcon, {}),
                      " Copy"
                    ] })
                  }
                )
              ] })
            ] }) })
          ] }),
          /* @__PURE__ */ jsxs(Accordion.Item, { value: "rest", children: [
            /* @__PURE__ */ jsx(Accordion.Header, { children: /* @__PURE__ */ jsx(Accordion.Trigger, { icon: () => /* @__PURE__ */ jsx(DocumentArrowDownIcon, { style: { width: 16, height: 16, color: "var(--colors-secondary600, #7C3AED)" } }), children: "REST API (cURL)" }) }),
            /* @__PURE__ */ jsx(Accordion.Content, { children: /* @__PURE__ */ jsxs(Box, { padding: 4, children: [
              /* @__PURE__ */ jsx(Typography, { variant: "pi", textColor: "neutral600", style: { marginBottom: "16px", display: "block" }, children: "For external applications, frontend calls, or Postman tests." }),
              /* @__PURE__ */ jsxs(CodeBlockWrapper, { children: [
                /* @__PURE__ */ jsx(CodeBlock, { dangerouslySetInnerHTML: {
                  __html: `curl -X POST http://localhost:1337/api/magic-mail/send \\
  -H <span class="string">"Content-Type: application/json"</span> \\
  -H <span class="string">"Authorization: Bearer YOUR_API_TOKEN"</span> \\
  -d <span class="string">'{
    "to": "user@example.com",
    "templateId": ${selectedTemplate.templateReferenceId},
    "templateData": {
      "name": "John Doe",
      "code": "123456"
    }
  }'</span>`
                } }),
                /* @__PURE__ */ jsx(
                  CopyButton,
                  {
                    size: "S",
                    variant: "ghost",
                    onClick: () => handleCopyCode(
                      `curl -X POST http://localhost:1337/api/magic-mail/send \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_TOKEN" \\
  -d '{
    "to": "user@example.com",
    "templateId": ${selectedTemplate.templateReferenceId},
    "templateData": {
      "name": "John Doe",
      "code": "123456"
    }
  }'`,
                      "curl"
                    ),
                    children: copiedCode === "curl" ? /* @__PURE__ */ jsxs(Fragment, { children: [
                      /* @__PURE__ */ jsx(CheckIcon, {}),
                      " Copied!"
                    ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
                      /* @__PURE__ */ jsx(ClipboardDocumentIcon, {}),
                      " Copy"
                    ] })
                  }
                )
              ] })
            ] }) })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsx(StyledModalFooter, { children: /* @__PURE__ */ jsx(TertiaryButton, { onClick: () => setShowCodeExample(false), children: "Close" }) })
    ] }) }),
    /* @__PURE__ */ jsx(Modal.Root, { open: showTestSendModal, onOpenChange: setShowTestSendModal, children: /* @__PURE__ */ jsxs(StyledModalContent, { children: [
      /* @__PURE__ */ jsx(StyledModalHeader, { children: /* @__PURE__ */ jsx(Modal.Title, { children: "Send Test Email" }) }),
      /* @__PURE__ */ jsxs(StyledModalBody, { children: [
        /* @__PURE__ */ jsxs(ModalField, { children: [
          /* @__PURE__ */ jsx(ModalLabel, { children: "Template" }),
          /* @__PURE__ */ jsx(ModalTemplateInfo, { children: /* @__PURE__ */ jsx(Typography, { variant: "omega", children: selectedTemplate?.name }) })
        ] }),
        /* @__PURE__ */ jsxs(ModalField, { children: [
          /* @__PURE__ */ jsx(ModalLabel, { children: "Recipient Email *" }),
          /* @__PURE__ */ jsx(
            TextInput,
            {
              placeholder: "test@example.com",
              value: testEmail,
              onChange: (e) => setTestEmail(e.target.value),
              type: "email"
            }
          )
        ] }),
        /* @__PURE__ */ jsxs(ModalField, { children: [
          /* @__PURE__ */ jsx(ModalLabel, { children: "Send from Account (optional)" }),
          /* @__PURE__ */ jsxs(
            StyledSelect,
            {
              value: testAccount,
              onChange: (e) => setTestAccount(e.target.value),
              children: [
                /* @__PURE__ */ jsx("option", { value: "", children: "Auto-select best account" }),
                accounts.filter((acc) => acc.isActive).map((account) => /* @__PURE__ */ jsxs("option", { value: account.name, children: [
                  account.name,
                  " (",
                  account.provider,
                  ")"
                ] }, account.name))
              ]
            }
          ),
          /* @__PURE__ */ jsx(ModalHint, { children: "Leave empty to use smart routing" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs(StyledModalFooter, { children: [
        /* @__PURE__ */ jsx(TertiaryButton, { onClick: () => setShowTestSendModal(false), children: "Cancel" }),
        /* @__PURE__ */ jsx(
          GradientButton$1,
          {
            onClick: sendTestEmail,
            startIcon: /* @__PURE__ */ jsx(PaperAirplaneIcon, { style: { width: 16, height: 16 } }),
            children: "Send Test Email"
          }
        )
      ] })
    ] }) }),
    /* @__PURE__ */ jsx(
      HiddenFileInput,
      {
        ref: fileInputRef,
        type: "file",
        accept: ".json",
        onChange: handleImport
      }
    )
  ] });
};
const EmailEditorComponent = ReactEmailEditor.EmailEditor || ReactEmailEditor.default || ReactEmailEditor;
if (!EmailEditorComponent) {
  console.error("[MagicMail] Failed to resolve EmailEditor component export", ReactEmailEditor);
}
const STANDARD_EMAIL_TEMPLATE = {
  counters: { u_row: 2, u_content_text: 1, u_content_image: 1, u_column: 2 },
  body: {
    values: {
      backgroundColor: "#ffffff",
      linkStyle: {
        body: true,
        linkHoverColor: "#0000ee",
        linkHoverUnderline: true,
        linkColor: "#0000ee",
        linkUnderline: true
      },
      contentWidth: "500px",
      backgroundImage: { repeat: false, center: true, fullWidth: true, url: "", cover: false },
      contentAlign: "center",
      textColor: "#000000",
      _meta: { htmlID: "u_body", htmlClassNames: "u_body" },
      fontFamily: { label: "Arial", value: "arial,helvetica,sans-serif" },
      preheaderText: ""
    },
    rows: [
      {
        cells: [1],
        values: {
          backgroundImage: { cover: false, url: "", repeat: false, fullWidth: true, center: true },
          hideDesktop: false,
          selectable: true,
          columnsBackgroundColor: "",
          hideable: true,
          backgroundColor: "",
          padding: "0px",
          columns: false,
          _meta: { htmlID: "u_row_2", htmlClassNames: "u_row" },
          deletable: true,
          displayCondition: null,
          duplicatable: true,
          draggable: true
        },
        columns: [
          {
            contents: [
              {
                values: {
                  hideDesktop: false,
                  duplicatable: true,
                  deletable: true,
                  linkStyle: {
                    linkHoverUnderline: true,
                    linkColor: "#0000ee",
                    inherit: true,
                    linkUnderline: true,
                    linkHoverColor: "#0000ee"
                  },
                  hideable: true,
                  lineHeight: "140%",
                  draggable: true,
                  containerPadding: "10px",
                  text: '<p style="font-size: 14px; line-height: 140%; text-align: center;"><span style="font-size: 14px; line-height: 19.6px;">__PLACEHOLDER__</span></p>',
                  _meta: { htmlID: "u_content_text_1", htmlClassNames: "u_content_text" },
                  textAlign: "left",
                  selectable: true
                },
                type: "text"
              }
            ],
            values: {
              border: {},
              _meta: { htmlClassNames: "u_column", htmlID: "u_column_2" },
              backgroundColor: "",
              padding: "0px"
            }
          }
        ]
      }
    ]
  },
  schemaVersion: 6
};
const Container$1 = styled.div`
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--colors-neutral100);
`;
const Header$1 = styled.div`
  padding: 24px;
  background: ${(p) => p.theme.colors.neutral0};
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
`;
const HeaderRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
`;
const HeaderLeft = styled.div`
  display: flex;
  gap: 12px;
  align-items: flex-start;
`;
const TitleContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;
const HeaderRight = styled.div`
  display: flex;
  gap: 8px;
`;
const SettingsRow = styled.div`
  display: flex;
  gap: 16px;
  align-items: flex-end;
`;
const FieldWrapper = styled.div`
  flex: ${(props) => props.flex || "initial"};
  width: ${(props) => props.width || "auto"};
`;
const ToggleWrapper = styled.div`
  padding-top: 28px;
  display: flex;
  gap: 12px;
  align-items: center;
  
  /* Custom green styling for active toggle */
  button[aria-checked="true"] {
    background-color: var(--colors-success600, #22C55E) !important;
    border-color: var(--colors-success600, #22C55E) !important;
    
    span {
      background-color: white !important;
    }
  }
  
  button[aria-checked="false"] {
    background-color: var(--colors-neutral200, rgba(128, 128, 128, 0.2)) !important;
    border-color: rgba(128, 128, 128, 0.2) !important;
    
    span {
      background-color: white !important;
    }
  }
  
  /* Label styling based on state */
  p {
    color: ${(props) => props.$isActive ? "var(--colors-success600, #22C55E)" : "var(--colors-neutral600, #6B7280)"};
    font-weight: 600;
    transition: color 0.2s;
  }
`;
const TabsWrapper = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
`;
const TabListWrapper = styled.div`
  padding: 0 24px;
  background: ${(p) => p.theme.colors.neutral0};
  border-bottom: 1px solid rgba(128, 128, 128, 0.2);
`;
const StyledTabsRoot = styled(Tabs.Root)`
  display: flex;
  flex-direction: column;
  height: 100%;
`;
const StyledTabsContent = styled(Tabs.Content)`
  flex: 1;
  display: flex;
  flex-direction: column;
`;
const TabContentWrapper = styled.div`
  height: calc(100vh - 240px);
  background: ${(p) => p.theme.colors.neutral0};
  position: relative;
`;
const TextTabContent = styled.div`
  padding: 20px;
  height: calc(100vh - 240px);
  
  textarea {
    width: 100%;
    height: 100%;
    min-height: 500px;
    font-family: monospace;
  }
`;
const LoadingContainer = styled.div`
  padding: 80px 20px;
  display: flex;
  justify-content: center;
  align-items: center;
`;
const EditorCanvas = styled.div`
  min-height: calc(100vh - 240px);
`;
const DesignerLoadingContainer = styled(LoadingContainer)`
  width: 100%;
  min-height: calc(100vh - 240px);
  padding: 40px 20px;
`;
const HiddenInput = styled.input`
  display: none;
`;
const SaveButton = styled(Button)`
  background: linear-gradient(135deg, var(--colors-success600, #22C55E) 0%, var(--colors-success700, #16A34A) 100%);
  border: none;
  color: white;
  font-weight: 600;
  font-size: 13px;
  padding: 8px 16px;
  height: 36px;
  box-shadow: 0 2px 8px rgba(34, 197, 94, 0.3);
  transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(34, 197, 94, 0.4);
    background: linear-gradient(135deg, var(--colors-success700, #16A34A) 0%, var(--colors-success800, #15803D) 100%);
  }

  &:active {
    transform: translateY(0);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    &:hover {
      transform: none;
    }
  }

  svg {
    width: 14px;
    height: 14px;
  }
`;
const ImportExportButton = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 16px;
  height: 36px;
  background: ${(p) => p.theme.colors.neutral0};
  border: 1px solid rgba(128, 128, 128, 0.2);
  border-radius: 4px;
  color: var(--colors-neutral800);
  font-weight: 500;
  font-size: 13px;
  cursor: pointer;
  transition: all 200ms;
  white-space: nowrap;

  &:hover {
    background: var(--colors-neutral100);
    border-color: var(--colors-primary600, #0284C7);
    color: var(--colors-primary600, #0284C7);
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(14, 165, 233, 0.15);
  }

  &:active {
    transform: translateY(0);
  }

  svg {
    width: 14px;
    height: 14px;
  }
`;
const ImportLabel = styled.label`
  cursor: pointer;
  display: inline-block;
`;
const BackButton = styled.button`
  background: ${(p) => p.theme.colors.neutral0};
  border: 1px solid rgba(128, 128, 128, 0.2);
  border-radius: 4px;
  padding: 8px 10px;
  height: 36px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 200ms;

  &:hover {
    background: var(--colors-neutral100);
    border-color: rgba(128, 128, 128, 0.3);
    transform: translateY(-1px);
  }

  &:active {
    transform: translateY(0);
  }

  svg {
    width: 16px;
    height: 16px;
  }
`;
const VersionButton = styled.button`
  background: ${(p) => p.theme.colors.neutral0};
  border: 1px solid rgba(128, 128, 128, 0.2);
  border-radius: 4px;
  padding: 8px 16px;
  height: 36px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 200ms;
  font-size: 13px;
  font-weight: 500;
  color: var(--colors-neutral800);
  white-space: nowrap;

  &:hover {
    background: var(--colors-neutral100);
    border-color: var(--colors-primary600, #0284C7);
    color: var(--colors-primary600, #0284C7);
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(14, 165, 233, 0.15);
  }

  &:active {
    transform: translateY(0);
  }

  svg {
    width: 14px;
    height: 14px;
  }
`;
const VersionModal = styled.div`
  position: fixed;
  top: 0;
  right: ${(props) => props.$isOpen ? "0" : "-450px"};
  width: 450px;
  height: 100vh;
  background: ${(p) => p.theme.colors.neutral0};
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.15);
  z-index: 9999;
  transition: right 300ms cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  flex-direction: column;
`;
const VersionModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 9998;
  opacity: ${(props) => props.$isOpen ? "1" : "0"};
  pointer-events: ${(props) => props.$isOpen ? "auto" : "none"};
  transition: opacity 300ms cubic-bezier(0.4, 0, 0.2, 1);
`;
const VersionModalHeader = styled.div`
  padding: 24px;
  border-bottom: 1px solid rgba(128, 128, 128, 0.2);
  display: flex;
  justify-content: space-between;
  align-items: center;
`;
const VersionModalContent = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 16px;
`;
const VersionItem = styled.div`
  padding: 16px;
  border: 1px solid rgba(128, 128, 128, 0.2);
  border-radius: 8px;
  margin-bottom: 12px;
  transition: all 150ms;
  
  &:hover {
    border-color: var(--colors-primary600, #0284C7);
    box-shadow: 0 2px 8px rgba(14, 165, 233, 0.15);
  }
`;
const VersionItemHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
`;
const VersionNumber = styled.div`
  font-weight: 600;
  color: var(--colors-neutral800);
  display: flex;
  align-items: center;
  gap: 8px;
`;
const VersionBadge = styled.span`
  background: linear-gradient(135deg, var(--colors-primary600, #0EA5E9) 0%, var(--colors-primary700, #0284C7) 100%);
  color: white;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
`;
const VersionDate = styled.div`
  font-size: 13px;
  color: var(--colors-neutral600);
`;
const VersionMeta = styled.div`
  font-size: 13px;
  color: var(--colors-neutral600);
  margin-bottom: 12px;
`;
const VersionActions = styled.div`
  display: flex;
  gap: 8px;
`;
const RestoreButton = styled(Button)`
  background: linear-gradient(135deg, var(--colors-success600, #22C55E) 0%, var(--colors-success700, #16A34A) 100%);
  border: none;
  color: white;
  font-size: 13px;
  padding: 8px 16px;
  
  &:hover {
    background: linear-gradient(135deg, var(--colors-success400, #4ADE80) 0%, var(--colors-success600, #22C55E) 100%);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(34, 197, 94, 0.3);
    border-color: transparent;
  }
  
  svg {
    width: 14px;
    height: 14px;
  }
`;
const DeleteButton = styled(Button)`
  background: linear-gradient(135deg, var(--colors-danger500, #EF4444) 0%, var(--colors-danger600, #DC2626) 100%);
  border: none;
  color: white;
  font-size: 13px;
  padding: 8px 16px;
  
  &:hover {
    background: linear-gradient(135deg, var(--colors-danger400, #F87171) 0%, var(--colors-danger500, #EF4444) 100%);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
    border-color: transparent;
  }
  
  svg {
    width: 14px;
    height: 14px;
  }
`;
const CloseButton$1 = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--colors-neutral600);
  transition: all 150ms;
  
  &:hover {
    color: var(--colors-neutral800);
    background: var(--colors-neutral100);
    border-radius: 4px;
  }
  
  svg {
    width: 20px;
    height: 20px;
  }
`;
const EmptyVersions = styled.div`
  text-align: center;
  padding: 60px 20px;
  color: var(--colors-neutral600);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  
  svg {
    width: 64px;
    height: 64px;
    margin-bottom: 16px;
    color: rgba(128, 128, 128, 0.3);
  }
`;
const EditorPage = () => {
  useAuthRefresh();
  const location = useLocation();
  const { get, post, put } = useFetchClient();
  const { toggleNotification } = useNotification();
  const navigate = useNavigate();
  const { hasFeature } = useLicense();
  const emailEditorRef = useRef(null);
  const pathname = location.pathname;
  const coreMatch = pathname.match(/\/designer\/core\/(.+)$/);
  const templateMatch = pathname.match(/\/designer\/(.+)$/);
  const isCoreEmail = !!coreMatch;
  const coreEmailType = coreMatch ? coreMatch[1] : null;
  const id = !isCoreEmail && templateMatch ? templateMatch[1] : null;
  const isNewTemplate = id === "new";
  const [loading, setLoading] = useState(!isNewTemplate && !isCoreEmail);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("html");
  const [editorLoaded, setEditorLoaded] = useState(false);
  const [templateData, setTemplateData] = useState({
    templateReferenceId: "",
    name: "",
    subject: "",
    category: "custom",
    isActive: true,
    design: null,
    bodyHtml: "",
    bodyText: "",
    tags: []
  });
  const canVersion = hasFeature("email-designer-versioning");
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [versions, setVersions] = useState([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  useEffect(() => {
    if (isCoreEmail) {
      fetchCoreTemplate();
    } else if (!isNewTemplate && id) {
      fetchTemplate();
    }
  }, [id, isCoreEmail, coreEmailType]);
  const fetchCoreTemplate = async () => {
    setLoading(true);
    try {
      const response = await get(`/magic-mail/designer/core/${coreEmailType}`);
      const coreTemplate = response.data?.data;
      let design = coreTemplate?.design;
      if (!design && coreTemplate?.message) {
        let message = coreTemplate.message;
        if (message.match(/<body/)) {
          const parser = new DOMParser();
          const parsedDocument = parser.parseFromString(message, "text/html");
          message = parsedDocument.body.innerText;
        }
        message = message.replace(/<(?!\/?(?:a|img|strong|b|i|%|%=)\b)[^>]+>/gi, "").replace(/"/g, "'").replace(/\n/g, "<br />");
        const templateStr = JSON.stringify(STANDARD_EMAIL_TEMPLATE);
        design = JSON.parse(templateStr.replace("__PLACEHOLDER__", message));
      }
      setTemplateData({
        templateReferenceId: "",
        name: coreEmailType === "reset-password" ? "Reset Password" : "Email Confirmation",
        subject: coreTemplate?.subject || "",
        category: "transactional",
        isActive: true,
        design,
        bodyHtml: coreTemplate?.bodyHtml || coreTemplate?.message || "",
        bodyText: coreTemplate?.bodyText || "",
        tags: []
      });
      setTimeout(() => {
        if (design && emailEditorRef.current?.editor) {
          emailEditorRef.current.editor.loadDesign(design);
        }
      }, 600);
    } catch (error) {
      console.error("[MagicMail] Error loading core template:", error);
      toggleNotification({
        type: "danger",
        message: "Failed to load core template"
      });
    } finally {
      setLoading(false);
    }
  };
  const fetchTemplate = async () => {
    setLoading(true);
    try {
      const response = await get(`/magic-mail/designer/templates/${id}`);
      const template = response.data?.data;
      setTemplateData(template);
      setTimeout(() => {
        if (template.design && emailEditorRef.current?.editor) {
          emailEditorRef.current.editor.loadDesign(template.design);
        }
      }, 500);
    } catch (error) {
      toggleNotification({ type: "danger", message: "Failed to load template" });
      navigate("/plugins/magic-mail/designer");
    } finally {
      setLoading(false);
    }
  };
  const fetchVersions = async () => {
    if (!id || isNewTemplate || isCoreEmail) return;
    setLoadingVersions(true);
    try {
      const response = await get(`/magic-mail/designer/templates/${id}/versions`);
      if (response.data?.success) {
        setVersions(response.data.data || []);
      }
    } catch (error) {
      console.error("[Version History] Error loading versions:", error);
      toggleNotification({
        type: "danger",
        message: "Failed to load version history"
      });
    } finally {
      setLoadingVersions(false);
    }
  };
  const handleRestoreVersion = async (versionId, versionNumber) => {
    if (!window.confirm(`Restore template to Version #${versionNumber}? Current content will be saved as a new version.`)) {
      return;
    }
    try {
      const response = await post(`/magic-mail/designer/templates/${id}/versions/${versionId}/restore`);
      if (response.data?.success) {
        toggleNotification({
          type: "success",
          message: `Restored to Version #${versionNumber}`
        });
        await fetchTemplate();
        await fetchVersions();
        setShowVersionHistory(false);
      }
    } catch (error) {
      console.error("[Version History] Error restoring version:", error);
      toggleNotification({
        type: "danger",
        message: "Failed to restore version"
      });
    }
  };
  const handleDeleteVersion = async (versionId, versionNumber) => {
    if (!window.confirm(`Delete Version #${versionNumber}? This action cannot be undone.`)) {
      return;
    }
    try {
      const response = await post(`/magic-mail/designer/templates/${id}/versions/${versionId}/delete`);
      if (response.data?.success) {
        toggleNotification({
          type: "success",
          message: `Version #${versionNumber} deleted`
        });
        await fetchVersions();
      }
    } catch (error) {
      console.error("[Version History] Error deleting version:", error);
      toggleNotification({
        type: "danger",
        message: "Failed to delete version"
      });
    }
  };
  const handleDeleteAllVersions = async () => {
    if (versions.length === 0) {
      toggleNotification({
        type: "info",
        message: "No versions to delete"
      });
      return;
    }
    if (!window.confirm(`Delete ALL ${versions.length} versions? This action cannot be undone.`)) {
      return;
    }
    try {
      const response = await post(`/magic-mail/designer/templates/${id}/versions/delete-all`);
      if (response.data?.success) {
        toggleNotification({
          type: "success",
          message: `Deleted ${versions.length} versions`
        });
        await fetchVersions();
      }
    } catch (error) {
      console.error("[Version History] Error deleting all versions:", error);
      toggleNotification({
        type: "danger",
        message: "Failed to delete all versions"
      });
    }
  };
  const handleOpenVersionHistory = () => {
    setShowVersionHistory(true);
    fetchVersions();
  };
  const handleSave = async () => {
    if (!isCoreEmail) {
      if (!templateData.templateReferenceId) {
        toggleNotification({ type: "warning", message: "Reference ID is required" });
        return;
      }
      if (!templateData.name) {
        toggleNotification({ type: "warning", message: "Name is required" });
        return;
      }
    }
    if (!templateData.subject) {
      toggleNotification({ type: "warning", message: "Subject is required" });
      return;
    }
    setSaving(true);
    try {
      let design = templateData.design;
      let bodyHtml = templateData.bodyHtml;
      if (activeTab === "html" && emailEditorRef.current?.editor) {
        await new Promise((resolve) => {
          emailEditorRef.current.editor.exportHtml((data) => {
            design = data.design;
            bodyHtml = data.html;
            resolve();
          });
        });
      }
      if (isCoreEmail) {
        const corePayload = {
          subject: templateData.subject,
          design,
          message: bodyHtml,
          // Send as 'message' not 'bodyHtml'
          bodyText: activeTab === "text" ? templateData.bodyText : ""
          // Include text version
        };
        await put(`/magic-mail/designer/core/${coreEmailType}`, corePayload);
        toggleNotification({
          type: "success",
          message: "Core email template saved!"
        });
        setSaving(false);
        return;
      }
      const payload = {
        ...templateData,
        design,
        bodyHtml,
        templateReferenceId: parseInt(templateData.templateReferenceId)
      };
      let response;
      if (isNewTemplate) {
        response = await post("/magic-mail/designer/templates", payload);
      } else {
        response = await put(`/magic-mail/designer/templates/${id}`, payload);
      }
      toggleNotification({
        type: "success",
        message: isNewTemplate ? "Template created!" : "Template saved!"
      });
      if (isNewTemplate && response.data?.data?.id) {
        navigate(`/plugins/magic-mail/designer/${response.data.data.id}`);
      }
    } catch (error) {
      toggleNotification({
        type: "danger",
        message: error.response?.data?.message || "Failed to save"
      });
    } finally {
      setSaving(false);
    }
  };
  const handleExportDesign = async () => {
    if (!emailEditorRef.current?.editor) return;
    emailEditorRef.current.editor.exportHtml((data) => {
      const dataStr = JSON.stringify(data.design, null, 2);
      const dataBlob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${templateData.name || "template"}-design.json`;
      link.click();
      URL.revokeObjectURL(url);
      toggleNotification({ type: "success", message: "Design exported!" });
    });
  };
  const handleImportDesign = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const design = JSON.parse(e.target.result);
        if (emailEditorRef.current?.editor) {
          emailEditorRef.current.editor.loadDesign(design);
          toggleNotification({ type: "success", message: "Design imported!" });
        }
      } catch (error) {
        toggleNotification({ type: "danger", message: "Invalid design file" });
      }
    };
    reader.readAsText(file);
  };
  const onEditorReady = () => {
    setEditorLoaded(true);
    if (templateData.design && emailEditorRef.current?.editor) {
      setTimeout(() => {
        emailEditorRef.current.editor.loadDesign(templateData.design);
      }, 100);
    }
  };
  if (loading) {
    return /* @__PURE__ */ jsx(Container$1, { children: /* @__PURE__ */ jsx(LoadingContainer, { children: /* @__PURE__ */ jsx(Loader, { children: "Loading template..." }) }) });
  }
  return /* @__PURE__ */ jsxs(Container$1, { children: [
    /* @__PURE__ */ jsxs(Header$1, { children: [
      /* @__PURE__ */ jsxs(HeaderRow, { children: [
        /* @__PURE__ */ jsxs(HeaderLeft, { children: [
          /* @__PURE__ */ jsx(BackButton, { onClick: () => navigate("/plugins/magic-mail/designer"), children: /* @__PURE__ */ jsx(ArrowLeftIcon, {}) }),
          /* @__PURE__ */ jsxs(TitleContainer, { children: [
            /* @__PURE__ */ jsx(Typography, { variant: "alpha", children: isCoreEmail ? `${coreEmailType === "reset-password" ? "Reset Password" : "Email Confirmation"}` : isNewTemplate ? "New Template" : `${templateData.name}` }),
            canVersion && !isNewTemplate && !isCoreEmail && /* @__PURE__ */ jsx(Typography, { variant: "pi", textColor: "neutral600", children: "Versioning enabled" }),
            isCoreEmail && /* @__PURE__ */ jsx(Typography, { variant: "pi", textColor: "neutral600", children: "Core Strapi Email Template" })
          ] })
        ] }),
        /* @__PURE__ */ jsxs(HeaderRight, { children: [
          /* @__PURE__ */ jsxs(ImportLabel, { children: [
            /* @__PURE__ */ jsxs(ImportExportButton, { children: [
              /* @__PURE__ */ jsx(ArrowUpTrayIcon, {}),
              "Import Design"
            ] }),
            /* @__PURE__ */ jsx(HiddenInput, { type: "file", accept: ".json", onChange: handleImportDesign })
          ] }),
          /* @__PURE__ */ jsxs(ImportExportButton, { onClick: handleExportDesign, as: "button", children: [
            /* @__PURE__ */ jsx(ArrowDownTrayIcon, {}),
            "Export Design"
          ] }),
          !isCoreEmail && !isNewTemplate && canVersion && /* @__PURE__ */ jsxs(VersionButton, { onClick: handleOpenVersionHistory, children: [
            /* @__PURE__ */ jsx(ClockIcon, {}),
            "Version History"
          ] }),
          /* @__PURE__ */ jsx(
            SaveButton,
            {
              startIcon: /* @__PURE__ */ jsx(CheckIcon, {}),
              onClick: handleSave,
              loading: saving,
              disabled: saving,
              children: saving ? "Saving..." : "Save Template"
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxs(SettingsRow, { children: [
        !isCoreEmail && /* @__PURE__ */ jsx(FieldWrapper, { width: "150px", children: /* @__PURE__ */ jsxs(Field.Root, { required: true, children: [
          /* @__PURE__ */ jsx(Field.Label, { children: "Reference ID" }),
          /* @__PURE__ */ jsx(
            Field.Input,
            {
              type: "number",
              value: templateData.templateReferenceId,
              onChange: (e) => setTemplateData({ ...templateData, templateReferenceId: e.target.value }),
              placeholder: "100"
            }
          )
        ] }) }),
        !isCoreEmail && /* @__PURE__ */ jsx(FieldWrapper, { flex: "1", children: /* @__PURE__ */ jsxs(Field.Root, { required: true, children: [
          /* @__PURE__ */ jsx(Field.Label, { children: "Name" }),
          /* @__PURE__ */ jsx(
            Field.Input,
            {
              value: templateData.name,
              onChange: (e) => setTemplateData({ ...templateData, name: e.target.value }),
              placeholder: "Welcome Email"
            }
          )
        ] }) }),
        /* @__PURE__ */ jsx(FieldWrapper, { flex: "1", children: /* @__PURE__ */ jsxs(Field.Root, { required: true, children: [
          /* @__PURE__ */ jsx(Field.Label, { children: "Subject" }),
          /* @__PURE__ */ jsx(
            Field.Input,
            {
              value: templateData.subject,
              onChange: (e) => setTemplateData({ ...templateData, subject: e.target.value }),
              placeholder: "Welcome {{user.firstName}}!"
            }
          )
        ] }) }),
        !isCoreEmail && /* @__PURE__ */ jsx(FieldWrapper, { width: "180px", children: /* @__PURE__ */ jsxs(Field.Root, { children: [
          /* @__PURE__ */ jsx(Field.Label, { children: "Category" }),
          /* @__PURE__ */ jsxs(
            SingleSelect,
            {
              value: templateData.category,
              onChange: (value) => setTemplateData({ ...templateData, category: value }),
              children: [
                /* @__PURE__ */ jsx(SingleSelectOption, { value: "transactional", children: "Transactional" }),
                /* @__PURE__ */ jsx(SingleSelectOption, { value: "marketing", children: "Marketing" }),
                /* @__PURE__ */ jsx(SingleSelectOption, { value: "notification", children: "Notification" }),
                /* @__PURE__ */ jsx(SingleSelectOption, { value: "custom", children: "Custom" })
              ]
            }
          )
        ] }) }),
        !isCoreEmail && /* @__PURE__ */ jsxs(ToggleWrapper, { $isActive: templateData.isActive, children: [
          /* @__PURE__ */ jsx(
            Toggle,
            {
              checked: templateData.isActive,
              onChange: () => setTemplateData({ ...templateData, isActive: !templateData.isActive })
            }
          ),
          /* @__PURE__ */ jsx(Typography, { variant: "omega", children: templateData.isActive ? "Active" : "Inactive" })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx(TabsWrapper, { children: /* @__PURE__ */ jsxs(StyledTabsRoot, { value: activeTab, onValueChange: setActiveTab, children: [
      /* @__PURE__ */ jsx(TabListWrapper, { children: /* @__PURE__ */ jsxs(Tabs.List, { children: [
        /* @__PURE__ */ jsx(Tabs.Trigger, { value: "html", children: "✨ Visual Designer" }),
        /* @__PURE__ */ jsx(Tabs.Trigger, { value: "text", children: "📝 Plain Text" })
      ] }) }),
      /* @__PURE__ */ jsx(StyledTabsContent, { value: "html", children: /* @__PURE__ */ jsxs(TabContentWrapper, { children: [
        !editorLoaded && /* @__PURE__ */ jsx(DesignerLoadingContainer, { children: /* @__PURE__ */ jsx(Loader, { children: "Loading Email Designer..." }) }),
        /* @__PURE__ */ jsx(
          EditorCanvas,
          {
            style: {
              visibility: editorLoaded ? "visible" : "hidden",
              pointerEvents: editorLoaded ? "auto" : "none"
            },
            children: /* @__PURE__ */ jsx(
              EmailEditorComponent,
              {
                ref: emailEditorRef,
                onReady: onEditorReady,
                minHeight: "calc(100vh - 240px)",
                options: {
                  // Display mode
                  displayMode: "email",
                  locale: "en",
                  projectId: 1,
                  // Required for some features
                  // Merge Tags Config
                  mergeTagsConfig: {
                    autocompleteTriggerChar: "@",
                    sort: false,
                    delimiter: ["{{", "}}"]
                  },
                  // Appearance
                  appearance: {
                    theme: "modern_light",
                    panels: {
                      tools: { dock: "left" }
                    }
                  },
                  // Features - Enable responsive preview
                  features: {
                    preview: true,
                    previewInBrowser: true,
                    textEditor: {
                      enabled: true,
                      spellChecker: true,
                      tables: true,
                      cleanPaste: true
                    }
                  },
                  // Fonts
                  fonts: {
                    showDefaultFonts: true,
                    customFonts: [
                      {
                        label: "Inter",
                        value: "'Inter', sans-serif",
                        url: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
                      }
                    ]
                  },
                  // Tools configuration - minimal, let Unlayer show all
                  tools: {
                    image: {
                      properties: {
                        src: {
                          value: {
                            url: "https://picsum.photos/600/350"
                          }
                        }
                      }
                    }
                  },
                  // Merge Tags with extended support
                  mergeTags: {
                    user: {
                      name: "User",
                      mergeTags: {
                        firstName: {
                          name: "First Name",
                          value: "{{user.firstName}}",
                          sample: "John"
                        },
                        lastName: {
                          name: "Last Name",
                          value: "{{user.lastName}}",
                          sample: "Doe"
                        },
                        email: {
                          name: "Email",
                          value: "{{user.email}}",
                          sample: "john@example.com"
                        },
                        username: {
                          name: "Username",
                          value: "{{user.username}}",
                          sample: "johndoe"
                        }
                      }
                    },
                    company: {
                      name: "Company",
                      mergeTags: {
                        name: {
                          name: "Name",
                          value: "{{company.name}}",
                          sample: "ACME Corp"
                        },
                        url: {
                          name: "Website",
                          value: "{{company.url}}",
                          sample: "https://acme.com"
                        },
                        address: {
                          name: "Address",
                          value: "{{company.address}}",
                          sample: "123 Main St, City"
                        }
                      }
                    },
                    order: {
                      name: "Order",
                      mergeTags: {
                        number: {
                          name: "Number",
                          value: "{{order.number}}",
                          sample: "#12345"
                        },
                        total: {
                          name: "Total",
                          value: "{{order.total}}",
                          sample: "$199.99"
                        },
                        date: {
                          name: "Date",
                          value: "{{order.date}}",
                          sample: "2024-01-15"
                        },
                        status: {
                          name: "Status",
                          value: "{{order.status}}",
                          sample: "Shipped"
                        }
                      }
                    },
                    system: {
                      name: "System",
                      mergeTags: {
                        date: {
                          name: "Current Date",
                          value: "{{system.date}}",
                          sample: (/* @__PURE__ */ new Date()).toLocaleDateString()
                        },
                        year: {
                          name: "Current Year",
                          value: "{{system.year}}",
                          sample: (/* @__PURE__ */ new Date()).getFullYear().toString()
                        },
                        unsubscribe: {
                          name: "Unsubscribe Link",
                          value: "{{system.unsubscribe}}",
                          sample: "https://example.com/unsubscribe"
                        }
                      }
                    }
                  },
                  // Special links
                  specialLinks: {
                    unsubscribe: {
                      enabled: true,
                      text: "Unsubscribe",
                      href: "{{system.unsubscribe}}"
                    },
                    webview: {
                      enabled: true,
                      text: "View in browser",
                      href: "{{system.webview}}"
                    }
                  },
                  // Custom CSS
                  customCSS: [
                    ".blockbuilder-content-email { font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif; }"
                  ],
                  // Validation
                  validator: {
                    enabled: true,
                    rules: {
                      maxImageSize: 1024 * 1024
                      // 1MB
                    }
                  }
                }
              }
            )
          }
        )
      ] }) }),
      /* @__PURE__ */ jsx(StyledTabsContent, { value: "text", children: /* @__PURE__ */ jsx(TextTabContent, { children: /* @__PURE__ */ jsx(
        Textarea,
        {
          value: templateData.bodyText,
          onChange: (e) => setTemplateData({ ...templateData, bodyText: e.target.value }),
          placeholder: "Plain text version of your email...\n\nUse Mustache variables:\n{{user.firstName}}\n{{company.name}}\n{{order.total}}"
        }
      ) }) })
    ] }) }),
    /* @__PURE__ */ jsx(VersionModalOverlay, { $isOpen: showVersionHistory, onClick: () => setShowVersionHistory(false) }),
    /* @__PURE__ */ jsxs(VersionModal, { $isOpen: showVersionHistory, children: [
      /* @__PURE__ */ jsxs(VersionModalHeader, { children: [
        /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: "8px" }, children: [
          /* @__PURE__ */ jsx(ClockIcon, { style: { width: 20, height: 20, color: "var(--colors-neutral800, #32324d)" } }),
          /* @__PURE__ */ jsx(Typography, { variant: "beta", fontWeight: "bold", children: "Version History" }),
          versions.length > 0 && /* @__PURE__ */ jsxs("span", { style: { fontSize: "12px", color: "var(--colors-neutral600, #666687)", marginLeft: "8px" }, children: [
            "(",
            versions.length,
            ")"
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: "8px", alignItems: "center" }, children: [
          versions.length > 0 && /* @__PURE__ */ jsx(
            DeleteButton,
            {
              size: "S",
              startIcon: /* @__PURE__ */ jsx(TrashIcon, {}),
              onClick: handleDeleteAllVersions,
              children: "Delete All"
            }
          ),
          /* @__PURE__ */ jsx(CloseButton$1, { onClick: () => setShowVersionHistory(false), children: /* @__PURE__ */ jsx(XMarkIcon, {}) })
        ] })
      ] }),
      /* @__PURE__ */ jsx(VersionModalContent, { children: loadingVersions ? /* @__PURE__ */ jsx("div", { style: { textAlign: "center", padding: "40px" }, children: /* @__PURE__ */ jsx(Loader, {}) }) : versions.length === 0 ? /* @__PURE__ */ jsxs(EmptyVersions, { children: [
        /* @__PURE__ */ jsx(ClockIcon, {}),
        /* @__PURE__ */ jsx(Typography, { variant: "beta", children: "No Versions Yet" }),
        /* @__PURE__ */ jsx(Typography, { variant: "omega", textColor: "neutral600", style: { maxWidth: "300px" }, children: "Versions are created automatically when you save changes" })
      ] }) : versions.map((version, index) => /* @__PURE__ */ jsxs(VersionItem, { children: [
        /* @__PURE__ */ jsxs(VersionItemHeader, { children: [
          /* @__PURE__ */ jsxs(VersionNumber, { children: [
            /* @__PURE__ */ jsxs(VersionBadge, { children: [
              "#",
              version.versionNumber || versions.length - index
            ] }),
            version.name
          ] }),
          /* @__PURE__ */ jsx(VersionDate, { children: new Date(version.createdAt).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit"
          }) })
        ] }),
        /* @__PURE__ */ jsxs(VersionMeta, { children: [
          /* @__PURE__ */ jsx("strong", { children: "Subject:" }),
          " ",
          version.subject || "No subject"
        ] }),
        /* @__PURE__ */ jsxs(VersionActions, { children: [
          /* @__PURE__ */ jsx(
            RestoreButton,
            {
              size: "S",
              startIcon: /* @__PURE__ */ jsx(ArrowUturnLeftIcon, {}),
              onClick: () => handleRestoreVersion(version.id, version.versionNumber || versions.length - index),
              children: "Restore"
            }
          ),
          /* @__PURE__ */ jsx(
            DeleteButton,
            {
              size: "S",
              startIcon: /* @__PURE__ */ jsx(TrashIcon, {}),
              onClick: () => handleDeleteVersion(version.id, version.versionNumber || versions.length - index),
              children: "Delete"
            }
          )
        ] })
      ] }, version.id)) })
    ] })
  ] });
};
const theme = {
  shadows: {
    sm: "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)",
    md: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)",
    xl: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)"
  },
  transitions: { fast: "150ms cubic-bezier(0.4, 0, 0.2, 1)", normal: "300ms cubic-bezier(0.4, 0, 0.2, 1)", slow: "500ms cubic-bezier(0.4, 0, 0.2, 1)" },
  spacing: { xs: "4px", sm: "8px", md: "16px", lg: "24px", xl: "32px", "2xl": "48px" },
  borderRadius: { lg: "12px", xl: "16px" }
};
const fadeIn$2 = keyframes`
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
`;
const shimmer = keyframes`
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
`;
const float = keyframes`
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-5px); }
`;
const breakpoints = {
  mobile: "768px"
};
const Container = styled(Box)`
  ${css`animation: ${fadeIn$2} ${theme.transitions.slow};`}
  min-height: 100vh;
  max-width: 1440px;
  margin: 0 auto;
  padding: ${theme.spacing.xl} ${theme.spacing.lg} 0;
  
  @media screen and (max-width: ${breakpoints.mobile}) {
    padding: 16px 12px 0;
  }
`;
const Header = styled(Box)`
  background: linear-gradient(135deg, 
    var(--colors-secondary600, #7C3AED) 0%, 
    ${"var(--colors-primary600, #0284C7)"} 100%
  );
  border-radius: ${theme.borderRadius.xl};
  padding: ${theme.spacing.xl} ${theme.spacing["2xl"]};
  margin-bottom: ${theme.spacing.xl};
  position: relative;
  overflow: hidden;
  box-shadow: ${theme.shadows.xl};
  
  @media screen and (max-width: ${breakpoints.mobile}) {
    padding: 24px 20px;
    border-radius: 12px;
  }
  
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 200%;
    height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.15), transparent);
    ${css`animation: ${shimmer} 3s infinite;`}
  }
  
  &::after {
    content: '';
    position: absolute;
    top: 0;
    right: 0;
    width: 100%;
    height: 100%;
    background-image: radial-gradient(circle at 20% 80%, transparent 50%, rgba(255, 255, 255, 0.1) 50%);
    background-size: 15px 15px;
    opacity: 0.3;
  }
`;
const HeaderContent = styled(Flex)`
  position: relative;
  z-index: 1;
`;
const Title = styled(Typography)`
  color: white;
  font-size: 2rem;
  font-weight: 700;
  letter-spacing: -0.025em;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
  
  svg {
    width: 28px;
    height: 28px;
    ${css`animation: ${float} 3s ease-in-out infinite;`}
  }

  @media screen and (max-width: ${breakpoints.mobile}) {
    font-size: 1.5rem;
    
    svg {
      width: 22px;
      height: 22px;
    }
  }
`;
const Subtitle = styled(Typography)`
  color: rgba(255, 255, 255, 0.95);
  font-size: 0.95rem;
  font-weight: 400;
  margin-top: ${theme.spacing.xs};
  letter-spacing: 0.01em;
  
  @media screen and (max-width: ${breakpoints.mobile}) {
    font-size: 0.85rem;
  }
`;
const StatsGrid = styled.div`
  margin-bottom: ${theme.spacing.xl};
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: ${theme.spacing.lg};
  justify-content: center;
  max-width: 1200px;
  margin-left: auto;
  margin-right: auto;
  
  @media screen and (max-width: ${breakpoints.mobile}) {
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
    margin-bottom: 24px;
  }
`;
const StatCard = styled(Box)`
  background: ${(p) => p.theme.colors.neutral0};
  border-radius: ${theme.borderRadius.lg};
  padding: 28px ${theme.spacing.lg};
  position: relative;
  overflow: hidden;
  transition: all ${theme.transitions.normal};
  ${css`animation: ${fadeIn$2} ${theme.transitions.slow} backwards;`}
  animation-delay: ${(props) => props.$delay || "0s"};
  box-shadow: ${theme.shadows.sm};
  border: 1px solid rgba(128, 128, 128, 0.2);
  min-width: 200px;
  flex: 1;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  
  @media screen and (max-width: ${breakpoints.mobile}) {
    min-width: unset;
    padding: 20px 12px;
    
    &:hover {
      transform: none;
    }
  }
  
  &:hover {
    transform: translateY(-6px);
    box-shadow: ${theme.shadows.xl};
    border-color: ${(props) => props.$color || "var(--colors-primary600, #0EA5E9)"};
    
    .stat-icon {
      transform: scale(1.15) rotate(5deg);
    }
    
    .stat-value {
      transform: scale(1.08);
      color: ${(props) => props.$color || "var(--colors-primary600, #0284C7)"};
    }
  }
`;
const StatIcon = styled(Box)`
  width: 68px;
  height: 68px;
  border-radius: ${theme.borderRadius.lg};
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: ${theme.spacing.md};
  background: ${(props) => props.$bg || "rgba(2, 132, 199, 0.12)"};
  transition: all ${theme.transitions.normal};
  
  svg {
    width: 32px;
    height: 32px;
    color: ${(props) => props.$color || "var(--colors-primary600, #0284C7)"};
  }
  
  @media screen and (max-width: ${breakpoints.mobile}) {
    width: 56px;
    height: 56px;
    margin-bottom: 12px;
    
    svg {
      width: 26px;
      height: 26px;
    }
  }
`;
const StatValue = styled(Typography)`
  font-size: 2.25rem;
  font-weight: 700;
  color: var(--colors-neutral800);
  transition: all ${theme.transitions.normal};
  line-height: 1;
  margin-bottom: ${theme.spacing.xs};
  
  @media screen and (max-width: ${breakpoints.mobile}) {
    font-size: 1.75rem;
  }
`;
const StatLabel = styled(Typography)`
  font-size: 0.875rem;
  color: var(--colors-neutral600);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  
  @media screen and (max-width: ${breakpoints.mobile}) {
    font-size: 0.75rem;
  }
`;
const FilterBar = styled(Box)`
  background: ${(p) => p.theme.colors.neutral0};
  border-radius: ${theme.borderRadius.lg};
  padding: ${theme.spacing.lg} ${theme.spacing.xl};
  margin-bottom: ${theme.spacing.lg};
  box-shadow: ${theme.shadows.sm};
  border: 1px solid rgba(128, 128, 128, 0.2);
`;
const StyledTable = styled(Table)`
  thead {
    background: var(--colors-neutral100);
    border-bottom: 2px solid rgba(128, 128, 128, 0.2);
    
    th {
      font-weight: 600;
      color: var(--colors-neutral800);
      font-size: 0.875rem;
      text-transform: uppercase;
      letter-spacing: 0.025em;
      padding: ${theme.spacing.lg} ${theme.spacing.lg};
    }
  }
  
  tbody tr {
    transition: all ${theme.transitions.fast};
    border-bottom: 1px solid rgba(128, 128, 128, 0.15);
    
    &:last-child {
      border-bottom: none;
    }
    
    &:hover {
      background: rgba(2, 132, 199, 0.12);
    }
    
    td {
      padding: ${theme.spacing.lg} ${theme.spacing.lg};
      color: var(--colors-neutral800);
      vertical-align: middle;
    }
  }
`;
const TableContainer = styled(Box)`
  background: ${(p) => p.theme.colors.neutral0};
  border-radius: ${theme.borderRadius.lg};
  box-shadow: ${theme.shadows.md};
  border: 1px solid rgba(128, 128, 128, 0.2);
  overflow: hidden;
  margin-bottom: ${theme.spacing.xl};
`;
const EmptyState = styled(Box)`
  background: ${(p) => p.theme.colors.neutral0};
  border-radius: ${theme.borderRadius.xl};
  border: 2px dashed rgba(128, 128, 128, 0.3);
  padding: 80px 32px;
  text-align: center;
  position: relative;
  overflow: hidden;
  min-height: 400px;
  display: flex;
  align-items: center;
  justify-content: center;
  
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(135deg, rgba(168, 85, 247, 0.06) 0%, ${"rgba(2, 132, 199, 0.06)"} 100%);
    opacity: 0.3;
    z-index: 0;
  }
`;
const EmptyContent = styled.div`
  position: relative;
  z-index: 1;
  max-width: 600px;
  margin: 0 auto;
`;
const EmptyIcon = styled.div`
  width: 120px;
  height: 120px;
  margin: 0 auto ${theme.spacing.lg};
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(168, 85, 247, 0.12) 0%, ${"rgba(2, 132, 199, 0.12)"} 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: ${theme.shadows.xl};
  
  svg {
    width: 60px;
    height: 60px;
    color: ${"var(--colors-primary600, #0284C7)"};
  }
`;
const Analytics = () => {
  useAuthRefresh();
  const { get, del } = useFetchClient();
  const { toggleNotification } = useNotification();
  const { hasFeature } = useLicense();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [emailLogs, setEmailLogs] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const hasBasicAnalytics = hasFeature("email-logging");
  useEffect(() => {
    if (hasBasicAnalytics) {
      fetchAnalytics();
      fetchEmailLogs();
    } else {
      setLoading(false);
    }
  }, [hasBasicAnalytics]);
  const fetchAnalytics = async () => {
    try {
      const response = await get("/magic-mail/analytics/stats");
      console.log("[DEBUG] Analytics response:", response);
      console.log("[DEBUG] Stats data:", response.data);
      const statsData = response.data?.data || response.data || {};
      console.log("[DEBUG] Stats to set:", statsData);
      setStats(statsData);
    } catch (error) {
      console.error("Failed to fetch analytics:", error);
      console.error("Error details:", error.response?.data);
    }
  };
  const fetchEmailLogs = async () => {
    setLoading(true);
    try {
      const response = await get("/magic-mail/analytics/emails?_limit=50&_sort=sentAt:DESC");
      setEmailLogs(response.data?.data || []);
    } catch (error) {
      console.error("Failed to fetch email logs:", error);
    } finally {
      setLoading(false);
    }
  };
  const handleClearAll = async () => {
    setIsDeleting(true);
    try {
      const response = await del("/magic-mail/analytics/emails");
      toggleNotification({
        type: "success",
        message: response.data?.message || "All email logs cleared successfully"
      });
      await fetchAnalytics();
      await fetchEmailLogs();
      setShowClearDialog(false);
    } catch (error) {
      console.error("Failed to clear email logs:", error);
      toggleNotification({
        type: "danger",
        message: "Failed to clear email logs"
      });
    } finally {
      setIsDeleting(false);
    }
  };
  const formatDate = (dateString) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };
  const filteredLogs = emailLogs.filter(
    (log) => log.recipient?.toLowerCase().includes(searchTerm.toLowerCase()) || log.subject?.toLowerCase().includes(searchTerm.toLowerCase()) || log.templateName?.toLowerCase().includes(searchTerm.toLowerCase())
  );
  if (!hasBasicAnalytics) {
    return /* @__PURE__ */ jsxs(Container, { children: [
      /* @__PURE__ */ jsx(Header, { children: /* @__PURE__ */ jsx(HeaderContent, { justifyContent: "center", alignItems: "center", children: /* @__PURE__ */ jsxs("div", { style: { textAlign: "center" }, children: [
        /* @__PURE__ */ jsxs(Title, { variant: "alpha", children: [
          /* @__PURE__ */ jsx(ChartBarIcon, {}),
          "Email Analytics"
        ] }),
        /* @__PURE__ */ jsx(Subtitle, { variant: "epsilon", children: "Upgrade to Premium to unlock detailed email analytics and tracking" })
      ] }) }) }),
      /* @__PURE__ */ jsx(EmptyState, { children: /* @__PURE__ */ jsxs(EmptyContent, { children: [
        /* @__PURE__ */ jsx(EmptyIcon, { children: /* @__PURE__ */ jsx(ChartBarIcon, {}) }),
        /* @__PURE__ */ jsx(Typography, { variant: "delta", fontWeight: "bold", style: { marginBottom: "12px", display: "block" }, children: "Analytics Available in Premium" }),
        /* @__PURE__ */ jsx(Typography, { variant: "omega", textColor: "neutral600", style: { marginBottom: "32px", lineHeight: "1.6", display: "block" }, children: "Upgrade to Premium to unlock email analytics, tracking, open rates, click rates, and detailed reports about your email campaigns." }),
        /* @__PURE__ */ jsx(
          GradientButton$1,
          {
            onClick: () => window.location.href = "/admin/settings/magic-mail/upgrade",
            children: "View Upgrade Plans"
          }
        )
      ] }) })
    ] });
  }
  if (loading) {
    return /* @__PURE__ */ jsx(Container, { children: /* @__PURE__ */ jsx(Flex, { justifyContent: "center", alignItems: "center", style: { minHeight: "400px" }, children: /* @__PURE__ */ jsx(Loader, { children: "Loading analytics..." }) }) });
  }
  return /* @__PURE__ */ jsxs(Container, { children: [
    /* @__PURE__ */ jsx(Header, { children: /* @__PURE__ */ jsx(HeaderContent, { justifyContent: "flex-start", alignItems: "center", children: /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsxs(Title, { variant: "alpha", children: [
        /* @__PURE__ */ jsx(ChartBarIcon, {}),
        "Email Analytics"
      ] }),
      /* @__PURE__ */ jsx(Subtitle, { variant: "epsilon", children: "Track your email performance and engagement" })
    ] }) }) }),
    /* @__PURE__ */ jsxs(StatsGrid, { children: [
      /* @__PURE__ */ jsxs(StatCard, { $delay: "0.1s", $color: "var(--colors-primary600, #0EA5E9)", children: [
        /* @__PURE__ */ jsx(StatIcon, { className: "stat-icon", $bg: "rgba(2, 132, 199, 0.12)", $color: "var(--colors-primary600, #0284C7)", children: /* @__PURE__ */ jsx(EnvelopeIcon, {}) }),
        /* @__PURE__ */ jsx(StatValue, { className: "stat-value", children: stats?.totalSent || 0 }),
        /* @__PURE__ */ jsx(StatLabel, { children: "Total Sent" })
      ] }),
      /* @__PURE__ */ jsxs(StatCard, { $delay: "0.2s", $color: "var(--colors-success600, #22C55E)", children: [
        /* @__PURE__ */ jsx(StatIcon, { className: "stat-icon", $bg: "rgba(22, 163, 74, 0.12)", $color: "var(--colors-success600, #16A34A)", children: /* @__PURE__ */ jsx(EnvelopeOpenIcon, {}) }),
        /* @__PURE__ */ jsx(StatValue, { className: "stat-value", children: stats?.totalOpened || 0 }),
        /* @__PURE__ */ jsx(StatLabel, { children: "Opened" })
      ] }),
      /* @__PURE__ */ jsxs(StatCard, { $delay: "0.3s", $color: "var(--colors-primary600, #0EA5E9)", children: [
        /* @__PURE__ */ jsx(StatIcon, { className: "stat-icon", $bg: "rgba(2, 132, 199, 0.12)", $color: "var(--colors-primary600, #0284C7)", children: /* @__PURE__ */ jsx(CursorArrowRaysIcon, {}) }),
        /* @__PURE__ */ jsx(StatValue, { className: "stat-value", children: stats?.totalClicked || 0 }),
        /* @__PURE__ */ jsx(StatLabel, { children: "Clicked" })
      ] }),
      /* @__PURE__ */ jsxs(StatCard, { $delay: "0.4s", $color: "var(--colors-danger600, #EF4444)", children: [
        /* @__PURE__ */ jsx(StatIcon, { className: "stat-icon", $bg: "rgba(220, 38, 38, 0.12)", $color: "var(--colors-danger600, #DC2626)", children: /* @__PURE__ */ jsx(ExclamationTriangleIcon, {}) }),
        /* @__PURE__ */ jsx(StatValue, { className: "stat-value", children: stats?.totalBounced || 0 }),
        /* @__PURE__ */ jsx(StatLabel, { children: "Bounced" })
      ] })
    ] }),
    /* @__PURE__ */ jsx(FilterBar, { children: /* @__PURE__ */ jsxs(Flex, { justifyContent: "space-between", alignItems: "center", children: [
      /* @__PURE__ */ jsxs(Typography, { variant: "omega", fontWeight: "semiBold", textColor: "neutral700", children: [
        "Recent Emails (",
        filteredLogs.length,
        ")"
      ] }),
      /* @__PURE__ */ jsxs(Flex, { gap: 2, children: [
        /* @__PURE__ */ jsx(
          TextInput,
          {
            placeholder: "Search emails...",
            value: searchTerm,
            onChange: (e) => setSearchTerm(e.target.value),
            startAction: /* @__PURE__ */ jsx(MagnifyingGlassIcon, { style: { width: 16, height: 16 } }),
            style: { maxWidth: "300px" }
          }
        ),
        emailLogs.length > 0 && /* @__PURE__ */ jsx(
          DangerButton,
          {
            startIcon: /* @__PURE__ */ jsx(TrashIcon, { style: { width: 16, height: 16 } }),
            onClick: () => setShowClearDialog(true),
            disabled: isDeleting,
            children: "Clear All"
          }
        )
      ] })
    ] }) }),
    filteredLogs.length === 0 ? /* @__PURE__ */ jsx(EmptyState, { children: /* @__PURE__ */ jsxs(EmptyContent, { children: [
      /* @__PURE__ */ jsx(EmptyIcon, { children: /* @__PURE__ */ jsx(EnvelopeIcon, {}) }),
      /* @__PURE__ */ jsx(Typography, { variant: "delta", fontWeight: "bold", style: { marginBottom: "12px", display: "block" }, children: searchTerm ? "No emails found" : "No emails sent yet" }),
      /* @__PURE__ */ jsx(Typography, { variant: "omega", textColor: "neutral600", style: { lineHeight: "1.6", display: "block" }, children: searchTerm ? "Try adjusting your search terms" : "Send your first email to see analytics and tracking information here!" })
    ] }) }) : /* @__PURE__ */ jsx(TableContainer, { children: /* @__PURE__ */ jsx(Box, { style: { overflowX: "auto" }, children: /* @__PURE__ */ jsxs(StyledTable, { colCount: 6, rowCount: filteredLogs.length, children: [
      /* @__PURE__ */ jsx(Thead, { children: /* @__PURE__ */ jsxs(Tr, { children: [
        /* @__PURE__ */ jsx(Th, { children: /* @__PURE__ */ jsx(Typography, { variant: "sigma", children: "Recipient" }) }),
        /* @__PURE__ */ jsx(Th, { children: /* @__PURE__ */ jsx(Typography, { variant: "sigma", children: "Subject" }) }),
        /* @__PURE__ */ jsx(Th, { children: /* @__PURE__ */ jsx(Typography, { variant: "sigma", children: "Template" }) }),
        /* @__PURE__ */ jsx(Th, { children: /* @__PURE__ */ jsx(Typography, { variant: "sigma", children: "Sent At" }) }),
        /* @__PURE__ */ jsx(Th, { children: /* @__PURE__ */ jsx(Typography, { variant: "sigma", children: "Opened" }) }),
        /* @__PURE__ */ jsx(Th, { children: /* @__PURE__ */ jsx(Typography, { variant: "sigma", children: "Clicked" }) })
      ] }) }),
      /* @__PURE__ */ jsx(Tbody, { children: filteredLogs.map((log) => /* @__PURE__ */ jsxs(Tr, { children: [
        /* @__PURE__ */ jsxs(Td, { children: [
          /* @__PURE__ */ jsx(Typography, { variant: "omega", fontWeight: "semiBold", children: log.recipient }),
          log.recipientName && /* @__PURE__ */ jsx(Typography, { variant: "pi", textColor: "neutral600", children: log.recipientName })
        ] }),
        /* @__PURE__ */ jsx(Td, { children: /* @__PURE__ */ jsx(Typography, { variant: "omega", children: log.subject || "-" }) }),
        /* @__PURE__ */ jsx(Td, { children: /* @__PURE__ */ jsx(Typography, { variant: "omega", textColor: "neutral600", children: log.templateName || "-" }) }),
        /* @__PURE__ */ jsx(Td, { children: /* @__PURE__ */ jsx(Typography, { variant: "pi", textColor: "neutral600", children: formatDate(log.sentAt) }) }),
        /* @__PURE__ */ jsx(Td, { children: log.openCount > 0 ? /* @__PURE__ */ jsxs(Flex, { alignItems: "center", gap: 2, children: [
          /* @__PURE__ */ jsx(CheckCircleIcon, { style: { width: 16, height: 16, color: "var(--colors-success600, #16A34A)" } }),
          /* @__PURE__ */ jsxs(Typography, { variant: "pi", fontWeight: "semiBold", style: { color: "var(--colors-success600, #16A34A)" }, children: [
            log.openCount,
            " ",
            log.openCount === 1 ? "time" : "times"
          ] })
        ] }) : /* @__PURE__ */ jsxs(Flex, { alignItems: "center", gap: 1, children: [
          /* @__PURE__ */ jsx(XCircleIcon, { style: { width: 16, height: 16, color: "var(--colors-neutral500)" } }),
          /* @__PURE__ */ jsx(Typography, { variant: "pi", textColor: "neutral600", children: "No" })
        ] }) }),
        /* @__PURE__ */ jsx(Td, { children: log.clickCount > 0 ? /* @__PURE__ */ jsxs(Flex, { alignItems: "center", gap: 2, children: [
          /* @__PURE__ */ jsx(CheckCircleIcon, { style: { width: 16, height: 16, color: "var(--colors-primary600, #0284C7)" } }),
          /* @__PURE__ */ jsxs(Typography, { variant: "pi", fontWeight: "semiBold", style: { color: "var(--colors-primary600, #0284C7)" }, children: [
            log.clickCount,
            " ",
            log.clickCount === 1 ? "time" : "times"
          ] })
        ] }) : /* @__PURE__ */ jsxs(Flex, { alignItems: "center", gap: 1, children: [
          /* @__PURE__ */ jsx(XCircleIcon, { style: { width: 16, height: 16, color: "var(--colors-neutral500)" } }),
          /* @__PURE__ */ jsx(Typography, { variant: "pi", textColor: "neutral600", children: "No" })
        ] }) })
      ] }, log.id)) })
    ] }) }) }),
    /* @__PURE__ */ jsx(Modal.Root, { open: showClearDialog, onOpenChange: setShowClearDialog, children: /* @__PURE__ */ jsxs(Modal.Content, { children: [
      /* @__PURE__ */ jsx(Modal.Header, { children: /* @__PURE__ */ jsx(Typography, { variant: "beta", fontWeight: "bold", children: "Clear All Email Logs?" }) }),
      /* @__PURE__ */ jsx(Modal.Body, { children: /* @__PURE__ */ jsxs(Flex, { direction: "column", gap: 4, children: [
        /* @__PURE__ */ jsx(Typography, { children: "Are you sure you want to delete all email logs? This action cannot be undone." }),
        /* @__PURE__ */ jsxs(Typography, { variant: "pi", textColor: "neutral600", children: [
          "This will permanently delete ",
          emailLogs.length,
          " email log(s) and all associated tracking data."
        ] })
      ] }) }),
      /* @__PURE__ */ jsx(Modal.Footer, { children: /* @__PURE__ */ jsxs(Flex, { justifyContent: "flex-end", gap: 2, children: [
        /* @__PURE__ */ jsx(
          TertiaryButton,
          {
            onClick: () => setShowClearDialog(false),
            disabled: isDeleting,
            children: "Cancel"
          }
        ),
        /* @__PURE__ */ jsx(
          DangerButton,
          {
            onClick: handleClearAll,
            loading: isDeleting,
            startIcon: /* @__PURE__ */ jsx(TrashIcon, { style: { width: 16, height: 16 } }),
            children: "Delete All"
          }
        )
      ] }) })
    ] }) })
  ] });
};
const fadeIn$1 = keyframes`
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;
const pulse = keyframes`
  0%, 100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.05);
  }
`;
const spin = keyframes`
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
`;
const colors = {
  whatsapp: "#25D366",
  whatsappDark: "#128C7E",
  whatsappLight: "rgba(37, 211, 102, 0.2)",
  primary: "#4945ff",
  primaryLight: "rgba(73, 69, 255, 0.06)",
  success: "#5cb176",
  successLight: "rgba(92, 177, 118, 0.12)",
  danger: "#d02b20",
  neutral: "#8e8ea9",
  neutralLight: "rgba(142, 142, 169, 0.08)",
  border: "rgba(128, 128, 128, 0.2)",
  textLight: "var(--colors-neutral600, #666687)"
};
const PageContainer = styled(Box)`
  padding: 40px;
  max-width: 900px;
  margin: 0 auto;
  animation: ${fadeIn$1} 0.4s ease;
`;
const HeaderSection = styled(Box)`
  text-align: center;
  margin-bottom: 48px;
`;
const WhatsAppLogo = styled.div`
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: linear-gradient(135deg, ${colors.whatsapp}, ${colors.whatsappDark});
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 24px;
  box-shadow: 0 8px 32px ${colors.whatsapp}40;
`;
const PhoneIcon = styled.div`
  width: 40px;
  height: 40px;
  color: white;
  font-size: 32px;
`;
const StepperContainer = styled(Box)`
  display: flex;
  align-items: flex-start;
  justify-content: center;
  gap: 0;
  margin-bottom: 48px;
  position: relative;
  padding: 0 40px;
`;
const StepWrapper = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  
  &:not(:last-child)::after {
    content: '';
    position: absolute;
    top: 28px;
    left: 50%;
    width: 100%;
    height: 3px;
    background: ${(props) => props.$completed ? colors.success : colors.neutralLight};
    transition: all 0.4s ease;
    z-index: 0;
  }
`;
const StepDot = styled.div`
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: ${(props) => props.$active ? colors.whatsapp : props.$completed ? colors.success : props.theme.colors.neutral0};
  color: ${(props) => props.$active || props.$completed ? "#ffffff" : colors.textLight};
  border: 4px solid ${(props) => props.$active ? colors.whatsapp : props.$completed ? colors.success : colors.border};
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 18px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  z-index: 1;
  cursor: ${(props) => props.$completed ? "pointer" : "default"};
  box-shadow: ${(props) => props.$active ? `0 4px 16px ${colors.whatsapp}40, 0 0 0 8px ${colors.whatsappLight}` : props.$completed ? `0 4px 12px ${colors.success}30` : "0 2px 8px rgba(0,0,0,0.08)"};
  
  ${(props) => props.$active && css`
    animation: ${pulse} 2s infinite;
  `}
  
  &:hover {
    transform: ${(props) => props.$completed ? "scale(1.1)" : props.$active ? "scale(1.05)" : "scale(1)"};
  }
`;
const StepLabel = styled(Typography)`
  margin-top: 12px;
  font-size: 13px;
  color: ${(props) => props.$active ? colors.whatsapp : props.$completed ? colors.success : colors.textLight};
  white-space: nowrap;
  font-weight: ${(props) => props.$active ? 600 : 500};
  text-align: center;
  transition: all 0.3s ease;
`;
const ContentCard = styled(Box)`
  background: ${(p) => p.theme.colors.neutral0};
  border: 1px solid ${colors.border};
  border-radius: 16px;
  padding: 32px;
  margin-bottom: 24px;
  animation: ${fadeIn$1} 0.4s ease;
  box-shadow: 0 4px 24px rgba(0,0,0,0.06);
`;
const QRCodeContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32px;
  background: ${colors.neutralLight};
  border-radius: 16px;
  margin: 24px 0;
`;
const QRImage = styled.img`
  width: 280px;
  height: 280px;
  border-radius: 12px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.1);
`;
const StatusBadge = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 20px;
  font-weight: 600;
  font-size: 14px;
  background: ${(props) => {
  switch (props.$status) {
    case "connected":
      return colors.successLight;
    case "connecting":
      return colors.primaryLight;
    case "qr_pending":
      return colors.whatsappLight;
    case "disconnected":
      return colors.neutralLight;
    default:
      return colors.neutralLight;
  }
}};
  color: ${(props) => {
  switch (props.$status) {
    case "connected":
      return colors.success;
    case "connecting":
      return colors.primary;
    case "qr_pending":
      return colors.whatsappDark;
    case "disconnected":
      return colors.neutral;
    default:
      return colors.neutral;
  }
}};
`;
const SpinningLoader = styled.div`
  width: 20px;
  height: 20px;
  border: 2px solid ${colors.primary}40;
  border-top-color: ${colors.primary};
  border-radius: 50%;
  animation: ${spin} 1s linear infinite;
`;
const ConnectedCard = styled(Box)`
  background: linear-gradient(135deg, ${colors.successLight}, ${colors.whatsappLight});
  border: 2px solid ${colors.success};
  border-radius: 16px;
  padding: 32px;
  text-align: center;
`;
const InfoBox$1 = styled(Box)`
  background: linear-gradient(135deg, rgba(2, 132, 199, 0.06) 0%, ${colors.whatsappLight} 100%);
  border: 1px solid rgba(2, 132, 199, 0.2);
  border-radius: 12px;
  padding: 24px;
  margin: 20px 0;
`;
const TestSection = styled(Box)`
  background: linear-gradient(135deg, ${colors.whatsappLight} 0%, rgba(34, 197, 94, 0.1) 100%);
  border: 1px solid ${colors.whatsapp}40;
  border-radius: 16px;
  padding: 24px;
  margin-top: 24px;
`;
const WhatsAppInput = styled.input`
  width: 100%;
  padding: 14px 16px;
  border: 2px solid rgba(128, 128, 128, 0.2);
  border-radius: 12px;
  font-size: 15px;
  background: ${(p) => p.theme.colors.neutral0};
  color: var(--colors-neutral800);
  transition: all 0.2s ease;
  box-sizing: border-box;
  
  &:focus {
    outline: none;
    border-color: ${colors.whatsapp};
    box-shadow: 0 0 0 3px ${colors.whatsapp}20;
  }
  
  &::placeholder {
    color: rgba(128, 128, 128, 0.4);
  }
`;
const WhatsAppTextarea = styled.textarea`
  width: 100%;
  padding: 14px 16px;
  border: 2px solid rgba(128, 128, 128, 0.2);
  border-radius: 12px;
  font-size: 15px;
  background: ${(p) => p.theme.colors.neutral0};
  color: var(--colors-neutral800);
  transition: all 0.2s ease;
  box-sizing: border-box;
  resize: vertical;
  min-height: 80px;
  font-family: inherit;
  
  &:focus {
    outline: none;
    border-color: ${colors.whatsapp};
    box-shadow: 0 0 0 3px ${colors.whatsapp}20;
  }
  
  &::placeholder {
    color: rgba(128, 128, 128, 0.4);
  }
`;
const InputLabel = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: ${colors.whatsappDark};
  margin-bottom: 8px;
`;
const InputHint = styled.span`
  font-size: 12px;
  color: var(--colors-neutral500);
  margin-top: 6px;
  display: block;
`;
const PhoneSymbol = styled.span`
  font-size: 16px;
  font-weight: 700;
`;
const MessageSymbol = styled.span`
  font-size: 16px;
`;
const UseCaseCard = styled(Box)`
  background: linear-gradient(135deg, ${colors.whatsappLight}, rgba(2, 132, 199, 0.06));
  border: 2px solid ${colors.whatsapp};
  border-radius: 16px;
  padding: 24px;
  margin-bottom: 32px;
`;
const ButtonRow = styled(Flex)`
  margin-top: 32px;
  padding-top: 24px;
  border-top: 1px solid rgba(128, 128, 128, 0.2);
`;
const AlertBox = styled(Box)`
  background: rgba(2, 132, 199, 0.06);
  border: 1px solid rgba(2, 132, 199, 0.2);
  border-radius: 12px;
  padding: 16px 20px;
  margin-top: 20px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
`;
const AlertIcon = styled.div`
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--colors-primary600, #0EA5E9);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: bold;
  flex-shrink: 0;
`;
const SuccessBox$1 = styled(Box)`
  background: rgba(22, 163, 74, 0.06);
  border: 1px solid rgba(22, 163, 74, 0.2);
  border-radius: 12px;
  padding: 16px 20px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
`;
const SuccessIcon = styled.div`
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--colors-success600, #22C55E);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`;
const WhatsAppButton = styled(GradientButton$1)`
  && {
    background: linear-gradient(135deg, ${colors.whatsapp} 0%, ${colors.whatsappDark} 100%) !important;
    
    &:hover:not(:disabled) {
      background: linear-gradient(135deg, ${colors.whatsappDark} 0%, ${colors.whatsapp} 100%) !important;
    }
  }
`;
const NotInstalledCard = styled(Box)`
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(220, 38, 38, 0.12));
  border: 2px solid var(--colors-warning600, #F59E0B);
  border-radius: 16px;
  padding: 32px;
  text-align: center;
`;
const WhatsAppPage = () => {
  const { get, post } = useFetchClient();
  const { toggleNotification } = useNotification();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [isAvailable, setIsAvailable] = useState(false);
  const [status, setStatus] = useState({
    status: "disconnected",
    qrCode: null,
    isConnected: false,
    session: null
  });
  const [testPhone, setTestPhone] = useState("");
  const [testMessage, setTestMessage] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  const stepTitles = ["Check Installation", "Connect WhatsApp", "Scan QR Code", "Ready to Use"];
  const checkAvailability = useCallback(async () => {
    try {
      const { data } = await get("/magic-mail/whatsapp/available");
      setIsAvailable(data.data.available);
      return data.data.available;
    } catch (error) {
      console.error("[MagicMail WhatsApp] Error checking availability:", error);
      setIsAvailable(false);
      return false;
    }
  }, [get]);
  const fetchStatus = useCallback(async () => {
    try {
      const { data } = await get("/magic-mail/whatsapp/status");
      setStatus(data.data);
      if (data.data.isConnected) {
        setCurrentStep(4);
      } else if (data.data.qrCode) {
        setCurrentStep(3);
      } else if (isAvailable) {
        setCurrentStep(2);
      }
      return data.data;
    } catch (error) {
      console.error("[MagicMail WhatsApp] Error fetching status:", error);
      return null;
    }
  }, [get, isAvailable]);
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      const available = await checkAvailability();
      if (available) {
        await fetchStatus();
      }
      setLoading(false);
    };
    init();
  }, [checkAvailability, fetchStatus]);
  useEffect(() => {
    let pollInterval;
    if (connecting || status.status === "connecting" || status.status === "qr_pending") {
      pollInterval = setInterval(async () => {
        const newStatus = await fetchStatus();
        if (newStatus?.isConnected) {
          setConnecting(false);
          setCurrentStep(4);
          toggleNotification({
            type: "success",
            message: "[SUCCESS] WhatsApp connected successfully!"
          });
        }
      }, 2e3);
    }
    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [connecting, status.status, fetchStatus, toggleNotification]);
  const handleConnect = async () => {
    setConnecting(true);
    try {
      const { data } = await post("/magic-mail/whatsapp/connect", {});
      if (data.data.qrCode) {
        setStatus((prev) => ({ ...prev, qrCode: data.data.qrCode, status: "qr_pending" }));
        setCurrentStep(3);
      } else if (data.data.status === "connected") {
        setStatus((prev) => ({ ...prev, isConnected: true, status: "connected" }));
        setCurrentStep(4);
        toggleNotification({
          type: "success",
          message: "[SUCCESS] WhatsApp already connected!"
        });
      }
    } catch (error) {
      toggleNotification({
        type: "danger",
        message: "[ERROR] Failed to connect: " + (error.response?.data?.error?.message || error.message)
      });
      setConnecting(false);
    }
  };
  const handleDisconnect = async () => {
    try {
      await post("/magic-mail/whatsapp/disconnect", {});
      setStatus({
        status: "disconnected",
        qrCode: null,
        isConnected: false,
        session: null
      });
      setCurrentStep(2);
      toggleNotification({
        type: "success",
        message: "[SUCCESS] WhatsApp disconnected"
      });
    } catch (error) {
      toggleNotification({
        type: "danger",
        message: "[ERROR] Failed to disconnect"
      });
    }
  };
  const handleSendTest = async () => {
    if (!testPhone) {
      toggleNotification({
        type: "warning",
        message: "Please enter a phone number"
      });
      return;
    }
    setSendingTest(true);
    try {
      const { data } = await post("/magic-mail/whatsapp/send-test", {
        phoneNumber: testPhone,
        message: testMessage || void 0
      });
      if (data.success) {
        toggleNotification({
          type: "success",
          message: "[SUCCESS] Test message sent!"
        });
        setTestPhone("");
        setTestMessage("");
      } else {
        toggleNotification({
          type: "danger",
          message: "[ERROR] " + (data.data.error || "Failed to send message")
        });
      }
    } catch (error) {
      toggleNotification({
        type: "danger",
        message: "[ERROR] " + (error.response?.data?.error?.message || error.message)
      });
    } finally {
      setSendingTest(false);
    }
  };
  const renderStatusBadge = () => {
    const statusText = {
      connected: "Connected",
      connecting: "Connecting...",
      qr_pending: "Waiting for QR Scan",
      disconnected: "Disconnected"
    };
    return /* @__PURE__ */ jsxs(StatusBadge, { $status: status.status, children: [
      status.status === "connecting" && /* @__PURE__ */ jsx(SpinningLoader, {}),
      status.status === "connected" && /* @__PURE__ */ jsx(Check, {}),
      statusText[status.status] || "Unknown"
    ] });
  };
  if (loading) {
    return /* @__PURE__ */ jsx(PageContainer, { children: /* @__PURE__ */ jsx(Flex, { justifyContent: "center", alignItems: "center", style: { minHeight: "400px" }, children: /* @__PURE__ */ jsx(Loader, {}) }) });
  }
  return /* @__PURE__ */ jsxs(PageContainer, { children: [
    /* @__PURE__ */ jsxs(HeaderSection, { children: [
      /* @__PURE__ */ jsx(WhatsAppLogo, { children: /* @__PURE__ */ jsx(PhoneIcon, { children: /* @__PURE__ */ jsx("svg", { viewBox: "0 0 24 24", fill: "currentColor", width: "40", height: "40", children: /* @__PURE__ */ jsx("path", { d: "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" }) }) }) }),
      /* @__PURE__ */ jsx(Typography, { variant: "alpha", fontWeight: "bold", style: { display: "block", marginBottom: "8px" }, children: "WhatsApp Integration" }),
      /* @__PURE__ */ jsx(Typography, { variant: "epsilon", textColor: "neutral600", style: { display: "block" }, children: "Send messages via WhatsApp - completely free!" }),
      /* @__PURE__ */ jsx(Box, { marginTop: 3, children: renderStatusBadge() })
    ] }),
    /* @__PURE__ */ jsx(StepperContainer, { children: [1, 2, 3, 4].map((step) => /* @__PURE__ */ jsxs(
      StepWrapper,
      {
        $completed: currentStep > step,
        children: [
          /* @__PURE__ */ jsx(
            StepDot,
            {
              $active: currentStep === step,
              $completed: currentStep > step,
              onClick: () => currentStep > step && setCurrentStep(step),
              children: currentStep > step ? /* @__PURE__ */ jsx(Check, {}) : step
            }
          ),
          /* @__PURE__ */ jsx(
            StepLabel,
            {
              $active: currentStep === step,
              $completed: currentStep > step,
              children: stepTitles[step - 1]
            }
          )
        ]
      },
      step
    )) }),
    /* @__PURE__ */ jsxs(UseCaseCard, { children: [
      /* @__PURE__ */ jsx(Typography, { variant: "delta", fontWeight: "bold", style: { display: "block", marginBottom: "12px" }, children: "What can you do with WhatsApp?" }),
      /* @__PURE__ */ jsx(Typography, { variant: "omega", textColor: "neutral700", style: { display: "block", marginBottom: "16px" }, children: "WhatsApp integration provides free messaging as an alternative or backup to email delivery." }),
      /* @__PURE__ */ jsxs(Flex, { direction: "column", gap: 3, children: [
        /* @__PURE__ */ jsxs(Box, { padding: 3, background: "neutral0", hasRadius: true, style: { border: `1px solid ${colors.border}` }, children: [
          /* @__PURE__ */ jsx(Typography, { variant: "pi", fontWeight: "bold", style: { display: "block", marginBottom: "4px" }, children: "1. FALLBACK-KANAL" }),
          /* @__PURE__ */ jsx(Typography, { variant: "pi", textColor: "neutral600", style: { display: "block" }, children: "Wenn alle Email-Accounts fehlschlagen, wird die Nachricht automatisch via WhatsApp zugestellt." })
        ] }),
        /* @__PURE__ */ jsxs(Box, { padding: 3, background: "neutral0", hasRadius: true, style: { border: `1px solid ${colors.border}` }, children: [
          /* @__PURE__ */ jsx(Typography, { variant: "pi", fontWeight: "bold", style: { display: "block", marginBottom: "4px" }, children: "2. ADMIN-BENACHRICHTIGUNGEN" }),
          /* @__PURE__ */ jsx(Typography, { variant: "pi", textColor: "neutral600", style: { display: "block" }, children: "Bei Email-Bounces, Quota-Limits oder Account-Fehlern wird der Admin via WhatsApp benachrichtigt." })
        ] }),
        /* @__PURE__ */ jsxs(Box, { padding: 3, background: "neutral0", hasRadius: true, style: { border: `1px solid ${colors.border}` }, children: [
          /* @__PURE__ */ jsx(Typography, { variant: "pi", fontWeight: "bold", style: { display: "block", marginBottom: "4px" }, children: "3. ROUTING-INTEGRATION" }),
          /* @__PURE__ */ jsx(Typography, { variant: "pi", textColor: "neutral600", style: { display: "block" }, children: "In Routing-Regeln kann WhatsApp als Fallback-Kanal definiert werden (Routing Rules Tab)." })
        ] })
      ] })
    ] }),
    currentStep === 1 && /* @__PURE__ */ jsxs(ContentCard, { children: [
      /* @__PURE__ */ jsx(Typography, { variant: "beta", fontWeight: "bold", style: { display: "block", marginBottom: "8px" }, children: "Check Installation" }),
      /* @__PURE__ */ jsx(Typography, { variant: "omega", textColor: "neutral600", style: { display: "block", marginBottom: "24px" }, children: "First, we need to verify that the required dependencies are installed." }),
      isAvailable ? /* @__PURE__ */ jsxs(SuccessBox$1, { children: [
        /* @__PURE__ */ jsx(SuccessIcon, { children: /* @__PURE__ */ jsx(Check, { style: { width: 14, height: 14 } }) }),
        /* @__PURE__ */ jsxs(Box, { children: [
          /* @__PURE__ */ jsx(Typography, { variant: "omega", fontWeight: "semiBold", style: { display: "block", marginBottom: "4px", color: "var(--colors-success600, #15803D)" }, children: "Dependencies Installed" }),
          /* @__PURE__ */ jsx(Typography, { variant: "pi", textColor: "neutral600", children: "Baileys library is installed and ready to use. You can proceed to connect your WhatsApp account." })
        ] })
      ] }) : /* @__PURE__ */ jsxs(NotInstalledCard, { children: [
        /* @__PURE__ */ jsx(Typography, { variant: "beta", fontWeight: "bold", style: { display: "block", marginBottom: "12px", color: colors.danger }, children: "[WARNING] Dependencies Not Installed" }),
        /* @__PURE__ */ jsx(Typography, { variant: "omega", textColor: "neutral600", style: { display: "block", marginBottom: "16px" }, children: "The WhatsApp integration requires additional dependencies. Please install them:" }),
        /* @__PURE__ */ jsx(
          Box,
          {
            padding: 4,
            background: "neutral0",
            hasRadius: true,
            style: {
              fontFamily: "monospace",
              fontSize: "14px",
              border: `1px solid ${colors.border}`,
              marginBottom: "16px"
            },
            children: "npm install baileys pino qrcode"
          }
        ),
        /* @__PURE__ */ jsx(Typography, { variant: "pi", textColor: "neutral600", children: "After installing, restart your Strapi server and refresh this page." })
      ] }),
      /* @__PURE__ */ jsxs(ButtonRow, { justifyContent: "flex-end", gap: 3, children: [
        /* @__PURE__ */ jsx(
          SecondaryButton,
          {
            onClick: () => {
              checkAvailability();
            },
            startIcon: /* @__PURE__ */ jsx(ArrowClockwise, {}),
            children: "Refresh"
          }
        ),
        /* @__PURE__ */ jsx(
          GradientButton$1,
          {
            onClick: () => setCurrentStep(2),
            disabled: !isAvailable,
            endIcon: /* @__PURE__ */ jsx(ArrowRight, {}),
            children: "Continue"
          }
        )
      ] })
    ] }),
    currentStep === 2 && /* @__PURE__ */ jsxs(ContentCard, { children: [
      /* @__PURE__ */ jsx(Typography, { variant: "beta", fontWeight: "bold", style: { display: "block", marginBottom: "8px" }, children: "Connect Your WhatsApp" }),
      /* @__PURE__ */ jsx(Typography, { variant: "omega", textColor: "neutral600", style: { display: "block", marginBottom: "24px" }, children: "Click the button below to start the connection process. A QR code will be generated for you to scan." }),
      /* @__PURE__ */ jsxs(InfoBox$1, { children: [
        /* @__PURE__ */ jsx(Typography, { variant: "delta", fontWeight: "bold", style: { display: "block", marginBottom: "16px", color: "var(--colors-primary600, #075985)" }, children: "How it works" }),
        /* @__PURE__ */ jsxs(Flex, { direction: "column", gap: 3, children: [
          /* @__PURE__ */ jsx(Typography, { variant: "omega", textColor: "neutral700", children: '1. Click "Connect WhatsApp" to generate a QR code' }),
          /* @__PURE__ */ jsx(Typography, { variant: "omega", textColor: "neutral700", children: "2. Open WhatsApp on your phone" }),
          /* @__PURE__ */ jsx(Typography, { variant: "omega", textColor: "neutral700", children: "3. Go to Settings - Linked Devices - Link a Device" }),
          /* @__PURE__ */ jsx(Typography, { variant: "omega", textColor: "neutral700", children: "4. Scan the QR code with your phone" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs(AlertBox, { children: [
        /* @__PURE__ */ jsx(AlertIcon, { children: "i" }),
        /* @__PURE__ */ jsxs(Box, { children: [
          /* @__PURE__ */ jsx(Typography, { variant: "omega", fontWeight: "semiBold", style: { display: "block", marginBottom: "4px" }, children: "Session Persistence" }),
          /* @__PURE__ */ jsx(Typography, { variant: "pi", textColor: "neutral600", children: "Your WhatsApp session will be saved. You won't need to scan the QR code again unless you manually disconnect or your session expires." })
        ] })
      ] }),
      /* @__PURE__ */ jsxs(ButtonRow, { justifyContent: "space-between", children: [
        /* @__PURE__ */ jsx(
          TertiaryButton,
          {
            onClick: () => setCurrentStep(1),
            startIcon: /* @__PURE__ */ jsx(ArrowLeft, {}),
            children: "Back"
          }
        ),
        /* @__PURE__ */ jsx(
          WhatsAppButton,
          {
            onClick: handleConnect,
            loading: connecting,
            startIcon: /* @__PURE__ */ jsx(Play, {}),
            children: "Connect WhatsApp"
          }
        )
      ] })
    ] }),
    currentStep === 3 && /* @__PURE__ */ jsxs(ContentCard, { children: [
      /* @__PURE__ */ jsx(Typography, { variant: "beta", fontWeight: "bold", style: { display: "block", marginBottom: "8px" }, children: "Scan QR Code" }),
      /* @__PURE__ */ jsx(Typography, { variant: "omega", textColor: "neutral600", style: { display: "block", marginBottom: "24px" }, children: "Open WhatsApp on your phone and scan this QR code to connect." }),
      /* @__PURE__ */ jsx(QRCodeContainer, { children: status.qrCode ? /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx(QRImage, { src: status.qrCode, alt: "WhatsApp QR Code" }),
        /* @__PURE__ */ jsx(Typography, { variant: "pi", textColor: "neutral600", style: { marginTop: "16px" }, children: 'QR code expires in 60 seconds. If it expires, click "Refresh QR".' })
      ] }) : /* @__PURE__ */ jsxs(Flex, { direction: "column", alignItems: "center", gap: 3, children: [
        /* @__PURE__ */ jsx(SpinningLoader, { style: { width: "40px", height: "40px" } }),
        /* @__PURE__ */ jsx(Typography, { variant: "omega", children: "Generating QR code..." })
      ] }) }),
      /* @__PURE__ */ jsxs(InfoBox$1, { children: [
        /* @__PURE__ */ jsx(Typography, { variant: "delta", fontWeight: "bold", style: { display: "block", marginBottom: "16px", color: "var(--colors-primary600, #075985)" }, children: "Instructions" }),
        /* @__PURE__ */ jsxs(Flex, { direction: "column", gap: 2, children: [
          /* @__PURE__ */ jsx(Typography, { variant: "omega", textColor: "neutral700", children: "1. Open WhatsApp on your phone" }),
          /* @__PURE__ */ jsx(Typography, { variant: "omega", textColor: "neutral700", children: "2. Tap Menu or Settings" }),
          /* @__PURE__ */ jsx(Typography, { variant: "omega", textColor: "neutral700", children: '3. Select "Linked Devices"' }),
          /* @__PURE__ */ jsx(Typography, { variant: "omega", textColor: "neutral700", children: '4. Tap "Link a Device"' }),
          /* @__PURE__ */ jsx(Typography, { variant: "omega", textColor: "neutral700", children: "5. Point your phone camera at this QR code" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs(ButtonRow, { justifyContent: "space-between", children: [
        /* @__PURE__ */ jsx(
          TertiaryButton,
          {
            onClick: () => setCurrentStep(2),
            startIcon: /* @__PURE__ */ jsx(ArrowLeft, {}),
            children: "Back"
          }
        ),
        /* @__PURE__ */ jsx(
          SecondaryButton,
          {
            onClick: handleConnect,
            startIcon: /* @__PURE__ */ jsx(ArrowClockwise, {}),
            children: "Refresh QR"
          }
        )
      ] })
    ] }),
    currentStep === 4 && /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs(ConnectedCard, { children: [
        /* @__PURE__ */ jsx(Box, { marginBottom: 4, children: /* @__PURE__ */ jsx(Check, { style: { width: "48px", height: "48px", color: colors.success } }) }),
        /* @__PURE__ */ jsx(Typography, { variant: "alpha", fontWeight: "bold", style: { display: "block", marginBottom: "8px" }, children: "WhatsApp Connected" }),
        status.session && /* @__PURE__ */ jsxs(Typography, { variant: "omega", textColor: "neutral600", style: { display: "block" }, children: [
          "Connected as: ",
          status.session.phoneNumber,
          " ",
          status.session.name && `(${status.session.name})`
        ] })
      ] }),
      /* @__PURE__ */ jsxs(ContentCard, { style: { marginTop: "24px" }, children: [
        /* @__PURE__ */ jsx(Typography, { variant: "beta", fontWeight: "bold", style: { display: "block", marginBottom: "8px" }, children: "Send Test Message" }),
        /* @__PURE__ */ jsx(Typography, { variant: "omega", textColor: "neutral600", style: { display: "block", marginBottom: "24px" }, children: "Test your WhatsApp connection by sending a message." }),
        /* @__PURE__ */ jsxs(TestSection, { children: [
          /* @__PURE__ */ jsxs(Box, { style: { marginBottom: "20px" }, children: [
            /* @__PURE__ */ jsxs(InputLabel, { children: [
              /* @__PURE__ */ jsx(PhoneSymbol, { children: "+" }),
              "Phone Number"
            ] }),
            /* @__PURE__ */ jsx(
              WhatsAppInput,
              {
                placeholder: "49123456789",
                value: testPhone,
                onChange: (e) => setTestPhone(e.target.value)
              }
            ),
            /* @__PURE__ */ jsx(InputHint, { children: "Enter with country code, without + (e.g., 49 for Germany, 1 for USA)" })
          ] }),
          /* @__PURE__ */ jsxs(Box, { style: { marginBottom: "24px" }, children: [
            /* @__PURE__ */ jsxs(InputLabel, { children: [
              /* @__PURE__ */ jsx(MessageSymbol, { children: "@" }),
              "Message (optional)"
            ] }),
            /* @__PURE__ */ jsx(
              WhatsAppTextarea,
              {
                placeholder: "Type your message here... or leave empty for default test message",
                value: testMessage,
                onChange: (e) => setTestMessage(e.target.value),
                rows: 3
              }
            )
          ] }),
          /* @__PURE__ */ jsx(
            WhatsAppButton,
            {
              onClick: handleSendTest,
              loading: sendingTest,
              disabled: !testPhone,
              style: { width: "100%" },
              children: "Send Test Message"
            }
          )
        ] }),
        /* @__PURE__ */ jsx(Divider, { style: { margin: "24px 0" } }),
        /* @__PURE__ */ jsx(Typography, { variant: "beta", fontWeight: "bold", style: { display: "block", marginBottom: "8px" }, children: "Using WhatsApp in Your Code" }),
        /* @__PURE__ */ jsx(Typography, { variant: "omega", textColor: "neutral600", style: { display: "block", marginBottom: "16px" }, children: "Use the WhatsApp service programmatically in your Strapi code." }),
        /* @__PURE__ */ jsx(
          Box,
          {
            padding: 4,
            background: "neutral100",
            hasRadius: true,
            style: {
              fontFamily: "monospace",
              fontSize: "13px",
              lineHeight: "1.6",
              overflow: "auto"
            },
            children: /* @__PURE__ */ jsx("pre", { style: { margin: 0 }, children: `// Send a message via WhatsApp
const whatsapp = strapi.plugin('magic-mail').service('whatsapp');

// Send simple message
await whatsapp.sendMessage('49123456789', 'Hello from MagicMail!');

// Send template message
await whatsapp.sendTemplateMessage('49123456789', 'welcome', {
  name: 'John',
  company: 'ACME Corp',
});` })
          }
        ),
        /* @__PURE__ */ jsxs(ButtonRow, { justifyContent: "space-between", alignItems: "center", children: [
          /* @__PURE__ */ jsx(
            DangerButton,
            {
              onClick: handleDisconnect,
              startIcon: /* @__PURE__ */ jsx(Cross, {}),
              children: "Disconnect WhatsApp"
            }
          ),
          /* @__PURE__ */ jsx(Badge, { backgroundColor: "success600", textColor: "neutral0", style: { padding: "8px 16px", fontSize: "13px" }, children: "FREE - No API costs!" })
        ] })
      ] })
    ] })
  ] });
};
const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;
const slideUp = keyframes`
  from { 
    opacity: 0;
    transform: translateY(30px);
  }
  to { 
    opacity: 1;
    transform: translateY(0);
  }
`;
const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(4, 28, 47, 0.85);
  backdrop-filter: blur(8px);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: ${fadeIn} 0.3s ease-out;
  padding: 20px;
`;
const ModalContent = styled(Box)`
  background: ${(p) => p.theme.colors.neutral0};
  border-radius: 16px;
  width: 100%;
  max-width: 580px;
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.3);
  animation: ${slideUp} 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
`;
const GradientHeader = styled(Box)`
  background: linear-gradient(135deg, #4945ff 0%, #7c3aed 100%);
  padding: 32px 40px;
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: -50%;
    right: -50%;
    width: 200%;
    height: 200%;
    background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);
  }
`;
const IconWrapper = styled.div`
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 16px;
  backdrop-filter: blur(10px);
  border: 2px solid rgba(255, 255, 255, 0.3);

  svg {
    width: 36px;
    height: 36px;
    color: white;
  }
`;
const CloseButton = styled.button`
  position: absolute;
  top: 16px;
  right: 16px;
  background: rgba(255, 255, 255, 0.2);
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  z-index: 10;
  
  svg {
    width: 20px;
    height: 20px;
    color: white;
  }

  &:hover {
    background: rgba(255, 255, 255, 0.3);
    transform: scale(1.1);
  }

  &:active {
    transform: scale(0.95);
  }
`;
const GradientButton = styled(Button)`
  && {
    background: linear-gradient(135deg, #4945ff 0%, #7c3aed 100%);
    color: white;
    font-weight: 600;
    border: none;
    box-shadow: 0 4px 12px rgba(73, 69, 255, 0.4);
    padding: 12px 24px;
    min-height: 44px;
    
    &:hover:not(:disabled) {
      background: linear-gradient(135deg, #4338ca 0%, #6d28d9 100%);
      box-shadow: 0 6px 16px rgba(73, 69, 255, 0.5);
    }
    
    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }
`;
styled(Button)`
  && {
    background: rgba(73, 69, 255, 0.06);
    color: #4945ff;
    font-weight: 600;
    border: 2px solid #4945ff;
    padding: 12px 24px;
    min-height: 44px;
    
    &:hover:not(:disabled) {
      background: rgba(73, 69, 255, 0.12);
    }
  }
`;
const ToggleButton = styled.button`
  background: none;
  border: none;
  color: #4945ff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  padding: 8px 0;
  text-decoration: underline;
  transition: color 0.2s;
  
  &:hover {
    color: #7c3aed;
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;
const InfoBox = styled(Box)`
  background: rgba(73, 69, 255, 0.06);
  border: 2px solid rgba(73, 69, 255, 0.3);
  border-radius: 8px;
  padding: 16px;
  width: 100%;
`;
const SuccessBox = styled(Box)`
  background: rgba(34, 197, 94, 0.06);
  border: 2px solid rgba(34, 197, 94, 0.3);
  border-radius: 8px;
  padding: 20px;
  text-align: center;
`;
const InfoText = styled(Typography)`
  font-size: 13px;
  line-height: 1.6;
  color: ${(p) => p.theme.colors.neutral800};
`;
const LicenseGuard = ({ children }) => {
  const { get, post } = useFetchClient();
  const { toggleNotification } = useNotification();
  const navigate = useNavigate();
  useAuthRefresh();
  const [isChecking, setIsChecking] = useState(true);
  const [needsLicense, setNeedsLicense] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [useExistingKey, setUseExistingKey] = useState(false);
  const [useAutoCreate, setUseAutoCreate] = useState(true);
  const [existingLicenseKey, setExistingLicenseKey] = useState("");
  const [existingEmail, setExistingEmail] = useState("");
  const [adminUser, setAdminUser] = useState(null);
  useEffect(() => {
    checkLicenseStatus();
    fetchAdminUser();
  }, []);
  const fetchAdminUser = async () => {
    try {
      const response = await get("/admin/users/me");
      const userData = response.data?.data || response.data;
      if (userData) {
        setAdminUser(userData);
      }
    } catch (error) {
      console.debug("[MagicMail] Could not fetch admin user");
    }
  };
  const checkLicenseStatus = async () => {
    setIsChecking(true);
    try {
      const response = await get("/magic-mail/license/status");
      if (response.data.valid) {
        setNeedsLicense(false);
      } else {
        setNeedsLicense(true);
      }
    } catch (error) {
      console.error("[MagicMail] License check error:", error);
      setNeedsLicense(true);
    } finally {
      setIsChecking(false);
    }
  };
  const handleAutoCreateLicense = async (e) => {
    e.preventDefault();
    setIsCreating(true);
    try {
      const response = await post("/magic-mail/license/auto-create", {});
      if (response.data && response.data.success) {
        toggleNotification({
          type: "success",
          message: "✅ License created! Reloading..."
        });
        setNeedsLicense(false);
        setTimeout(() => {
          window.location.reload();
        }, 500);
      } else {
        throw new Error("Failed to auto-create license");
      }
    } catch (error) {
      console.error("[MagicMail] Error:", error);
      toggleNotification({
        type: "danger",
        message: "Failed to create license. Try manual entry."
      });
      setIsCreating(false);
      setUseAutoCreate(false);
    }
  };
  const handleValidateExistingKey = async (e) => {
    e.preventDefault();
    if (!existingLicenseKey.trim() || !existingEmail.trim()) {
      toggleNotification({
        type: "warning",
        message: "Please enter both license key and email address"
      });
      return;
    }
    setIsCreating(true);
    try {
      const response = await post("/magic-mail/license/store-key", {
        licenseKey: existingLicenseKey.trim(),
        email: existingEmail.trim()
      });
      if (response.data && response.data.success) {
        toggleNotification({
          type: "success",
          message: "✅ License activated! Reloading..."
        });
        setNeedsLicense(false);
        setTimeout(() => {
          window.location.reload();
        }, 500);
      } else {
        throw new Error("Invalid license");
      }
    } catch (error) {
      toggleNotification({
        type: "danger",
        message: "Invalid license key or email address"
      });
      setIsCreating(false);
    }
  };
  const handleClose = () => {
    navigate("/content-manager");
  };
  if (isChecking) {
    return /* @__PURE__ */ jsx(Box, { padding: 8, style: { textAlign: "center" }, children: /* @__PURE__ */ jsx(Loader, { children: "Checking license..." }) });
  }
  if (needsLicense) {
    return /* @__PURE__ */ jsx(ModalOverlay, { children: /* @__PURE__ */ jsxs(ModalContent, { children: [
      /* @__PURE__ */ jsxs(GradientHeader, { children: [
        /* @__PURE__ */ jsx(CloseButton, { onClick: handleClose, type: "button", children: /* @__PURE__ */ jsx(XMarkIcon, {}) }),
        /* @__PURE__ */ jsx(IconWrapper, { children: /* @__PURE__ */ jsx(KeyIcon, {}) }),
        /* @__PURE__ */ jsxs(Box, { style: { textAlign: "center", position: "relative" }, children: [
          /* @__PURE__ */ jsx(
            Typography,
            {
              variant: "alpha",
              style: {
                color: "white",
                fontSize: "24px",
                fontWeight: "700",
                marginBottom: "12px",
                display: "block"
              },
              children: "🔐 Activate MagicMail"
            }
          ),
          /* @__PURE__ */ jsx(
            Typography,
            {
              variant: "epsilon",
              style: {
                color: "rgba(255, 255, 255, 0.9)",
                fontSize: "14px",
                display: "block"
              },
              children: useExistingKey ? "Enter your existing license key" : "Create a license to start using the plugin"
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsx("form", { onSubmit: useExistingKey ? handleValidateExistingKey : handleAutoCreateLicense, children: /* @__PURE__ */ jsx(Box, { padding: 6, paddingLeft: 8, paddingRight: 8, children: /* @__PURE__ */ jsxs(Flex, { direction: "column", gap: 5, style: { width: "100%" }, children: [
        /* @__PURE__ */ jsx(Box, { style: { textAlign: "center", width: "100%" }, children: /* @__PURE__ */ jsx(
          ToggleButton,
          {
            type: "button",
            onClick: () => setUseExistingKey(!useExistingKey),
            disabled: isCreating,
            children: useExistingKey ? "← Create new license" : "Have a license key? →"
          }
        ) }),
        /* @__PURE__ */ jsx(InfoBox, { children: /* @__PURE__ */ jsx(InfoText, { variant: "omega", children: useExistingKey ? "Enter your email and license key to activate." : adminUser && adminUser.email ? `Click "Activate" to auto-create a license with your account (${adminUser.email})` : 'Click "Activate" to auto-create a license with your admin account' }) }),
        useExistingKey ? (
          // Existing License Key Input
          /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsxs(Box, { style: { width: "100%" }, children: [
              /* @__PURE__ */ jsx(
                Typography,
                {
                  variant: "pi",
                  fontWeight: "bold",
                  style: { marginBottom: "8px", display: "block" },
                  children: "Email Address *"
                }
              ),
              /* @__PURE__ */ jsx(
                TextInput,
                {
                  placeholder: "admin@example.com",
                  type: "email",
                  value: existingEmail,
                  onChange: (e) => setExistingEmail(e.target.value),
                  required: true,
                  disabled: isCreating
                }
              ),
              /* @__PURE__ */ jsx(Typography, { variant: "omega", textColor: "neutral600", style: { fontSize: "11px", marginTop: "4px" }, children: "Enter the email address associated with this license" })
            ] }),
            /* @__PURE__ */ jsxs(Box, { style: { width: "100%" }, children: [
              /* @__PURE__ */ jsx(
                Typography,
                {
                  variant: "pi",
                  fontWeight: "bold",
                  style: { marginBottom: "8px", display: "block" },
                  children: "License Key *"
                }
              ),
              /* @__PURE__ */ jsx(
                TextInput,
                {
                  placeholder: "MAGIC-MAIL-XXXX-XXXX-XXXX",
                  value: existingLicenseKey,
                  onChange: (e) => setExistingLicenseKey(e.target.value),
                  required: true,
                  disabled: isCreating
                }
              ),
              /* @__PURE__ */ jsx(Typography, { variant: "omega", textColor: "neutral600", style: { fontSize: "11px", marginTop: "4px" }, children: "Enter the license key" })
            ] })
          ] })
        ) : adminUser ? (
          // Auto-create mode - Show user info
          /* @__PURE__ */ jsxs(SuccessBox, { children: [
            /* @__PURE__ */ jsx(Typography, { variant: "omega", fontWeight: "bold", style: { marginBottom: "12px", display: "block" }, children: "Ready to activate with your account:" }),
            /* @__PURE__ */ jsxs(Typography, { variant: "pi", style: { marginBottom: "4px", display: "block" }, children: [
              adminUser.firstname || "Admin",
              " ",
              adminUser.lastname || "User"
            ] }),
            /* @__PURE__ */ jsx(Typography, { variant: "pi", textColor: "neutral600", children: adminUser.email || "Loading..." })
          ] })
        ) : /* @__PURE__ */ jsxs(Box, { padding: 4, background: "neutral100", hasRadius: true, style: { textAlign: "center" }, children: [
          /* @__PURE__ */ jsx(Loader, { small: true }),
          /* @__PURE__ */ jsx(Typography, { variant: "pi", marginTop: 2, children: "Loading admin user data..." })
        ] }),
        /* @__PURE__ */ jsx(Flex, { gap: 3, justifyContent: "center", style: { marginTop: "16px" }, children: useExistingKey ? /* @__PURE__ */ jsx(
          GradientButton,
          {
            type: "submit",
            size: "L",
            startIcon: /* @__PURE__ */ jsx(CheckIcon, { style: { width: 20, height: 20 } }),
            loading: isCreating,
            disabled: isCreating || !existingLicenseKey.trim() || !existingEmail.trim(),
            children: "Validate License"
          }
        ) : /* @__PURE__ */ jsx(
          GradientButton,
          {
            type: "submit",
            size: "L",
            startIcon: /* @__PURE__ */ jsx(CheckIcon, { style: { width: 20, height: 20 } }),
            loading: isCreating,
            disabled: isCreating || !adminUser,
            children: "Activate License"
          }
        ) })
      ] }) }) })
    ] }) });
  }
  return /* @__PURE__ */ jsx(Fragment, { children });
};
const App = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { hasFeature } = useLicense();
  const hasEmailDesigner = hasFeature("email-designer-basic");
  const hasAnalytics = hasFeature("email-logging");
  const isEditorRoute = /\/designer\/(new|\d+|core\/.+)/.test(location.pathname);
  const getActiveTab = () => {
    if (location.pathname.includes("/analytics")) return "analytics";
    if (location.pathname.includes("/routing")) return "routing";
    if (location.pathname.includes("/designer") && !isEditorRoute) return "templates";
    if (location.pathname.includes("/whatsapp")) return "whatsapp";
    return "accounts";
  };
  const [activeTab, setActiveTab] = useState(getActiveTab());
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === "accounts") navigate("/plugins/magic-mail");
    if (tab === "routing") navigate("/plugins/magic-mail/routing");
    if (tab === "templates") navigate("/plugins/magic-mail/designer");
    if (tab === "analytics") navigate("/plugins/magic-mail/analytics");
    if (tab === "whatsapp") navigate("/plugins/magic-mail/whatsapp");
  };
  if (isEditorRoute) {
    return /* @__PURE__ */ jsx(LicenseGuard, { children: /* @__PURE__ */ jsx(EditorPage, {}) });
  }
  return /* @__PURE__ */ jsx(LicenseGuard, { children: /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsxs(Tabs.Root, { value: activeTab, onValueChange: handleTabChange, children: [
    /* @__PURE__ */ jsxs(Tabs.List, { children: [
      /* @__PURE__ */ jsx(Tabs.Trigger, { value: "accounts", children: /* @__PURE__ */ jsxs(Flex, { gap: 2, alignItems: "center", children: [
        /* @__PURE__ */ jsx(EnvelopeIcon, { style: { width: 16, height: 16 } }),
        "Email Accounts"
      ] }) }),
      /* @__PURE__ */ jsx(Tabs.Trigger, { value: "routing", children: /* @__PURE__ */ jsxs(Flex, { gap: 2, alignItems: "center", children: [
        /* @__PURE__ */ jsx(FunnelIcon, { style: { width: 16, height: 16 } }),
        "Routing Rules"
      ] }) }),
      hasEmailDesigner && /* @__PURE__ */ jsx(Tabs.Trigger, { value: "templates", children: /* @__PURE__ */ jsxs(Flex, { gap: 2, alignItems: "center", children: [
        /* @__PURE__ */ jsx(DocumentTextIcon, { style: { width: 16, height: 16 } }),
        "Email Templates"
      ] }) }),
      hasAnalytics && /* @__PURE__ */ jsx(Tabs.Trigger, { value: "analytics", children: /* @__PURE__ */ jsxs(Flex, { gap: 2, alignItems: "center", children: [
        /* @__PURE__ */ jsx(ChartBarIcon, { style: { width: 16, height: 16 } }),
        "Analytics"
      ] }) }),
      /* @__PURE__ */ jsx(Tabs.Trigger, { value: "whatsapp", children: /* @__PURE__ */ jsxs(Flex, { gap: 2, alignItems: "center", children: [
        /* @__PURE__ */ jsx(ChatBubbleLeftIcon, { style: { width: 16, height: 16 } }),
        "WhatsApp"
      ] }) })
    ] }),
    /* @__PURE__ */ jsx(Tabs.Content, { value: "accounts", children: /* @__PURE__ */ jsx(HomePage, {}) }),
    /* @__PURE__ */ jsx(Tabs.Content, { value: "routing", children: /* @__PURE__ */ jsx(RoutingRulesPage, {}) }),
    hasEmailDesigner && /* @__PURE__ */ jsx(Tabs.Content, { value: "templates", children: /* @__PURE__ */ jsx(TemplateList, {}) }),
    hasAnalytics && /* @__PURE__ */ jsx(Tabs.Content, { value: "analytics", children: /* @__PURE__ */ jsx(Analytics, {}) }),
    /* @__PURE__ */ jsx(Tabs.Content, { value: "whatsapp", children: /* @__PURE__ */ jsx(WhatsAppPage, {}) })
  ] }) }) });
};
export {
  App as default
};

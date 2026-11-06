/**
 * Styled components of the template editor. Same layout and look as before,
 * with DS tokens (dark mode), contrast-safe brand fills, 36px controls,
 * wrapping header rows down to 320px and reduced-motion support.
 */
import styled, { css, keyframes } from 'styled-components';
import { Button, Modal, Tabs } from '@strapi/design-system';
import { accent, brand, color, fontSize } from '../../utils/theme';
import { CONTROL_HEIGHT } from '../../components/StyledButtons';
import { reducedMotion } from '../../components/shared/motion';

const MOBILE = '768px';

export const Container = styled.div`
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: ${color('neutral100')};
  overflow-x: hidden;
`;

export const Header = styled.div`
  padding: 24px;
  background: ${color('neutral0')};
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);

  @media screen and (max-width: ${MOBILE}) {
    padding: 16px 12px;
  }
`;

export const HeaderRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 16px;
`;

export const HeaderLeft = styled.div`
  display: flex;
  gap: 12px;
  align-items: flex-start;
  min-width: 0;
  flex: 1 1 260px;
`;

export const TitleContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  overflow-wrap: anywhere;
`;

export const HeaderRight = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;

  @media screen and (max-width: ${MOBILE}) {
    justify-content: flex-start;
    width: 100%;
  }
`;

export const SettingsRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: flex-start;
`;

export const FieldWrapper = styled.div`
  flex: ${(p) => p.$flex || '0 0 auto'};
  width: ${(p) => p.$width || 'auto'};
  min-width: ${(p) => (p.$flex ? '200px' : '0')};

  @media screen and (max-width: ${MOBILE}) {
    flex: 1 1 100%;
    width: 100%;
    min-width: 0;
  }
`;

export const SwitchWrapper = styled.div`
  padding-top: 28px;
  display: flex;
  gap: 12px;
  align-items: center;

  @media screen and (max-width: ${MOBILE}) {
    padding-top: 0;
  }
`;

export const TabsWrapper = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
`;

export const TabListWrapper = styled.div`
  padding: 0 24px;
  background: ${color('neutral0')};
  border-bottom: 1px solid rgba(128, 128, 128, 0.2);

  svg {
    width: 16px;
    height: 16px;
    margin-right: 6px;
    vertical-align: -3px;
  }

  @media screen and (max-width: ${MOBILE}) {
    padding: 0 12px;
  }
`;

export const StyledTabsRoot = styled(Tabs.Root)`
  display: flex;
  flex-direction: column;
  height: 100%;
`;

/**
 * Both panels stay mounted (forceMount), so switching tabs never destroys the
 * Unlayer editor and its unsaved design (UI-M01). The inactive panel is hidden.
 */
export const StyledTabsContent = styled(Tabs.Content)`
  flex: 1;
  display: flex;
  flex-direction: column;

  &[data-state='inactive'] {
    display: none;
  }
`;

export const TabContentWrapper = styled.div`
  height: calc(100vh - 240px);
  min-height: 520px;
  background: ${color('neutral0')};
  position: relative;
`;

export const TextTabContent = styled.div`
  padding: 20px;
  height: calc(100vh - 240px);
  min-height: 520px;

  textarea {
    width: 100%;
    height: 100%;
    min-height: 480px;
    font-family: monospace;
  }

  @media screen and (max-width: ${MOBILE}) {
    padding: 12px;
  }
`;

export const LoadingContainer = styled.div`
  padding: 80px 20px;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;
  gap: 16px;
  text-align: center;
`;

export const EditorCanvas = styled.div`
  min-height: calc(100vh - 240px);
`;

export const DesignerLoadingContainer = styled(LoadingContainer)`
  width: 100%;
  min-height: calc(100vh - 240px);
  padding: 40px 20px;
`;

export const OverlayState = styled(DesignerLoadingContainer)`
  position: absolute;
  inset: 0;
  z-index: 1;
  background: ${color('neutral0')};
`;

export const ReadOnlyPreview = styled.iframe`
  width: 100%;
  height: calc(100vh - 360px);
  min-height: 400px;
  border: 1px solid rgba(128, 128, 128, 0.2);
  border-radius: 8px;
  background: #ffffff;
`;

export const ReadOnlyPanel = styled.div`
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;

  @media screen and (max-width: ${MOBILE}) {
    padding: 12px;
  }
`;

export const HiddenInput = styled.input`
  display: none;
`;

const outlineButton = css`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 16px;
  height: ${CONTROL_HEIGHT};
  background: ${color('neutral0')};
  border: 1px solid rgba(128, 128, 128, 0.2);
  border-radius: 4px;
  color: ${color('neutral800')};
  font-weight: 500;
  font-size: 13px;
  cursor: pointer;
  transition: all 200ms;
  white-space: nowrap;

  &:hover:not(:disabled) {
    background: ${color('neutral100')};
    border-color: ${accent.primary};
    color: ${accent.primary};
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(14, 165, 233, 0.15);
  }

  &:active:not(:disabled) {
    transform: translateY(0);
  }

  &:focus-visible {
    outline: 2px solid ${accent.primary};
    outline-offset: 2px;
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  svg {
    width: 14px;
    height: 14px;
  }

  ${reducedMotion}
`;

export const ToolbarButton = styled.button`
  ${outlineButton}
`;

export const SaveButton = styled(Button)`
  && {
    background: linear-gradient(135deg, ${brand.success} 0%, ${brand.successHover} 100%);
    border: none;
    color: #ffffff;
    font-weight: 600;
    font-size: 13px;
    padding: 8px 16px;
    height: ${CONTROL_HEIGHT};
    box-shadow: 0 2px 8px rgba(21, 128, 61, 0.3);
    transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);

    &:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(21, 128, 61, 0.4);
      background: ${brand.successHover};
    }

    &:active:not(:disabled) {
      transform: translateY(0);
    }

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    svg {
      width: 14px;
      height: 14px;
    }

    ${reducedMotion}
  }
`;

export const BackButton = styled.button`
  background: ${color('neutral0')};
  border: 1px solid rgba(128, 128, 128, 0.2);
  color: ${color('neutral800')};
  border-radius: 4px;
  padding: 8px 10px;
  height: ${CONTROL_HEIGHT};
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 200ms;

  &:hover {
    background: ${color('neutral100')};
    border-color: rgba(128, 128, 128, 0.3);
    transform: translateY(-1px);
  }

  &:active {
    transform: translateY(0);
  }

  &:focus-visible {
    outline: 2px solid ${accent.primary};
    outline-offset: 2px;
  }

  svg {
    width: 16px;
    height: 16px;
  }

  ${reducedMotion}
`;

// ================ VERSION HISTORY SIDE SHEET ================
const slideIn = keyframes`
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
`;

const slideOut = keyframes`
  from { transform: translateX(0); }
  to { transform: translateX(100%); }
`;

/** DS Modal (Radix dialog: focus trap, Esc, aria-modal) styled as the right side sheet. */
export const VersionSheet = styled(Modal.Content)`
  && {
    top: 0;
    right: 0;
    bottom: 0;
    left: auto;
    transform: none;
    margin: 0;
    width: min(450px, 100vw);
    max-width: 100vw;
    height: 100vh;
    max-height: 100vh;
    border-radius: 0;
    box-shadow: -4px 0 24px rgba(0, 0, 0, 0.15);
    display: flex;
    flex-direction: column;

    @media (prefers-reduced-motion: no-preference) {
      &[data-state='open'] {
        animation: ${slideIn} 300ms cubic-bezier(0.4, 0, 0.2, 1);
      }
      &[data-state='closed'] {
        animation: ${slideOut} 200ms cubic-bezier(0.4, 0, 0.2, 1);
      }
    }
  }
`;

export const VersionSheetHeader = styled(Modal.Header)`
  && {
    padding: 24px;
    background: ${color('neutral0')};
    border-bottom: 1px solid rgba(128, 128, 128, 0.2);
    gap: 8px;
    flex-wrap: wrap;
  }
`;

export const VersionSheetTitle = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  color: ${color('neutral800')};
  flex: 1;
  min-width: 0;

  svg {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
  }
`;

export const VersionModalContent = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 16px;
`;

export const VersionList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
`;

export const VersionItem = styled.li`
  padding: 16px;
  border: 1px solid rgba(128, 128, 128, 0.2);
  border-radius: 8px;
  margin-bottom: 12px;
  transition: all 150ms;

  &:hover {
    border-color: ${accent.primary};
    box-shadow: 0 2px 8px rgba(14, 165, 233, 0.15);
  }

  ${reducedMotion}
`;

export const VersionItemHeader = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
`;

export const VersionNumber = styled.div`
  font-weight: 600;
  color: ${color('neutral800')};
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  overflow-wrap: anywhere;
`;

export const VersionBadge = styled.span`
  background: linear-gradient(135deg, ${brand.primary} 0%, ${brand.primaryHover} 100%);
  color: #ffffff;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: ${fontSize(1)};
  font-weight: 600;
`;

export const VersionDate = styled.div`
  font-size: 13px;
  color: ${color('neutral600')};
`;

export const VersionMeta = styled.div`
  font-size: 13px;
  color: ${color('neutral600')};
  margin-bottom: 12px;
  overflow-wrap: anywhere;
`;

export const VersionActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const filledSmall = css`
  && {
    border: none;
    color: #ffffff;
    font-size: 13px;
    padding: 8px 16px;
    transition: all 200ms;

    &:hover:not(:disabled) {
      transform: translateY(-1px);
      border-color: transparent;
    }

    svg {
      width: 14px;
      height: 14px;
    }

    ${reducedMotion}
  }
`;

export const RestoreButton = styled(Button)`
  ${filledSmall}
  && {
    background: linear-gradient(135deg, ${brand.success} 0%, ${brand.successHover} 100%);

    &:hover:not(:disabled) {
      background: ${brand.successHover};
      box-shadow: 0 4px 12px rgba(21, 128, 61, 0.3);
    }
  }
`;

export const DeleteButton = styled(Button)`
  ${filledSmall}
  && {
    background: linear-gradient(135deg, ${brand.danger} 0%, ${brand.dangerHover} 100%);

    &:hover:not(:disabled) {
      background: ${brand.dangerHover};
      box-shadow: 0 4px 12px rgba(220, 38, 38, 0.3);
    }
  }
`;

export const EmptyVersions = styled.div`
  text-align: center;
  padding: 60px 20px;
  color: ${color('neutral600')};
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

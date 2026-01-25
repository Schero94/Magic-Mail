/**
 * Styled Button Components for MagicMail
 * Consistent button styling across all pages
 */
import styled, { css } from 'styled-components';
import { Button } from '@strapi/design-system';

// ================ PRIMARY GRADIENT BUTTON ================
export const GradientButton = styled(Button)`
  && {
    background: linear-gradient(135deg, #0EA5E9 0%, #A855F7 100%);
    color: white;
    font-weight: 600;
    border: none;
    padding: 10px 20px;
    min-height: 40px;
    transition: all 0.2s ease;
    
    &:hover:not(:disabled) {
      background: linear-gradient(135deg, #0284C7 0%, #9333EA 100%);
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(14, 165, 233, 0.3);
    }
    
    &:active:not(:disabled) {
      transform: translateY(0);
    }
    
    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }
`;

// ================ SECONDARY BUTTON (Gradient Outline) ================
export const SecondaryButton = styled(Button)`
  && {
    background: white;
    color: #7C3AED;
    font-weight: 600;
    border: 2px solid transparent;
    background-image: linear-gradient(white, white), linear-gradient(135deg, #0EA5E9 0%, #A855F7 100%);
    background-origin: border-box;
    background-clip: padding-box, border-box;
    padding: 10px 20px;
    min-height: 40px;
    transition: all 0.2s ease;
    
    &:hover:not(:disabled) {
      background: linear-gradient(135deg, #0EA5E9 0%, #A855F7 100%);
      background-clip: padding-box;
      color: white;
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(168, 85, 247, 0.3);
    }
    
    &:active:not(:disabled) {
      transform: translateY(0);
    }
    
    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }
`;

// ================ TERTIARY/GHOST BUTTON ================
export const TertiaryButton = styled(Button)`
  && {
    background: transparent;
    color: ${props => props.theme.colors.neutral600};
    font-weight: 500;
    border: 1px solid ${props => props.theme.colors.neutral200};
    padding: 10px 20px;
    min-height: 40px;
    transition: all 0.2s ease;
    
    &:hover:not(:disabled) {
      background: ${props => props.theme.colors.neutral100};
      border-color: ${props => props.theme.colors.neutral300};
      color: ${props => props.theme.colors.neutral800};
    }
    
    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }
`;

// ================ DANGER BUTTON ================
export const DangerButton = styled(Button)`
  && {
    background: #FEE2E2;
    color: #DC2626;
    font-weight: 600;
    border: 1px solid #FECACA;
    padding: 10px 20px;
    min-height: 40px;
    transition: all 0.2s ease;
    
    &:hover:not(:disabled) {
      background: #DC2626;
      color: white;
      border-color: #DC2626;
    }
    
    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }
`;

// ================ SUCCESS BUTTON ================
export const SuccessButton = styled(Button)`
  && {
    background: linear-gradient(135deg, #10B981 0%, #059669 100%);
    color: white;
    font-weight: 600;
    border: none;
    padding: 10px 20px;
    min-height: 40px;
    transition: all 0.2s ease;
    
    &:hover:not(:disabled) {
      background: linear-gradient(135deg, #059669 0%, #047857 100%);
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
    }
    
    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }
`;

// ================ ICON BUTTON (Small, for actions) ================
export const IconButton = styled(Button)`
  && {
    background: linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%);
    color: #64748B;
    border: 1px solid #E2E8F0;
    padding: 8px;
    min-width: 38px;
    min-height: 38px;
    width: 38px;
    height: 38px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
    
    svg {
      width: 18px;
      height: 18px;
    }
    
    &:hover:not(:disabled) {
      background: linear-gradient(135deg, #0EA5E9 0%, #0284C7 100%);
      border-color: #0EA5E9;
      color: white;
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(14, 165, 233, 0.25);
    }
    
    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }
`;

// ================ ICON BUTTON DANGER ================
export const IconButtonDanger = styled(Button)`
  && {
    background: linear-gradient(135deg, #FEF2F2 0%, #FEE2E2 100%);
    color: #EF4444;
    border: 1px solid #FECACA;
    padding: 8px;
    min-width: 38px;
    min-height: 38px;
    width: 38px;
    height: 38px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
    
    svg {
      width: 18px;
      height: 18px;
    }
    
    &:hover:not(:disabled) {
      background: linear-gradient(135deg, #EF4444 0%, #DC2626 100%);
      border-color: #EF4444;
      color: white;
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
    }
    
    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }
`;

// ================ ICON BUTTON PRIMARY ================
export const IconButtonPrimary = styled(Button)`
  && {
    background: linear-gradient(135deg, #F0F9FF 0%, #E0F2FE 100%);
    color: #0EA5E9;
    border: 1px solid #BAE6FD;
    padding: 8px;
    min-width: 38px;
    min-height: 38px;
    width: 38px;
    height: 38px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
    
    svg {
      width: 18px;
      height: 18px;
    }
    
    &:hover:not(:disabled) {
      background: linear-gradient(135deg, #0EA5E9 0%, #0284C7 100%);
      border-color: #0EA5E9;
      color: white;
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(14, 165, 233, 0.3);
    }
    
    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }
`;

// ================ ICON BUTTON SUCCESS ================
export const IconButtonSuccess = styled(Button)`
  && {
    background: linear-gradient(135deg, #F0FDF4 0%, #DCFCE7 100%);
    color: #22C55E;
    border: 1px solid #BBF7D0;
    padding: 8px;
    min-width: 38px;
    min-height: 38px;
    width: 38px;
    height: 38px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
    
    svg {
      width: 18px;
      height: 18px;
    }
    
    &:hover:not(:disabled) {
      background: linear-gradient(135deg, #22C55E 0%, #16A34A 100%);
      border-color: #22C55E;
      color: white;
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(34, 197, 94, 0.3);
    }
    
    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }
`;

// ================ ICON BUTTON WARNING ================
export const IconButtonWarning = styled(Button)`
  && {
    background: linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%);
    color: #F59E0B;
    border: 1px solid #FDE68A;
    padding: 8px;
    min-width: 38px;
    min-height: 38px;
    width: 38px;
    height: 38px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
    
    svg {
      width: 18px;
      height: 18px;
    }
    
    &:hover:not(:disabled) {
      background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%);
      border-color: #F59E0B;
      color: white;
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);
    }
    
    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }
`;

// ================ ICON BUTTON PURPLE (for special actions) ================
export const IconButtonPurple = styled(Button)`
  && {
    background: linear-gradient(135deg, #FAF5FF 0%, #F3E8FF 100%);
    color: #A855F7;
    border: 1px solid #E9D5FF;
    padding: 8px;
    min-width: 38px;
    min-height: 38px;
    width: 38px;
    height: 38px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
    
    svg {
      width: 18px;
      height: 18px;
    }
    
    &:hover:not(:disabled) {
      background: linear-gradient(135deg, #A855F7 0%, #9333EA 100%);
      border-color: #A855F7;
      color: white;
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(168, 85, 247, 0.3);
    }
    
    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }
`;

// ================ LARGE CTA BUTTON ================
export const CTAButton = styled(Button)`
  && {
    background: linear-gradient(135deg, #0EA5E9 0%, #A855F7 100%);
    color: white;
    font-weight: 700;
    font-size: 1rem;
    border: none;
    padding: 14px 28px;
    min-height: 52px;
    border-radius: 12px;
    transition: all 0.2s ease;
    box-shadow: 0 4px 14px rgba(14, 165, 233, 0.25);
    
    &:hover:not(:disabled) {
      background: linear-gradient(135deg, #0284C7 0%, #9333EA 100%);
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(14, 165, 233, 0.35);
    }
    
    &:active:not(:disabled) {
      transform: translateY(0);
    }
    
    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }
`;

// ================ LINK STYLE BUTTON ================
export const LinkButton = styled(Button)`
  && {
    background: transparent;
    color: #0EA5E9;
    font-weight: 500;
    border: none;
    padding: 4px 8px;
    min-height: auto;
    text-decoration: underline;
    transition: all 0.2s ease;
    
    &:hover:not(:disabled) {
      color: #0284C7;
      text-decoration: none;
    }
    
    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }
`;

// ================ WHITE OUTLINE BUTTON (for gradient backgrounds) ================
export const WhiteOutlineButton = styled(Button)`
  && {
    background: rgba(255, 255, 255, 0.15);
    color: white;
    font-weight: 600;
    border: 2px solid rgba(255, 255, 255, 0.4);
    padding: 8px 16px;
    min-height: 38px;
    border-radius: 8px;
    backdrop-filter: blur(4px);
    transition: all 0.2s ease;
    
    &:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.25);
      border-color: rgba(255, 255, 255, 0.6);
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }
    
    &:active:not(:disabled) {
      transform: translateY(0);
    }
    
    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }
`;

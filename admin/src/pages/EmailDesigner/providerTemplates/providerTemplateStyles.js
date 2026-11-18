/**
 * Styles of the provider template dialogs. Theme tokens only (dark mode),
 * DS spacing, no fixed widths so the dialogs shrink to 320px.
 */
import styled from 'styled-components';
import { color, theme, LIGHT_FALLBACK_COLORS } from '../../../utils/theme';

/**
 * Sandboxed email preview (no scripts, no same-origin access). The email is
 * shown on the light DS canvas in both admin themes, like a mail client:
 * provider templates rarely set a text colour, so a dark canvas would render
 * black text on a dark background.
 */
export const PreviewFrame = styled.iframe`
  display: block;
  width: 100%;
  height: 320px;
  border: 1px solid ${color('neutral200')};
  border-radius: ${theme.borderRadius.md};
  background: ${LIGHT_FALLBACK_COLORS.neutral0};
  color-scheme: light;

  ${({ theme: dsTheme }) => dsTheme.breakpoints?.medium ?? '@media (min-width: 768px)'} {
    height: 420px;
  }
`;

/** Detected variables as a wrapping list of name + badge pairs. */
export const VariableList = styled.ul`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme: dsTheme }) => dsTheme.spaces[2]};
  margin: 0;
  padding: 0;
  list-style: none;
`;

export const VariableItem = styled.li`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme: dsTheme }) => dsTheme.spaces[2]};
  max-width: 100%;
  padding: ${({ theme: dsTheme }) => `${dsTheme.spaces[1]} ${dsTheme.spaces[2]}`};
  border: 1px solid ${color('neutral200')};
  border-radius: ${theme.borderRadius.sm};
  background: ${color('neutral100')};

  code {
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    font-size: ${({ theme: dsTheme }) => dsTheme.fontSizes[1]};
    color: ${color('neutral800')};
    overflow-wrap: anywhere;
  }
`;

/** Read-only converted HTML for "Convert for provider". */
export const ConvertedCode = styled.pre`
  margin: 0;
  max-height: 280px;
  overflow: auto;
  padding: ${({ theme: dsTheme }) => dsTheme.spaces[4]};
  border: 1px solid ${color('neutral200')};
  border-radius: ${theme.borderRadius.md};
  background: ${color('neutral100')};
  color: ${color('neutral800')};
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  font-size: ${({ theme: dsTheme }) => dsTheme.fontSizes[1]};
  white-space: pre-wrap;
  overflow-wrap: anywhere;
`;

/** The template key under the name: small, secondary, copyable. */
export const KeyText = styled.code`
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  font-size: ${({ theme: dsTheme }) => dsTheme.fontSizes[1]};
  color: ${color('neutral600')};
  overflow-wrap: anywhere;
`;

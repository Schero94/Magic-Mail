import { Typography } from '@strapi/design-system';
import { Page } from '@strapi/strapi/admin';
import styled from 'styled-components';
import { useMagicMailIntl } from '../../hooks/useMagicMailIntl';

/**
 * Sets the browser tab title to "<page> | MagicMail".
 * Render it once per view (the editor and settings page render their own;
 * App.jsx renders it for the four tabs).
 *
 * @param {{children: string}} props
 */
export const PluginPageTitle = ({ children }) => {
  const { t } = useMagicMailIntl();
  return <Page.Title>{t('common.pageTitle', '{page} | MagicMail', { page: children })}</Page.Title>;
};

/**
 * Section heading (h2) with the current section heading look
 * (delta, neutral700, 15px semibold).
 */
export const SectionHeading = styled(Typography).attrs((props) => ({
  tag: props.tag ?? 'h2',
  variant: props.variant ?? 'delta',
  textColor: props.textColor ?? 'neutral700',
}))`
  && {
    font-size: 1.5rem;
    font-weight: 600;
  }
`;

/**
 * Sub-section heading (h3) for cards and modal sections.
 */
export const SubsectionHeading = styled(Typography).attrs((props) => ({
  tag: props.tag ?? 'h3',
  variant: props.variant ?? 'delta',
  textColor: props.textColor ?? 'neutral800',
}))``;

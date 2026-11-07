/**
 * Mirrors the Magic Link table design; keep in sync.
 *
 * Source: strapi-plugin-magic-link admin/src/pages/Tokens/securityTabs.shared.jsx
 * (filter bar, rounded data table with the neutral header band, phone card
 * layout, empty/error/loading states, pagination) and
 * pages/Tokens/components/tokenStyles.js (StatusBadge). The code is copied
 * as-is; MagicMail differences are marked "MagicMail:" below:
 * - `useMagicMailIntl` instead of `useMagicLinkIntl`, and the translation ids
 *   live in the MagicMail locale files;
 * - `td.cell-wrap` lets long recipients, subjects and match values wrap;
 * - `EmptyState` accepts extra `children` (template onboarding list) and
 *   `LoadErrorState` an optional `description`;
 * - `StatusBadge` adds the `neutral` and `secondary` tones;
 * - the Magic Link-only `.agent-text` rule is left out.
 *
 * Usage (see the foundation guide):
 *
 *   <FilterBar role="search" aria-label={...}>
 *     <FilterSearch><SearchField ... /></FilterSearch>
 *     <FilterSelect><SingleSelect ... /></FilterSelect>
 *     <FilterActions><Button size="L" ...>Refresh</Button></FilterActions>
 *   </FilterBar>
 *   <DataTable aria-label={...}>
 *     <StyledTable colCount={n} rowCount={rows.length + 1}>
 *       ...<Td data-label={columnLabel}>...</Td>  // label of the phone card row
 *       ...<Td data-label="">row actions</Td>      // empty label: actions footer
 *     </StyledTable>
 *     <TablePagination ... />
 *   </DataTable>
 */
import styled from 'styled-components';
import {
  Box,
  Button,
  Dots,
  Flex,
  Loader,
  NextLink,
  PageLink,
  Pagination,
  PreviousLink,
  SingleSelect,
  SingleSelectOption,
  Table,
  Typography,
} from '@strapi/design-system';
import { ArrowClockwise, WarningCircle } from '@strapi/icons';
import { useMagicMailIntl } from '../../../hooks/useMagicMailIntl';
import { useFormatters } from '../../../hooks/useFormatters';
import { accent, color, fontSize } from '../../../utils/theme';
import { reducedMotion } from '../motion';
import { breakpoints, space, tableTheme as theme, tint } from './tableTheme';
import { getPageItems, PAGE_SIZES } from './tableUtils';

/**
 * Empty-state icon colour sets: icon accent plus a tinted icon background.
 * `secondary` (purple) has no shared tint, so it comes from `tint.secondary`.
 */
const STATE_TONES = Object.freeze({
  primary: { fg: accent.primary, bg: tint.primary.bg },
  success: { fg: accent.success, bg: tint.success.bg },
  warning: { fg: accent.warning, bg: tint.warning.bg },
  danger: { fg: accent.danger, bg: tint.danger.bg },
  secondary: { fg: accent.secondary, bg: tint.secondary.bg },
});

const toneOf = (props) => STATE_TONES[props.$tone] || STATE_TONES.primary;

/* ---------------------------- filter bar --------------------------- */

export const FilterBar = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: ${space(2)};
  background: ${color('neutral0')};
  border: 1px solid ${color('neutral200')};
  border-radius: ${theme.borderRadius.lg};
  box-shadow: ${theme.shadows.sm};
  padding: ${space(4)};
  margin-bottom: ${space(6)};

  > * {
    min-width: 0;
  }
`;

export const FilterSearch = styled.div`
  flex: 1 1 240px;

  @media (max-width: ${breakpoints.mobile}) {
    flex-basis: 100%;
  }
`;

export const FilterSelect = styled.div`
  flex: 0 1 180px;

  @media (max-width: ${breakpoints.mobile}) {
    flex: 1 1 140px;
  }
`;

export const FilterActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${space(2)};
  margin-left: auto;

  @media (max-width: ${breakpoints.mobile}) {
    margin-left: 0;
    flex: 1 1 100%;

    > * {
      flex: 1 1 0;
      min-width: 0;
    }
  }
`;

/**
 * Entries-per-page select (40px, labelled).
 * @param {{value: number, onChange: (value: number) => void, sizes?: readonly number[]}} props
 */
export const PageSizeSelect = ({ value, onChange, sizes = PAGE_SIZES }) => {
  const { t } = useMagicMailIntl();
  return (
    <SingleSelect
      aria-label={t('common.entriesPerPage', 'Entries per page')}
      value={String(value)}
      onChange={(next) => onChange(parseInt(next, 10) || sizes[0])}
    >
      {sizes.map((size) => (
        <SingleSelectOption key={size} value={String(size)}>
          {t('common.entries', '{count} entries', { count: size })}
        </SingleSelectOption>
      ))}
    </SingleSelect>
  );
};

/* ------------------------------ table ------------------------------ */

export const DataTable = styled.section`
  background: ${color('neutral0')};
  border: 1px solid ${color('neutral200')};
  border-radius: ${theme.borderRadius.xl};
  box-shadow: ${theme.shadows.sm};
  overflow: hidden;

  /* DS 2.2.4 Table renders its own bordered, shadowed wrapper and a scroll
     container with 24px side padding. Inside this card that drew a second
     frame and inset the header band, so both are flattened: the header band
     spans the card and the first column lines up with the filter bar. */
  > div:has(table) {
    background: transparent;
    border: none;
    border-radius: 0;
    box-shadow: none;
  }

  div:has(> table) {
    padding-left: 0;
    padding-right: 0;
  }

  /* Phones: the rows are cards of their own, so the frame around them goes
     away and the cards line up with the filter bar (as in the Tokens tab).
     Loading, error and empty states keep the frame. */
  @media (max-width: ${breakpoints.mobile}) {
    &:has(table) {
      overflow: visible;
      background: transparent;
      border: none;
      border-radius: 0;
      box-shadow: none;
    }
  }
`;

export const StyledTable = styled(Table)`
  thead {
    background: ${color('neutral100')};
    border-bottom: 1px solid ${color('neutral200')};

    th {
      padding: ${space(4)};
      color: ${color('neutral800')};
      font-size: ${fontSize(0)};
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
  }

  tbody tr {
    border-bottom: 1px solid ${color('neutral150')};
    transition: background ${theme.transitions.fast};

    &:last-child {
      border-bottom: none;
    }

    /* Only on devices that hover: on touch screens the tint stuck to the
       last tapped card and read as a selection. */
    @media (hover: hover) {
      &:hover {
        background: ${(props) =>
          props.$hover === 'danger' ? color('danger100')(props) : color('primary100')(props)};
      }
    }

    td {
      padding: ${space(4)};
      color: ${color('neutral800')};
    }

    /* MagicMail: long recipients, subjects, descriptions and match values
       wrap instead of widening the table (DS cells are nowrap). */
    td.cell-wrap {
      white-space: normal;
      overflow-wrap: anywhere;
    }

    ${reducedMotion}
  }

  /* DS checkboxes are 20px (flex: 0 0 20px); 24px keeps the row selectors
     at the desktop target size (32px on phones, below). */
  button[role='checkbox'] {
    flex-basis: 24px;
    width: 24px;
    height: 24px;
  }

  /* 769-1199px: 8px side padding and wrapping dates, so every column,
     including the row actions, fits without horizontal scrolling (same step
     as the Tokens table). */
  @media (max-width: ${breakpoints.tableCompact}) {
    thead th,
    tbody tr td {
      padding-left: ${space(2)};
      padding-right: ${space(2)};
    }

    tbody tr td.cell-date {
      white-space: normal;
      text-wrap: balance;
    }
  }

  /* DS gives a checkbox cell 4px side padding, which put the selector 4px
     from the card edge once the scroll padding was removed. */
  && thead th:first-child,
  && tbody td:first-child {
    padding-left: ${space(4)};
  }

  /* The outer columns keep 16px at every width, so the rows stay symmetric
     inside the card when the compact step narrows the inner padding. */
  && thead th:last-child,
  && tbody td:last-child {
    padding-right: ${space(4)};
  }

  @media (max-width: ${breakpoints.mobile}) {
    display: block;

    button[role='checkbox'] {
      flex-basis: 32px;
      width: 32px;
      height: 32px;
    }

    && tbody td:first-child,
    && tbody td:last-child {
      padding-left: 0;
      padding-right: 0;
    }

    thead {
      display: none;
    }

    tbody {
      display: block;
    }

    tbody tr {
      display: block;
      margin: 0 0 ${space(4)};
      padding: ${space(4)};
      background: ${color('neutral0')};
      border: 1px solid ${color('neutral200')};
      border-radius: ${theme.borderRadius.lg};
      box-shadow: ${theme.shadows.sm};

      &:last-child {
        margin-bottom: 0;
        border-bottom: 1px solid ${color('neutral200')};
      }
    }

    tbody tr td {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: ${space(3)};
      padding: ${space(2)} 0;
      min-width: 0;
      text-align: right;

      &:not(:last-child) {
        border-bottom: 1px solid ${color('neutral150')};
      }

      &::before {
        content: attr(data-label);
        flex-shrink: 0;
        font-size: ${fontSize(1)};
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: ${color('neutral600')};
        text-align: left;
      }

      &[data-label='']::before {
        display: none;
      }

      /* Row actions sit at the end of the card, like a footer. */
      &[data-label='']:last-child {
        justify-content: flex-end;
      }
    }
  }
`;

/** Column header that holds a sort button (keeps the uppercase label and the button aligned). */
export const SortHeader = styled.span`
  display: inline-flex;
  align-items: center;
  gap: ${space(1)};
`;

export const Avatar = styled.span`
  width: 36px;
  height: 36px;
  border-radius: ${theme.borderRadius.full};
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: ${(props) => props.$background};

  svg {
    width: 16px;
    height: 16px;
  }

  svg path {
    fill: #ffffff;
  }
`;

export const MonoText = styled.span`
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: ${fontSize(2)};
  font-weight: 600;
  color: ${color('neutral800')};
  /* DS table cells are nowrap; long values may break on phones. */
  white-space: normal;
  overflow-wrap: anywhere;
  min-width: 0;
`;

export const ActionBar = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: ${space(2)};
  padding: ${space(4)};
  margin-bottom: ${space(4)};
  background: ${tint.primary.bg};
  border: 1px solid ${tint.primary.border};
  border-radius: ${theme.borderRadius.lg};
  color: ${color('neutral800')};
`;

/**
 * State badge: DS Badge metrics (11px semi-bold caps) in the Magic Link tints.
 * Source: tokenStyles.js StatusBadge. MagicMail: `neutral` and `secondary`
 * tones added for inactive rows and category/priority labels.
 * @example <StatusBadge $tone="success">{t('...', 'Active')}</StatusBadge>
 */
export const StatusBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: ${space(1)};
  padding: 3px ${space(2)};
  border: 1px solid ${(p) => (tint[p.$tone] ?? tint.neutral).border(p)};
  border-radius: ${theme.borderRadius.sm};
  background: ${(p) => (tint[p.$tone] ?? tint.neutral).bg(p)};
  color: ${(p) => (tint[p.$tone] ?? tint.neutral).fg(p)};
  font-size: ${fontSize(0)};
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  white-space: nowrap;

  svg {
    width: 12px;
    height: 12px;
    flex-shrink: 0;
  }

  svg path {
    fill: currentColor;
  }
`;

/* --------------------------- empty / states --------------------------- */

const EmptyBox = styled.div`
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 320px;
  padding: ${space(7)};
  text-align: center;
  background: ${color('neutral0')};

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, rgba(2, 132, 199, 0.08) 0%, rgba(147, 51, 234, 0.08) 100%);
    pointer-events: none;
  }

  > * {
    position: relative;
    width: 100%;
    max-width: 560px;
  }

  @media (max-width: ${breakpoints.mobile}) {
    min-height: 0;
    padding: ${space(6)} ${space(4)};
  }
`;

const EmptyIcon = styled.span`
  width: 96px;
  height: 96px;
  border-radius: ${theme.borderRadius.full};
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${(props) => toneOf(props).bg(props)};
  box-shadow: ${theme.shadows.lg};

  svg {
    width: 48px;
    height: 48px;
  }

  svg path {
    fill: ${(props) => toneOf(props).fg(props)};
  }
`;

/**
 * Empty, no-match and error states inside the table card.
 * @param {{icon: Function, tone?: string, title: string, description?: string, actions?: import('react').ReactNode, role?: string, headingTag?: string, children?: import('react').ReactNode}} props
 */
export const EmptyState = ({
  icon: Icon,
  tone = 'primary',
  title,
  description,
  actions,
  role,
  headingTag = 'h3',
  children,
}) => (
  <EmptyBox role={role}>
    <Flex direction="column" alignItems="center" gap={4}>
      <EmptyIcon $tone={tone} aria-hidden="true">
        <Icon />
      </EmptyIcon>
      <Typography tag={headingTag} variant="beta" textColor="neutral800">
        {title}
      </Typography>
      {description ? (
        <Typography variant="omega" textColor="neutral600" style={{ maxWidth: '400px' }}>
          {description}
        </Typography>
      ) : null}
      {children}
      {actions ? (
        <Flex gap={2} wrap="wrap" justifyContent="center" paddingTop={2}>
          {actions}
        </Flex>
      ) : null}
    </Flex>
  </EmptyBox>
);

/**
 * Load error with a retry button, rendered in place of the table.
 * @param {{message: string, description?: string, onRetry: () => void, isRetrying?: boolean}} props
 */
export const LoadErrorState = ({ message, description, onRetry, isRetrying = false }) => {
  const { t } = useMagicMailIntl();
  return (
    <EmptyState
      icon={WarningCircle}
      tone="danger"
      role="alert"
      title={message}
      description={description ?? t('common.error.generic', 'An error occurred')}
      actions={
        <Button
          variant="secondary"
          size="L"
          startIcon={<ArrowClockwise aria-hidden="true" />}
          onClick={onRetry}
          loading={isRetrying}
        >
          {t('common.table.retry', 'Try again')}
        </Button>
      }
    />
  );
};

/** In-content loader (no full-screen overlay, no rotate wrapper). */
export const LoadingState = ({ label }) => (
  <Flex justifyContent="center" alignItems="center" padding={8} style={{ minHeight: '320px' }}>
    <Loader>{label}</Loader>
  </Flex>
);

/* ---------------------------- pagination ---------------------------- */

const PaginationWrap = styled(Box)`
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: ${space(2)};
  padding: ${space(4)};
  border-top: 1px solid ${color('neutral150')};

  @media (max-width: ${breakpoints.mobile}) {
    justify-content: center;
    padding: ${space(4)} 0 0;
    border-top: none;

    nav a,
    nav button {
      min-width: 32px;
      min-height: 32px;
    }
  }
`;

/**
 * DS pagination with ellipses and keyboard-reachable buttons, plus a
 * "Showing x-y of z" summary.
 * @param {{page: number, pageCount: number, total: number, pageSize: number, onChange: (page: number) => void, label?: string}} props
 */
export const TablePagination = ({ page, pageCount, total, pageSize, onChange, label }) => {
  const { t } = useMagicMailIntl();
  const { formatNumber } = useFormatters();
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const go = (next) => (event) => {
    event.preventDefault();
    if (next >= 1 && next <= pageCount && next !== page) onChange(next);
  };

  return (
    <PaginationWrap>
      <Typography variant="pi" textColor="neutral600" aria-live="polite">
        {t('common.table.pagination.summary', 'Showing {from}-{to} of {total}', {
          from: formatNumber(from),
          to: formatNumber(to),
          total: formatNumber(total),
        })}
      </Typography>
      {pageCount > 1 ? (
        <Pagination
          activePage={page}
          pageCount={pageCount}
          label={label ?? t('common.table.pagination.label', 'Pagination')}
        >
          <PreviousLink tag="button" type="button" onClick={go(page - 1)}>
            {t('common.previous', 'Previous')}
          </PreviousLink>
          {getPageItems(page, pageCount).map((item) =>
            typeof item === 'number' ? (
              <PageLink key={item} tag="button" type="button" number={item} onClick={go(item)}>
                {t('common.table.pagination.goTo', 'Go to page {page}', { page: item })}
              </PageLink>
            ) : (
              <Dots key={item}>{t('common.table.pagination.more', 'More pages')}</Dots>
            )
          )}
          <NextLink tag="button" type="button" onClick={go(page + 1)}>
            {t('common.next', 'Next')}
          </NextLink>
        </Pagination>
      ) : null}
    </PaginationWrap>
  );
};

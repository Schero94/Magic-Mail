import { useState } from 'react';
import { Typography } from '@strapi/design-system';
import { ChevronDownIcon, ChevronRightIcon, LockClosedIcon } from '@heroicons/react/24/outline';
import styled from 'styled-components';
import { StatusBadge, breakpoints, space } from '../shared/table';
import { useMagicMailIntl } from '../../hooks/useMagicMailIntl';
import { color, theme } from '../../utils/theme';
import { childEntries, truncateValue, valueKind } from '../../utils/emailPreview.mjs';

const List = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid ${color('neutral200')};
  border-radius: ${theme.borderRadius.md};
  overflow: hidden;
`;

const NestedList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  border-top: 1px solid ${color('neutral150')};
`;

const Row = styled.li`
  border-top: 1px solid ${color('neutral150')};

  &:first-child {
    border-top: 0;
  }
`;

/** Key | value grid; the key column shrinks first on phones. */
const Line = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
  gap: ${space(3)};
  align-items: start;
  padding: ${space(2)} ${space(4)};
  padding-left: calc(${space(4)} + ${(p) => p.$depth * 16}px);
  min-width: 0;
`;

const KeyText = styled.span`
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 1.3rem;
  font-weight: 600;
  color: ${color('neutral800')};
  overflow-wrap: anywhere;
  min-width: 0;
`;

const ValueBox = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: ${space(1)};
  min-width: 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
`;

const PlainButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: ${space(1)};
  min-height: 24px;
  padding: 0;
  border: 0;
  background: none;
  color: ${color('primary600')};
  font: inherit;
  font-size: 1.3rem;
  font-weight: 600;
  cursor: pointer;
  text-align: left;

  &:focus-visible {
    outline: 2px solid ${color('primary600')};
    outline-offset: 2px;
    border-radius: ${theme.borderRadius.sm};
  }

  svg {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
  }

  @media (max-width: ${breakpoints.mobile}) {
    min-height: 32px;
  }
`;

/**
 * A long text value with "Show more" / "Show less".
 *
 * @param {{value: string}} props
 * @returns {JSX.Element}
 */
const LongText = ({ value }) => {
  const { t } = useMagicMailIntl();
  const [expanded, setExpanded] = useState(false);
  const { text, truncated } = truncateValue(value);
  return (
    <ValueBox>
      <Typography variant="omega" textColor="neutral800">
        {expanded ? value : text}
      </Typography>
      {truncated ? (
        <PlainButton type="button" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
          {expanded
            ? t('analytics.detail.variables.showLess', 'Show less')
            : t('analytics.detail.variables.showMore', 'Show more')}
        </PlainButton>
      ) : null}
    </ValueBox>
  );
};

/**
 * One variable: key and value; objects and arrays expand to their children.
 *
 * @param {{name: string, value: unknown, depth: number}} props
 * @returns {JSX.Element}
 */
const VariableRow = ({ name, value, depth }) => {
  const { t } = useMagicMailIntl();
  const kind = valueKind(value);
  const [open, setOpen] = useState(depth === 0 && childEntries(value).length <= 5);

  let rendered;
  if (kind === 'masked') {
    rendered = (
      <StatusBadge
        $tone="neutral"
        title={t(
          'analytics.detail.variables.maskedHint',
          'Hidden before storing because it looks like a secret.'
        )}
      >
        <LockClosedIcon aria-hidden="true" />
        {t('analytics.detail.variables.masked', 'Hidden')}
      </StatusBadge>
    );
  } else if (kind === 'empty') {
    rendered = (
      <Typography
        variant="omega"
        textColor="neutral600"
        aria-label={t('analytics.detail.variables.empty', 'Empty')}
      >
        —
      </Typography>
    );
  } else if (kind === 'object' || kind === 'array') {
    const count = childEntries(value).length;
    rendered = (
      <PlainButton type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {open ? <ChevronDownIcon aria-hidden="true" /> : <ChevronRightIcon aria-hidden="true" />}
        {kind === 'array'
          ? t('analytics.detail.variables.items', '{count, plural, one {# item} other {# items}}', {
              count,
            })
          : t(
              'analytics.detail.variables.fields',
              '{count, plural, one {# field} other {# fields}}',
              { count }
            )}
      </PlainButton>
    );
  } else if (kind === 'boolean') {
    rendered = (
      <Typography variant="omega" textColor="neutral800">
        {value
          ? t('analytics.detail.variables.true', 'Yes (true)')
          : t('analytics.detail.variables.false', 'No (false)')}
      </Typography>
    );
  } else {
    rendered = <LongText value={String(value)} />;
  }

  return (
    <Row>
      <Line $depth={depth}>
        <KeyText>{name}</KeyText>
        {kind === 'text' || kind === 'number' ? rendered : <ValueBox>{rendered}</ValueBox>}
      </Line>
      {(kind === 'object' || kind === 'array') && open ? (
        <NestedList>
          {childEntries(value).map(([childName, childValue]) => (
            <VariableRow key={childName} name={childName} value={childValue} depth={depth + 1} />
          ))}
        </NestedList>
      ) : null}
    </Row>
  );
};

/**
 * Readable key/value list of the stored (masked) variables of one email.
 * Nested objects and arrays expand; long values are shortened with
 * "Show more"; masked values show a "Hidden" badge.
 *
 * @param {{variables: object}} props
 * @returns {JSX.Element}
 */
export const VariablesTable = ({ variables }) => {
  const { t } = useMagicMailIntl();
  return (
    <List aria-label={t('analytics.detail.variables.label', 'Variables')}>
      {childEntries(variables).map(([name, value]) => (
        <VariableRow key={name} name={name} value={value} depth={0} />
      ))}
    </List>
  );
};

export default VariablesTable;

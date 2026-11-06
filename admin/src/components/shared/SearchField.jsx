import { forwardRef } from 'react';
import styled from 'styled-components';
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { brand, color, fontSize, theme } from '../../utils/theme';
import { reducedMotion } from './motion';
import { useMagicMailIntl } from '../../hooks/useMagicMailIntl';

const Wrapper = styled.div`
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
  min-width: 0;
`;

const Icon = styled(MagnifyingGlassIcon)`
  position: absolute;
  left: 12px;
  width: 16px;
  height: 16px;
  color: ${color('neutral600')};
  pointer-events: none;
`;

const Input = styled.input`
  width: 100%;
  padding: 10px 40px 10px 40px;
  border: 1px solid ${color('neutral200')};
  border-radius: ${theme.borderRadius.md};
  font-size: ${fontSize(2)};
  line-height: 1.43;
  transition: all ${theme.transitions.fast};
  background: ${color('neutral0')};
  color: ${color('neutral800')};

  &:focus {
    outline: none;
    border-color: ${brand.primary};
    box-shadow: 0 0 0 2px rgba(3, 105, 161, 0.2);
  }

  &:focus-visible {
    outline: 2px solid ${brand.primary};
    outline-offset: 1px;
  }

  &::placeholder {
    color: ${color('neutral500')};
  }

  &::-webkit-search-cancel-button {
    display: none;
  }

  ${reducedMotion}
`;

const ClearButton = styled.button`
  position: absolute;
  right: 8px;
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: ${color('neutral600')};
  cursor: pointer;

  &:hover {
    background: ${color('neutral150')};
    color: ${color('neutral800')};
  }

  &:focus-visible {
    outline: 2px solid ${brand.primary};
    outline-offset: 1px;
  }

  svg {
    width: 14px;
    height: 14px;
  }
`;

/**
 * Accessible search input with the MagicMail filter-bar look.
 *
 *   <SearchField
 *     label={t('accounts.search.label', 'Search accounts')}
 *     placeholder={t('accounts.search.placeholder', 'Search by name, email, or provider...')}
 *     value={searchQuery}
 *     onChange={setSearchQuery}
 *   />
 *
 * @param {object} props
 * @param {string} props.label - accessible name (required; placeholders are not labels)
 * @param {string} props.value
 * @param {(value: string) => void} props.onChange - receives the string value
 * @param {string} [props.placeholder]
 * @param {string} [props.clearLabel]
 */
export const SearchField = forwardRef(
  ({ label, value, onChange, placeholder, clearLabel, ...rest }, ref) => {
    const { t } = useMagicMailIntl();
    const hasValue = typeof value === 'string' && value.length > 0;

    return (
      <Wrapper role="search">
        <Icon aria-hidden="true" />
        <Input
          ref={ref}
          type="search"
          aria-label={label}
          value={value ?? ''}
          placeholder={placeholder}
          onChange={(event) => onChange?.(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && hasValue) {
              event.stopPropagation();
              onChange?.('');
            }
          }}
          autoComplete="off"
          {...rest}
        />
        {hasValue ? (
          <ClearButton
            type="button"
            aria-label={clearLabel ?? t('common.search.clear', 'Clear search')}
            onClick={() => onChange?.('')}
          >
            <XMarkIcon aria-hidden="true" />
          </ClearButton>
        ) : null}
      </Wrapper>
    );
  }
);

SearchField.displayName = 'SearchField';

export default SearchField;

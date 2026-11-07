import {
  Children,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import styled, { css, useTheme } from 'styled-components';
import { Box, IconButton, Tabs } from '@strapi/design-system';
import { ChevronLeft, ChevronRight } from '@strapi/icons';
import { prefersReducedMotion } from './motion';

/**
 * True while a CSS media query matches (window.matchMedia on a theme
 * breakpoint, like the Strapi admin's own useIsMobile), read through
 * useSyncExternalStore so the value is never stale.
 *
 * @param {string} query - Media query, with or without the leading `@media`
 * @returns {boolean}
 */
const useMediaQuery = (query) => {
  const clean = query.replace('@media', '').trim();
  const subscribe = useCallback(
    (onChange) => {
      const list = window.matchMedia(clean);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [clean]
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(clean).matches,
    () => true
  );
};

const Strip = styled(Box)`
  position: relative;
`;

/*
 * From the medium breakpoint the list is the Design System tab list
 * unchanged (equal-width tabs, like native Strapi tabbed screens). Below it
 * the five MagicMail sections do not fit, so the list scrolls inside its own
 * region; edge buttons show that more sections exist and scroll-padding keeps
 * a focused tab clear of them.
 */
const List = styled(Tabs.List)`
  ${({ $scroll, theme }) =>
    $scroll &&
    css`
      scrollbar-width: thin;
      scroll-padding-inline: ${theme.spaces[8]};

      [role='tab'] {
        flex: 0 0 auto;
        white-space: nowrap;
      }
    `}
`;

const EdgeButton = styled(IconButton)`
  && {
    position: absolute;
    top: 0;
    bottom: 0;
    z-index: 2;
    width: ${({ theme }) => theme.spaces[8]};
    height: auto;
    border: none;
    border-radius: 0;
    ${({ $side, theme }) =>
      $side === 'start'
        ? css`
            left: 0;
            justify-content: flex-start;
            padding-left: ${theme.spaces[1]};
            background: linear-gradient(to right, ${theme.colors.neutral100} 55%, transparent);
          `
        : css`
            right: 0;
            justify-content: flex-end;
            padding-right: ${theme.spaces[1]};
            background: linear-gradient(to left, ${theme.colors.neutral100} 55%, transparent);
          `}
  }
`;

/**
 * Tab list for the MagicMail sections. Wide screens get the Design System
 * tab list as is. Narrow screens (below the theme's medium breakpoint) get a
 * horizontally scrolling list with "previous" / "next" edge buttons whenever
 * sections are out of view, the active tab scrolled into view and every
 * focused tab (arrow keys) kept visible. The edge buttons are pointer
 * shortcuts; keyboard users move with the arrow keys of the tab list.
 *
 * @param {object} props
 * @param {string} props.value - Active tab value (re-centres on change)
 * @param {string} props.label - Accessible name of the tab list
 * @param {string} props.previousLabel - Label of the "previous" edge button
 * @param {string} props.nextLabel - Label of the "next" edge button
 * @param {React.ReactNode} props.children - `Tabs.Trigger` elements
 * @returns {JSX.Element}
 */
export const SectionTabsList = ({ value, label, previousLabel, nextLabel, children }) => {
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.medium);
  const scroll = !wide;
  const listRef = useRef(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    const list = listRef.current;
    if (!list || !scroll) {
      setEdges((prev) => (prev.start || prev.end ? { start: false, end: false } : prev));
      return;
    }
    const start = list.scrollLeft > 1;
    const end = list.scrollLeft + list.clientWidth < list.scrollWidth - 1;
    setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, [scroll]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return undefined;
    measure();
    list.addEventListener('scroll', measure, { passive: true });
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(list);
    return () => {
      list.removeEventListener('scroll', measure);
      observer?.disconnect();
    };
  }, [measure]);

  // Keep the active tab in view after a reload, a deep link or a tab change,
  // and again when a tab appears later (the Outbox tab waits for its
  // permission check and would otherwise push the strip past the centre).
  const tabCount = Children.count(children);
  useLayoutEffect(() => {
    const list = listRef.current;
    const tab = list?.querySelector('[role="tab"][aria-selected="true"]');
    if (!scroll || !list || !tab || list.scrollWidth <= list.clientWidth) return;
    // Centre it (the browser clamps at both ends), so it never sits under an
    // edge button.
    const listBox = list.getBoundingClientRect();
    const tabBox = tab.getBoundingClientRect();
    list.scrollLeft += tabBox.left - listBox.left - (listBox.width - tabBox.width) / 2;
    measure();
  }, [value, scroll, measure, tabCount]);

  const scrollBySide = (direction) => {
    const list = listRef.current;
    if (!list) return;
    list.scrollBy({
      left: direction * Math.max(list.clientWidth * 0.6, 120),
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  };

  // A tab reached with the arrow keys is scrolled into view.
  const handleFocus = (event) => {
    if (!scroll || event.target?.getAttribute?.('role') !== 'tab') return;
    event.target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  return (
    <Strip>
      <List
        ref={listRef}
        aria-label={label}
        $scroll={scroll}
        // An inline overflow marks the list as its own scroll region (as the
        // measurement contract expects for intentional scroll regions).
        style={scroll ? { overflowX: 'auto', overflowY: 'hidden' } : undefined}
        onFocus={handleFocus}
      >
        {children}
      </List>
      {edges.start ? (
        <EdgeButton
          $side="start"
          label={previousLabel}
          withTooltip={false}
          variant="ghost"
          tabIndex={-1}
          onClick={() => scrollBySide(-1)}
        >
          <ChevronLeft aria-hidden />
        </EdgeButton>
      ) : null}
      {edges.end ? (
        <EdgeButton
          $side="end"
          label={nextLabel}
          withTooltip={false}
          variant="ghost"
          tabIndex={-1}
          onClick={() => scrollBySide(1)}
        >
          <ChevronRight aria-hidden />
        </EdgeButton>
      ) : null}
    </Strip>
  );
};

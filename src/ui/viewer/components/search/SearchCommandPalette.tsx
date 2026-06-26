import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGlobalSearch } from '../../hooks/useGlobalSearch';
import { resultToQueryReplacement } from '../../search/normalize';
import type {
  ConcreteSearchResult,
  SearchResult,
  SearchTypeFilter,
} from '../../search/types';
import { SearchDetailDrawer } from './SearchDetailDrawer';
import { SearchResultsList } from './SearchResultsList';

export interface HighlightFeedItemTarget {
  kind: 'memory' | 'session' | 'prompt';
  id: number;
}

interface SearchCommandPaletteProps {
  isOpen: boolean;
  project?: string;
  onClose: () => void;
  onHighlightFeedItem: (target: HighlightFeedItemTarget) => void;
}

const TYPE_OPTIONS: Array<{ value: SearchTypeFilter; label: string }> = [
  { value: 'all', label: 'All types' },
  { value: 'memory', label: 'Memory' },
  { value: 'sessions', label: 'Sessions' },
  { value: 'prompts', label: 'Prompts' },
  { value: 'files', label: 'Files' },
  { value: 'concepts', label: 'Concepts' },
];

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function isConcreteResult(result: SearchResult): result is ConcreteSearchResult {
  return result.kind === 'memory' || result.kind === 'session' || result.kind === 'prompt';
}

function resultMatchesType(result: SearchResult, type: SearchTypeFilter): boolean {
  switch (type) {
    case 'all':
      return true;
    case 'memory':
      return result.kind === 'memory';
    case 'sessions':
      return result.kind === 'session';
    case 'prompts':
      return result.kind === 'prompt';
    case 'files':
      return result.kind === 'file';
    case 'concepts':
      return result.kind === 'concept';
  }
}

function isResultNavigationTarget(target: EventTarget | null, input: HTMLInputElement | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target === input || target.closest('.search-results-list') !== null;
}

function focusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter(element => element.getClientRects().length > 0 || element === document.activeElement);
}

export function SearchCommandPalette({
  isOpen,
  project,
  onClose,
  onHighlightFeedItem,
}: SearchCommandPaletteProps) {
  const {
    query,
    type,
    results,
    isLoading,
    error,
    detail,
    isDetailLoading,
    detailError,
    setQuery,
    setType,
    openDetail,
    closeDetail,
  } = useGlobalSearch(project);
  const hasDetailView = detail !== null || isDetailLoading || detailError !== null;
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const paletteRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const focusablesRef = useRef<HTMLElement[]>([]);

  const visibleResults = useMemo(
    () => results.filter(result => resultMatchesType(result, type)),
    [results, type]
  );

  // Cache the focusable elements and refresh them only when the rendered set can
  // actually change (open state, result rows, detail view) instead of walking
  // the DOM on every Tab keypress inside the trap handler.
  useEffect(() => {
    focusablesRef.current = isOpen ? focusableElements(paletteRef.current) : [];
  }, [isOpen, visibleResults, hasDetailView]);

  const closePalette = useCallback(() => {
    closeDetail();
    onClose();
  }, [closeDetail, onClose]);

  useEffect(() => {
    if (!isOpen) {
      closeDetail();
      previouslyFocusedRef.current?.focus();
      previouslyFocusedRef.current = null;
    }
  }, [closeDetail, isOpen]);

  const selectResult = useCallback((result: SearchResult) => {
    const replacement = resultToQueryReplacement(result);
    if (replacement !== null) {
      closeDetail();
      setQuery(replacement);
      setType('all');
      setActiveIndex(0);
      inputRef.current?.focus();
      return;
    }

    if (isConcreteResult(result)) {
      onHighlightFeedItem({ kind: result.kind, id: result.sourceId });
      void openDetail(result);
    }
  }, [closeDetail, onHighlightFeedItem, openDetail, setQuery, setType]);

  useEffect(() => {
    if (!isOpen) return;
    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [isOpen]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, type]);

  useEffect(() => {
    setActiveIndex(index => {
      if (visibleResults.length === 0) return 0;
      return Math.min(index, visibleResults.length - 1);
    });
  }, [visibleResults.length]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (hasDetailView) {
          closeDetail();
        } else {
          closePalette();
        }
        return;
      }

      if (event.key === 'Tab') {
        const focusables = focusablesRef.current;
        if (focusables.length === 0) {
          event.preventDefault();
          return;
        }

        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const activeElement = document.activeElement;

        if (!paletteRef.current?.contains(activeElement)) {
          event.preventDefault();
          first.focus();
          return;
        }

        if (event.shiftKey && activeElement === first) {
          event.preventDefault();
          last.focus();
          return;
        }

        if (!event.shiftKey && activeElement === last) {
          event.preventDefault();
          first.focus();
        }
        return;
      }

      if (!isResultNavigationTarget(event.target, inputRef.current)) {
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex(index => visibleResults.length === 0 ? 0 : (index + 1) % visibleResults.length);
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex(index => visibleResults.length === 0 ? 0 : (index - 1 + visibleResults.length) % visibleResults.length);
        return;
      }

      if (event.key === 'Enter' && event.target === inputRef.current && visibleResults[activeIndex]) {
        event.preventDefault();
        selectResult(visibleResults[activeIndex]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    activeIndex,
    closeDetail,
    closePalette,
    hasDetailView,
    isOpen,
    selectResult,
    visibleResults,
  ]);

  if (!isOpen) return null;

  return (
    <div
      className="search-palette-backdrop"
      role="presentation"
      onMouseDown={event => {
        if (hasDetailView) return;
        if (event.target === event.currentTarget) {
          closePalette();
        }
      }}
    >
      <div
        ref={paletteRef}
        className={`search-palette ${hasDetailView ? 'with-detail' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Search memories"
      >
        <div className="search-palette-panel">
          <div className="search-controls">
            <input
              ref={inputRef}
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search memories, sessions, prompts, files, concepts..."
              aria-label="Search query"
            />
            <select
              value={type}
              onChange={event => setType(event.target.value as SearchTypeFilter)}
              aria-label="Search result type"
            >
              {TYPE_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <SearchResultsList
            query={query}
            results={visibleResults}
            isLoading={isLoading}
            error={error}
            activeIndex={activeIndex}
            onSelect={selectResult}
          />
        </div>

        <SearchDetailDrawer
          detail={detail}
          isLoading={isDetailLoading}
          error={detailError}
          onClose={closeDetail}
        />
      </div>
    </div>
  );
}

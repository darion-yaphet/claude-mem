import './happydom';
import React from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import type {
  ConcreteSearchResult,
  SearchResult,
  SearchTypeFilter,
} from '../../src/ui/viewer/search/types';
import type { SearchDetail } from '../../src/ui/viewer/hooks/useGlobalSearch';

// Mutable store backing the mocked useGlobalSearch hook. Each render reads the
// current values; tests mutate the store then re-render the palette.
interface HookStore {
  query: string;
  type: SearchTypeFilter;
  results: SearchResult[];
  isLoading: boolean;
  error: string | null;
  detail: SearchDetail | null;
  isDetailLoading: boolean;
  detailError: string | null;
}

const store: HookStore = {
  query: '',
  type: 'all',
  results: [],
  isLoading: false,
  error: null,
  detail: null,
  isDetailLoading: false,
  detailError: null,
};

const setQuery = mock((next: string) => { store.query = next; });
const setType = mock((next: SearchTypeFilter) => { store.type = next; });
const openDetail = mock(async () => {});
const closeDetail = mock(() => {});

function resetStore(): void {
  store.query = 'settings';
  store.type = 'all';
  store.results = [];
  store.isLoading = false;
  store.error = null;
  store.detail = null;
  store.isDetailLoading = false;
  store.detailError = null;
  setQuery.mockClear();
  setType.mockClear();
  openDetail.mockClear();
  closeDetail.mockClear();
}

mock.module('../../src/ui/viewer/hooks/useGlobalSearch', () => ({
  useGlobalSearch: () => ({
    query: store.query,
    type: store.type,
    results: store.results,
    isLoading: store.isLoading,
    error: store.error,
    detail: store.detail,
    isDetailLoading: store.isDetailLoading,
    detailError: store.detailError,
    setQuery,
    setType,
    openDetail,
    closeDetail,
  }),
}));

const { SearchCommandPalette } = await import(
  '../../src/ui/viewer/components/search/SearchCommandPalette'
);

// happy-dom has no layout engine, so getClientRects() returns an empty list and
// the palette's focusable filter would discard every element. Stub it to report
// a non-empty rect so focus-trap behavior is actually exercised.
let originalGetClientRects: typeof Element.prototype.getClientRects;
beforeAll(() => {
  originalGetClientRects = Element.prototype.getClientRects;
  Element.prototype.getClientRects = function getClientRects() {
    return [{ width: 1, height: 1 } as DOMRect] as unknown as DOMRectList;
  };
});

function memoryResult(sourceId: number, title: string): ConcreteSearchResult {
  return {
    kind: 'memory',
    sourceId,
    id: `memory-${sourceId}`,
    title,
    subtitle: 'subtitle',
    actionLabel: 'Open',
    createdAtEpoch: sourceId,
  };
}

function renderPalette(overrides: Partial<{
  isOpen: boolean;
  onClose: () => void;
  onHighlightFeedItem: (target: { kind: 'memory' | 'session' | 'prompt'; id: number }) => void;
}> = {}) {
  const onClose = overrides.onClose ?? mock(() => {});
  const onHighlightFeedItem = overrides.onHighlightFeedItem ?? mock(() => {});
  const utils = render(
    <SearchCommandPalette
      isOpen={overrides.isOpen ?? true}
      project="claude-mem"
      onClose={onClose}
      onHighlightFeedItem={onHighlightFeedItem}
    />
  );
  return { ...utils, onClose, onHighlightFeedItem };
}

beforeEach(() => {
  resetStore();
});

afterEach(() => {
  cleanup();
});

describe('SearchCommandPalette', () => {
  it('renders nothing when closed', () => {
    const { container } = renderPalette({ isOpen: false });
    expect(container.querySelector('.search-palette')).toBeNull();
  });

  it('renders an accessible modal dialog when open', () => {
    const { getByRole } = renderPalette();
    const dialog = getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-label')).toBe('Search memories');
  });

  it('closes the palette on Escape when no detail is open', () => {
    const { getByLabelText, onClose } = renderPalette();
    const input = getByLabelText('Search query') as HTMLElement;
    input.focus();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(closeDetail).toHaveBeenCalled();
  });

  it('closes the detail first on Escape, keeping the palette open', () => {
    store.detail = { kind: 'memory', item: { id: 7, title: 'Memory 7' } as never };
    const { getByLabelText, onClose } = renderPalette();
    const input = getByLabelText('Search query') as HTMLElement;
    input.focus();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(closeDetail).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows a detail load error in the drawer, not the results list', () => {
    store.detailError = 'Failed to load memory: 500';
    const { container } = renderPalette();

    const drawer = container.querySelector('.search-detail-drawer');
    expect(drawer).not.toBeNull();
    expect(within(drawer as HTMLElement).getByRole('alert').textContent)
      .toContain('Failed to load memory: 500');
    // The results list keeps showing results, not the detail error.
    expect(container.querySelector('.search-results-list .search-results-error')).toBeNull();
  });

  it('clears a detail error first on Escape, keeping the palette open', () => {
    store.detailError = 'Failed to load memory: 500';
    const { getByLabelText, onClose } = renderPalette();
    const input = getByLabelText('Search query') as HTMLElement;
    input.focus();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(closeDetail).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('moves the active row with ArrowDown / ArrowUp and wraps around', () => {
    store.results = [
      memoryResult(1, 'First'),
      memoryResult(2, 'Second'),
      memoryResult(3, 'Third'),
    ];
    const { getByLabelText, container } = renderPalette();
    const input = getByLabelText('Search query') as HTMLElement;
    input.focus();

    const activeTitle = () =>
      container.querySelector('[aria-current="true"] .search-result-title')?.textContent;

    expect(activeTitle()).toBe('First');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(activeTitle()).toBe('Second');

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(activeTitle()).toBe('First');

    // Wrap past the top.
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(activeTitle()).toBe('Third');
  });

  it('selects the active concrete result on Enter', () => {
    store.results = [memoryResult(1, 'First'), memoryResult(2, 'Second')];
    const { getByLabelText, onHighlightFeedItem } = renderPalette();
    const input = getByLabelText('Search query') as HTMLElement;
    input.focus();

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onHighlightFeedItem).toHaveBeenCalledWith({ kind: 'memory', id: 2 });
    expect(openDetail).toHaveBeenCalledTimes(1);
  });

  it('traps focus inside the palette with Tab and Shift+Tab', () => {
    store.results = [memoryResult(1, 'First')];
    const { getByLabelText, container } = renderPalette();
    const input = getByLabelText('Search query') as HTMLElement;

    const focusables = Array.from(
      container.querySelectorAll<HTMLElement>('input, select, button')
    );
    const last = focusables[focusables.length - 1];
    expect(focusables[0]).toBe(input);
    expect(last).not.toBe(input);

    // Shift+Tab from the first element wraps to the last.
    input.focus();
    fireEvent.keyDown(input, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);

    // Tab from the last element wraps back to the first.
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(input);
  });

  it('replaces the query when an aggregate (file/concept) result is selected', () => {
    store.results = [{
      kind: 'file',
      id: 'file-src/app.ts',
      title: 'src/app.ts',
      subtitle: '',
      actionLabel: 'Search',
      createdAtEpoch: 0,
    }];
    const { container } = renderPalette();
    const row = container.querySelector('.search-result-row') as HTMLElement;

    fireEvent.click(row);

    expect(setQuery).toHaveBeenCalledWith('src/app.ts');
    expect(setType).toHaveBeenCalledWith('all');
    expect(openDetail).not.toHaveBeenCalled();
  });
});

# Global Search Command Palette Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a command-palette global search for the existing claude-mem viewer with a query input, right-side type dropdown, dense mixed result list, File/Concept query replacement, and concrete detail drawer behavior.

**Architecture:** Keep the feed as the primary page. Add focused viewer modules for search API access, pure result normalization, command palette rendering, and detail display. Use existing `/api/search?format=json` and detail endpoints first; derive File/Concept rows from search metadata on the frontend.

**Tech Stack:** React 19, TypeScript, Bun test, existing viewer CSS in `src/ui/viewer-template.html`, existing `authFetch` wrapper, existing Express worker search routes.

---

## File Structure

- Create `src/ui/viewer/search/types.ts`: frontend-only search result, response, and UI state types.
- Create `src/ui/viewer/search/normalize.ts`: pure functions to normalize JSON search responses and derive File/Concept rows.
- Create `src/ui/viewer/hooks/useGlobalSearch.ts`: debounced/cancellable search and detail fetch hook.
- Create `src/ui/viewer/components/search/SearchCommandPalette.tsx`: overlay shell, input, dropdown, keyboard close behavior, state wiring.
- Create `src/ui/viewer/components/search/SearchResultsList.tsx`: mixed result list.
- Create `src/ui/viewer/components/search/SearchResultRow.tsx`: one dense row with left-side type label.
- Create `src/ui/viewer/components/search/SearchDetailDrawer.tsx`: concrete Memory/Session/Prompt details.
- Modify `src/ui/viewer/constants/api.ts`: add search and detail endpoints.
- Modify `src/ui/viewer/constants/timing.ts`: add search debounce and highlight durations.
- Modify `src/ui/viewer/types.ts`: add search-compatible session/prompt/detail fields if existing viewer types are too narrow.
- Modify `src/ui/viewer/components/Header.tsx`: add compact Search button and `Cmd/Ctrl+K` hint title.
- Modify `src/ui/viewer/components/Feed.tsx`: accept an optional highlighted item target and attach stable DOM IDs to feed cards.
- Modify `src/ui/viewer/App.tsx`: own palette open state and pass highlight target to `Feed`.
- Modify `src/ui/viewer-template.html`: add command palette, result row, drawer, and feed highlight CSS.
- Create `tests/viewer/global-search-normalize.test.ts`: pure normalization tests.

## Task 1: Normalize Search Responses

**Files:**
- Create: `src/ui/viewer/search/types.ts`
- Create: `src/ui/viewer/search/normalize.ts`
- Create: `tests/viewer/global-search-normalize.test.ts`

- [ ] **Step 1: Write failing tests for mixed results and File/Concept pivots**

Create `tests/viewer/global-search-normalize.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import {
  buildSearchUrl,
  normalizeSearchResponse,
  resultToQueryReplacement,
} from '../../src/ui/viewer/search/normalize';
import type { SearchApiResponse } from '../../src/ui/viewer/search/types';

describe('global search normalization', () => {
  it('normalizes observations, sessions, prompts, files, and concepts into one sorted list', () => {
    const response: SearchApiResponse = {
      query: 'settings',
      totalResults: 3,
      observations: [{
        id: 11,
        memory_session_id: 'mem-1',
        project: 'claude-mem',
        platform_source: 'claude',
        type: 'feature',
        title: 'Settings behavior near Header.tsx',
        subtitle: 'Hooked up settings control',
        narrative: 'Updated the viewer header settings flow.',
        text: null,
        facts: null,
        concepts: JSON.stringify(['settings', 'viewer']),
        files_read: JSON.stringify(['src/ui/viewer/components/Header.tsx']),
        files_modified: JSON.stringify(['src/ui/viewer/components/Header.tsx']),
        prompt_number: 4,
        created_at: '2026-06-24T01:00:00.000Z',
        created_at_epoch: 1782243600000,
      }],
      sessions: [{
        id: 7,
        session_id: 'session-7',
        memory_session_id: 'mem-7',
        project: 'claude-mem',
        platform_source: 'codex',
        request: 'Implement viewer settings modal',
        investigated: 'Header controls',
        learned: null,
        completed: 'Settings modal connected',
        next_steps: null,
        files_read: null,
        files_edited: null,
        notes: null,
        prompt_number: 3,
        discovery_tokens: 100,
        created_at: '2026-06-24T00:30:00.000Z',
        created_at_epoch: 1782241800000,
      }],
      prompts: [{
        id: 5,
        content_session_id: 'content-5',
        project: 'claude-mem',
        platform_source: 'claude',
        prompt_number: 2,
        prompt_text: 'Can you fix settings search?',
        created_at: '2026-06-24T00:10:00.000Z',
        created_at_epoch: 1782240600000,
      }],
    };

    const results = normalizeSearchResponse(response);

    expect(results.map(result => result.kind)).toEqual([
      'memory',
      'session',
      'prompt',
      'file',
      'concept',
      'concept',
    ]);
    expect(results[0]).toMatchObject({
      kind: 'memory',
      id: 'memory-11',
      title: 'Settings behavior near Header.tsx',
      sourceId: 11,
    });
    expect(results.find(result => result.kind === 'file')).toMatchObject({
      id: 'file-src/ui/viewer/components/Header.tsx',
      title: 'src/ui/viewer/components/Header.tsx',
      actionLabel: 'Search',
    });
    expect(results.find(result => result.kind === 'concept' && result.title === 'settings')).toBeTruthy();
  });

  it('maps type dropdown values to existing search route query params', () => {
    expect(buildSearchUrl({ query: 'settings', type: 'all' })).toBe('/api/search?query=settings&format=json&orderBy=date_desc&limit=20');
    expect(buildSearchUrl({ query: 'settings', type: 'memory' })).toBe('/api/search?query=settings&type=observations&format=json&orderBy=date_desc&limit=20');
    expect(buildSearchUrl({ query: 'settings', type: 'sessions', project: 'claude-mem' })).toBe('/api/search?query=settings&type=sessions&project=claude-mem&format=json&orderBy=date_desc&limit=20');
    expect(buildSearchUrl({ query: 'settings', type: 'prompts' })).toBe('/api/search?query=settings&type=prompts&format=json&orderBy=date_desc&limit=20');
  });

  it('replaces the query when a File or Concept result is clicked', () => {
    expect(resultToQueryReplacement({ kind: 'file', id: 'file-a', title: 'src/ui/Header.tsx', subtitle: '', actionLabel: 'Search', createdAtEpoch: 0 })).toBe('src/ui/Header.tsx');
    expect(resultToQueryReplacement({ kind: 'concept', id: 'concept-settings', title: 'settings', subtitle: '', actionLabel: 'Search', createdAtEpoch: 0 })).toBe('settings');
    expect(resultToQueryReplacement({ kind: 'memory', id: 'memory-1', sourceId: 1, title: 'Memory', subtitle: '', actionLabel: 'Open', createdAtEpoch: 0 })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
bun test tests/viewer/global-search-normalize.test.ts
```

Expected: FAIL because `src/ui/viewer/search/normalize.ts` does not exist.

- [ ] **Step 3: Add search types**

Create `src/ui/viewer/search/types.ts`:

```ts
import type { Observation, Summary, UserPrompt } from '../types';

export type SearchTypeFilter = 'all' | 'memory' | 'sessions' | 'prompts' | 'files' | 'concepts';

export interface SearchApiSession extends Summary {
  memory_session_id?: string;
  files_read?: string | null;
  files_edited?: string | null;
  notes?: string | null;
  discovery_tokens?: number;
  prompt_number?: number | null;
  created_at?: string;
}

export interface SearchApiPrompt extends UserPrompt {
  created_at?: string;
}

export interface SearchApiResponse {
  observations: Observation[];
  sessions: SearchApiSession[];
  prompts: SearchApiPrompt[];
  totalResults: number;
  query: string;
}

export type ConcreteSearchKind = 'memory' | 'session' | 'prompt';
export type AggregateSearchKind = 'file' | 'concept';
export type SearchResultKind = ConcreteSearchKind | AggregateSearchKind;

interface BaseSearchResult {
  id: string;
  kind: SearchResultKind;
  title: string;
  subtitle: string;
  actionLabel: 'Open' | 'Search';
  createdAtEpoch: number;
}

export interface ConcreteSearchResult extends BaseSearchResult {
  kind: ConcreteSearchKind;
  sourceId: number;
  project?: string;
}

export interface AggregateSearchResult extends BaseSearchResult {
  kind: AggregateSearchKind;
}

export type SearchResult = ConcreteSearchResult | AggregateSearchResult;

export interface SearchRequest {
  query: string;
  type: SearchTypeFilter;
  project?: string;
}
```

- [ ] **Step 4: Add normalization implementation**

Create `src/ui/viewer/search/normalize.ts`:

```ts
import type {
  AggregateSearchResult,
  SearchApiResponse,
  SearchRequest,
  SearchResult,
  SearchTypeFilter,
} from './types';
import type { Observation } from '../types';

const TYPE_TO_API_TYPE: Partial<Record<SearchTypeFilter, string>> = {
  memory: 'observations',
  sessions: 'sessions',
  prompts: 'prompts',
};

function parseStringArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [];
  } catch {
    return [];
  }
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.map(value => value.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function firstUsefulText(...values: Array<string | null | undefined>): string {
  return values.find(value => typeof value === 'string' && value.trim().length > 0)?.trim() ?? 'Untitled';
}

function formatProjectSubtitle(project?: string, platformSource?: string): string {
  return [project, platformSource].filter(Boolean).join(' · ');
}

function observationFileValues(observation: Observation): string[] {
  return uniqueSorted([
    ...parseStringArray(observation.files_modified),
    ...parseStringArray(observation.files_read),
  ]);
}

export function buildSearchUrl(request: SearchRequest): string {
  const params = new URLSearchParams();
  const trimmedQuery = request.query.trim();
  if (trimmedQuery) params.set('query', trimmedQuery);
  const apiType = TYPE_TO_API_TYPE[request.type];
  if (apiType) params.set('type', apiType);
  if (request.project) params.set('project', request.project);
  params.set('format', 'json');
  params.set('orderBy', 'date_desc');
  params.set('limit', '20');
  return `/api/search?${params.toString()}`;
}

export function normalizeSearchResponse(response: SearchApiResponse): SearchResult[] {
  const concreteResults: SearchResult[] = [
    ...response.observations.map(observation => ({
      id: `memory-${observation.id}`,
      kind: 'memory' as const,
      sourceId: observation.id,
      title: firstUsefulText(observation.title, observation.subtitle, observation.text, observation.narrative),
      subtitle: firstUsefulText(observation.subtitle, formatProjectSubtitle(observation.project, observation.platform_source)),
      actionLabel: 'Open' as const,
      createdAtEpoch: observation.created_at_epoch,
      project: observation.project,
    })),
    ...response.sessions.map(session => ({
      id: `session-${session.id}`,
      kind: 'session' as const,
      sourceId: session.id,
      title: firstUsefulText(session.request, session.completed, session.investigated, 'Session summary'),
      subtitle: formatProjectSubtitle(session.project, session.platform_source),
      actionLabel: 'Open' as const,
      createdAtEpoch: session.created_at_epoch,
      project: session.project,
    })),
    ...response.prompts.map(prompt => ({
      id: `prompt-${prompt.id}`,
      kind: 'prompt' as const,
      sourceId: prompt.id,
      title: firstUsefulText(prompt.prompt_text, 'Prompt'),
      subtitle: formatProjectSubtitle(prompt.project, prompt.platform_source),
      actionLabel: 'Open' as const,
      createdAtEpoch: prompt.created_at_epoch,
      project: prompt.project,
    })),
  ];

  const aggregateResults: AggregateSearchResult[] = [
    ...uniqueSorted(response.observations.flatMap(observationFileValues)).map(file => ({
      id: `file-${file}`,
      kind: 'file' as const,
      title: file,
      subtitle: 'Related memories and sessions',
      actionLabel: 'Search' as const,
      createdAtEpoch: 0,
    })),
    ...uniqueSorted(response.observations.flatMap(observation => parseStringArray(observation.concepts))).map(concept => ({
      id: `concept-${concept}`,
      kind: 'concept' as const,
      title: concept,
      subtitle: 'Related memories and sessions',
      actionLabel: 'Search' as const,
      createdAtEpoch: 0,
    })),
  ];

  return [...concreteResults.sort((a, b) => b.createdAtEpoch - a.createdAtEpoch), ...aggregateResults];
}

export function resultToQueryReplacement(result: SearchResult): string | null {
  return result.kind === 'file' || result.kind === 'concept' ? result.title : null;
}
```

- [ ] **Step 5: Run normalization test**

Run:

```bash
bun test tests/viewer/global-search-normalize.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add src/ui/viewer/search/types.ts src/ui/viewer/search/normalize.ts tests/viewer/global-search-normalize.test.ts
git commit -m "Define viewer search result normalization"
```

## Task 2: Add Search Hook and API Constants

**Files:**
- Modify: `src/ui/viewer/constants/api.ts`
- Modify: `src/ui/viewer/constants/timing.ts`
- Create: `src/ui/viewer/hooks/useGlobalSearch.ts`
- Test: `tests/viewer/global-search-normalize.test.ts`

- [ ] **Step 1: Extend constants**

Update `src/ui/viewer/constants/api.ts`:

```ts
export const API_ENDPOINTS = {
  OBSERVATIONS: '/api/observations',
  SUMMARIES: '/api/summaries',
  PROMPTS: '/api/prompts',
  SETTINGS: '/api/settings',
  STATS: '/api/stats',
  PROCESSING_STATUS: '/api/processing-status',
  STREAM: '/stream',
  SEARCH: '/api/search',
  OBSERVATION_DETAIL: (id: number) => `/api/observation/${id}`,
  SESSION_DETAIL: (id: number) => `/api/session/${id}`,
  PROMPT_DETAIL: (id: number) => `/api/prompt/${id}`,
} as const;
```

Update `src/ui/viewer/constants/timing.ts`:

```ts
export const TIMING = {
  SSE_RECONNECT_DELAY_MS: 3000,

  STATS_REFRESH_INTERVAL_MS: 10000,

  SAVE_STATUS_DISPLAY_DURATION_MS: 3000,

  SEARCH_DEBOUNCE_MS: 250,
  SEARCH_HIGHLIGHT_DURATION_MS: 1800,
} as const;
```

- [ ] **Step 2: Add hook implementation**

Create `src/ui/viewer/hooks/useGlobalSearch.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { API_ENDPOINTS } from '../constants/api';
import { TIMING } from '../constants/timing';
import { authFetch } from '../utils/api';
import { buildSearchUrl, normalizeSearchResponse } from '../search/normalize';
import type {
  ConcreteSearchResult,
  SearchApiResponse,
  SearchResult,
  SearchTypeFilter,
} from '../search/types';
import type { Observation, Summary, UserPrompt } from '../types';

export type SearchDetail =
  | { kind: 'memory'; item: Observation }
  | { kind: 'session'; item: Summary }
  | { kind: 'prompt'; item: UserPrompt };

interface GlobalSearchState {
  query: string;
  type: SearchTypeFilter;
  results: SearchResult[];
  isLoading: boolean;
  error: string | null;
  detail: SearchDetail | null;
  isDetailLoading: boolean;
}

function detailUrlFor(result: ConcreteSearchResult): string {
  if (result.kind === 'memory') return API_ENDPOINTS.OBSERVATION_DETAIL(result.sourceId);
  if (result.kind === 'session') return API_ENDPOINTS.SESSION_DETAIL(result.sourceId);
  return API_ENDPOINTS.PROMPT_DETAIL(result.sourceId);
}

export function useGlobalSearch(project?: string) {
  const [state, setState] = useState<GlobalSearchState>({
    query: '',
    type: 'all',
    results: [],
    isLoading: false,
    error: null,
    detail: null,
    isDetailLoading: false,
  });
  const abortRef = useRef<AbortController | null>(null);
  const requestSeqRef = useRef(0);

  const setQuery = useCallback((query: string) => {
    setState(prev => ({ ...prev, query, detail: null }));
  }, []);

  const setType = useCallback((type: SearchTypeFilter) => {
    setState(prev => ({ ...prev, type, detail: null }));
  }, []);

  useEffect(() => {
    const trimmedQuery = state.query.trim();
    abortRef.current?.abort();

    if (!trimmedQuery) {
      setState(prev => ({ ...prev, results: [], isLoading: false, error: null }));
      return;
    }

    const timeout = window.setTimeout(() => {
      const requestSeq = requestSeqRef.current + 1;
      requestSeqRef.current = requestSeq;
      const controller = new AbortController();
      abortRef.current = controller;
      setState(prev => ({ ...prev, isLoading: true, error: null }));

      authFetch(buildSearchUrl({ query: trimmedQuery, type: state.type, project }), {
        signal: controller.signal,
      })
        .then(async response => {
          if (!response.ok) throw new Error(`Search failed: ${response.status}`);
          return await response.json() as SearchApiResponse;
        })
        .then(data => {
          if (requestSeqRef.current !== requestSeq) return;
          setState(prev => ({
            ...prev,
            results: normalizeSearchResponse(data),
            isLoading: false,
            error: null,
          }));
        })
        .catch(error => {
          if (controller.signal.aborted || requestSeqRef.current !== requestSeq) return;
          setState(prev => ({
            ...prev,
            results: [],
            isLoading: false,
            error: error instanceof Error ? error.message : String(error),
          }));
        });
    }, TIMING.SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeout);
      abortRef.current?.abort();
    };
  }, [project, state.query, state.type]);

  const openDetail = useCallback(async (result: ConcreteSearchResult): Promise<SearchDetail | null> => {
    setState(prev => ({ ...prev, isDetailLoading: true, error: null }));
    try {
      const response = await authFetch(detailUrlFor(result));
      if (!response.ok) throw new Error(`Detail failed: ${response.status}`);
      const item = await response.json();
      const detail = { kind: result.kind, item } as SearchDetail;
      setState(prev => ({ ...prev, detail, isDetailLoading: false }));
      return detail;
    } catch (error) {
      setState(prev => ({
        ...prev,
        isDetailLoading: false,
        error: error instanceof Error ? error.message : String(error),
      }));
      return null;
    }
  }, []);

  const closeDetail = useCallback(() => {
    setState(prev => ({ ...prev, detail: null }));
  }, []);

  return {
    ...state,
    setQuery,
    setType,
    openDetail,
    closeDetail,
  };
}
```

- [ ] **Step 3: Typecheck viewer**

Run:

```bash
npm run typecheck:viewer
```

Expected: PASS. If it fails because the route detail types are narrower than `Summary` or `UserPrompt`, update `src/ui/viewer/search/types.ts` with explicit detail types and keep the detail drawer consuming those types.

- [ ] **Step 4: Run search normalization regression**

Run:

```bash
bun test tests/viewer/global-search-normalize.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/ui/viewer/constants/api.ts src/ui/viewer/constants/timing.ts src/ui/viewer/hooks/useGlobalSearch.ts src/ui/viewer/search/types.ts tests/viewer/global-search-normalize.test.ts
git commit -m "Add viewer global search data hook"
```

## Task 3: Build Command Palette UI

**Files:**
- Create: `src/ui/viewer/components/search/SearchResultRow.tsx`
- Create: `src/ui/viewer/components/search/SearchResultsList.tsx`
- Create: `src/ui/viewer/components/search/SearchDetailDrawer.tsx`
- Create: `src/ui/viewer/components/search/SearchCommandPalette.tsx`
- Modify: `src/ui/viewer/components/Header.tsx`
- Modify: `src/ui/viewer/App.tsx`
- Modify: `src/ui/viewer-template.html`

- [ ] **Step 1: Add result row component**

Create `src/ui/viewer/components/search/SearchResultRow.tsx`:

```tsx
import React from 'react';
import type { SearchResult } from '../../search/types';

interface SearchResultRowProps {
  result: SearchResult;
  isActive: boolean;
  onSelect: (result: SearchResult) => void;
}

const LABELS: Record<SearchResult['kind'], string> = {
  memory: 'Memory',
  session: 'Session',
  prompt: 'Prompt',
  file: 'File',
  concept: 'Concept',
};

export function SearchResultRow({ result, isActive, onSelect }: SearchResultRowProps) {
  return (
    <button
      type="button"
      className={`search-result-row ${isActive ? 'active' : ''}`}
      onClick={() => onSelect(result)}
    >
      <span className={`search-result-kind kind-${result.kind}`}>{LABELS[result.kind]}</span>
      <span className="search-result-main">
        <span className="search-result-title">{result.title}</span>
        {result.subtitle && <span className="search-result-subtitle">{result.subtitle}</span>}
      </span>
      <span className="search-result-action">{result.actionLabel}</span>
    </button>
  );
}
```

- [ ] **Step 2: Add results list component**

Create `src/ui/viewer/components/search/SearchResultsList.tsx`:

```tsx
import React from 'react';
import type { SearchResult } from '../../search/types';
import { SearchResultRow } from './SearchResultRow';

interface SearchResultsListProps {
  query: string;
  results: SearchResult[];
  isLoading: boolean;
  error: string | null;
  activeIndex: number;
  onSelect: (result: SearchResult) => void;
}

export function SearchResultsList({
  query,
  results,
  isLoading,
  error,
  activeIndex,
  onSelect,
}: SearchResultsListProps) {
  if (!query.trim()) {
    return <div className="search-empty">Search memory, sessions, prompts, files, and concepts.</div>;
  }
  if (isLoading) {
    return <div className="search-empty">Searching...</div>;
  }
  if (error) {
    return <div className="search-error">{error}</div>;
  }
  if (results.length === 0) {
    return <div className="search-empty">No results for "{query}".</div>;
  }

  return (
    <div className="search-results-list">
      {results.map((result, index) => (
        <SearchResultRow
          key={result.id}
          result={result}
          isActive={index === activeIndex}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Add detail drawer component**

Create `src/ui/viewer/components/search/SearchDetailDrawer.tsx`:

```tsx
import React from 'react';
import type { SearchDetail } from '../../hooks/useGlobalSearch';

interface SearchDetailDrawerProps {
  detail: SearchDetail | null;
  isLoading: boolean;
  onClose: () => void;
}

function detailTitle(detail: SearchDetail): string {
  if (detail.kind === 'memory') return detail.item.title || detail.item.subtitle || `Memory #${detail.item.id}`;
  if (detail.kind === 'session') return detail.item.request || `Session #${detail.item.id}`;
  return detail.item.prompt_text || `Prompt #${detail.item.id}`;
}

function detailBody(detail: SearchDetail): string {
  if (detail.kind === 'memory') return detail.item.narrative || detail.item.text || detail.item.subtitle || '';
  if (detail.kind === 'session') {
    return [
      detail.item.investigated,
      detail.item.learned,
      detail.item.completed,
      detail.item.next_steps,
    ].filter(Boolean).join('\n\n');
  }
  return detail.item.prompt_text;
}

export function SearchDetailDrawer({ detail, isLoading, onClose }: SearchDetailDrawerProps) {
  if (!detail && !isLoading) return null;

  return (
    <aside className="search-detail-drawer" aria-label="Search result detail">
      <div className="search-detail-header">
        <h3>{isLoading || !detail ? 'Loading detail...' : detailTitle(detail)}</h3>
        <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close detail">
          ×
        </button>
      </div>
      {detail && (
        <div className="search-detail-body">
          <pre>{detailBody(detail)}</pre>
        </div>
      )}
    </aside>
  );
}
```

- [ ] **Step 4: Add command palette component**

Create `src/ui/viewer/components/search/SearchCommandPalette.tsx`:

```tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useGlobalSearch } from '../../hooks/useGlobalSearch';
import { resultToQueryReplacement } from '../../search/normalize';
import type { ConcreteSearchResult, SearchResult, SearchTypeFilter } from '../../search/types';
import { SearchDetailDrawer } from './SearchDetailDrawer';
import { SearchResultsList } from './SearchResultsList';

interface SearchCommandPaletteProps {
  isOpen: boolean;
  project?: string;
  onClose: () => void;
  onHighlightFeedItem: (target: { kind: ConcreteSearchResult['kind']; id: number }) => void;
}

const TYPE_OPTIONS: Array<{ value: SearchTypeFilter; label: string }> = [
  { value: 'all', label: 'All types' },
  { value: 'memory', label: 'Memory' },
  { value: 'sessions', label: 'Sessions' },
  { value: 'prompts', label: 'Prompts' },
  { value: 'files', label: 'Files' },
  { value: 'concepts', label: 'Concepts' },
];

function isConcreteResult(result: SearchResult): result is ConcreteSearchResult {
  return result.kind === 'memory' || result.kind === 'session' || result.kind === 'prompt';
}

export function SearchCommandPalette({
  isOpen,
  project,
  onClose,
  onHighlightFeedItem,
}: SearchCommandPaletteProps) {
  const search = useGlobalSearch(project);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (isOpen) setActiveIndex(0);
  }, [isOpen, search.query, search.type]);

  const activeResult = useMemo(() => search.results[activeIndex], [activeIndex, search.results]);

  const handleSelect = useCallback(async (result: SearchResult) => {
    const replacement = resultToQueryReplacement(result);
    if (replacement !== null) {
      search.setQuery(replacement);
      search.setType('all');
      return;
    }
    if (isConcreteResult(result)) {
      await search.openDetail(result);
      onHighlightFeedItem({ kind: result.kind, id: result.sourceId });
    }
  }, [onHighlightFeedItem, search]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (search.detail) search.closeDetail();
        else onClose();
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex(index => Math.min(index + 1, Math.max(search.results.length - 1, 0)));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex(index => Math.max(index - 1, 0));
      } else if (event.key === 'Enter' && activeResult) {
        event.preventDefault();
        void handleSelect(activeResult);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeResult, handleSelect, isOpen, onClose, search]);

  if (!isOpen) return null;

  return (
    <div className="search-palette-backdrop" onMouseDown={onClose}>
      <section
        className="search-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Global search"
        onMouseDown={event => event.stopPropagation()}
      >
        <div className="search-palette-controls">
          <input
            className="search-palette-input"
            value={search.query}
            onChange={event => search.setQuery(event.target.value)}
            placeholder="Search memory, sessions, files, concepts..."
            autoFocus
          />
          <select
            className="search-palette-type"
            value={search.type}
            onChange={event => search.setType(event.target.value as SearchTypeFilter)}
          >
            {TYPE_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>

        <SearchResultsList
          query={search.query}
          results={search.results}
          isLoading={search.isLoading}
          error={search.error}
          activeIndex={activeIndex}
          onSelect={handleSelect}
        />

        <SearchDetailDrawer
          detail={search.detail}
          isLoading={search.isDetailLoading}
          onClose={search.closeDetail}
        />
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Wire Header and App**

Modify `src/ui/viewer/components/Header.tsx`:

```tsx
interface HeaderProps {
  isConnected: boolean;
  projects: string[];
  currentFilter: string;
  onFilterChange: (filter: string) => void;
  isProcessing: boolean;
  queueDepth: number;
  themePreference: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
  onContextPreviewToggle: () => void;
  onSearchToggle: () => void;
  onShowHelp?: () => void;
}
```

Add `onSearchToggle` to the destructuring and place this button before the project `<select>`:

```tsx
<button
  className="settings-btn"
  onClick={onSearchToggle}
  title="Search memory (Cmd/Ctrl+K)"
  aria-label="Search memory"
>
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"></circle>
    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
  </svg>
</button>
```

Modify `src/ui/viewer/App.tsx`:

```tsx
import { SearchCommandPalette } from './components/search/SearchCommandPalette';
import { TIMING } from './constants/timing';
```

Add state:

```tsx
const [searchOpen, setSearchOpen] = useState(false);
const [highlightTarget, setHighlightTarget] = useState<{ kind: 'memory' | 'session' | 'prompt'; id: number } | null>(null);
```

Add keyboard open effect:

```tsx
useEffect(() => {
  const onKeyDown = (event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      setSearchOpen(true);
    }
  };
  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}, []);
```

Pass the header prop:

```tsx
onSearchToggle={() => setSearchOpen(true)}
```

Pass `highlightTarget={highlightTarget}` to `Feed`, and render the palette:

```tsx
<SearchCommandPalette
  isOpen={searchOpen}
  project={currentFilter || undefined}
  onClose={() => setSearchOpen(false)}
  onHighlightFeedItem={(target) => {
    setHighlightTarget(target);
    window.setTimeout(() => setHighlightTarget(null), TIMING.SEARCH_HIGHLIGHT_DURATION_MS);
  }}
/>
```

- [ ] **Step 6: Add CSS**

Append to `src/ui/viewer-template.html` before the console drawer styles:

```css
.search-palette-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1200;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 72px 16px 16px;
}

.search-palette {
  width: min(920px, 100%);
  max-height: calc(100vh - 96px);
  background: var(--color-bg-card);
  border: 1px solid var(--color-border-primary);
  border-radius: 8px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.28);
  overflow: hidden;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
}

.search-palette-controls {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 152px;
  gap: 10px;
  padding: 14px;
  border-bottom: 1px solid var(--color-border-secondary);
}

.search-palette-input,
.search-palette-type {
  height: 42px;
  border: 1px solid var(--color-border-primary);
  border-radius: 6px;
  background: var(--color-bg-input);
  color: var(--color-text-primary);
  padding: 0 12px;
  font: inherit;
}

.search-results-list {
  overflow: auto;
  max-height: 54vh;
  padding: 8px;
}

.search-result-row {
  width: 100%;
  display: grid;
  grid-template-columns: 84px minmax(0, 1fr) 76px;
  gap: 10px;
  align-items: center;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-primary);
  padding: 10px;
  text-align: left;
  cursor: pointer;
}

.search-result-row:hover,
.search-result-row.active {
  background: var(--color-bg-card-hover);
  border-color: var(--color-border-hover);
}

.search-result-kind {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 26px;
  border-radius: 4px;
  background: var(--color-type-badge-bg);
  color: var(--color-type-badge-text);
  font-size: 12px;
  font-weight: 700;
}

.search-result-main {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.search-result-title,
.search-result-subtitle {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search-result-title {
  font-weight: 650;
}

.search-result-subtitle,
.search-result-action,
.search-empty,
.search-error {
  color: var(--color-text-secondary);
  font-size: 13px;
}

.search-result-action {
  text-align: right;
}

.search-empty,
.search-error {
  padding: 24px;
  text-align: center;
}

.search-error {
  color: var(--color-accent-error);
}

.search-detail-drawer {
  border-top: 1px solid var(--color-border-secondary);
  background: var(--color-bg-secondary);
}

.search-detail-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  padding: 12px 14px;
  border-bottom: 1px solid var(--color-border-secondary);
}

.search-detail-header h3 {
  margin: 0;
  font-size: 15px;
}

.search-detail-body {
  max-height: 28vh;
  overflow: auto;
  padding: 14px;
}

.search-detail-body pre {
  margin: 0;
  white-space: pre-wrap;
  font-family: inherit;
  color: var(--color-text-primary);
}

.feed-highlight {
  outline: 2px solid var(--color-accent-primary);
  outline-offset: 3px;
}

@media (max-width: 600px) {
  .search-palette-backdrop {
    padding: 12px;
  }

  .search-palette-controls {
    grid-template-columns: 1fr;
  }

  .search-result-row {
    grid-template-columns: 72px minmax(0, 1fr);
  }

  .search-result-action {
    display: none;
  }
}
```

- [ ] **Step 7: Typecheck viewer**

Run:

```bash
npm run typecheck:viewer
```

Expected: PASS.

- [ ] **Step 8: Commit Task 3**

```bash
git add src/ui/viewer/components/search src/ui/viewer/components/Header.tsx src/ui/viewer/App.tsx src/ui/viewer-template.html
git commit -m "Add viewer global search command palette"
```

## Task 4: Feed Highlight and Detail Targeting

**Files:**
- Modify: `src/ui/viewer/components/Feed.tsx`
- Modify: `src/ui/viewer/App.tsx`
- Modify: `src/ui/viewer/components/search/SearchCommandPalette.tsx`
- Modify: `src/ui/viewer-template.html`

- [ ] **Step 1: Add feed item DOM IDs and highlight prop**

Modify `src/ui/viewer/components/Feed.tsx`:

```tsx
interface FeedProps {
  observations: Observation[];
  summaries: Summary[];
  prompts: UserPrompt[];
  onLoadMore: () => void;
  isLoading: boolean;
  hasMore: boolean;
  highlightTarget?: { kind: 'memory' | 'session' | 'prompt'; id: number } | null;
}

function feedDomId(itemType: FeedItem['itemType'], id: number): string {
  if (itemType === 'observation') return `feed-memory-${id}`;
  if (itemType === 'summary') return `feed-session-${id}`;
  return `feed-prompt-${id}`;
}

function isHighlighted(
  item: FeedItem,
  highlightTarget?: { kind: 'memory' | 'session' | 'prompt'; id: number } | null,
): boolean {
  if (!highlightTarget) return false;
  if (item.itemType === 'observation') return highlightTarget.kind === 'memory' && item.id === highlightTarget.id;
  if (item.itemType === 'summary') return highlightTarget.kind === 'session' && item.id === highlightTarget.id;
  return highlightTarget.kind === 'prompt' && item.id === highlightTarget.id;
}
```

Wrap each card in the map:

```tsx
const highlighted = isHighlighted(item, highlightTarget);
const wrapperClassName = highlighted ? 'feed-item-wrapper feed-highlight' : 'feed-item-wrapper';
return (
  <div id={feedDomId(item.itemType, item.id)} className={wrapperClassName} key={key}>
    {item.itemType === 'observation'
      ? <ObservationCard observation={item} />
      : item.itemType === 'summary'
        ? <SummaryCard summary={item} />
        : <PromptCard prompt={item} />}
  </div>
);
```

- [ ] **Step 2: Scroll highlighted target into view from App**

Add this effect to `src/ui/viewer/App.tsx` after `highlightTarget` state:

```tsx
useEffect(() => {
  if (!highlightTarget) return;
  const prefix = highlightTarget.kind === 'memory'
    ? 'feed-memory'
    : highlightTarget.kind === 'session'
      ? 'feed-session'
      : 'feed-prompt';
  const element = document.getElementById(`${prefix}-${highlightTarget.id}`);
  element?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}, [highlightTarget]);
```

- [ ] **Step 3: Add wrapper CSS**

Append near the search CSS in `src/ui/viewer-template.html`:

```css
.feed-item-wrapper {
  border-radius: 8px;
}

.feed-item-wrapper.feed-highlight {
  animation: feed-highlight-pulse 1.8s ease-out;
}

@keyframes feed-highlight-pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(9, 105, 218, 0.45);
  }
  60% {
    box-shadow: 0 0 0 6px rgba(9, 105, 218, 0.08);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(9, 105, 218, 0);
  }
}
```

- [ ] **Step 4: Typecheck and build viewer**

Run:

```bash
npm run typecheck:viewer
node scripts/build-viewer.js
```

Expected: both PASS. `plugin/ui/viewer-bundle.js` and `plugin/ui/viewer.html` may change after the build; include them if this repo convention expects committed built assets for viewer changes.

- [ ] **Step 5: Commit Task 4**

```bash
git add src/ui/viewer/components/Feed.tsx src/ui/viewer/App.tsx src/ui/viewer-template.html plugin/ui/viewer-bundle.js plugin/ui/viewer.html
git commit -m "Connect search results to viewer feed details"
```

## Task 5: Final Verification

**Files:**
- Review: all files changed by Tasks 1-4

- [ ] **Step 1: Run focused tests**

```bash
bun test tests/viewer/global-search-normalize.test.ts tests/viewer/welcome-card-storage.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run viewer typecheck**

```bash
npm run typecheck:viewer
```

Expected: PASS.

- [ ] **Step 3: Build viewer assets**

```bash
node scripts/build-viewer.js
```

Expected output includes:

```text
React viewer built successfully
plugin/ui/viewer-bundle.js
plugin/ui/viewer.html
```

- [ ] **Step 4: Optional full typecheck if shared types changed**

Run only if implementation changed anything outside `src/ui/viewer`, `src/ui/viewer-template.html`, or `plugin/ui`:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Manual browser smoke test**

Start or restart the worker:

```bash
npm run worker:restart
```

Open the viewer at the configured worker port. Verify:

- Search button opens the palette.
- `Cmd/Ctrl+K` opens the palette.
- Typing a query produces results.
- Type dropdown changes result scope.
- File/Concept result click replaces the input query and reruns search.
- Memory/Session/Prompt result click opens a detail drawer.
- If the selected feed item is loaded, it scrolls and highlights.
- Escape closes detail first, then closes the palette.

- [ ] **Step 6: Final commit if verification required build asset changes**

```bash
git status --short
git add plugin/ui/viewer-bundle.js plugin/ui/viewer.html
git commit -m "Build viewer assets for global search"
```

Skip this commit if `git status --short` shows no build asset changes.

## Self-Review Notes

- Spec coverage: The plan covers command palette entry, input plus right-side dropdown, dense mixed list, left-side type labels, no active filter chips, File/Concept query replacement, detail drawer, feed highlight, loading/empty/error states, and viewer verification.
- Placeholder scan: No `TBD`, `TODO`, or undefined future behavior remains in the executable steps.
- Type consistency: `SearchTypeFilter`, `SearchResult`, `ConcreteSearchResult`, and `SearchDetail` are introduced before use and reused consistently across hook and component tasks.

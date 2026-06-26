import { useCallback, useEffect, useRef, useState } from 'react';
import { API_ENDPOINTS } from '../constants/api';
import { TIMING } from '../constants/timing';
import { buildSearchUrl, normalizeSearchResponse } from '../search/normalize';
import type {
  ConcreteSearchKind,
  ConcreteSearchResult,
  SearchApiObservation,
  SearchApiPrompt,
  SearchApiResponse,
  SearchApiSession,
  SearchResult,
  SearchTypeFilter,
} from '../search/types';
import { authFetch } from '../utils/api';

export type SearchDetail =
  | { kind: 'memory'; item: SearchApiObservation }
  | { kind: 'session'; item: SearchApiSession }
  | { kind: 'prompt'; item: SearchApiPrompt };

interface GlobalSearchState {
  query: string;
  type: SearchTypeFilter;
  results: SearchResult[];
  isLoading: boolean;
  error: string | null;
  detail: SearchDetail | null;
  isDetailLoading: boolean;
  detailError: string | null;
}

interface UseGlobalSearchResult extends GlobalSearchState {
  setQuery: (query: string) => void;
  setType: (type: SearchTypeFilter) => void;
  openDetail: (result: ConcreteSearchResult) => Promise<void>;
  closeDetail: () => void;
}

function isAbortError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'name' in error
    && error.name === 'AbortError';
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function detailUrlFor(kind: ConcreteSearchKind, id: number): string {
  switch (kind) {
    case 'memory':
      return API_ENDPOINTS.OBSERVATION_DETAIL(id);
    case 'session':
      return API_ENDPOINTS.SESSION_DETAIL(id);
    case 'prompt':
      return API_ENDPOINTS.PROMPT_DETAIL(id);
  }
}

function isDetailRecord(item: unknown): item is { id: number } {
  return typeof item === 'object'
    && item !== null
    && 'id' in item
    && typeof (item as { id: unknown }).id === 'number';
}

function detailFromResponse(kind: ConcreteSearchKind, item: unknown): SearchDetail {
  // Validate the boundary before narrowing an `unknown` payload — a missing or
  // malformed detail body should fail fast instead of rendering a blank drawer
  // built from undefined fields.
  if (!isDetailRecord(item)) {
    throw new Error(`Malformed ${kind} detail response`);
  }
  switch (kind) {
    case 'memory':
      return { kind, item: item as SearchApiObservation };
    case 'session':
      return { kind, item: item as SearchApiSession };
    case 'prompt':
      return { kind, item: item as SearchApiPrompt };
  }
}

export function useGlobalSearch(project?: string): UseGlobalSearchResult {
  const [query, setQueryState] = useState('');
  const [type, setTypeState] = useState<SearchTypeFilter>('all');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<SearchDetail | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const searchAbortRef = useRef<AbortController | null>(null);
  const searchSequenceRef = useRef(0);
  const detailAbortRef = useRef<AbortController | null>(null);
  const detailSequenceRef = useRef(0);
  const previousProjectRef = useRef(project);

  const clearDetailForScopeChange = useCallback(() => {
    detailAbortRef.current?.abort();
    detailSequenceRef.current += 1;
    setDetail(null);
    setIsDetailLoading(false);
    setDetailError(null);
  }, []);

  const setQuery = useCallback((nextQuery: string) => {
    clearDetailForScopeChange();
    setQueryState(nextQuery);
  }, [clearDetailForScopeChange]);

  const setType = useCallback((nextType: SearchTypeFilter) => {
    clearDetailForScopeChange();
    setTypeState(nextType);
  }, [clearDetailForScopeChange]);

  useEffect(() => {
    if (previousProjectRef.current === project) return;

    previousProjectRef.current = project;
    clearDetailForScopeChange();
  }, [clearDetailForScopeChange, project]);

  useEffect(() => {
    searchAbortRef.current?.abort();
    const sequence = searchSequenceRef.current + 1;
    searchSequenceRef.current = sequence;

    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      setResults([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    searchAbortRef.current = controller;
    setIsLoading(true);
    setError(null);

    const timeout = setTimeout(async () => {
      try {
        const response = await authFetch(buildSearchUrl({ query: trimmedQuery, type, project }), {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Search failed: ${response.statusText || response.status}`);
        }

        const data = await response.json() as SearchApiResponse;
        if (searchSequenceRef.current !== sequence || controller.signal.aborted) return;

        setResults(normalizeSearchResponse(data));
      } catch (caughtError) {
        if (isAbortError(caughtError) || searchSequenceRef.current !== sequence) return;
        setResults([]);
        setError(errorMessage(caughtError, 'Search failed'));
      } finally {
        if (searchSequenceRef.current === sequence && !controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }, TIMING.SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [project, query, type]);

  const closeDetail = useCallback(() => {
    detailAbortRef.current?.abort();
    detailSequenceRef.current += 1;
    setDetail(null);
    setIsDetailLoading(false);
    setDetailError(null);
  }, []);

  const openDetail = useCallback(async (result: ConcreteSearchResult) => {
    detailAbortRef.current?.abort();
    const sequence = detailSequenceRef.current + 1;
    detailSequenceRef.current = sequence;

    const controller = new AbortController();
    detailAbortRef.current = controller;
    setDetail(null);
    setIsDetailLoading(true);
    setDetailError(null);

    try {
      const response = await authFetch(detailUrlFor(result.kind, result.sourceId), {
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Failed to load ${result.kind}: ${response.statusText || response.status}`);
      }

      const item = await response.json() as unknown;
      if (detailSequenceRef.current !== sequence || controller.signal.aborted) return;

      setDetail(detailFromResponse(result.kind, item));
    } catch (caughtError) {
      if (isAbortError(caughtError) || detailSequenceRef.current !== sequence) return;
      setDetail(null);
      setDetailError(errorMessage(caughtError, `Failed to load ${result.kind}`));
    } finally {
      if (detailSequenceRef.current === sequence && !controller.signal.aborted) {
        setIsDetailLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    return () => {
      searchAbortRef.current?.abort();
      detailAbortRef.current?.abort();
    };
  }, []);

  return {
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
  };
}

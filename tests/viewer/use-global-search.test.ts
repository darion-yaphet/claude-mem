import './happydom';
import { afterEach, describe, expect, it, mock } from 'bun:test';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useGlobalSearch } from '../../src/ui/viewer/hooks/useGlobalSearch';
import type {
  ConcreteSearchResult,
  SearchApiResponse,
} from '../../src/ui/viewer/search/types';

const originalFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

function jsonResponse(body: unknown, ok = true): Response {
  return new Response(JSON.stringify(body), {
    status: ok ? 200 : 500,
    headers: { 'content-type': 'application/json' },
  });
}

function emptyResponse(query: string): SearchApiResponse {
  return { observations: [], sessions: [], prompts: [], totalResults: 0, query };
}

function responseTitled(query: string): SearchApiResponse {
  return {
    query,
    totalResults: 1,
    observations: [{
      id: 1,
      memory_session_id: 'mem',
      project: 'claude-mem',
      type: 'feature',
      title: query,
      subtitle: null,
      narrative: null,
      text: null,
      facts: null,
      concepts: null,
      files_read: null,
      files_modified: null,
      created_at_epoch: 100,
    }],
    sessions: [],
    prompts: [],
  };
}

function memoryResult(sourceId: number): ConcreteSearchResult {
  return {
    kind: 'memory',
    sourceId,
    id: `memory-${sourceId}`,
    title: '',
    subtitle: '',
    actionLabel: 'Open',
    createdAtEpoch: 0,
  };
}

describe('useGlobalSearch', () => {
  it('debounces input into a single search request', async () => {
    const fetchMock = mock(async () => jsonResponse(emptyResponse('abc')));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook(() => useGlobalSearch());

    act(() => result.current.setQuery('a'));
    act(() => result.current.setQuery('ab'));
    act(() => result.current.setQuery('abc'));

    // Debounce window (250ms) has not elapsed — no request yet.
    expect(fetchMock).toHaveBeenCalledTimes(0);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain('query=abc');
  });

  it('does not search for an empty/whitespace query', async () => {
    const fetchMock = mock(async () => jsonResponse(emptyResponse('')));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook(() => useGlobalSearch());
    act(() => result.current.setQuery('   '));

    await new Promise(resolve => setTimeout(resolve, 350));
    expect(fetchMock).toHaveBeenCalledTimes(0);
    expect(result.current.results).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('ignores a stale response that resolves after a newer query', async () => {
    const resolvers: Record<string, () => void> = {};
    const fetchMock = mock((input: RequestInfo | URL) => new Promise<Response>(resolve => {
      const url = new URL(String(input), 'http://localhost');
      const query = url.searchParams.get('query') ?? '';
      resolvers[query] = () => resolve(jsonResponse(responseTitled(query)));
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook(() => useGlobalSearch());

    act(() => result.current.setQuery('first'));
    await waitFor(() => expect(resolvers.first).toBeDefined());

    act(() => result.current.setQuery('second'));
    await waitFor(() => expect(resolvers.second).toBeDefined());

    // Newer query resolves first and wins.
    await act(async () => { resolvers.second(); });
    await waitFor(() => expect(result.current.results[0]?.title).toBe('second'));

    // Stale (older) query resolves later and must be discarded.
    await act(async () => { resolvers.first(); });
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(result.current.results[0]?.title).toBe('second');
  });

  it('aborts the in-flight search request on unmount', async () => {
    let capturedSignal: AbortSignal | undefined;
    const fetchMock = mock((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>(() => { capturedSignal = init?.signal ?? undefined; }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { result, unmount } = renderHook(() => useGlobalSearch());
    act(() => result.current.setQuery('pending'));

    await waitFor(() => expect(capturedSignal).toBeDefined());
    expect(capturedSignal!.aborted).toBe(false);

    unmount();
    expect(capturedSignal!.aborted).toBe(true);
  });

  it('surfaces an error and clears results when the search request fails', async () => {
    const fetchMock = mock(async () => jsonResponse({}, false));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook(() => useGlobalSearch());
    act(() => result.current.setQuery('boom'));

    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.results).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('loads detail through the kind-specific endpoint and clears it on close', async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/observation/')) {
        return jsonResponse({ id: 7, title: 'Memory 7', project: 'claude-mem', created_at_epoch: 1 });
      }
      return jsonResponse(emptyResponse('x'));
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook(() => useGlobalSearch());

    await act(async () => { await result.current.openDetail(memoryResult(7)); });
    expect(fetchMock.mock.calls.some(call => String(call[0]).includes('/api/observation/7'))).toBe(true);
    expect(result.current.detail).toMatchObject({ kind: 'memory', item: { id: 7 } });

    act(() => result.current.closeDetail());
    expect(result.current.detail).toBeNull();
    expect(result.current.isDetailLoading).toBe(false);
  });

  it('routes a failed detail load to detailError without touching the search error', async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) =>
      String(input).includes('/api/observation/')
        ? jsonResponse({}, false)
        : jsonResponse(emptyResponse('x')));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook(() => useGlobalSearch());

    await act(async () => { await result.current.openDetail(memoryResult(7)); });

    expect(result.current.detailError).toBeTruthy();
    expect(result.current.detail).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.isDetailLoading).toBe(false);
  });

  it('fails fast on a malformed search response', async () => {
    const fetchMock = mock(async () => jsonResponse({ query: 'x', totalResults: 0 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook(() => useGlobalSearch());
    act(() => result.current.setQuery('x'));

    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.results).toEqual([]);
  });

  it('fails fast on a malformed detail response', async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) =>
      String(input).includes('/api/observation/')
        ? jsonResponse({ not: 'a detail' })
        : jsonResponse(emptyResponse('x')));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook(() => useGlobalSearch());
    await act(async () => { await result.current.openDetail(memoryResult(7)); });

    expect(result.current.detailError).toBeTruthy();
    expect(result.current.detail).toBeNull();
  });

  it('clears an open detail when the project scope changes', async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) =>
      String(input).includes('/api/observation/')
        ? jsonResponse({ id: 7, created_at_epoch: 1 })
        : jsonResponse(emptyResponse('x')));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    let project = 'project-a';
    const { result, rerender } = renderHook(() => useGlobalSearch(project));

    await act(async () => { await result.current.openDetail(memoryResult(7)); });
    expect(result.current.detail).not.toBeNull();

    project = 'project-b';
    act(() => rerender());
    expect(result.current.detail).toBeNull();
  });
});

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
        memory_session_id: 'mem-7',
        project: 'claude-mem',
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

  it('ignores malformed metadata and aggregates only valid file and concept strings', () => {
    const response: SearchApiResponse = {
      query: 'settings',
      totalResults: 2,
      observations: [{
        id: 12,
        memory_session_id: 'mem-2',
        project: 'claude-mem',
        platform_source: 'claude',
        type: 'feature',
        title: 'Malformed files metadata',
        subtitle: null,
        narrative: null,
        text: null,
        facts: null,
        concepts: JSON.stringify(['settings', ' ', 'settings', 'viewer']),
        files_read: '{invalid json',
        files_modified: JSON.stringify(['src/ui/Search.tsx', '', ' src/ui/Search.tsx ', 'src/ui/Palette.tsx']),
        prompt_number: 5,
        created_at: '2026-06-24T02:00:00.000Z',
        created_at_epoch: 1782247200000,
      }, {
        id: 13,
        memory_session_id: 'mem-3',
        project: 'claude-mem',
        platform_source: 'claude',
        type: 'feature',
        title: 'Malformed concepts metadata',
        subtitle: null,
        narrative: null,
        text: null,
        facts: null,
        concepts: '{invalid json',
        files_read: JSON.stringify(['src/ui/Header.tsx', '', 'src/ui/Header.tsx']),
        files_modified: '{invalid json',
        prompt_number: 6,
        created_at: '2026-06-24T03:00:00.000Z',
        created_at_epoch: 1782250800000,
      }],
      sessions: [],
      prompts: [],
    };

    expect(() => normalizeSearchResponse(response)).not.toThrow();

    const results = normalizeSearchResponse(response);
    expect(results.filter(result => result.kind === 'file').map(result => result.title)).toEqual([
      'src/ui/Header.tsx',
      'src/ui/Palette.tsx',
      'src/ui/Search.tsx',
    ]);
    expect(results.filter(result => result.kind === 'concept').map(result => result.title)).toEqual([
      'settings',
      'viewer',
    ]);
  });

  it('throws on a malformed response missing the result arrays', () => {
    expect(() => normalizeSearchResponse({ query: 'x', totalResults: 0 } as never)).toThrow(/Malformed search response/);
    expect(() => normalizeSearchResponse({
      query: 'x',
      totalResults: 0,
      observations: [],
      sessions: [],
    } as never)).toThrow(/Malformed search response/);
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

import type {
  AggregateSearchResult,
  SearchApiResponse,
  SearchApiObservation,
  SearchRequest,
  SearchResult,
  SearchTypeFilter,
} from './types';
import { API_ENDPOINTS } from '../constants/api';

const TYPE_TO_API_TYPE: Partial<Record<SearchTypeFilter, string>> = {
  memory: 'observations',
  sessions: 'sessions',
  prompts: 'prompts',
};

// Defaults applied to every /api/search request built by buildSearchUrl.
const SEARCH_RESPONSE_FORMAT = 'json';
const SEARCH_ORDER_BY = 'date_desc';
const SEARCH_RESULT_LIMIT = 20;

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

function observationFileValues(observation: SearchApiObservation): string[] {
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
  params.set('format', SEARCH_RESPONSE_FORMAT);
  params.set('orderBy', SEARCH_ORDER_BY);
  params.set('limit', String(SEARCH_RESULT_LIMIT));
  return `${API_ENDPOINTS.SEARCH}?${params.toString()}`;
}

function assertSearchResponse(response: SearchApiResponse): void {
  // The search route is same-origin and trusted, but an error page, a proxy, or
  // a schema drift can still return a body without these arrays. Guard the
  // boundary so a malformed payload fails fast with a clear message instead of
  // throwing an opaque `.map of undefined` deep inside normalization.
  const hasArrays = response !== null
    && typeof response === 'object'
    && Array.isArray(response.observations)
    && Array.isArray(response.sessions)
    && Array.isArray(response.prompts);
  if (!hasArrays) {
    throw new Error('Malformed search response: expected observations, sessions, and prompts arrays');
  }
}

export function normalizeSearchResponse(response: SearchApiResponse): SearchResult[] {
  assertSearchResponse(response);

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

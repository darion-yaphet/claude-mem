export type SearchTypeFilter = 'all' | 'memory' | 'sessions' | 'prompts' | 'files' | 'concepts';

export interface SearchApiObservation {
  id: number;
  memory_session_id: string;
  project: string;
  platform_source?: string;
  type: string;
  title: string | null;
  subtitle: string | null;
  narrative: string | null;
  text: string | null;
  facts: string | null;
  concepts: string | null;
  files_read: string | null;
  files_modified: string | null;
  prompt_number?: number | null;
  created_at?: string;
  created_at_epoch: number;
}

export interface SearchApiSession {
  id: number;
  memory_session_id: string;
  project?: string;
  platform_source?: string;
  request?: string | null;
  investigated?: string | null;
  learned?: string | null;
  completed?: string | null;
  next_steps?: string | null;
  files_read?: string | null;
  files_edited?: string | null;
  notes?: string | null;
  discovery_tokens?: number | null;
  prompt_number?: number | null;
  created_at?: string;
  created_at_epoch: number;
}

export interface SearchApiPrompt {
  id: number;
  content_session_id: string;
  memory_session_id?: string;
  project?: string;
  platform_source?: string;
  prompt_number?: number | null;
  prompt_text: string;
  created_at?: string;
  created_at_epoch: number;
}

export interface SearchApiResponse {
  observations: SearchApiObservation[];
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

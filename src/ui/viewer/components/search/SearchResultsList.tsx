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
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    return (
      <div className="search-results-state">
        Start typing to search memories, sessions, prompts, files, and concepts.
      </div>
    );
  }

  if (isLoading && results.length === 0) {
    return (
      <div className="search-results-state">
        <span className="spinner search-spinner" aria-hidden="true"></span>
        Searching...
      </div>
    );
  }

  if (error) {
    return (
      <div className="search-results-state search-results-error" role="alert">
        {error}
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="search-results-state">
        No results for "{trimmedQuery}".
      </div>
    );
  }

  return (
    <div className="search-results-list" role="list" aria-label="Search results">
      {isLoading && (
        <div className="search-results-loading" role="listitem">
          <span className="spinner search-spinner" aria-hidden="true"></span>
          Updating results...
        </div>
      )}
      {results.map((result, index) => (
        <div key={result.id} role="listitem">
          <SearchResultRow
            result={result}
            isActive={index === activeIndex}
            onSelect={onSelect}
          />
        </div>
      ))}
    </div>
  );
}

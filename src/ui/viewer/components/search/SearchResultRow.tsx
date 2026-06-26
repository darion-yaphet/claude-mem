import React from 'react';
import type { SearchResult, SearchResultKind } from '../../search/types';

interface SearchResultRowProps {
  result: SearchResult;
  isActive: boolean;
  onSelect: (result: SearchResult) => void;
}

const TYPE_LABELS: Record<SearchResultKind, string> = {
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
      aria-current={isActive ? 'true' : undefined}
    >
      <span className={`search-result-type type-${result.kind}`}>
        {TYPE_LABELS[result.kind]}
      </span>
      <span className="search-result-main">
        <span className="search-result-title">{result.title}</span>
        <span className="search-result-subtitle">{result.subtitle || 'No metadata'}</span>
      </span>
      <span className="search-result-action">{result.actionLabel}</span>
    </button>
  );
}

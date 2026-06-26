import React from 'react';
import type { SearchDetail } from '../../hooks/useGlobalSearch';

interface SearchDetailDrawerProps {
  detail: SearchDetail | null;
  isLoading: boolean;
  error: string | null;
  onClose: () => void;
}

function formatDate(epoch?: number, iso?: string): string {
  const value = epoch ? new Date(epoch) : iso ? new Date(iso) : null;
  if (!value || Number.isNaN(value.getTime())) return 'Unknown date';
  return value.toLocaleString();
}

function firstText(...values: Array<string | null | undefined>): string {
  return values.find(value => typeof value === 'string' && value.trim().length > 0)?.trim() ?? '';
}

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

function DetailSection({ label, value }: { label: string; value: string | null | undefined }) {
  const text = value?.trim();
  if (!text) return null;

  return (
    <section className="search-detail-section">
      <h4>{label}</h4>
      <p>{text}</p>
    </section>
  );
}

function DetailList({ label, values }: { label: string; values: string[] }) {
  if (values.length === 0) return null;

  return (
    <section className="search-detail-section">
      <h4>{label}</h4>
      <ul>
        {values.map(value => (
          <li key={value}>{value}</li>
        ))}
      </ul>
    </section>
  );
}

export function SearchDetailDrawer({ detail, isLoading, error, onClose }: SearchDetailDrawerProps) {
  if (!detail && !isLoading && !error) return null;

  const title = detail
    ? detail.kind === 'memory'
      ? firstText(detail.item.title, detail.item.subtitle, detail.item.text, 'Memory')
      : detail.kind === 'session'
        ? firstText(detail.item.request, detail.item.completed, detail.item.investigated, 'Session')
        : firstText(detail.item.prompt_text, 'Prompt')
    : error
      ? 'Unable to load detail'
      : 'Loading detail';

  const date = detail ? formatDate(detail.item.created_at_epoch, detail.item.created_at) : '';
  const project = detail?.item.project;

  return (
    <aside className="search-detail-drawer" aria-label="Search result detail">
      <div className="search-detail-header">
        <div>
          <div className="search-detail-kind">{detail?.kind ?? 'Detail'}</div>
          <h3>{title}</h3>
          <div className="search-detail-meta">
            {[project, date].filter(Boolean).join(' - ')}
          </div>
        </div>
        <button
          type="button"
          className="search-detail-close"
          onClick={onClose}
          aria-label="Close search detail"
        >
          x
        </button>
      </div>

      <div className="search-detail-body">
        {isLoading && (
          <div className="search-results-state">
            <span className="spinner search-spinner" aria-hidden="true"></span>
            Loading detail...
          </div>
        )}

        {!isLoading && error && (
          <div className="search-results-state search-results-error" role="alert">
            {error}
          </div>
        )}

        {!isLoading && !error && detail?.kind === 'memory' && (
          <>
            <DetailSection label="Subtitle" value={detail.item.subtitle} />
            <DetailSection label="Narrative" value={detail.item.narrative} />
            <DetailSection label="Text" value={detail.item.text} />
            <DetailSection label="Facts" value={detail.item.facts} />
            <DetailList label="Concepts" values={parseStringArray(detail.item.concepts)} />
            <DetailList label="Files read" values={parseStringArray(detail.item.files_read)} />
            <DetailList label="Files modified" values={parseStringArray(detail.item.files_modified)} />
          </>
        )}

        {!isLoading && detail?.kind === 'session' && (
          <>
            <DetailSection label="Request" value={detail.item.request} />
            <DetailSection label="Investigated" value={detail.item.investigated} />
            <DetailSection label="Learned" value={detail.item.learned} />
            <DetailSection label="Completed" value={detail.item.completed} />
            <DetailSection label="Next steps" value={detail.item.next_steps} />
            <DetailSection label="Notes" value={detail.item.notes} />
            <DetailList label="Files read" values={parseStringArray(detail.item.files_read)} />
            <DetailList label="Files edited" values={parseStringArray(detail.item.files_edited)} />
          </>
        )}

        {!isLoading && detail?.kind === 'prompt' && (
          <DetailSection label="Prompt" value={detail.item.prompt_text} />
        )}
      </div>
    </aside>
  );
}

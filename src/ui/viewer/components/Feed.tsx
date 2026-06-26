import React, { useMemo, useRef, useEffect } from 'react';
import { Observation, Summary, UserPrompt, FeedItem } from '../types';
import { ObservationCard } from './ObservationCard';
import { SummaryCard } from './SummaryCard';
import { PromptCard } from './PromptCard';
import { ScrollToTop } from './ScrollToTop';
import { UI } from '../constants/ui';

interface FeedProps {
  observations: Observation[];
  summaries: Summary[];
  prompts: UserPrompt[];
  onLoadMore: () => void;
  isLoading: boolean;
  hasMore: boolean;
  highlightTarget?: { kind: 'memory' | 'session' | 'prompt'; id: number } | null;
}

function getFeedItemTarget(item: FeedItem): { kind: 'memory' | 'session' | 'prompt'; id: number; elementId: string } {
  if (item.itemType === 'observation') {
    return { kind: 'memory', id: item.id, elementId: `feed-memory-${item.id}` };
  }

  if (item.itemType === 'summary') {
    return { kind: 'session', id: item.id, elementId: `feed-session-${item.id}` };
  }

  return { kind: 'prompt', id: item.id, elementId: `feed-prompt-${item.id}` };
}

export function Feed({
  observations,
  summaries,
  prompts,
  onLoadMore,
  isLoading,
  hasMore,
  highlightTarget = null,
}: FeedProps) {
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const onLoadMoreRef = useRef(onLoadMore);

  useEffect(() => {
    onLoadMoreRef.current = onLoadMore;
  }, [onLoadMore]);

  useEffect(() => {
    const element = loadMoreRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first.isIntersecting && hasMore && !isLoading) {
          onLoadMoreRef.current?.();
        }
      },
      { threshold: UI.LOAD_MORE_THRESHOLD }
    );

    observer.observe(element);

    return () => {
      if (element) {
        observer.unobserve(element);
      }
      observer.disconnect();
    };
  }, [hasMore, isLoading]);

  const items = useMemo<FeedItem[]>(() => {
    const combined = [
      ...observations.map(o => ({ ...o, itemType: 'observation' as const })),
      ...summaries.map(s => ({ ...s, itemType: 'summary' as const })),
      ...prompts.map(p => ({ ...p, itemType: 'prompt' as const }))
    ];

    return combined.sort((a, b) => b.created_at_epoch - a.created_at_epoch);
  }, [observations, summaries, prompts]);

  return (
    <div className="feed" ref={feedRef}>
      <ScrollToTop targetRef={feedRef} />
      <div className="feed-content">
        {items.map(item => {
          const key = `${item.itemType}-${item.id}`;
          const target = getFeedItemTarget(item);
          const isHighlighted = highlightTarget?.kind === target.kind && highlightTarget.id === target.id;
          const wrapperClassName = `feed-item-wrapper${isHighlighted ? ' feed-highlight' : ''}`;

          if (item.itemType === 'observation') {
            return (
              <div key={key} id={target.elementId} className={wrapperClassName}>
                <ObservationCard observation={item} />
              </div>
            );
          } else if (item.itemType === 'summary') {
            return (
              <div key={key} id={target.elementId} className={wrapperClassName}>
                <SummaryCard summary={item} />
              </div>
            );
          } else {
            return (
              <div key={key} id={target.elementId} className={wrapperClassName}>
                <PromptCard prompt={item} />
              </div>
            );
          }
        })}
        {items.length === 0 && !isLoading && (
          <div style={{ textAlign: 'center', padding: '40px', color: '#8b949e' }}>
            No items to display
          </div>
        )}
        {isLoading && (
          <div style={{ textAlign: 'center', padding: '20px', color: '#8b949e' }}>
            <div className="spinner" style={{ display: 'inline-block', marginRight: '10px' }}></div>
            Loading more...
          </div>
        )}
        {hasMore && !isLoading && items.length > 0 && (
          <div ref={loadMoreRef} style={{ height: '20px', margin: '10px 0' }} />
        )}
        {!hasMore && items.length > 0 && (
          <div style={{ textAlign: 'center', padding: '20px', color: '#8b949e', fontSize: '14px' }}>
            No more items to load
          </div>
        )}
      </div>
    </div>
  );
}

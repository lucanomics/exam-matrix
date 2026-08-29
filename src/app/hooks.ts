/**
 * React bindings for the store, plus the derived views every screen needs.
 *
 * The derived values are memoised on the snapshot object identity: the store
 * replaces the whole snapshot on every write, so a stale memo is impossible and
 * an unchanged snapshot never recomputes.
 */

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { store, type AppState } from '../data/store.ts';
import { buildIndex } from '../domain/search.ts';
import { countToday } from '../domain/review/queue.ts';
import { buildWeaknessReport } from '../domain/weakness.ts';
import type { ID, StudyItem } from '../domain/models.ts';

export function useApp(): AppState {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

export function useSnapshot() {
  return useApp().snapshot;
}

export function useActiveExam() {
  return useApp().snapshot.exam;
}

export function useItemsById(): Map<ID, StudyItem> {
  const { items } = useSnapshot();
  return useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
}

export function useTopicTitles(): Map<ID, string> {
  const { topics } = useSnapshot();
  return useMemo(() => new Map(topics.map((t) => [t.id, t.title])), [topics]);
}

export function useSubjectTitles(): Map<ID, string> {
  const { subjects } = useSnapshot();
  return useMemo(() => new Map(subjects.map((s) => [s.id, s.title])), [subjects]);
}

export function useSearchIndex() {
  const snap = useSnapshot();
  return useMemo(
    () => buildIndex({
      items: snap.items, matrices: snap.matrices, topics: snap.topics, subjects: snap.subjects,
    }),
    [snap.items, snap.matrices, snap.topics, snap.subjects],
  );
}

export function useTodayCounts(now?: Date) {
  const snap = useSnapshot();
  const key = now?.toDateString();
  return useMemo(
    () => countToday(snap.items, snap.lastReviews, now ?? new Date()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snap.items, snap.lastReviews, key],
  );
}

export function useWeaknessReport() {
  const snap = useSnapshot();
  return useMemo(
    () => buildWeaknessReport({
      items: snap.items,
      reviews: snap.reviews,
      lastReviews: snap.lastReviews,
      relations: snap.relations,
      topics: snap.topics,
      subjects: snap.subjects,
    }),
    [snap.items, snap.reviews, snap.lastReviews, snap.relations, snap.topics, snap.subjects],
  );
}

/** Wrap a write so the caller does not have to remember to refresh. */
export function useMutate() {
  return useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    const result = await fn();
    await store.refresh();
    return result;
  }, []);
}

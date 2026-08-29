/**
 * The application store.
 *
 * A plain external store read through `useSyncExternalStore`, not a state
 * library. The justification (§29): the durable state already lives in
 * IndexedDB, so what React needs is a cached read of one exam plus a way to be
 * told it changed. That is about a hundred lines. Redux, Zustand or a query
 * cache would each add a dependency, a set of conventions and a second place
 * for truth to live, to solve a problem this app does not have.
 *
 * Everything mutating goes through `repo`, then calls `refresh()`. Reads are
 * synchronous against the cached snapshot, which is what keeps the queue
 * builder, the search index and the weakness report renderable without effects.
 */

import type { Exam, ID, Settings } from '../domain/models.ts';
import {
  emptySnapshot, listExams, loadExamSnapshot, type ExamSnapshot,
} from './repo.ts';
import { getDB, readMeta, readSettings, writeMeta, writeSettings, DEFAULT_SETTINGS } from './db.ts';
import { readLegacyLocalStorage } from './import/legacy.ts';
import { legacyToPayload } from './import/legacy.ts';
import { importPayload } from './repo.ts';

export interface AppState {
  ready: boolean;
  exams: Exam[];
  activeExamId?: ID;
  snapshot: ExamSnapshot;
  settings: Settings;
  /** Set once if a legacy editor save was found and converted on first run. */
  legacyNotice?: { examTitle: string; items: number };
  error?: string;
}

const initialState: AppState = {
  ready: false,
  exams: [],
  snapshot: emptySnapshot(),
  settings: DEFAULT_SETTINGS,
};

type Listener = () => void;

class Store {
  private state: AppState = initialState;
  private listeners = new Set<Listener>();
  private booted = false;

  getState = (): AppState => this.state;

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  };

  private set(patch: Partial<AppState>): void {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn();
  }

  /** Called once from the app root. Safe to call again; it no-ops. */
  boot = async (): Promise<void> => {
    if (this.booted) return;
    this.booted = true;
    try {
      const db = await getDB();
      await readMeta(db);
      const settings = await readSettings(db);
      let exams = await listExams(db);

      // First run in a browser that still holds the old editor's save.
      if (exams.length === 0) {
        const legacy = readLegacyLocalStorage();
        if (legacy) {
          const payload = legacyToPayload(legacy);
          await importPayload(payload, 'merge', db);
          await writeMeta({ legacyImportedAt: new Date().toISOString() }, db);
          exams = await listExams(db);
          this.set({
            legacyNotice: {
              examTitle: payload.exams[0]?.title ?? '이전 시험',
              items: payload.items.length,
            },
          });
        }
      }

      const activeExamId =
        settings.activeExamId && exams.some((e) => e.id === settings.activeExamId)
          ? settings.activeExamId
          : exams[0]?.id;

      const snapshot = await loadExamSnapshot(activeExamId, db);
      this.set({ ready: true, exams, settings, snapshot, ...(activeExamId ? { activeExamId } : {}) });
    } catch (err) {
      this.set({ ready: true, error: (err as Error).message });
    }
  };

  /** Re-read the active exam. Call after any write. */
  refresh = async (): Promise<void> => {
    const db = await getDB();
    const exams = await listExams(db);
    const activeExamId =
      this.state.activeExamId && exams.some((e) => e.id === this.state.activeExamId)
        ? this.state.activeExamId
        : exams[0]?.id;
    const snapshot = await loadExamSnapshot(activeExamId, db);
    this.set({ exams, snapshot, ...(activeExamId ? { activeExamId } : { activeExamId: undefined }) });
  };

  selectExam = async (examId: ID): Promise<void> => {
    const db = await getDB();
    const settings = await writeSettings({ activeExamId: examId }, db);
    const snapshot = await loadExamSnapshot(examId, db);
    this.set({ activeExamId: examId, snapshot, settings });
  };

  updateSettings = async (patch: Partial<Settings>): Promise<void> => {
    const settings = await writeSettings(patch);
    this.set({ settings });
  };

  dismissLegacyNotice = (): void => this.set({ legacyNotice: undefined });
}

export const store = new Store();

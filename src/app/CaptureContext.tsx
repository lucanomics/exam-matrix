/**
 * Quick Capture is reachable from every screen, so its open/close state lives
 * above the router rather than inside any one page.
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { ID } from '../domain/models.ts';

export interface CaptureSeed {
  topicId?: ID;
  subjectId?: ID;
  prompt?: string;
  answer?: string;
  confusedWithId?: ID;
  cellRef?: { matrixId: ID; rowId: ID; columnId: ID };
  sourceTitle?: string;
}

interface CaptureApi {
  open: (seed?: CaptureSeed) => void;
  close: () => void;
  seed: CaptureSeed | null;
  isOpen: boolean;
}

const Ctx = createContext<CaptureApi>({ open: () => {}, close: () => {}, seed: null, isOpen: false });
export const useCapture = (): CaptureApi => useContext(Ctx);

export function CaptureProvider({ children }: { children: ReactNode }) {
  const [seed, setSeed] = useState<CaptureSeed | null>(null);
  const open = useCallback((s: CaptureSeed = {}) => setSeed(s), []);
  const close = useCallback(() => setSeed(null), []);
  const api = useMemo(() => ({ open, close, seed, isOpen: seed !== null }), [open, close, seed]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

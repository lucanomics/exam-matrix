/**
 * Transient confirmations. Announced politely so a screen reader hears the
 * save that a sighted user sees.
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

interface ToastItem { id: number; text: string; tone: 'info' | 'warn'; action?: { label: string; run: () => void } }

interface ToastApi {
  show: (text: string, opts?: { tone?: 'info' | 'warn'; action?: ToastItem['action']; ms?: number }) => void;
}

const Ctx = createContext<ToastApi>({ show: () => {} });
export const useToast = (): ToastApi => useContext(Ctx);

let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const show = useCallback<ToastApi['show']>((text, opts = {}) => {
    const id = ++seq;
    setItems((prev) => [...prev.slice(-2), { id, text, tone: opts.tone ?? 'info', ...(opts.action ? { action: opts.action } : {}) }]);
    window.setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), opts.ms ?? 4200);
  }, []);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={t.tone === 'warn' ? 'toast toast--warn' : 'toast'}>
            <span style={{ flex: 1 }}>{t.text}</span>
            {t.action ? (
              <button type="button" onClick={() => { t.action!.run(); setItems((p) => p.filter((x) => x.id !== t.id)); }}>
                {t.action.label}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

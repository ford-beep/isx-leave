"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

type Toast = { id: number; kind: "ok" | "err" | "info"; message: string };
type Ctx = { push: (message: string, kind?: Toast["kind"]) => void };

const ToastCtx = createContext<Ctx>({ push: () => {} });
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);

  const push = useCallback((message: string, kind: Toast["kind"] = "info") => {
    const id = Date.now() + Math.random();
    setItems((t) => [...t, { id, kind, message }]);
    setTimeout(() => setItems((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);

  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            <span>{t.message}</span>
            <button className="x" aria-label="Dismiss"
              onClick={() => setItems((s) => s.filter((x) => x.id !== t.id))}>×</button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/** Fires a toast whenever a server action result changes. */
export function useActionToast(state: { ok: boolean; message?: string } | null) {
  const { push } = useToast();
  useEffect(() => {
    if (state?.message) push(state.message, state.ok ? "ok" : "err");
  }, [state, push]);
}

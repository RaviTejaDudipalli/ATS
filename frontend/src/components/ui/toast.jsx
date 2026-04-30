'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

const ICONS = {
  success: { Icon: CheckCircle2, ring: 'ring-emerald-500/30', bg: 'bg-emerald-500/10', fg: 'text-emerald-700 dark:text-emerald-300' },
  error:   { Icon: AlertTriangle, ring: 'ring-rose-500/30',    bg: 'bg-rose-500/10',    fg: 'text-rose-700 dark:text-rose-300' },
  info:    { Icon: Info,         ring: 'ring-brand-500/30',   bg: 'bg-brand-500/10',   fg: 'text-brand-700 dark:text-brand-300' },
};

let counter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
    const handle = timers.current.get(id);
    if (handle) { clearTimeout(handle); timers.current.delete(id); }
  }, []);

  const push = useCallback(
    ({ kind = 'info', title, description, durationMs = 4500 }) => {
      const id = ++counter;
      setToasts((ts) => [...ts, { id, kind, title, description }]);
      if (durationMs > 0) {
        const handle = setTimeout(() => dismiss(id), durationMs);
        timers.current.set(id, handle);
      }
      return id;
    },
    [dismiss],
  );

  // Stable shorthand functions so consumers can destructure and memoize.
  const value = useMemo(
    () => ({
      toast: push,
      success: (title, description) => push({ kind: 'success', title, description }),
      error: (title, description) => push({ kind: 'error', title, description }),
      info: (title, description) => push({ kind: 'info', title, description }),
      dismiss,
    }),
    [push, dismiss],
  );

  // Cleanup timers on unmount.
  useEffect(() => () => {
    for (const h of timers.current.values()) clearTimeout(h);
    timers.current.clear();
  }, []);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        // Live region — screen readers announce new toasts as they appear.
        role="region"
        aria-label="Notifications"
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2"
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => {
            const cfg = ICONS[t.kind] || ICONS.info;
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 40, transition: { duration: 0.2 } }}
                transition={{ type: 'spring', stiffness: 280, damping: 24 }}
                role={t.kind === 'error' ? 'alert' : 'status'}
                aria-live={t.kind === 'error' ? 'assertive' : 'polite'}
                className={`pointer-events-auto card flex items-start gap-3 p-3.5 ring-1 ${cfg.ring} ${cfg.bg}`}
              >
                <span className={`mt-0.5 ${cfg.fg}`}>
                  <cfg.Icon size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  {t.title && <div className="text-sm font-semibold">{t.title}</div>}
                  {t.description && <div className="muted mt-0.5 text-sm">{t.description}</div>}
                </div>
                <button
                  type="button"
                  aria-label="Dismiss notification"
                  onClick={() => dismiss(t.id)}
                  className="muted -m-1 rounded-lg p-1 transition hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <X size={14} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}

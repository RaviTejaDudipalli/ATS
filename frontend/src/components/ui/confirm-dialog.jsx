'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Loader2 } from 'lucide-react';

/**
 * Accessible confirm dialog.
 *
 * Replaces the native `window.confirm()` (which can't be styled, isn't
 * keyboard-trapped, and confuses screen readers).
 *
 * Usage:
 *   const confirm = useConfirm();
 *   const ok = await confirm({
 *     title: 'Delete job?',
 *     description: 'Applications will be removed too.',
 *     confirmLabel: 'Delete',
 *     destructive: true,
 *   });
 */

let resolver = null;
let mountedSetter = null;

export function useConfirm() {
  return (opts) => new Promise((resolve) => {
    resolver = resolve;
    mountedSetter?.(opts || {});
  });
}

export function ConfirmDialogHost() {
  const [opts, setOpts] = useState(null);
  const [loading, setLoading] = useState(false);
  const dialogRef = useRef(null);
  const confirmBtnRef = useRef(null);
  const prevFocus = useRef(null);

  // Wire setter so useConfirm() can open the dialog without prop-drilling.
  useEffect(() => {
    mountedSetter = setOpts;
    return () => { mountedSetter = null; };
  }, []);

  const close = useCallback((result) => {
    if (resolver) { resolver(result); resolver = null; }
    setOpts(null);
    setLoading(false);
    if (prevFocus.current) prevFocus.current.focus();
  }, []);

  // Focus management: trap, autofocus the confirm button, restore focus on close.
  useEffect(() => {
    if (!opts) return;
    prevFocus.current = document.activeElement;
    confirmBtnRef.current?.focus();

    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(false); }
      if (e.key === 'Tab' && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [opts, close]);

  if (!opts) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="confirm-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
        onMouseDown={(e) => { if (e.target === e.currentTarget) close(false); }}
      >
        <motion.div
          key="confirm-dialog"
          ref={dialogRef}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          aria-describedby="confirm-desc"
          initial={{ scale: 0.96, opacity: 0, y: 8 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.97, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 26 }}
          className="card w-full max-w-md p-6"
        >
          <div className="flex items-start gap-3">
            {opts.destructive && (
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-rose-500/10 text-rose-600">
                <AlertTriangle size={18} />
              </span>
            )}
            <div className="flex-1">
              <h2 id="confirm-title" className="text-lg font-semibold">
                {opts.title || 'Are you sure?'}
              </h2>
              {opts.description && (
                <p id="confirm-desc" className="muted mt-1 text-sm">
                  {opts.description}
                </p>
              )}
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => close(false)}
              className="btn-ghost"
              disabled={loading}
            >
              {opts.cancelLabel || 'Cancel'}
            </button>
            <button
              ref={confirmBtnRef}
              type="button"
              onClick={async () => {
                if (opts.onConfirm) {
                  try { setLoading(true); await opts.onConfirm(); } finally { close(true); }
                } else {
                  close(true);
                }
              }}
              className={
                opts.destructive
                  ? 'btn inline-flex items-center gap-2 bg-rose-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-rose-500'
                  : 'btn-primary'
              }
              disabled={loading}
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              {opts.confirmLabel || 'Confirm'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

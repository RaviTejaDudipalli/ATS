'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, Sun, Moon, LogOut, LayoutDashboard, User } from 'lucide-react';
import { useTheme } from 'next-themes';
import clsx from 'clsx';

import { useAuth } from '@/lib/auth-context';

const navLinks = [
  { href: '/', label: 'Home' },
  { href: '/about', label: 'About' },
  { href: '/careers', label: 'Careers' },
  { href: '/contact', label: 'Contact' },
];

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    setMounted(true);
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => { setOpen(false); }, [pathname]);

  // Close the mobile menu on Escape; also lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  const dashboardHref =
    user?.role === 'RECRUITER' ? '/recruiter/dashboard' : '/candidate/dashboard';

  const isDark = mounted && (resolvedTheme || theme) === 'dark';

  return (
    <header
      className={clsx(
        'sticky top-0 z-40 transition-all',
        scrolled ? 'glass border-b' : 'border-b border-transparent',
      )}
      style={{ borderColor: scrolled ? 'rgb(var(--border))' : undefined }}
    >
      <div className="container-page flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-purple-500 text-white shadow-soft">
            R
          </span>
          <span>Hayai</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {navLinks.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? 'page' : undefined}
                className={clsx(
                  'relative rounded-lg px-3 py-2 text-sm font-medium transition focus:outline-none focus-visible:shadow-glow',
                  active ? 'text-brand-600' : 'muted hover:text-current',
                )}
              >
                {l.label}
                {active && (
                  <motion.span
                    layoutId="nav-underline"
                    className="absolute inset-x-2 -bottom-0.5 h-0.5 rounded bg-brand-500"
                  />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <button
            type="button"
            aria-label="Toggle theme"
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            className="btn-ghost h-10 w-10 !px-0"
          >
            {mounted ? (isDark ? <Sun size={18} /> : <Moon size={18} />) : <Moon size={18} />}
          </button>

          {user ? (
            <>
              <Link href={dashboardHref} className="btn-ghost">
                <LayoutDashboard size={16} /> Dashboard
              </Link>
              <button
                type="button"
                onClick={() => { logout(); router.push('/'); }}
                className="btn-ghost"
              >
                <LogOut size={16} /> Logout
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-ghost"><User size={16} /> Log in</Link>
              <Link href="/signup" className="btn-primary">Get started</Link>
            </>
          )}
        </div>

        <button
          type="button"
          className="btn-ghost h-10 w-10 !px-0 md:hidden"
          aria-label="Toggle menu"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="md:hidden overflow-hidden border-t"
            style={{ borderColor: 'rgb(var(--border))' }}
          >
            <div className="container-page flex flex-col gap-1 py-3">
              {navLinks.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5"
                >
                  {l.label}
                </Link>
              ))}
              <div className="my-2 h-px" style={{ background: 'rgb(var(--border))' }} />
              <button
                type="button"
                onClick={() => setTheme(isDark ? 'light' : 'dark')}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5"
              >
                {isDark ? <Sun size={16} /> : <Moon size={16} />} Toggle theme
              </button>
              {user ? (
                <>
                  <Link href={dashboardHref} className="rounded-lg px-3 py-2 text-sm font-medium">Dashboard</Link>
                  <button
                    type="button"
                    onClick={() => { logout(); router.push('/'); }}
                    className="rounded-lg px-3 py-2 text-left text-sm font-medium"
                  >
                    Log out
                  </button>
                </>
              ) : (
                <>
                  <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-medium">Log in</Link>
                  <Link href="/signup" className="btn-primary mt-1">Get started</Link>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

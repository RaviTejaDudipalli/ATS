import Link from 'next/link';
import { Github, Linkedin, Twitter } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="mt-16 border-t" style={{ borderColor: 'rgb(var(--border))' }}>
      <div className="container-page grid gap-10 py-12 md:grid-cols-4">
        <div>
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-purple-500 text-white">
              R
            </span>
            Hayai
          </Link>
          <p className="muted mt-3 max-w-xs text-sm">
            Hire smarter with built-in resume scoring, intuitive workflows, and a candidate
            experience that respects everyone's time.
          </p>
        </div>

        <div>
          <h4 className="mb-3 text-sm font-semibold">Product</h4>
          <ul className="space-y-2 text-sm muted">
            <li><Link href="/careers" className="hover:text-current">Careers</Link></li>
            <li><Link href="/about" className="hover:text-current">About</Link></li>
            <li><Link href="/contact" className="hover:text-current">Contact</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="mb-3 text-sm font-semibold">For users</h4>
          <ul className="space-y-2 text-sm muted">
            <li><Link href="/signup" className="hover:text-current">Create account</Link></li>
            <li><Link href="/login" className="hover:text-current">Log in</Link></li>
            <li><Link href="/jobs" className="hover:text-current">Browse jobs</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="mb-3 text-sm font-semibold">Connect</h4>
          <div className="flex gap-2">
            <a className="btn-ghost h-9 w-9 !px-0" href="#" aria-label="GitHub"><Github size={16} /></a>
            <a className="btn-ghost h-9 w-9 !px-0" href="#" aria-label="LinkedIn"><Linkedin size={16} /></a>
            <a className="btn-ghost h-9 w-9 !px-0" href="#" aria-label="Twitter"><Twitter size={16} /></a>
          </div>
        </div>
      </div>
      <div className="border-t" style={{ borderColor: 'rgb(var(--border))' }}>
        <div className="container-page flex h-14 items-center justify-between text-xs muted">
          <span>© {new Date().getFullYear()} Hayai. All rights reserved.</span>
          <span>Crafted with care.</span>
        </div>
      </div>
    </footer>
  );
}

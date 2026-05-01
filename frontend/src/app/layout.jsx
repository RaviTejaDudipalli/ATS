import './globals.css';
import { Inter } from 'next/font/google';
import { ThemeProvider } from '@/components/theme-provider';
import { AuthProvider } from '@/lib/auth-context';
import { ToastProvider } from '@/components/ui/toast';
import { ConfirmDialogHost } from '@/components/ui/confirm-dialog';
import Navbar from '@/components/navbar';
import Footer from '@/components/footer';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

export const metadata = {
  title: 'Ravi Demo ATS · Hire smarter',
  description:
    'A clean, modern applicant tracking system with built-in resume scoring.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="min-h-screen flex flex-col">
        <ThemeProvider>
          <AuthProvider>
            <ToastProvider>
              <a
                href="#main"
                className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-brand-500 focus:px-3 focus:py-1.5 focus:text-sm focus:text-white"
              >
                Skip to content
              </a>
              <Navbar />
              <main id="main" className="flex-1">{children}</main>
              <Footer />
              <ConfirmDialogHost />
            </ToastProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

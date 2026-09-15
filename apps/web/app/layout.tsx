import type { ReactNode } from 'react';
import Link from 'next/link';
import './globals.css';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="chrome">
          <Link href="/" className="chrome__brand">
            camefa
          </Link>
          <Link href="/decide">decide</Link>
        </nav>
        {children}
      </body>
    </html>
  );
}

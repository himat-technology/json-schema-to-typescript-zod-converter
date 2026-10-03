import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { SITE } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: SITE.name,
    template: `%s | ${SITE.name}`,
  },
  description: "Free, privacy-first developer tools by Himat Technologies.",
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-brand-700 focus:shadow"
        >
          Skip to content
        </a>
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
            <Link
              href="/free-tools/json-schema-to-typescript-zod-converter"
              className="flex items-center gap-2 rounded-md font-semibold text-navy-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            >
              <span aria-hidden className="grid size-8 place-items-center rounded-lg bg-navy-900 text-sm font-bold text-white">
                H
              </span>
              <span>
                Himat <span className="text-brand-600">Technologies</span>
              </span>
            </Link>
          </div>
        </header>
        <main id="main" className="flex-1">
          {children}
        </main>
        <footer className="border-t border-slate-200 bg-white">
          <div className="mx-auto max-w-7xl px-4 py-6 text-sm text-slate-500 sm:px-6 lg:px-8">
            © {new Date().getFullYear()} {SITE.name}. Free tools run entirely in your browser.
          </div>
        </footer>
      </body>
    </html>
  );
}

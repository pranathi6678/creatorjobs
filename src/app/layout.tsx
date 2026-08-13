import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CreatorJobs — powered by Whop",
  description: "A minimal marketplace connecting buyers and sellers, powered by Whop.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-neutral-50 text-neutral-900">
        <header className="border-b border-neutral-200 bg-white">
          <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
            <Link href="/" className="text-lg font-semibold text-neutral-900">
              CreatorJobs
            </Link>
            <div className="flex gap-6 text-sm text-neutral-700">
              <Link href="/" className="hover:underline">
                Browse
              </Link>
              <Link href="/sell" className="hover:underline">
                Become a seller
              </Link>
              <Link href="/dashboard" className="hover:underline">
                Ops dashboard
              </Link>
            </div>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">{children}</main>
        <footer className="border-t border-neutral-200 py-6 text-center text-xs text-neutral-500">
          CreatorJobs — a Whop Technical CSM take-home prototype
        </footer>
      </body>
    </html>
  );
}

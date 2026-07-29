import type { Metadata } from "next";
import { Playfair_Display, Jost } from "next/font/google";
import "./globals.css";

/** Display serif — headlines only, always large, never below ~20px. */
const playfair = Playfair_Display({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
});

/** UI sans — everything else, including the letter-spaced caps on buttons. */
const jost = Jost({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Handled — Never forget her birthday again",
  description:
    "A standing order for the dates that matter. Set them once; the right gift arrives on the day, at the right address, for the next twelve months.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${playfair.variable} ${jost.variable} h-full antialiased`}>
      <head>
        {/* The reveal animations start content at opacity 0. Without
            JavaScript nothing would ever bring it back, so hand non-scripted
            clients an override rather than relying on a script to undo it. */}
        <noscript>
          <style>{`.reveal{opacity:1!important;transform:none!important}.ink-path{stroke-dashoffset:0!important}`}</style>
        </noscript>
        {/* The seal is decorative; hint the browser to paint it early */}
        <meta name="color-scheme" content="light" />
      </head>
      <body className="flex min-h-full flex-col bg-bone text-ink">{children}</body>
    </html>
  );
}

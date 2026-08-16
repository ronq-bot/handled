import Link from "next/link";
import { Logo } from "./logo";

// Rooted ("/#how") so they still resolve from pages that share this chrome,
// like /risk — a bare "#how" goes nowhere from anywhere but the landing page.
const SECTIONS = [
  { href: "/#how", label: "How it works" },
  { href: "/#gifts", label: "The catalogue" },
  { href: "/#pricing", label: "Membership" },
  { href: "/#faq", label: "Questions" },
];

export function MarketingHeader({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bone/92 backdrop-blur-sm">
      <div className="container-x flex h-20 items-center justify-between gap-8">
        <Logo />

        <nav aria-label="Sections" className="hidden items-center gap-9 lg:flex">
          {SECTIONS.map((s) => (
            <a
              key={s.href}
              href={s.href}
              className="border-b border-transparent py-1 text-[0.6875rem] font-medium uppercase tracking-[0.2em] text-muted transition-colors hover:border-brass hover:text-ink"
            >
              {s.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-6">
          {signedIn ? (
            <Link href="/dashboard" className="btn btn-primary">
              My orders
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden text-[0.6875rem] font-medium uppercase tracking-[0.2em] text-muted transition-colors hover:text-ink sm:inline"
              >
                Sign in
              </Link>
              <Link href="/signup" className="btn btn-primary">
                Begin
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-bone-2">
      <div className="container-x py-20">
        <div className="grid gap-14 md:grid-cols-[1.6fr_1fr_1fr]">
          <div>
            <Logo />
            <p className="mt-7 max-w-sm text-[0.9375rem] leading-relaxed text-muted">
              A standing order for the dates that matter. Set them once; the right gift arrives on
              the day, at the right address, for the next twelve months.
            </p>
          </div>

          <nav aria-label="The service">
            <h2 className="smallcaps-quiet">The service</h2>
            <ul className="mt-6 space-y-3">
              {SECTIONS.map((s) => (
                <li key={s.href}>
                  <a
                    href={s.href}
                    className="text-[0.9375rem] text-muted transition-colors hover:text-ink"
                  >
                    {s.label}
                  </a>
                </li>
              ))}
              <li>
                <Link
                  href="/risk"
                  className="text-[0.9375rem] text-muted transition-colors hover:text-ink"
                >
                  The Doghouse Risk Meter
                </Link>
              </li>
            </ul>
          </nav>

          <nav aria-label="Account">
            <h2 className="smallcaps-quiet">Account</h2>
            <ul className="mt-6 space-y-3">
              <li>
                <Link
                  href="/signup"
                  className="text-[0.9375rem] text-muted transition-colors hover:text-ink"
                >
                  Become a member
                </Link>
              </li>
              <li>
                <Link
                  href="/login"
                  className="text-[0.9375rem] text-muted transition-colors hover:text-ink"
                >
                  Sign in
                </Link>
              </li>
            </ul>
          </nav>
        </div>

        <hr className="rule mt-16" />

        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 text-[0.8125rem] text-faint">
          <p>© {new Date().getUTCFullYear()} Handled</p>
          <p>Partner names shown in this build are illustrative.</p>
        </div>
      </div>
    </footer>
  );
}

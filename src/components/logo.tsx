import Link from "next/link";

/**
 * A wordmark, not a badge. Serif name, letter-spaced descriptor beneath —
 * the way a house that has existed for eighty years would set it.
 */
export function Logo({ href = "/", compact = false }: { href?: string; compact?: boolean }) {
  return (
    <Link href={href} className="group inline-block leading-none">
      <span className="serif block text-[1.35rem] tracking-tight text-ink transition-colors group-hover:text-forest">
        Handled
      </span>
      {!compact && (
        <span className="mt-1 block text-[0.5625rem] font-medium uppercase tracking-[0.34em] text-brass-deep">
          Standing gift orders
        </span>
      )}
    </Link>
  );
}

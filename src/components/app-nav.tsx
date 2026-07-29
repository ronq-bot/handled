"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/dates", label: "Dates" },
  { href: "/dashboard/gifts", label: "Orders" },
  { href: "/dashboard/people", label: "Recipients" },
  { href: "/dashboard/coverage", label: "Fulfilment" },
  { href: "/dashboard/settings", label: "Account" },
];

/** Letter-spaced tabs with a brass underline for the current page. */
export function AppNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Account" className="container-x">
      <ul className="-mb-px flex gap-8 overflow-x-auto">
        {NAV.map((item) => {
          const active =
            item.href === "/dashboard" ? pathname === item.href : pathname.startsWith(item.href);

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`block whitespace-nowrap border-b-2 py-4 text-[0.6875rem] font-medium uppercase tracking-[0.2em] transition-colors ${
                  active
                    ? "border-brass text-ink"
                    : "border-transparent text-muted hover:border-line-strong hover:text-ink"
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

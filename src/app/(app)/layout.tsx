import { Logo } from "@/components/logo";
import { AppNav } from "@/components/app-nav";
import { requireUser } from "@/lib/auth";
import { logoutAction } from "../(auth)/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="skip-link">
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-line bg-bone/92 backdrop-blur-sm">
        <div className="container-x flex h-20 items-center justify-between gap-6">
          <Logo href="/dashboard" />
          <div className="flex items-center gap-6">
            <span className="hidden text-[0.8125rem] text-muted sm:block">
              {user.name || user.email}
            </span>
            <form action={logoutAction}>
              <button type="submit" className="btn btn-ghost min-h-10 px-5 py-2">
                Sign out
              </button>
            </form>
          </div>
        </div>
        <AppNav />
      </header>

      <main id="main" className="container-x flex-1 py-14">
        {children}
      </main>

      <footer className="border-t border-line bg-bone-2 py-10">
        <div className="container-x text-[0.8125rem] text-faint">
          Handled · Gifts dispatched on your behalf. The credit is entirely yours.
        </div>
      </footer>
    </div>
  );
}

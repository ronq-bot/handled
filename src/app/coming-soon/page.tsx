import type { Metadata } from "next";
import { SealMark } from "@/components/illustrations";

export const metadata: Metadata = {
  title: "Handled — Opening soon",
  description: "A standing order for the dates that matter. Opening soon.",
  // Nothing here should be indexed while the real site is behind the gate.
  robots: { index: false, follow: false },
};

/**
 * The holding page. `middleware.ts` rewrites every route here while
 * HANDLED_COMING_SOON is on, so this is the only thing the public can reach —
 * and because it's a rewrite rather than a redirect, the URL is preserved and
 * no one can map which routes actually exist.
 */
export default function ComingSoonPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-24">
      <div className="container-tight text-center">
        <div className="enter flex justify-center">
          <SealMark className="drift h-16 w-16 text-brass" />
        </div>

        <div className="enter" style={{ animationDelay: "0.08s" }}>
          <p className="smallcaps mt-8">Est. for the chronically forgetful</p>
          <hr className="rule-brass mx-auto mt-6" />
        </div>

        <div className="enter" style={{ animationDelay: "0.16s" }}>
          <h1 className="display-1 mt-10 text-ink">
            Something is being
            <br />
            <em className="italic text-forest">handled.</em>
          </h1>
        </div>

        <div className="enter" style={{ animationDelay: "0.24s" }}>
          <p className="lede mx-auto mt-9">
            A standing order for the dates that matter — set once, then delivered on the day for
            the next twelve months. We are putting the finishing touches to it.
          </p>
          <p className="mt-10 text-[0.9375rem] text-faint">
            Opening shortly. Do try to remember her birthday in the meantime.
          </p>
        </div>
      </div>
    </main>
  );
}

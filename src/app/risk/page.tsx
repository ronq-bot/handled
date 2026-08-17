import type { Metadata } from "next";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth";
import { MarketingHeader, SiteFooter } from "@/components/site-chrome";
import { RiskQuiz } from "./risk-quiz";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "The Doghouse Risk Meter — Handled",
  description:
    "Enter the dates that matter and get an honest score for how exposed you are. Free, no account, and the number is only fixable one way.",
};

/**
 * The public quiz — see docs/MARKETING.md, campaign 2. It runs the dashboard's
 * real `dogHouseRisk()` in the browser: a real feature wearing a growth page's
 * clothes, not a gimmick with a made-up number.
 */
export default async function RiskPage() {
  const signedIn = (await cookies()).has(SESSION_COOKIE);

  return (
    <>
      <MarketingHeader signedIn={signedIn} />

      <main className="section">
        <div className="container-tight">
          <p className="smallcaps">A free reading, no account required</p>
          <h1 className="display-2 mt-5">The Doghouse Risk Meter.</h1>
          <p className="lede mt-6 max-w-2xl">
            The same score our members see on their dashboard, computed on the dates you are about
            to type with your own two hands. It is theatrical, and it is also correct.
          </p>

          <div className="mt-14">
            <RiskQuiz />
          </div>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}

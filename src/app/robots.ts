import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Nothing behind a login is worth a crawler's time, and the auth
        // pages carry no content worth ranking.
        disallow: ["/dashboard", "/api/", "/onboarding", "/reset", "/forgot"],
      },
    ],
    sitemap: `${env.appUrl}/sitemap.xml`,
  };
}

import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${env.appUrl}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${env.appUrl}/risk`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${env.appUrl}/signup`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${env.appUrl}/login`, changeFrequency: "yearly", priority: 0.3 },
  ];
}

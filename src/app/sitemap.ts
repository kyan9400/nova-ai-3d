import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Static so it also works in the GitHub Pages export.
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${SITE_URL}/`, changeFrequency: "monthly", priority: 1 }];
}

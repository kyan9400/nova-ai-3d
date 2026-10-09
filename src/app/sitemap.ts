import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: "https://nova-ai-3d-xi.vercel.app/", changeFrequency: "monthly", priority: 1 }];
}

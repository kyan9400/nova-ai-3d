// Canonical address of the live site (metadata, canonical link, JSON-LD).
export const SITE_URL = "https://nova-ai-3d-xi.vercel.app";

// GitHub Pages mirror (GH_PAGES=1 build). Its OG images resolve against this origin;
// the canonical link still points at SITE_URL.
export const PAGES_ORIGIN = "https://kyan9400.github.io";
export const IS_PAGES = process.env.GH_PAGES === "1";

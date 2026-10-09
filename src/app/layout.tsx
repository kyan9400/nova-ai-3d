import type { Metadata, Viewport } from "next";
import { Archivo, Martian_Mono } from "next/font/google";
import { motionBootScript } from "@/lib/motion-boot";
import "./globals.css";

// Archivo is variable on weight AND width: the expanded display cut and the body text share one file.
const sans = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});

const mono = Martian_Mono({
  subsets: ["latin"],
  variable: "--font-martian",
  display: "swap",
  preload: false,
});

const SITE_URL = "https://nova-ai-3d-xi.vercel.app";
const TITLE = "Nova — a mind that listens before it speaks";
const DESCRIPTION =
  "Nova reads your team's docs, meetings and tickets and answers in seconds, with the source attached. Talk to the particle orb and see it think.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: "%s · Nova" },
  description: DESCRIPTION,
  applicationName: "Nova",
  authors: [{ name: "Alhassan Alfarran", url: "https://alhassan-portfolio-sigma.vercel.app" }],
  creator: "Alhassan Alfarran",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Nova",
    title: TITLE,
    description: DESCRIPTION,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0b",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: motionBootScript }} />
      </head>
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}

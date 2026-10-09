import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Lost in orbit",
  description: "This page drifted out of Nova's orbit.",
};

export default function NotFound() {
  return (
    <main id="main" tabIndex={-1} className="lost">
      <div>
        <div className="lost__orbit" aria-hidden="true">
          <span />
          <span />
          <span />
          <i />
        </div>
        <p className="lost__code">ERROR 404</p>
        <h1 className="display display--sm">
          Lost in <em>orbit.</em>
        </h1>
        <p className="lede">Nova searched every doc, thread and ticket. This page isn&apos;t in any of them.</p>
        <Link href="/" className="btn btn--primary">
          Back to Nova
        </Link>
      </div>
    </main>
  );
}

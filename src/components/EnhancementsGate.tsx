"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { afterLoadIdle } from "@/lib/after-idle";

// Section dots, magnetic buttons and the cursor ring are a separate chunk, requested only after
// window "load" + idle (the same gate as the 3D), so none of it is in the first-load JS.
const Enhancements = dynamic(() => import("./Enhancements"), { ssr: false });

export default function EnhancementsGate() {
  const [on, setOn] = useState(false);
  useEffect(() => afterLoadIdle(() => setOn(true)), []);

  // Sections start with content-visibility: auto (900px placeholders). On the first same-page link
  // click, turn it off before the browser measures the jump, so smooth scrolling lands on the target.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const link = e.target instanceof Element ? e.target.closest('a[href^="#"]') : null;
      if (!link) return;
      document.documentElement.dataset.cv = "off";
      document.removeEventListener("click", onClick, true);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return on ? <Enhancements /> : null;
}

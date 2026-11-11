"use client";

import { useEffect, useState, Suspense } from "react";
import { usePathname } from "next/navigation";
import "./page-transition.css";

export function triggerPageTransition() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("ambagan:transition:start"));
  }
}

export function stopPageTransition() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("ambagan:transition:stop"));
  }
}

function PageTransitionInner() {
  const [active, setActive] = useState(false);
  const pathname = usePathname();

  // Reset when route navigation completes
  useEffect(() => {
    setActive(false);
  }, [pathname]);

  useEffect(() => {
    const handleStart = () => setActive(true);
    const handleStop = () => setActive(false);

    window.addEventListener("ambagan:transition:start", handleStart);
    window.addEventListener("ambagan:transition:stop", handleStop);

    // Global click listener to intercept all navigation links and buttons
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      const anchor = target.closest("a");
      if (anchor && anchor.href) {
        if (
          anchor.target === "_blank" ||
          anchor.hasAttribute("download") ||
          anchor.getAttribute("href")?.startsWith("#") ||
          anchor.getAttribute("href")?.startsWith("mailto:") ||
          anchor.getAttribute("href")?.startsWith("tel:")
        ) {
          return;
        }

        try {
          const url = new URL(anchor.href, window.location.href);
          if (url.origin === window.location.origin) {
            const isDifferent =
              url.pathname !== window.location.pathname ||
              url.search !== window.location.search;
            if (isDifferent) {
              setActive(true);
            }
          }
        } catch {
          // Ignore invalid URLs
        }
      }
    };

    document.addEventListener("click", handleClick, { capture: true });

    return () => {
      window.removeEventListener("ambagan:transition:start", handleStart);
      window.removeEventListener("ambagan:transition:stop", handleStop);
      document.removeEventListener("click", handleClick, { capture: true });
    };
  }, []);

  // Safety fallback: dismiss overlay if no route change occurs after 3.5s
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => {
      setActive(false);
    }, 3500);
    return () => clearTimeout(timer);
  }, [active]);

  if (!active) return null;

  return (
    <div
      className="page-blur-transition-overlay"
      aria-label="Loading"
      role="status"
    >
      <div className="page-blur-content">
        <div className="page-blur-spinner">
          <div className="page-blur-ring" />
          <div className="page-blur-glow" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/logo.svg"
            alt="Ambagan"
            className="page-blur-logo"
          />
        </div>
      </div>
    </div>
  );
}

export function PageTransition() {
  return (
    <Suspense fallback={null}>
      <PageTransitionInner />
    </Suspense>
  );
}

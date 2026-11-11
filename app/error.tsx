"use client";

import { useEffect } from "react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Route error:", error);
  }, [error]);

  return (
    <div style={{ padding: "40px", textAlign: "center", fontFamily: "sans-serif" }}>
      <h2 style={{ color: "#1A2E1A" }}>Something went wrong!</h2>
      <p style={{ color: "#6B7280", margin: "12px 0 24px" }}>
        {error?.message || "An unexpected error occurred while loading this view."}
      </p>
      <button
        onClick={() => reset()}
        style={{
          padding: "10px 24px",
          backgroundColor: "#16A34A",
          color: "white",
          border: "none",
          borderRadius: "8px",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Try again
      </button>
    </div>
  );
}

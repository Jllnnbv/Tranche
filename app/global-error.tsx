"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ padding: "40px", textAlign: "center", fontFamily: "sans-serif" }}>
        <h2 style={{ color: "#1A2E1A" }}>Application Error</h2>
        <p style={{ color: "#6B7280", margin: "12px 0 24px" }}>
          {error?.message || "An unexpected error occurred."}
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
          Reload
        </button>
      </body>
    </html>
  );
}

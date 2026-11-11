"use client";

import "./dashboard-loading.css";

export function DashboardLoading() {
  return (
    <div className="dbl-screen" aria-label="Loading" role="status">
      <div className="dbl-blur-content">
        <div className="dbl-blur-spinner">
          <div className="dbl-blur-ring" />
          <div className="dbl-blur-glow" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/logo.svg" alt="Ambagan" className="dbl-blur-logo" />
        </div>
      </div>
    </div>
  );
}

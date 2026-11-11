"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { GroupDashboard } from "@/components/group-dashboard";
import { DEFAULT_SCHOOL_PROJECT, DEFAULT_ANTIPOLO, type AmbaganItem } from "@/components/dashboard";

function GroupContent() {
  const searchParams = useSearchParams();
  const planParam = searchParams.get("plan") || searchParams.get("group") || searchParams.get("openPlan") || "school-project";
  const paidParam = searchParams.get("paid") === "true";

  const [currentPlan, setCurrentPlan] = useState<AmbaganItem>(() => {
    if (planParam === "antipolo-trip") return DEFAULT_ANTIPOLO;
    return DEFAULT_SCHOOL_PROJECT;
  });

  const [initialMode, setInitialMode] = useState<"empty" | "one_paid" | "multi_paid">(() => {
    if (paidParam) return "one_paid";
    if (typeof window !== "undefined") {
      try {
        if (localStorage.getItem("ambagan_paid_" + planParam) === "true") {
          return "one_paid";
        }
      } catch {}
    }
    return planParam === "antipolo-trip" ? "multi_paid" : "empty";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = localStorage.getItem("ambagan_groups") ?? localStorage.getItem("tranche_paluwagans");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const found = parsed.find((p: AmbaganItem) => p.id === planParam);
          if (found) {
            setCurrentPlan(found);
          }
        }
      }
    } catch {}

    const isPaid = paidParam || localStorage.getItem("ambagan_paid_" + planParam) === "true";
    if (isPaid) {
      setInitialMode("one_paid");
    } else if (planParam === "antipolo-trip") {
      setInitialMode("multi_paid");
    } else {
      setInitialMode("empty");
    }
  }, [planParam, paidParam]);

  return <GroupDashboard plan={currentPlan} initialMode={initialMode} />;
}

export default function GroupPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "#f5f3e9" }} />}>
      <GroupContent />
    </Suspense>
  );
}

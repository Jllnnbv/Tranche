import type { Metadata } from "next";
import { VerifyCard } from "@/components/verify-card";

export const metadata: Metadata = {
  title: "Verify Account — Ambagan",
  description: "Verify your Ambagan account with a 6-digit verification code.",
};

export default function Page() {
  return <VerifyCard />;
}

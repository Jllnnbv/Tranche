import type { Metadata } from "next";
import { LoginCard } from "@/components/login-card";

export const metadata: Metadata = {
  title: "Log in — Ambagan",
  description: "Log in to Ambagan to start saving in ambagan.",
};

export default function Page() {
  return <LoginCard />;
}

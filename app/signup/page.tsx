import type { Metadata } from "next";
import { SignupCard } from "@/components/signup-card";

export const metadata: Metadata = {
  title: "Sign up — Ambagan",
  description: "Create an account on Ambagan to start saving in ambagan.",
};

export default function Page() {
  return <SignupCard />;
}

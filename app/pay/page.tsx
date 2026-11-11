import type { Metadata } from "next";
import { Payment } from "@/components/payment";

export const metadata: Metadata = {
  title: "Pay contribution — Ambagan",
  description: "Review, sign and track your Ambagan contribution.",
};

export const dynamic = "force-dynamic";

export default function PayPage() {
  return <Payment />;
}

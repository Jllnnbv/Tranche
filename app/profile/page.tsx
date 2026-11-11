import type { Metadata } from "next";
import { ProfileSettings } from "@/components/profile-settings";

export const metadata: Metadata = {
  title: "Profile Settings — Ambagan",
  description: "Manage your personal information, wallet, and security for Ambagan.",
};

export const dynamic = "force-dynamic";

export default function ProfilePage() {
  return <ProfileSettings />;
}

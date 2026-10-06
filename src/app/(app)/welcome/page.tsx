import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ProfileForm } from "@/components/profile-form";
import { getMyProfile, requireUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Welcome" };

export default async function WelcomePage() {
  await requireUser();
  const profile = await getMyProfile();
  if (!profile) redirect("/login");
  if (profile.campus_id) redirect("/browse");

  return (
    <div style={{ maxWidth: 520, margin: "0 auto" }} className="stack">
      <div className="stack-sm">
        <span className="chip chip-green" style={{ alignSelf: "flex-start" }}>
          ✓ Hult email verified
        </span>
        <h1 className="page-title">Welcome to Broke2Broke 👋</h1>
        <p className="text-2">One quick thing: which campus are you on? You&apos;ll see items and the Sunday Market near you.</p>
      </div>
      <div className="card card-pop">
        <ProfileForm initial={profile} next="/browse" submitLabel="Start browsing →" />
      </div>
    </div>
  );
}

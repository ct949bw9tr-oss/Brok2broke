import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { MobileTabBar, TopNav, UnreadBadge } from "@/components/app-nav";
import { Logo } from "@/components/logo";
import { getMyProfile, requireUser } from "@/server/auth/session";
import { unreadCount } from "@/server/queries";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  const [profile, unread] = await Promise.all([getMyProfile(), unreadCount()]);
  const onboarded = Boolean(profile?.campus_id);

  return (
    <>
      <header className="topbar">
        <div className="container topbar-inner">
          <Logo href={onboarded ? "/browse" : "/"} />
          {onboarded && <TopNav isAdmin={Boolean(profile?.is_admin)} />}
          {onboarded && (
            <div className="topbar-actions">
              <Link href="/messages" className="btn btn-ghost btn-sm hide-mobile" aria-label="Messages">
                💬
                <UnreadBadge count={unread} />
              </Link>
              <Link href="/listings/new" className="btn btn-primary btn-sm hide-mobile">
                + Sell
              </Link>
              <Link href="/me" aria-label="My profile">
                <Avatar name={profile?.full_name ?? ""} />
              </Link>
            </div>
          )}
        </div>
      </header>
      <main className="container app-main">{children}</main>
      {onboarded && <MobileTabBar unread={unread} />}
    </>
  );
}

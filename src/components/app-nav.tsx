"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/browse", label: "Browse", icon: "🔎" },
  { href: "/market", label: "Sunday Market", short: "Market", icon: "🧺" },
  { href: "/messages", label: "Messages", short: "Inbox", icon: "💬" },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function TopNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  return (
    <nav className="topnav" aria-label="Main">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} aria-current={isActive(pathname, l.href) ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
      {isAdmin && (
        <Link href="/insights" aria-current={isActive(pathname, "/insights") ? "page" : undefined}>
          Insights
        </Link>
      )}
    </nav>
  );
}

export function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="dot-badge" aria-label={`${count} unread`}>
      {count > 9 ? "9+" : count}
    </span>
  );
}

export function MobileTabBar({ unread }: { unread: number }) {
  const pathname = usePathname();
  const tabs = [
    LINKS[0],
    LINKS[1],
    { href: "/listings/new", label: "Sell", icon: "+", className: "tab-sell" },
    LINKS[2],
    { href: "/me", label: "Me", icon: "🙂" },
  ];
  return (
    <nav className="mobile-tabbar" aria-label="Main">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={"className" in t ? t.className : undefined}
          aria-current={isActive(pathname, t.href) ? "page" : undefined}
        >
          <span aria-hidden>{t.icon}</span>
          <span>{"short" in t ? t.short : t.label}</span>
          {t.href === "/messages" && <UnreadBadge count={unread} />}
        </Link>
      ))}
    </nav>
  );
}

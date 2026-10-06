import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { listingPriceLabel, photoUrl, timeAgo } from "@/lib/catalog";
import { isUnread } from "@/lib/unread";
import { requireStudent } from "@/server/auth/session";
import { myConversations } from "@/server/queries";

export const metadata: Metadata = { title: "Messages" };

export default async function MessagesPage() {
  const { user } = await requireStudent();
  const conversations = await myConversations();

  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <div className="page-head">
        <h1 className="page-title">Messages</h1>
      </div>
      {conversations.length === 0 ? (
        <EmptyState
          emoji="💬"
          title="No conversations yet"
          body="When you message a seller, or someone asks about your item, it shows up here."
          action={{ href: "/browse", label: "Browse items" }}
        />
      ) : (
        <div className="inbox">
          {conversations.map((c) => {
            const iAmBuyer = c.buyer_id === user.id;
            const other = iAmBuyer ? c.seller : c.buyer;
            const unread = isUnread(c.last_message_at, iAmBuyer ? c.buyer_last_read_at : c.seller_last_read_at);
            const cover = c.listing?.photos[0];
            return (
              <Link key={c.id} href={`/messages/${c.id}`} className={unread ? "inbox-item unread" : "inbox-item"}>
                <div className="inbox-thumb">
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element -- Supabase Storage URL
                    <img src={photoUrl(cover)} alt="" />
                  ) : (
                    <span aria-hidden>📦</span>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row between" style={{ flexWrap: "nowrap" }}>
                    <span className="inbox-name">{other?.full_name ?? "Student"}</span>
                    <span className="small muted">{timeAgo(c.last_message_at)}</span>
                  </div>
                  <div className="small text-2 listing-title">
                    {iAmBuyer ? "Buying" : "Selling"} · {c.listing?.title}
                    {c.listing ? ` · ${listingPriceLabel(c.listing)}` : ""}
                    {c.listing?.status === "sold" ? " · Sold" : ""}
                  </div>
                </div>
                <span className="unread-dot" aria-label={unread ? "Unread" : undefined} />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

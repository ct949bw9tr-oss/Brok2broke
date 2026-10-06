import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { listingPriceLabel, photoUrl } from "@/lib/catalog";
import { requireStudent } from "@/server/auth/session";
import { conversationMessages, getConversation, markConversationRead } from "@/server/queries";
import { AutoRefresh, Composer } from "./thread-client";

export const metadata: Metadata = { title: "Conversation" };

function timeLabel(iso: string) {
  return new Intl.DateTimeFormat("en", { weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await requireStudent();
  const conversation = await getConversation(id);
  if (!conversation) notFound();

  const [messages] = await Promise.all([conversationMessages(id), markConversationRead(id)]);
  const iAmSeller = conversation.seller_id === user.id;
  const other = iAmSeller ? conversation.buyer : conversation.seller;
  const listing = conversation.listing;
  const cover = listing?.photos[0];

  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <AutoRefresh />
      <Link href="/messages" className="small muted">
        ← All messages
      </Link>
      <div className="card row" style={{ marginTop: 12, flexWrap: "nowrap" }}>
        <div className="inbox-thumb">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element -- Supabase Storage URL
            <img src={photoUrl(cover)} alt="" />
          ) : (
            <span aria-hidden>📦</span>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong>{other?.full_name ?? "Student"}</strong>
          <div className="small text-2 listing-title">
            {listing ? (
              <Link href={`/listings/${listing.id}`} style={{ textDecoration: "underline" }}>
                {listing.title}
              </Link>
            ) : (
              "Listing"
            )}
            {listing ? ` · ${listingPriceLabel(listing)}` : ""}
          </div>
        </div>
        {iAmSeller && listing && listing.status !== "sold" && (
          <Link href={`/listings/${listing.id}`} className="btn btn-sm">
            Mark sold
          </Link>
        )}
        {listing?.status === "sold" && <span className="chip chip-coral">Sold</span>}
      </div>

      <div className="thread" aria-live="polite">
        {messages.map((m) => (
          <div key={m.id} className={m.sender_id === user.id ? "bubble mine" : "bubble theirs"}>
            {m.body}
            <div className="bubble-time">{timeLabel(m.created_at)}</div>
          </div>
        ))}
      </div>

      <p className="small muted" style={{ textAlign: "center" }}>
        🛡️ Meet somewhere public on campus or at the Sunday Market. Never pay before you see the item.
      </p>
      <Composer conversationId={id} />
    </div>
  );
}

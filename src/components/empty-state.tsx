import Link from "next/link";

export function EmptyState({
  emoji,
  title,
  body,
  action,
}: {
  emoji: string;
  title: string;
  body?: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="empty">
      <div className="emoji" aria-hidden>
        {emoji}
      </div>
      <h3>{title}</h3>
      {body && <p>{body}</p>}
      {action && (
        <Link href={action.href} className="btn btn-primary">
          {action.label}
        </Link>
      )}
    </div>
  );
}

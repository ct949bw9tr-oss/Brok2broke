import Link from "next/link";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="logo" aria-label="Broke2Broke home">
      broke<span className="logo-two">2</span>broke
    </Link>
  );
}

import Link from "next/link";
import { Logo } from "@/components/logo";

export default function NotFound() {
  return (
    <main className="auth-wrap">
      <div className="stack" style={{ textAlign: "center", alignItems: "center" }}>
        <Logo />
        <div style={{ fontSize: 56 }}>🫥</div>
        <h1 className="page-title">This item has left the building</h1>
        <p className="text-2">It may have been sold, removed, or never existed.</p>
        <Link href="/browse" className="btn btn-primary">
          Back to browsing
        </Link>
      </div>
    </main>
  );
}

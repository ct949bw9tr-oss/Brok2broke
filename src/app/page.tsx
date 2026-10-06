import Link from "next/link";
import { Logo } from "@/components/logo";
import { getCurrentUser } from "@/server/auth/session";

const COLLAGE = [
  { emoji: "🪑", bg: "#ffe9e3", t: "Desk chair", p: "$25", style: { top: 10, left: "6%", transform: "rotate(-6deg)" } },
  { emoji: "📚", bg: "#e6eeff", t: "Finance 101 book", p: "£12", style: { top: 40, right: "4%", transform: "rotate(5deg)" } },
  { emoji: "🧥", bg: "#fff2d9", t: "Winter coat", p: "Swap", style: { bottom: 10, left: "22%", transform: "rotate(3deg)" } },
];

export default async function Landing() {
  const user = await getCurrentUser();
  const cta = user ? { href: "/browse", label: "Go to the marketplace" } : { href: "/login", label: "Join with your Hult email" };

  return (
    <div className="container">
      <header className="landing-nav">
        <Logo />
        <Link href={user ? "/browse" : "/login"} className="btn btn-sm">
          {user ? "Open app" : "Sign in"}
        </Link>
      </header>

      <section className="hero">
        <div>
          <span className="chip chip-lime">🎓 Only verified Hult students</span>
          <h1 style={{ marginTop: 18 }}>
            Buy &amp; sell with <mark>students</mark> on your campus.
          </h1>
          <p className="lede">
            Broke2Broke is the student-to-student marketplace for Hult. No shipping, no strangers: every account is a
            verified Hult email, and every Sunday we host a market on campus where you can see it, try it and take it home.
          </p>
          <div className="row">
            <Link href={cta.href} className="btn btn-primary btn-lg">
              {cta.label} →
            </Link>
            <a href="#how" className="btn btn-ghost btn-lg">
              How it works
            </a>
          </div>
        </div>
        <div className="hero-collage" aria-hidden>
          {COLLAGE.map((c) => (
            <div key={c.t} className="collage-card" style={c.style}>
              <div className="art" style={{ background: c.bg }}>
                {c.emoji}
              </div>
              <div className="row between">
                <span className="t">{c.t}</span>
                <span className="p">{c.p}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section" id="how">
        <h2 className="section-title">Three steps. Zero awkward meetups with randoms.</h2>
        <div className="steps">
          <div className="card card-pop">
            <span className="step-num">1</span>
            <h3>Verify with your Hult email</h3>
            <p className="text-2" style={{ marginTop: 8 }}>
              We send a one-time code to your @student.hult.edu address. No passwords, no outsiders.
            </p>
          </div>
          <div className="card card-pop">
            <span className="step-num">2</span>
            <h3>List in 30 seconds</h3>
            <p className="text-2" style={{ marginTop: 8 }}>
              Snap a photo, set a price (or mark it free / swap) and it&apos;s live for everyone on your campus.
            </p>
          </div>
          <div className="card card-pop">
            <span className="step-num">3</span>
            <h3>Meet on campus or on Sunday</h3>
            <p className="text-2" style={{ marginTop: 8 }}>
              Chat in the app and meet at school, or bring it to the Sunday Market and sell in person.
            </p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="band">
          <span className="eyebrow muted">Every Sunday · on campus</span>
          <h2 className="section-title" style={{ marginTop: 10 }}>
            The Sunday Market 🧺
          </h2>
          <div className="compare">
            <div>
              <h3>Browse online all week</h3>
              <p className="muted" style={{ marginTop: 6 }}>
                Sellers tag items they&apos;ll bring. You know what&apos;s coming before you show up.
              </p>
            </div>
            <div>
              <h3>See it, try it, take it</h3>
              <p className="muted" style={{ marginTop: 6 }}>
                Check the item in person and walk home with it. No shipping, no &quot;where do we meet?&quot;.
              </p>
            </div>
            <div>
              <h3>It&apos;s a campus event</h3>
              <p className="muted" style={{ marginTop: 6 }}>
                RSVP, see who&apos;s going, and turn your old stuff into this week&apos;s grocery money.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Why not Depop, Vinted or Facebook?</h2>
        <div className="compare">
          <div className="card">
            <h3>✅ Verified students</h3>
            <p className="text-2" style={{ marginTop: 6 }}>Everyone is a Hult student. Higher trust, fewer scams.</p>
          </div>
          <div className="card">
            <h3>📍 Nearby only</h3>
            <p className="text-2" style={{ marginTop: 6 }}>Items on your campus. Pick up between classes.</p>
          </div>
          <div className="card">
            <h3>💸 No fees, no shipping</h3>
            <p className="text-2" style={{ marginTop: 6 }}>Pay each other directly when you meet. Keep it all.</p>
          </div>
        </div>
      </section>

      <section className="section" style={{ textAlign: "center" }}>
        <h2 className="section-title" style={{ margin: "0 auto 20px" }}>
          Moving out? Just arrived? Broke?
        </h2>
        <Link href={cta.href} className="btn btn-primary btn-lg">
          {cta.label} →
        </Link>
      </section>

      <footer className="footer row between">
        <Logo />
        <span>A student venture at Hult International Business School. Not an official Hult service.</span>
      </footer>
    </div>
  );
}

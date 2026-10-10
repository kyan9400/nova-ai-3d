import Stage from "@/components/Stage";
import ChatDemo from "@/components/ChatDemo";
import Pricing from "@/components/Pricing";
import MotionToggle from "@/components/MotionToggle";
import OrbPoster from "@/components/OrbPoster";
import MobileMenu from "@/components/MobileMenu";

const NAV_LINKS = [
  { href: "#demo", label: "Demo" },
  { href: "#capabilities", label: "Capabilities" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

const NAV_CTA = { href: "#pricing", label: "Start free" };

const CAPABILITIES = [
  {
    title: "Answers with receipts",
    body: "Every answer links the doc, thread or ticket it came from, so you can check in one click.",
    icon: "M5 4h10l4 4v12H5z M15 4v4h4 M8 13h8 M8 16.5h5",
  },
  {
    title: "Meeting memory",
    body: "Nova listens to the calls you invite it to and keeps decisions, owners and dates — not transcripts nobody reads.",
    icon: "M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z M6 11a6 6 0 0 0 12 0 M12 17v4",
  },
  {
    title: "Drafts in your voice",
    body: "Replies, briefs and release notes that sound like your team, learned from what you've already written.",
    icon: "M4 20l4-1 11-11-3-3L5 16z M14 7l3 3",
  },
  {
    title: "Hands off the busywork",
    body: "Files the ticket, books the follow-up, updates the doc. You approve; Nova does the clicking.",
    icon: "M4 12l5 5L20 6",
  },
];

const STEPS = [
  { n: "01", title: "Connect", body: "Link your docs, chat and tracker in a few clicks. Nova indexes only what you choose." },
  { n: "02", title: "Ask", body: "Type or speak in plain words, wherever you already work." },
  {
    n: "03",
    title: "Act",
    body: "Approve the draft, the ticket, the invite. Nova handles the rest and tells you when it's done.",
  },
];

const FAQ = [
  {
    q: "Is my data used to train models?",
    a: "No. Your workspace is used only to answer your team's questions.",
  },
  {
    q: "Which tools does Nova connect to?",
    a: "Docs, chat, email, calendars and issue trackers — the usual suspects, through standard APIs.",
  },
  {
    q: "Can Nova take actions on its own?",
    a: "Only with your approval. Every action is shown first and logged.",
  },
  {
    q: "What happens when the trial ends?",
    a: "You drop to Spark automatically. Nothing is deleted, nothing is charged.",
  },
  {
    q: "Is this a real product?",
    a: "No — Nova is a fictional brand made for a design and engineering portfolio.",
  },
];

function Logo() {
  return (
    <a href="#top" className="logo" aria-label="Nova, back to top">
      <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true" focusable="false">
        <circle cx="16" cy="16" r="7" fill="#ffd60a" />
        <ellipse cx="16" cy="16" rx="14" ry="5" fill="none" stroke="#c8cbd2" strokeWidth="1.6" transform="rotate(-24 16 16)" />
        <circle cx="27" cy="11" r="1.8" fill="#f4f3ee" />
      </svg>
      <span>Nova</span>
    </a>
  );
}

export default function Home() {
  return (
    <>
      <header className="nav">
        <div className="nav__inner">
          <Logo />
          <nav aria-label="Main" className="nav__links">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href}>
                {l.label}
              </a>
            ))}
          </nav>
          <div className="nav__actions">
            <MotionToggle compact />
            <a href={NAV_CTA.href} className="btn btn--primary btn--sm nav__cta">
              {NAV_CTA.label}
            </a>
            <MobileMenu links={NAV_LINKS} cta={NAV_CTA} />
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1}>
        <Stage poster={<OrbPoster />}>
          <section id="top" className="hero" aria-labelledby="hero-title">
            <div className="container hero__inner">
              <p className="eyebrow">Nova / assistant for teams</p>
              <h1 id="hero-title" className="display">
                A mind that <em>listens</em> before it speaks.
              </h1>
              <p className="lede">
                Nova reads your docs, meetings and tickets — then answers in seconds, with the source attached. No more
                “who knows where that lives?”
              </p>
              <div className="hero__ctas">
                <a href="#pricing" className="btn btn--primary">
                  Start free
                </a>
                <a href="#demo" className="btn btn--ghost">
                  Talk to the orb <span aria-hidden="true">↓</span>
                </a>
              </div>
              <p className="hint">
                <span className="hint__dot" aria-hidden="true" />
                <span className="hint__fine">Move your cursor. The orb is paying attention.</span>
                <span className="hint__touch">Touch the screen. The orb is paying attention.</span>
              </p>
            </div>
          </section>

          <section id="demo" className="demo" aria-labelledby="demo-title">
            <div className="container demo__inner">
              <div className="demo__copy">
                <p className="eyebrow">Live demo</p>
                <h2 id="demo-title" className="h2">
                  Say something. <em>Watch it think.</em>
                </h2>
                <p className="body">
                  Every key you press ripples through Nova&apos;s particles. Send a message and it gathers itself, then
                  answers word by word. <span className="muted">(Demo replies are scripted — no data leaves your browser.)</span>
                </p>
              </div>
              <ChatDemo />
            </div>
          </section>
        </Stage>

        <section id="capabilities" className="section" aria-labelledby="cap-title">
          <div className="container">
            <p className="eyebrow">What Nova does</p>
            <h2 id="cap-title" className="h2">
              Four jobs, done <em>quietly.</em>
            </h2>
            <ul className="caps">
              {CAPABILITIES.map((c) => (
                <li key={c.title} className="cap reveal">
                  <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false" className="cap__icon">
                    <path d={c.icon} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <h3 className="h3">{c.title}</h3>
                  <p className="body">{c.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="how" className="section section--alt" aria-labelledby="how-title">
          <div className="container how">
            <div>
              <p className="eyebrow">How it works</p>
              <h2 id="how-title" className="h2">
                Running by <em>lunch.</em>
              </h2>
            </div>
            <ol className="steps">
              {STEPS.map((s) => (
                <li key={s.n} className="step reveal">
                  <span className="step__n" aria-hidden="true">
                    {s.n}
                  </span>
                  <div>
                    <h3 className="h3">{s.title}</h3>
                    <p className="body">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="trust" className="section" aria-labelledby="trust-title">
          <div className="container trust">
            <div className="trust__copy">
              <p className="eyebrow">Trust</p>
              <h2 id="trust-title" className="h2">
                Your knowledge <em>stays yours.</em>
              </h2>
              <p className="body body--lg">
                Nova never trains shared models on your workspace. Data is encrypted in transit and at rest, permissions
                mirror your existing tools, and you can delete everything with one button.
              </p>
            </div>
            <dl className="stats">
              <div className="stat reveal">
                <dt>Median answer time</dt>
                <dd>1.4 s</dd>
              </div>
              <div className="stat reveal">
                <dt>Workspace data used for training</dt>
                <dd>0</dd>
              </div>
              <div className="stat reveal">
                <dt>Uptime target</dt>
                <dd>99.95%</dd>
              </div>
            </dl>
          </div>
        </section>

        <section id="pricing" className="section section--alt" aria-labelledby="pricing-title">
          <div className="container">
            <p className="eyebrow">Pricing</p>
            <h2 id="pricing-title" className="h2">
              Pick an <em>orbit.</em>
            </h2>
            <Pricing />
          </div>
        </section>

        <section id="faq" className="section" aria-labelledby="faq-title">
          <div className="container faq">
            <div>
              <p className="eyebrow">FAQ</p>
              <h2 id="faq-title" className="h2">
                Fair <em>questions.</em>
              </h2>
            </div>
            <div className="faq__list">
              {FAQ.map((f) => (
                <details key={f.q} className="qa">
                  <summary>
                    <span>{f.q}</span>
                    <span className="qa__icon" aria-hidden="true" />
                  </summary>
                  <p className="body">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section id="contact" className="section closing" aria-labelledby="contact-title">
          <div className="container closing__inner">
            <div className="closing__glow" aria-hidden="true" />
            <h2 id="contact-title" className="display display--sm">
              Give your team a <em>second brain.</em>
            </h2>
            <p className="lede">Start free in two minutes. Or just say hello — I build sites like this one.</p>
            <div className="closing__ctas">
              <a className="btn btn--primary" href="mailto:kyan775909@gmail.com?subject=Hello%20from%20the%20Nova%20site">
                Start free
              </a>
              <a className="btn btn--ghost" href="mailto:kyan775909@gmail.com">
                Email
              </a>
              <a className="btn btn--ghost" href="https://wa.me/79193999749" target="_blank" rel="noopener noreferrer">
                WhatsApp
              </a>
              <a className="btn btn--ghost" href="https://t.me/hassan_9400" target="_blank" rel="noopener noreferrer">
                Telegram
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="container footer__inner">
          <div className="footer__brand">
            <Logo />
            <p className="footer__note">Concept project — fictional brand.</p>
          </div>
          <ul className="footer__links">
            <li>
              <a href="https://github.com/kyan9400" target="_blank" rel="noopener noreferrer">
                GitHub
              </a>
            </li>
            <li>
              <a href="https://alhassan-portfolio-sigma.vercel.app" target="_blank" rel="noopener noreferrer">
                Portfolio
              </a>
            </li>
            <li>
              <MotionToggle />
            </li>
          </ul>
          <p className="footer__copy">© 2026 Alhassan Alfarran</p>
        </div>
      </footer>
    </>
  );
}

"use client";

import { useState } from "react";

type Plan = {
  name: string;
  blurb: string;
  monthly: string;
  yearly: string;
  unit: string;
  features: string[];
  cta: string;
  href: string;
  featured?: boolean;
};

const PLANS: Plan[] = [
  {
    name: "Spark",
    blurb: "For trying Nova with a small team.",
    monthly: "$0",
    yearly: "$0",
    unit: "forever",
    features: ["Up to 3 people", "200 answers / month", "Docs + chat connectors", "Community support"],
    cta: "Start free",
    href: "#contact",
  },
  {
    name: "Orbit",
    blurb: "For teams that live in their tools.",
    monthly: "$14",
    yearly: "$11",
    unit: "per person / month",
    features: ["Unlimited answers", "Meeting memory", "Drafts in your voice", "All connectors", "Priority support"],
    cta: "Start 14-day trial",
    href: "#contact",
    featured: true,
  },
  {
    name: "Nebula",
    blurb: "For companies with security reviews.",
    monthly: "Custom",
    yearly: "Custom",
    unit: "annual agreement",
    features: ["SSO + SCIM", "Data residency (EU/US)", "Audit log", "Dedicated success manager"],
    cta: "Talk to us",
    href: "#contact",
  },
];

export default function Pricing() {
  const [yearly, setYearly] = useState(false);

  return (
    <>
      <div className="billing" role="group" aria-label="Billing period">
        <button type="button" className="billing__opt" aria-pressed={!yearly} onClick={() => setYearly(false)}>
          Monthly
        </button>
        <button type="button" className="billing__opt" aria-pressed={yearly} onClick={() => setYearly(true)}>
          Yearly <span className="billing__save">save 20%</span>
        </button>
      </div>

      <ul className="plans">
        {PLANS.map((p, i) => (
          <li key={p.name} className={`plan reveal${p.featured ? " plan--featured" : ""}`}>
            <div className={`plan__orb plan__orb--${i}`} aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            {p.featured && <p className="plan__badge">Most popular</p>}
            <h3 className="plan__name">{p.name}</h3>
            <p className="plan__blurb">{p.blurb}</p>
            <p className="plan__price">
              <span className="plan__amount">{yearly ? p.yearly : p.monthly}</span>
              <span className="plan__unit">{p.unit}</span>
            </p>
            {yearly && p.monthly !== p.yearly && <p className="plan__note">billed yearly</p>}
            <ul className="plan__features">
              {p.features.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <a className={`btn ${p.featured ? "btn--primary" : "btn--ghost"} plan__cta`} href={p.href}>
              {p.cta}
              <span className="sr-only"> — {p.name} plan</span>
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}

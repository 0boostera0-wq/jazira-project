"use client";

// Clean, brand-style SVG payment badges — no emojis, no external assets.
// Each renders inside a white rounded card sized ~ 56x36.

const Card = ({ children, title }) => (
  <span
    title={title}
    className="inline-flex h-9 w-14 items-center justify-center rounded-lg bg-white shadow-sm"
    style={{ border: "1px solid rgba(0,0,0,0.08)" }}
  >
    {children}
  </span>
);

export function VisaBadge() {
  return (
    <Card title="Visa">
      <svg width="40" height="14" viewBox="0 0 40 14" aria-label="Visa">
        <text
          x="20" y="12" textAnchor="middle"
          fontFamily="Arial, sans-serif" fontWeight="700" fontStyle="italic"
          fontSize="13" fill="#1A1F71" letterSpacing="0.5"
        >VISA</text>
      </svg>
    </Card>
  );
}

export function MastercardBadge() {
  return (
    <Card title="Mastercard">
      <svg width="40" height="26" viewBox="0 0 40 26" aria-label="Mastercard">
        <circle cx="16" cy="13" r="9" fill="#EB001B" />
        <circle cx="24" cy="13" r="9" fill="#F79E1B" />
        <path d="M20 6.2a9 9 0 0 0 0 13.6 9 9 0 0 0 0-13.6z" fill="#FF5F00" />
      </svg>
    </Card>
  );
}

export function MadaBadge() {
  return (
    <Card title="مدى - mada">
      <svg width="44" height="20" viewBox="0 0 44 20" aria-label="mada">
        <text
          x="22" y="10" textAnchor="middle"
          fontFamily="Arial, sans-serif" fontWeight="800" fontSize="11" fill="#231F20"
        >mada</text>
        <rect x="9" y="13" width="11" height="3" rx="1.5" fill="#84C341" />
        <rect x="23" y="13" width="11" height="3" rx="1.5" fill="#1BA2DD" />
      </svg>
    </Card>
  );
}

export function ApplePayBadge() {
  return (
    <Card title="Apple Pay">
      <svg width="44" height="20" viewBox="0 0 44 20" aria-label="Apple Pay">
        {/* apple glyph */}
        <path
          d="M9.6 6.1c.5-.6.8-1.4.7-2.2-.7 0-1.6.5-2.1 1.1-.5.5-.9 1.3-.7 2.1.8.1 1.6-.4 2.1-1zM10.3 7.3c-1.1-.1-2 .6-2.6.6-.6 0-1.4-.6-2.3-.6-1.2 0-2.3.7-2.9 1.8-1.2 2.1-.3 5.3.9 7 .6.8 1.3 1.8 2.2 1.7.9 0 1.2-.6 2.3-.6 1.1 0 1.4.6 2.3.6.9 0 1.5-.8 2.1-1.7.7-1 .9-1.9.9-2-.1 0-1.8-.7-1.8-2.7 0-1.7 1.4-2.5 1.4-2.5-.7-1.1-1.9-1.2-2.4-1.2z"
          fill="#000"
        />
        <text
          x="29" y="14" textAnchor="middle"
          fontFamily="Arial, sans-serif" fontWeight="600" fontSize="11" fill="#000"
        >Pay</text>
      </svg>
    </Card>
  );
}

export function PayPalBadge() {
  return (
    <Card title="PayPal">
      <svg width="46" height="16" viewBox="0 0 46 16" aria-label="PayPal">
        <text x="2" y="13" fontFamily="Arial, sans-serif" fontWeight="800" fontStyle="italic" fontSize="13" fill="#003087">Pay</text>
        <text x="23" y="13" fontFamily="Arial, sans-serif" fontWeight="800" fontStyle="italic" fontSize="13" fill="#009CDE">Pal</text>
      </svg>
    </Card>
  );
}

export default function PaymentBadges() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <ApplePayBadge />
      <MadaBadge />
      <VisaBadge />
      <MastercardBadge />
      <PayPalBadge />
    </div>
  );
}

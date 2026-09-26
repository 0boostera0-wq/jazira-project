import { setRequestLocale } from "@/i18n/server";
import Messages from "@/i18n/WithMessages";
import { buildMetadata } from "@/lib/seo";
import CheckoutLayout from "@/components/subscriptions/CheckoutLayout";
import CheckoutPay from "@/components/subscriptions/CheckoutPay";

export async function generateMetadata(props) {
  const params = await props.params;
  return buildMetadata({ locale: params.locale, key: "checkout", path: "/checkout", noindex: true });
}

// Auth-only (middleware gate). Static shell; <CheckoutPay> resolves the
// account state (signed out / free / Elite) and talks to /api/checkout.
export default async function CheckoutPage(props) {
  const params = await props.params;
  setRequestLocale(params.locale);
  return (
    <Messages ns={["subscriptions"]}>
      <CheckoutLayout pay={<CheckoutPay />} />
    </Messages>
  );
}

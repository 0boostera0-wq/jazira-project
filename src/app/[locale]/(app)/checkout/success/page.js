import { setRequestLocale } from "@/i18n/server";
import Messages from "@/i18n/WithMessages";
import { buildMetadata } from "@/lib/seo";
import SuccessLayout from "@/components/subscriptions/SuccessLayout";
import ActivationStatus from "@/components/subscriptions/ActivationStatus";

export async function generateMetadata(props) {
  const params = await props.params;
  return buildMetadata({ locale: params.locale, key: "checkoutSuccess", path: "/checkout/success", noindex: true });
}

// Where the payment provider sends the buyer back. The status island polls the
// DB-verified Elite flag; nothing on this page grants Elite.
export default async function CheckoutSuccessPage(props) {
  const params = await props.params;
  setRequestLocale(params.locale);
  return (
    <Messages ns={["subscriptions"]}>
      <SuccessLayout status={<ActivationStatus />} />
    </Messages>
  );
}

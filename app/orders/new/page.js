import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import OrderForm from "@/app/orders/new/order-form";
import { findStartedGroupGiftForProduct } from "@/lib/group-gifts";
import { getProductById } from "@/lib/products";
import { requireUser } from "@/lib/session";
import { findUserById } from "@/lib/users";
import { sanitizeCallbackPath } from "@/lib/utils/format";

export const metadata = { title: "선물 주문" };

export default async function NewOrderPage({ searchParams }) {
  await connection();
  const query = await searchParams;
  const productId = typeof query.product === "string" ? query.product : "";
  const requestedMode = query.mode === "self" ? "self" : "single";
  const recipientId = typeof query.recipient === "string" ? query.recipient : "";
  const from = sanitizeCallbackPath(query.from, `/products/${productId}`);
  const callbackParams = new URLSearchParams({ product: productId, from });

  if (requestedMode === "self") callbackParams.set("mode", "self");
  if (recipientId) callbackParams.set("recipient", recipientId);

  const callback = `/orders/new?${callbackParams}`;
  const user = await requireUser(callback);
  const product = await getProductById(productId);

  if (!product || product.status === "archived") {
    notFound();
  }

  const requestedRecipient = recipientId ? await findUserById(recipientId) : null;

  if (recipientId && !requestedRecipient) {
    notFound();
  }

  const mode = requestedMode === "self" || requestedRecipient?.id === user.id ? "self" : "single";
  const recipient = mode === "self" ? user : requestedRecipient;

  if (recipient) {
    const startedGroupGift = await findStartedGroupGiftForProduct(recipient.id, product.id);

    if (startedGroupGift) {
      redirect(`/group-gifts/${startedGroupGift.id}`);
    }
  }

  return (
    <section className="container page-section">
      <OrderForm product={product} recipient={recipient} mode={mode} from={from} />
    </section>
  );
}

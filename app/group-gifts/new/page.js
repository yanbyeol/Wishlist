import Link from "next/link";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { CreateGroupGiftForm } from "@/app/group-gifts/group-gift-forms";
import GiftEmailAuthForm from "@/components/gift-email-auth-form";
import ProductImage from "@/components/product-image";
import { findOpenGroupGiftForProduct } from "@/lib/group-gifts";
import { getProductById } from "@/lib/products";
import { getCurrentUser } from "@/lib/session";
import { findUserById } from "@/lib/users";
import { formatWon, sanitizeCallbackPath } from "@/lib/utils/format";
import {
  getGroupGiftPath,
  getSharedWishlistReturnPath,
} from "@/lib/utils/group-gift-navigation";
import { isProductInWishlist } from "@/lib/wishlists";

export const metadata = { title: "함께 선물하기" };

export default async function NewGroupGiftPage({ searchParams }) {
  await connection();
  const query = await searchParams;
  const productId = typeof query.product === "string" ? query.product : "";
  const recipientId = typeof query.recipient === "string" ? query.recipient : "";
  const from = sanitizeCallbackPath(query.from, "/");
  const returnTo = getSharedWishlistReturnPath(query.returnTo);
  const callbackParams = new URLSearchParams({ product: productId, recipient: recipientId });

  if (from !== "/") {
    callbackParams.set("from", from);
  }

  if (returnTo) {
    callbackParams.set("returnTo", returnTo);
  }

  const callback = `/group-gifts/new?${callbackParams}`;
  const [user, product, recipient, isWishlisted] = await Promise.all([
    getCurrentUser(),
    getProductById(productId),
    findUserById(recipientId),
    isProductInWishlist(recipientId, productId),
  ]);

  if (!product || !recipient || !isWishlisted || product.status === "archived") {
    notFound();
  }

  if (!user) {
    return (
      <section className="container narrow-page page-section">
        <div className="form-card">
          <div className="page-heading compact-heading">
            <p className="eyebrow">회원가입 없이 함께 준비해요</p>
            <h1>{recipient.name}님을 위한 공동선물</h1>
            <p>이메일 인증 후 공동선물을 만들고 같은 이메일로 다시 관리할 수 있어요.</p>
          </div>
          <GiftEmailAuthForm callback={callback} />
        </div>
      </section>
    );
  }

  if (recipient.id === user.id) {
    redirect(`/orders/new?product=${product.id}&mode=self`);
  }

  const existing = await findOpenGroupGiftForProduct(recipient.id, product.id);

  if (existing) {
    redirect(getGroupGiftPath(existing.id, returnTo));
  }

  return (
    <section className="container page-section checkout-grid">
      <div>
        <div className="page-heading">
          <p className="eyebrow">친구들과 함께 준비해요</p>
          <h1>함께 선물하기</h1>
          <p>링크를 공유하고 친구들과 목표 금액을 함께 채워 보세요.</p>
        </div>
        <CreateGroupGiftForm
          product={product}
          recipient={recipient}
          from={from}
          returnTo={returnTo}
        />
      </div>
      <aside className="order-summary-card">
        <ProductImage src={product.imageUrl} alt={product.name} />
        <p className="eyebrow">{product.category}</p>
        <h2>{product.name}</h2>
        <div className="summary-price-row"><span>목표 금액</span><strong>{formatWon(product.price)}</strong></div>
        <Link href={from} className="text-link">상품으로 돌아가기</Link>
      </aside>
    </section>
  );
}

import Link from "next/link";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { CreateGroupGiftForm } from "@/app/group-gifts/group-gift-forms";
import ProductImage from "@/components/product-image";
import { findOpenGroupGiftForProduct } from "@/lib/group-gifts";
import { getProductById } from "@/lib/products";
import { requireUser } from "@/lib/session";
import { findUserById } from "@/lib/users";
import { formatWon, sanitizeCallbackPath } from "@/lib/utils/format";
import { isProductInWishlist } from "@/lib/wishlists";

export const metadata = { title: "함께 선물하기" };

export default async function NewGroupGiftPage({ searchParams }) {
  await connection();
  const query = await searchParams;
  const productId = typeof query.product === "string" ? query.product : "";
  const recipientId = typeof query.recipient === "string" ? query.recipient : "";
  const callback = `/group-gifts/new?product=${encodeURIComponent(productId)}&recipient=${encodeURIComponent(recipientId)}`;
  const user = await requireUser(callback);
  const [product, recipient, isWishlisted] = await Promise.all([
    getProductById(productId),
    findUserById(recipientId),
    isProductInWishlist(recipientId, productId),
  ]);

  if (!product || !recipient || !isWishlisted || product.status === "archived") {
    notFound();
  }

  if (recipient.id === user.id) {
    redirect(`/orders/new?product=${product.id}&mode=self`);
  }

  const existing = await findOpenGroupGiftForProduct(recipient.id, product.id);

  if (existing) {
    redirect(`/group-gifts/${existing.id}`);
  }

  const from = sanitizeCallbackPath(query.from, "/");

  return (
    <section className="container page-section checkout-grid">
      <div>
        <div className="page-heading">
          <p className="eyebrow">친구들과 함께 준비해요</p>
          <h1>함께 선물하기</h1>
          <p>링크를 공유하고 친구들과 목표 금액을 함께 채워 보세요.</p>
        </div>
        <CreateGroupGiftForm product={product} recipient={recipient} from={from} />
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

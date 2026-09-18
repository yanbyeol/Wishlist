import Link from "next/link";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import ProductImage from "@/components/product-image";
import { GiftIcon, SparkleIcon } from "@/components/icons";
import { findOpenGroupGiftForProduct } from "@/lib/group-gifts";
import { getCurrentUser } from "@/lib/session";
import { formatWon } from "@/lib/utils/format";
import { hasGroupGiftStarted } from "@/lib/utils/group-gift";
import { getGroupGiftPath } from "@/lib/utils/group-gift-navigation";
import { getSharedWishlist } from "@/lib/wishlists";

export default async function SharedProductPage({ params }) {
  await connection();
  const { token, id } = await params;
  const wishlist = await getSharedWishlist(token);
  const item = wishlist?.items.find(({ product }) => product.id === id);

  if (!wishlist || !item) {
    notFound();
  }

  const product = item.product;
  const sharedWishlistPath = `/shared/${token}`;
  const openGroupGift = await findOpenGroupGiftForProduct(wishlist.userId, product.id);

  if (hasGroupGiftStarted(openGroupGift)) {
    redirect(getGroupGiftPath(openGroupGift.id, sharedWishlistPath));
  }

  const user = await getCurrentUser();
  const isOwner = user?.id === wishlist.userId;
  const soldOut = product.quantity === 0 || product.status === "sold_out";
  const returnPath = `/shared/${token}/products/${product.id}`;
  const orderPath = isOwner
    ? `/orders/new?product=${product.id}&mode=self&from=${encodeURIComponent(returnPath)}`
    : `/orders/new?product=${product.id}&recipient=${wishlist.userId}&from=${encodeURIComponent(returnPath)}`;
  const groupGiftPath = openGroupGift
    ? getGroupGiftPath(openGroupGift.id, sharedWishlistPath)
    : `/group-gifts/new?product=${product.id}&recipient=${wishlist.userId}&from=${encodeURIComponent(returnPath)}&returnTo=${encodeURIComponent(sharedWishlistPath)}`;
  return (
    <section className="container page-section">
      <Link href={`/shared/${token}`} className="back-link">← 위시리스트로 돌아가기</Link>
      <div className="product-detail-grid">
        <div className="detail-media">
          <ProductImage src={product.imageUrl} alt={product.name} />
          {soldOut && <span className="sold-out-overlay large">품절</span>}
        </div>
        <div className="product-detail-copy">
          <p className="eyebrow">{wishlist.owner?.name ?? "친구"}님의 위시 · {product.category}</p>
          <h1>{product.name}</h1>
          <p className="detail-price">{formatWon(product.price)}</p>
          <p className="seller-line">남은 수량 {product.quantity}개</p>
          <div className="detail-description">
            <h2>상품 소개</h2>
            <p>{product.description}</p>
          </div>
          <div className="demo-notice compact">
            <SparkleIcon />
            <span>결제와 배송은 실제로 이루어지지 않는 데모입니다.</span>
          </div>
          <div className="detail-actions stacked-actions">
            {soldOut ? (
              <button className="button button-disabled" disabled>현재 품절된 상품입니다</button>
            ) : (
              <>
                <Link href={orderPath} className="button button-primary">
                  <GiftIcon size={20} /> {isOwner ? "나에게 선물하기" : "선물하기"}
                </Link>
                {!isOwner && (
                  <Link href={groupGiftPath} className="button button-dark">
                    함께 선물하기
                  </Link>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

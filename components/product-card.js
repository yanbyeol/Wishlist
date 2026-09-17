import Link from "next/link";
import ProductImage from "@/components/product-image";
import StatusBadge from "@/components/status-badge";
import WishlistButton from "@/components/wishlist-button";
import { formatWon } from "@/lib/utils/format";
import { hasGroupGiftStarted } from "@/lib/utils/group-gift";

export default function ProductCard({
  product,
  user,
  isWishlisted = false,
  isOwned = false,
  detailsHref = `/products/${product.id}`,
  returnPath = "/",
  showWishlistAction = true,
  groupGiftStatus = "",
  groupGiftCurrentAmount = 0,
}) {
  let groupGiftStatusLabel = "";
  const groupGiftStarted = hasGroupGiftStarted({
    status: groupGiftStatus,
    currentAmount: groupGiftCurrentAmount,
  });

  if (groupGiftStatus === "funding" && groupGiftStarted) {
    groupGiftStatusLabel = "공동선물 진행중";
  } else if (
    groupGiftStarted &&
    ["funded", "processing", "payment_failed"].includes(groupGiftStatus)
  ) {
    groupGiftStatusLabel = "목표 달성";
  }

  return (
    <article className="product-card">
      <div className="product-card-media">
        <Link
          href={detailsHref}
          aria-label={`${product.name} ${groupGiftStatusLabel ? "공동선물 보기" : "상세 보기"}`}
        >
          <ProductImage src={product.imageUrl} alt={product.name} />
        </Link>
        {isOwned && <span className="own-product-badge">내 상품</span>}
        {showWishlistAction && (
          <WishlistButton
            productId={product.id}
            isWishlisted={isWishlisted}
            removalBlocked={groupGiftStarted}
            user={user}
            returnPath={returnPath}
            compact
          />
        )}
        {product.quantity === 0 && <span className="sold-out-overlay">품절</span>}
      </div>
      <div className="product-card-body">
        <p className="eyebrow">{product.category}</p>
        <Link href={detailsHref} className="product-name">{product.name}</Link>
        <div className="product-card-price-row">
          <strong>{formatWon(product.price)}</strong>
          <span>재고 {product.quantity}개</span>
        </div>
        {groupGiftStatusLabel && (
          <div className="product-card-participation">
            <StatusBadge tone={groupGiftStatus === "funding" ? "warm" : "accent"}>
              {groupGiftStatusLabel}
            </StatusBadge>
          </div>
        )}
      </div>
    </article>
  );
}

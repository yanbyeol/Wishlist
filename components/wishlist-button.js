import Link from "next/link";
import { toggleWishlistAction } from "@/app/wishlist/actions";
import { HeartIcon } from "@/components/icons";

export default function WishlistButton({ productId, isWishlisted, user, returnPath, compact = false }) {
  if (!user) {
    return (
      <Link
        href={`/login?callback=${encodeURIComponent(returnPath)}`}
        className={compact ? "heart-button" : "button button-secondary"}
        aria-label="로그인하고 위시리스트에 추가"
      >
        <HeartIcon filled={false} />
        {!compact && <span>위시리스트 추가</span>}
      </Link>
    );
  }

  return (
    <form action={toggleWishlistAction}>
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="returnPath" value={returnPath} />
      <button
        className={compact ? `heart-button ${isWishlisted ? "active" : ""}` : "button button-secondary"}
        type="submit"
        aria-label={isWishlisted ? "위시리스트에서 해제" : "위시리스트에 추가"}
      >
        <HeartIcon filled={isWishlisted} />
        {!compact && <span>{isWishlisted ? "위시리스트에 담김" : "위시리스트 추가"}</span>}
      </button>
    </form>
  );
}

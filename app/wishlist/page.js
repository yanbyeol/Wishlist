import Link from "next/link";
import { connection } from "next/server";
import EmptyState from "@/components/empty-state";
import ProductCard from "@/components/product-card";
import ShareButton from "@/components/share-button";
import { findStartedGroupGiftsForProducts } from "@/lib/group-gifts";
import { requireUser } from "@/lib/session";
import { getWishlistForUser } from "@/lib/wishlists";

export const metadata = { title: "위시리스트" };

export default async function WishlistPage() {
  await connection();
  const user = await requireUser("/wishlist");
  const wishlist = await getWishlistForUser(user);
  const startedGroupGifts = await findStartedGroupGiftsForProducts(
    user.id,
    wishlist.items.map(({ product }) => product.id),
  );
  const groupGiftByProductId = new Map(
    startedGroupGifts.map((groupGift) => [groupGift.productId, groupGift]),
  );

  return (
    <section className="container page-section">
      <div className="page-heading heading-with-action">
        <div>
          <p className="eyebrow">내가 기다리는 선물</p>
          <h1>{wishlist.title}</h1>
          <p>갖고 싶은 상품을 담고 링크로 친구들에게 알려 보세요.</p>
        </div>
        {wishlist.items.length > 0 && (
          <ShareButton
            path={`/shared/${wishlist.shareToken}`}
            title={wishlist.title}
            showCopyButton
          />
        )}
      </div>

      {wishlist.items.length > 0 ? (
        <>
          <div className="product-grid">
            {wishlist.items.map(({ product }) => {
              const groupGift = groupGiftByProductId.get(product.id);

              return (
                <ProductCard
                  key={product.id}
                  product={product}
                  user={user}
                  isWishlisted
                  returnPath="/wishlist"
                  detailsHref={groupGift
                    ? `/group-gifts/${groupGift.id}`
                    : `/products/${product.id}`}
                  groupGiftStatus={groupGift?.status}
                  groupGiftCurrentAmount={groupGift?.currentAmount}
                />
              );
            })}
          </div>
          <div className="centered-action">
            <Link href="/#products" className="button button-secondary">+ 상품 추가하기</Link>
          </div>
        </>
      ) : (
        <EmptyState
          title="아직 담아 둔 상품이 없어요"
          description="상품을 둘러보고 받고 싶은 선물을 위시리스트에 추가해 보세요."
          href="/#products"
          action="위시리스트에 상품 추가하기"
        />
      )}
    </section>
  );
}

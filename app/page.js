import Link from "next/link";
import { connection } from "next/server";
import HomeProductBoard from "@/app/home-product-board";
import { getProductFilters } from "@/app/product-filter";
import { ArrowIcon, GiftIcon, SparkleIcon } from "@/components/icons";
import { getAddressRequiredGiftSummary } from "@/lib/orders";
import { listProducts } from "@/lib/products";
import { getCurrentUser } from "@/lib/session";
import { getWishlistedProductIds } from "@/lib/wishlists";

export default async function Home({ searchParams }) {
  await connection();
  const filters = getProductFilters(await searchParams);
  const user = await getCurrentUser();
  const [products, wishlistedIds, addressRequiredGift] = await Promise.all([
    listProducts({ category: filters.category, query: filters.keyword, sort: filters.sort, excludeSoldOut: filters.excludeSoldOut }),
    user ? getWishlistedProductIds(user.id) : [],
    user ? getAddressRequiredGiftSummary(user.id) : null,
  ]);

  return (
    <>
      {addressRequiredGift && (
        <aside className="home-alert-wrap" aria-label="배송지 입력이 필요한 선물">
          <div className="container home-alert-banner">
            <span className="home-alert-icon"><GiftIcon size={24} /></span>
            <div className="home-alert-copy">
              <h2>선물이 도착했어요!</h2>
              <p>선물을 받으려면 배송지를 입력해주세요.</p>
              {addressRequiredGift.count > 1 && (
                <small>배송지를 기다리는 선물이 {addressRequiredGift.count}개 있어요.</small>
              )}
            </div>
            <Link href={addressRequiredGift.acceptancePath} className="button button-primary">
              배송지 입력하기
            </Link>
          </div>
        </aside>
      )}

      <section className="hero-section">
        <div className="container hero-grid">
          <div className="hero-copy">
            <span className="hero-label"><SparkleIcon size={18} /> 함께라서 더 특별한 선물</span>
            <h1>마음을 고르고,<br /><em>함께 전해요.</em></h1>
            <p>갖고 싶은 상품은 위시리스트에 담고, 친구의 바람은 혼자 또는 함께 선물해 보세요.</p>
            <div className="hero-actions">
              <a href="#products" className="button button-primary">선물 둘러보기 <ArrowIcon /></a>
              <Link href={user ? "/wishlist" : "/signup"} className="button button-ghost">
                {user ? "내 위시리스트" : "무료로 시작하기"}
              </Link>
            </div>
          </div>
          <div className="hero-art" aria-label="친구들이 함께 준비하는 선물">
            <div className="hero-orbit orbit-one" />
            <div className="hero-orbit orbit-two" />
            <div className="hero-gift"><GiftIcon size={82} /></div>
            <span className="floating-note note-one">wish</span>
            <span className="floating-note note-two">for you</span>
            <span className="floating-heart">♥</span>
          </div>
        </div>
      </section>

      <HomeProductBoard
        initialProducts={products}
        initialFilters={filters}
        user={user ? { id: user.id } : null}
        wishlistedIds={wishlistedIds}
      />
    </>
  );
}

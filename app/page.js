import Link from "next/link";
import { connection } from "next/server";
import ProductSearchForm from "@/app/product-search-form";
import ProductCard from "@/components/product-card";
import { ArrowIcon, GiftIcon, SparkleIcon } from "@/components/icons";
import { PRODUCT_CATEGORIES } from "@/lib/constants";
import { listProducts } from "@/lib/products";
import { getCurrentUser } from "@/lib/session";
import { getWishlistedProductIds } from "@/lib/wishlists";

export default async function Home({ searchParams }) {
  await connection();
  const query = await searchParams;
  const category = typeof query.category === "string" ? query.category : "";
  const keyword = typeof query.q === "string" ? query.q.trim() : "";
  const user = await getCurrentUser();
  const [products, wishlistedIds] = await Promise.all([
    listProducts({ category, query: keyword }),
    user ? getWishlistedProductIds(user.id) : [],
  ]);
  const wishlisted = new Set(wishlistedIds);

  return (
    <>
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

      <section className="category-strip" aria-label="상품 카테고리">
        <div className="container category-list">
          <Link href={keyword ? `/?q=${encodeURIComponent(keyword)}` : "/"} scroll={false} className={!category ? "active" : ""}>전체</Link>
          {PRODUCT_CATEGORIES.map((item) => {
            const params = new URLSearchParams();
            params.set("category", item);
            if (keyword) params.set("q", keyword);
            return <Link key={item} href={`/?${params}`} scroll={false} className={category === item ? "active" : ""}>{item}</Link>;
          })}
        </div>
      </section>

      <section className="container products-section" id="products">
        <div className="section-heading">
          <div>
            <p className="eyebrow">선물 큐레이션</p>
            <h2>{category || "마음을 전하기 좋은 선물"}</h2>
          </div>
          <ProductSearchForm key={`${category}:${keyword}`} category={category} keyword={keyword} />
        </div>

        {products.length ? (
          <div className="product-grid">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                user={user}
                isWishlisted={wishlisted.has(product.id)}
              />
            ))}
          </div>
        ) : (
          <div className="inline-empty">
            <p>조건에 맞는 상품이 아직 없어요.</p>
            <Link href="/" className="text-link">전체 상품 보기</Link>
          </div>
        )}

        <Link href={user ? "/products/new" : "/login?callback=%2Fproducts%2Fnew"} className="add-product-banner">
          <span className="add-icon">+</span>
          <span><strong>새로운 선물을 소개하고 싶나요?</strong><small>로그인한 회원이라면 누구나 상품을 등록할 수 있어요.</small></span>
          <ArrowIcon />
        </Link>
      </section>
    </>
  );
}

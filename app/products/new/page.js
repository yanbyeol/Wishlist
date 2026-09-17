import { connection } from "next/server";
import ProductForm from "@/app/products/product-form";
import { requireMember } from "@/lib/session";

export const metadata = { title: "상품 등록" };

export default async function NewProductPage() {
  await connection();
  await requireMember("/products/new");

  return (
    <section className="container narrow-page page-section">
      <div className="page-heading">
        <p className="eyebrow">새로운 선물 제안</p>
        <h1>상품 등록</h1>
        <p>누군가의 위시리스트에 담길 멋진 상품을 소개해 주세요.</p>
      </div>
      <ProductForm />
    </section>
  );
}

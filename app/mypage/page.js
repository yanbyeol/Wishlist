import Link from "next/link";
import { connection } from "next/server";
import { listAddresses } from "@/lib/addresses";
import { listReceivedOrders, listSellerOrders } from "@/lib/orders";
import { listProductsBySeller } from "@/lib/products";
import { requireUser } from "@/lib/session";

export const metadata = { title: "마이페이지" };

export default async function MyPage() {
  await connection();
  const user = await requireUser("/mypage");
  const [addresses, receivedOrders, products, sellerOrders] = await Promise.all([
    listAddresses(user.id),
    listReceivedOrders(user.id),
    listProductsBySeller(user.id),
    listSellerOrders(user.id),
  ]);

  return (
    <section className="container page-section">
      <div className="page-heading">
        <p className="eyebrow">My WishMate</p>
        <h1>{user.name}님, 반가워요</h1>
        <p>{user.email}</p>
      </div>

      <div className="dashboard-grid">
        <Link href="/mypage/addresses" className="dashboard-card">
          <span className="dashboard-card-icon">⌂</span>
          <div><p>배송지 관리</p><strong>{addresses.length}개</strong><small>선물 받을 주소를 저장해 두세요.</small></div>
          <span>→</span>
        </Link>
        <Link href="/mypage/gifts" className="dashboard-card">
          <span className="dashboard-card-icon">♥</span>
          <div><p>받은 선물</p><strong>{receivedOrders.length}개</strong><small>축하 카드와 배송 상태를 확인해요.</small></div>
          <span>→</span>
        </Link>
        <Link href="/seller/products" className="dashboard-card">
          <span className="dashboard-card-icon">▦</span>
          <div><p>판매 상품 관리</p><strong>{products.length}개</strong><small>등록한 상품을 수정하거나 정리해요.</small></div>
          <span>→</span>
        </Link>
        <Link href="/seller/orders" className="dashboard-card">
          <span className="dashboard-card-icon">↗</span>
          <div><p>판매 주문 관리</p><strong>{sellerOrders.length}개</strong><small>주문 정보와 배송 상태를 관리해요.</small></div>
          <span>→</span>
        </Link>
      </div>
    </section>
  );
}

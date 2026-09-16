import { connection } from "next/server";
import { listSellerOrders } from "@/lib/orders";
import { getSellerOrderStatuses } from "@/lib/seller-order-filter";
import { requireUser } from "@/lib/session";
import SellerOrderBoard from "./seller-order-board";

export const metadata = { title: "판매 주문 관리" };

export default async function SellerOrdersPage({ searchParams }) {
  await connection();
  const user = await requireUser("/seller/orders");
  const query = await searchParams;
  const selectedStatuses = getSellerOrderStatuses(query.status);
  const orders = await listSellerOrders(user.id, selectedStatuses);
  const notice = typeof query.notice === "string" ? query.notice : "";

  return (
    <section className="container page-section">
      <div className="page-heading">
        <p className="eyebrow">판매 상품 관리</p>
        <h1>주문 관리</h1>
        <p>주문자와 배송 정보를 확인하고 목업 배송 상태를 변경합니다.</p>
      </div>
      <SellerOrderBoard initialOrders={orders} initialStatuses={selectedStatuses} initialNotice={notice} />
    </section>
  );
}

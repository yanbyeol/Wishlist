import Link from "next/link";
import { connection } from "next/server";
import { updateOrderStatusAction } from "@/app/seller/orders/actions";
import EmptyState from "@/components/empty-state";
import StatusBadge from "@/components/status-badge";
import { ORDER_STATUS_OPTIONS } from "@/lib/constants";
import { listSellerOrders } from "@/lib/orders";
import { getSellerOrderStatuses } from "@/lib/seller-order-filter";
import { requireUser } from "@/lib/session";
import { formatDate, formatWon, getOrderStatusLabel } from "@/lib/utils/format";
import OrderStatusCheckboxes from "./order-status-checkboxes";
import styles from "./order-filter.module.css";

export const metadata = { title: "판매 주문 관리" };

const notices = {
  updated: "배송 상태를 변경했습니다.",
  blocked: "배송지가 없거나 주문 관리 권한이 없어 상태를 변경하지 못했습니다.",
  "invalid-status": "변경할 수 없는 배송 상태입니다.",
};

export default async function SellerOrdersPage({ searchParams }) {
  await connection();
  const user = await requireUser("/seller/orders");
  const query = await searchParams;
  const selectedStatuses = getSellerOrderStatuses(query.status);
  const orders = await listSellerOrders(user.id, selectedStatuses);
  const notice = typeof query.notice === "string" ? notices[query.notice] : "";

  return (
    <section className="container page-section">
      <div className="page-heading">
        <p className="eyebrow">판매 상품 관리</p>
        <h1>주문 관리</h1>
        <p>주문자와 배송 정보를 확인하고 목업 배송 상태를 변경합니다.</p>
      </div>
      <form action="/seller/orders" method="get" className={styles.filter}>
        <OrderStatusCheckboxes selectedStatuses={selectedStatuses} />
        <button className="button button-dark" type="submit">조회</button>
        <p id="order-filter-help" className={styles.help}>선택한 상태의 주문을 바로 조회합니다. 최소 1개 상태를 선택해야 합니다.</p>
      </form>
      {notice && <p className="notice-banner">{notice}</p>}

      {orders.length > 0 ? (
        <div className="seller-order-list">
          {orders.map((order) => (
            <article className="seller-order-card" key={order.id}>
              <div className="seller-order-heading">
                <div><p className="eyebrow">{formatDate(order.createdAt)} · {order.id.slice(-8).toUpperCase()}</p><h2>{order.productSnapshot.name}</h2></div>
                <StatusBadge tone={order.status === "delivered" ? "success" : "warm"}>{getOrderStatusLabel(order.status)}</StatusBadge>
              </div>
              <div className="order-info-grid">
                <div><span>주문자</span><strong>{order.sender?.name ?? "-"}</strong><small>{order.sender?.email ?? ""}</small></div>
                <div><span>받는 사람</span><strong>{order.recipient?.name ?? "-"}</strong><small>{order.recipient?.email ?? ""}</small></div>
                <div><span>결제 정보</span><strong>{formatWon(order.totalAmount)}</strong><small>목업 결제 완료</small></div>
                <div><span>배송지</span><strong>{order.shippingAddress?.recipientName ?? "입력 대기"}</strong><small>{order.shippingAddress ? `(${order.shippingAddress.postalCode}) ${order.shippingAddress.address1} ${order.shippingAddress.address2}` : "수락 링크에서 입력 예정"}</small></div>
              </div>
              <div className="seller-order-actions">
                <Link href={`/orders/${order.id}`} className="text-link">주문 상세</Link>
                <form action={updateOrderStatusAction}>
                  <input type="hidden" name="orderId" value={order.id} />
                  {selectedStatuses.map((status) => <input type="hidden" name="filterStatus" value={status} key={status} />)}
                  <label><span className="sr-only">배송 상태</span><select name="status" defaultValue={order.status}>{ORDER_STATUS_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
                  <button className="button button-dark" type="submit">상태 저장</button>
                </form>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          title="선택한 상태의 주문이 없어요"
          description="다른 주문 상태를 선택하거나 새 주문을 기다려 주세요."
          href="/seller/products"
          action="판매 상품 확인하기"
        />
      )}
    </section>
  );
}

"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { querySellerOrdersAction, updateOrderStatusAction } from "./actions";
import EmptyState from "@/components/empty-state";
import StatusBadge from "@/components/status-badge";
import { ORDER_STATUS_OPTIONS } from "@/lib/constants";
import { getSellerOrderStatuses } from "@/lib/seller-order-filter";
import { formatDate, formatWon, getOrderStatusLabel } from "@/lib/utils/format";
import OrderStatusCheckboxes from "./order-status-checkboxes";
import styles from "../seller-filter.module.css";

const notices = {
  updated: "배송 상태를 변경했습니다.",
  blocked: "배송지가 없거나 주문 관리 권한이 없어 상태를 변경하지 못했습니다.",
  "invalid-status": "변경할 수 없는 배송 상태입니다.",
};

export default function SellerOrderBoard({ initialOrders, initialStatuses, initialNotice }) {
  const [queryState, setQueryState] = useState(null);
  const latestRequest = useRef(0);
  const filterForm = useRef(null);

  const query = typeof window === "undefined" ? null : new URLSearchParams(window.location.search);
  const selectedStatuses = query ? getSellerOrderStatuses(query.getAll("status")) : initialStatuses;
  const notice = notices[query ? query.get("notice") : initialNotice] ?? "";
  // 상태 저장 등으로 새 서버 데이터가 오면 이전 조회 결과보다 우선합니다.
  const currentState = queryState?.initialOrders === initialOrders ? queryState : null;
  const orders = currentState?.orders ?? initialOrders;
  const isLoading = currentState?.isLoading ?? false;
  const error = currentState?.error ?? "";

  useEffect(() => {
    function restoreFilter() {
      if (window.location.pathname === "/seller/orders") filterForm.current?.requestSubmit();
    }

    const urlStatuses = getSellerOrderStatuses(new URLSearchParams(window.location.search).getAll("status"));
    const hasSameInitialStatuses = urlStatuses.length === initialStatuses.length
      && urlStatuses.every((status, index) => status === initialStatuses[index]);

    // 상세 화면에서 뒤로 돌아온 경우 URL은 복원되지만 부분 조회 결과는 사라지므로 다시 조회합니다.
    if (!hasSameInitialStatuses) restoreFilter();

    window.addEventListener("popstate", restoreFilter);
    return () => {
      window.removeEventListener("popstate", restoreFilter);
      latestRequest.current += 1;
    };
  }, [initialStatuses]);

  function submitFilter(event) {
    event.preventDefault();
    const statuses = getSellerOrderStatuses(new URLSearchParams(window.location.search).getAll("status"));
    const requestId = ++latestRequest.current;
    setQueryState((previous) => ({
      initialOrders,
      orders: previous?.initialOrders === initialOrders ? previous.orders : initialOrders,
      isLoading: true,
      error: "",
    }));

    startTransition(async () => {
      try {
        const result = await querySellerOrdersAction(statuses);
        if (requestId !== latestRequest.current) return;
        setQueryState((previous) => ({
          initialOrders,
          orders: result.error ? previous.orders : result.orders,
          isLoading: false,
          error: result.error,
        }));
      } catch {
        if (requestId !== latestRequest.current) return;
        setQueryState((previous) => ({
          ...previous,
          isLoading: false,
          error: "주문을 조회하지 못했습니다. 다시 조회해 주세요.",
        }));
      }
    });
  }

  return (
    <>
      <form ref={filterForm} action="/seller/orders" method="get" onSubmit={submitFilter} className={styles.filter}>
        <OrderStatusCheckboxes selectedStatuses={selectedStatuses} />
        <button className={`button button-primary ${styles.queryButton}`} type="submit">다시 조회</button>
        <p id="order-filter-help" className={styles.help}>
          {!isLoading && !error && "최소 1개 상태를 선택해 주세요."}
          <span className={`${styles.feedback}${error ? " error-message" : ""}`} role={error ? "alert" : "status"}>
            {isLoading ? "조회 중…" : error}
          </span>
        </p>
      </form>
      {notice && <p className="notice-banner">{notice}</p>}
      <div aria-busy={isLoading}>
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
          <EmptyState title="선택한 상태의 주문이 없어요" description="다른 주문 상태를 선택하거나 새 주문을 기다려 주세요." href="/seller/products" action="판매 상품 확인하기" />
        )}
      </div>
    </>
  );
}

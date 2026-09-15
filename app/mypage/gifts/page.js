import Link from "next/link";
import { connection } from "next/server";
import EmptyState from "@/components/empty-state";
import ProductImage from "@/components/product-image";
import StatusBadge from "@/components/status-badge";
import { listReceivedOrders } from "@/lib/orders";
import { requireUser } from "@/lib/session";
import { formatDate, getOrderStatusLabel } from "@/lib/utils/format";

export const metadata = { title: "받은 선물" };

export default async function ReceivedGiftsPage() {
  await connection();
  const user = await requireUser("/mypage/gifts");
  const orders = await listReceivedOrders(user.id);

  return (
    <section className="container page-section">
      <div className="page-heading">
        <p className="eyebrow">마이페이지</p>
        <h1>받은 선물</h1>
        <p>도착한 마음과 목업 배송 상태를 한곳에서 확인하세요.</p>
      </div>

      {orders.length > 0 ? (
        <div className="gift-list">
          {orders.map((order) => (
            <article className="gift-list-card" key={order.id}>
              <ProductImage
                src={order.productSnapshot.imageUrl ?? order.productSnapshot.image}
                alt={order.productSnapshot.name}
              />
              <div className="gift-list-copy">
                <div className="gift-list-heading">
                  <div><p className="eyebrow">{formatDate(order.createdAt)}</p><h2>{order.productSnapshot.name}</h2></div>
                  <StatusBadge tone={order.status === "delivered" ? "success" : "warm"}>{getOrderStatusLabel(order.status)}</StatusBadge>
                </div>
                {order.card && <blockquote>“{order.card.message}”</blockquote>}
                <div className="inline-actions">
                  <Link href={`/orders/${order.id}`} className="text-link">선물 자세히 보기</Link>
                  {order.status === "awaiting_address" && order.card?.acceptancePath && (
                    <Link href={order.card.acceptancePath} className="button button-primary">배송지 입력</Link>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          title="아직 받은 선물이 없어요"
          description="위시리스트를 공유하면 친구들이 마음을 전할 수 있어요."
          href="/wishlist"
          action="내 위시리스트 공유하기"
        />
      )}
    </section>
  );
}

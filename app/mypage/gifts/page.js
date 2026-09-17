import Link from "next/link";
import { connection } from "next/server";
import EmptyState from "@/components/empty-state";
import ProductImage from "@/components/product-image";
import ShareButton from "@/components/share-button";
import StatusBadge from "@/components/status-badge";
import { listReceivedOrders, listSentOrders } from "@/lib/orders";
import { requireMember } from "@/lib/session";
import { formatDate, getOrderStatusLabel } from "@/lib/utils/format";

export const metadata = { title: "선물함" };

function ReceivedGiftList({ orders }) {
  return (
    <div className="gift-list">
      {orders.map((order) => (
        <article className="gift-list-card" key={order.id}>
          <ProductImage
            src={order.productSnapshot.imageUrl ?? order.productSnapshot.image}
            alt={order.productSnapshot.name}
          />
          <div className="gift-list-copy">
            <div className="gift-list-heading">
              <div><p className="eyebrow">{formatDate(order.createdAt)}</p><h3>{order.productSnapshot.name}</h3></div>
              <StatusBadge tone={order.status === "delivered" ? "success" : "warm"}>{getOrderStatusLabel(order.status)}</StatusBadge>
            </div>
            {order.card && <blockquote>“{order.card.message}”</blockquote>}
            <div className="inline-actions">
              <Link href={`/orders/${order.id}`} className="text-link">선물 자세히 보기</Link>
              {!order.shippingAddress || order.status === "awaiting_address" ? (
                order.card?.acceptancePath && (
                  <Link href={order.card.acceptancePath} className="button button-primary">배송지 입력하기</Link>
                )
              ) : (
                <Link href={`/orders/${order.id}`} className="button button-secondary">
                  {order.status === "preparing" ? "배송지 확인/변경" : "배송지 확인"}
                </Link>
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function SentGiftList({ orders }) {
  if (orders.length === 0) {
    return (
      <EmptyState
        title="아직 보낸 선물이 없어요"
        description="상품을 둘러보고 소중한 사람에게 마음을 전해 보세요."
        action="선물할 상품 둘러보기"
      />
    );
  }

  return (
    <div className="gift-list">
      {orders.map((order) => (
        <article className="gift-list-card" key={order.id}>
          <ProductImage
            src={order.productSnapshot.imageUrl ?? order.productSnapshot.image}
            alt={order.productSnapshot.name}
          />
          <div className="gift-list-copy">
            <div className="gift-list-heading">
              <div><p className="eyebrow">{formatDate(order.createdAt)}</p><h3>{order.productSnapshot.name}</h3></div>
              <StatusBadge tone={order.status === "delivered" ? "success" : "warm"}>{getOrderStatusLabel(order.status)}</StatusBadge>
            </div>
            <p className="muted-copy">받는 사람 · {order.recipient?.name ?? "WishMate 회원"}</p>
            {order.card && <blockquote>“{order.card.message}”</blockquote>}
            <div className="inline-actions">
              <Link href={`/orders/${order.id}?view=sent`} className="text-link">주문 자세히 보기</Link>
              {order.status === "awaiting_address" && order.card?.acceptancePath && (
                <ShareButton
                  path={order.card.acceptancePath}
                  title={`${order.recipient?.name ?? "친구"}님을 위한 선물`}
                  text="선물이 도착했어요. 링크에서 선물을 확인하고 배송지를 입력해 주세요."
                  label="선물 수락 링크 공유하기"
                />
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

export default async function ReceivedGiftsPage() {
  await connection();
  const user = await requireMember("/mypage/gifts");
  const [receivedOrders, sentOrders] = await Promise.all([
    listReceivedOrders(user.id),
    listSentOrders(user.id),
  ]);
  const addressRequiredOrders = receivedOrders.filter(
    (order) => !order.shippingAddress || order.status === "awaiting_address",
  );
  const receivedWithAddressOrders = receivedOrders.filter(
    (order) => order.shippingAddress && order.status !== "awaiting_address",
  );

  return (
    <section className="container page-section">
      <div className="page-heading">
        <p className="eyebrow">마이페이지</p>
        <h1>선물함</h1>
        <p>받은 선물과 보낸 선물의 목업 배송 상태를 한곳에서 확인하세요.</p>
      </div>

      <div className="gift-box-sections">
        {addressRequiredOrders.length > 0 && (
          <section className="gift-box-section" aria-labelledby="address-required-heading">
            <div className="section-heading compact-section-heading">
              <div>
                <p className="eyebrow">Action required</p>
                <h2 id="address-required-heading">배송지 입력 필요 ({addressRequiredOrders.length})</h2>
              </div>
            </div>
            <ReceivedGiftList orders={addressRequiredOrders} />
          </section>
        )}

        <section className="gift-box-section" aria-labelledby="received-gifts-heading">
          <div className="section-heading compact-section-heading">
            <div>
              <p className="eyebrow">Received</p>
              <h2 id="received-gifts-heading">받은 선물 {receivedWithAddressOrders.length}개</h2>
            </div>
          </div>
          {receivedWithAddressOrders.length > 0 ? (
            <ReceivedGiftList orders={receivedWithAddressOrders} />
          ) : receivedOrders.length === 0 ? (
            <EmptyState
              title="아직 받은 선물이 없어요"
              description="위시리스트를 공유하면 친구들이 마음을 전할 수 있어요."
              href="/wishlist"
              action="내 위시리스트 공유하기"
            />
          ) : (
            <p className="inline-empty">배송지를 입력한 선물이 아직 없습니다.</p>
          )}
        </section>

        <section className="gift-box-section" aria-labelledby="sent-gifts-heading">
          <div className="section-heading compact-section-heading">
            <div>
              <p className="eyebrow">Sent</p>
              <h2 id="sent-gifts-heading">보낸 선물 {sentOrders.length}개</h2>
            </div>
          </div>
          <SentGiftList orders={sentOrders} />
        </section>
      </div>
    </section>
  );
}

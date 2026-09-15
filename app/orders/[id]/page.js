import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import ProductImage from "@/components/product-image";
import ShareButton from "@/components/share-button";
import StatusBadge from "@/components/status-badge";
import { getOrderDetails } from "@/lib/orders";
import { requireUser } from "@/lib/session";
import { formatDate, formatWon, getOrderStatusLabel } from "@/lib/utils/format";

function statusTone(status) {
  if (status === "delivered") return "success";
  if (status === "shipped") return "accent";
  if (status === "preparing") return "warm";
  return "neutral";
}

export default async function OrderDetailPage({ params }) {
  await connection();
  const { id } = await params;
  const user = await requireUser(`/orders/${id}`);
  const order = await getOrderDetails(id);

  if (
    !order ||
    ![order.senderId, order.recipientId, order.sellerId].includes(user.id)
  ) {
    notFound();
  }

  const isRecipient = user.id === order.recipientId;
  const isSender = user.id === order.senderId;
  const acceptancePath = order.card?.acceptancePath;

  return (
    <section className="container narrow-page page-section">
      <div className="page-heading heading-with-badge">
        <div>
          <p className="eyebrow">선물 주문 결과</p>
          <h1>선물이 준비되었어요</h1>
          <p>{formatDate(order.createdAt)} · 주문번호 {order.id.slice(-8).toUpperCase()}</p>
        </div>
        <StatusBadge tone={statusTone(order.status)}>
          {getOrderStatusLabel(order.status)}
        </StatusBadge>
      </div>

      {order.card && (
        <div className={`gift-card gift-card-${order.card.theme ?? "warm-confetti"}`}>
          <span className="gift-card-sparkle">✦</span>
          <p>WishMate celebration card</p>
          <h2>{order.card.title}</h2>
          <blockquote>{order.card.message}</blockquote>
          <small>AI 축하 카드 · {order.card.generationProvider === "mock" ? "데모 생성" : order.card.generationProvider}</small>
        </div>
      )}

      <div className="info-card order-result-card">
        <ProductImage
          src={order.productSnapshot.imageUrl ?? order.productSnapshot.image}
          alt={order.productSnapshot.name}
        />
        <div>
          <p className="eyebrow">{order.type === "group" ? "같이 준비한 선물" : "선물 상품"}</p>
          <h2>{order.productSnapshot.name}</h2>
          <strong>{formatWon(order.totalAmount)}</strong>
          <p>{order.sender?.name ?? "보낸 사람"} → {order.recipient?.name ?? "받는 사람"}</p>
        </div>
      </div>

      {order.status === "awaiting_address" && acceptancePath && (
        <div className="action-panel">
          <div>
            <h2>배송지를 기다리고 있어요</h2>
            <p>선물을 받을 분이 링크에서 배송지를 입력하면 상품 준비가 시작됩니다.</p>
          </div>
          {isRecipient ? (
            <Link href={acceptancePath} className="button button-primary">선물 수락하고 배송지 입력</Link>
          ) : isSender ? (
            <ShareButton
              path={acceptancePath}
              title={`${order.recipient?.name ?? "친구"}님을 위한 선물`}
              text="선물이 도착했어요. 링크에서 선물을 확인하고 배송지를 입력해 주세요."
              label="선물 수락 링크 공유하기"
            />
          ) : null}
        </div>
      )}

      {order.shippingAddress && (
        <div className="info-card address-summary">
          <div>
            <p className="eyebrow">배송지</p>
            <h2>{order.shippingAddress.recipientName}</h2>
          </div>
          <p>{order.shippingAddress.phone}</p>
          <p>({order.shippingAddress.postalCode}) {order.shippingAddress.address1} {order.shippingAddress.address2}</p>
          {order.delivery?.trackingNumber && <p>목업 운송장 · {order.delivery.trackingNumber}</p>}
        </div>
      )}

      <div className="centered-action">
        <Link href={isRecipient ? "/mypage/gifts" : "/"} className="button button-secondary">
          {isRecipient ? "받은 선물 보기" : "상품 더 둘러보기"}
        </Link>
      </div>
    </section>
  );
}

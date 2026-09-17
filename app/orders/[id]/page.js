import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import GroupGiftMessageCards from "@/components/group-gift-message-cards";
import { GiftIcon } from "@/components/icons";
import ProductImage from "@/components/product-image";
import ShareButton from "@/components/share-button";
import StatusBadge from "@/components/status-badge";
import { getOrderDetails } from "@/lib/orders";
import { requireMember, requireUser } from "@/lib/session";
import { formatDate, formatWon, getOrderStatusLabel } from "@/lib/utils/format";

function statusTone(status) {
  if (status === "delivered") return "success";
  if (status === "shipped") return "accent";
  if (status === "preparing") return "warm";
  return "neutral";
}

function getOrderView(value) {
  return ["sent", "seller"].includes(value) ? value : "";
}

function getGroupParticipantCount(contributions) {
  const participantNames = contributions.map((contribution) => (
    String(contribution.name ?? contribution.nickname ?? "").trim() || "익명의 친구"
  ));

  return new Set(participantNames).size;
}

export default async function OrderDetailPage({ params, searchParams }) {
  await connection();
  const { id } = await params;
  const query = await searchParams;
  const orderView = getOrderView(query.view);
  const callbackPath = orderView ? `/orders/${id}?view=${orderView}` : `/orders/${id}`;
  const user = orderView === "seller"
    ? await requireMember(callbackPath)
    : await requireUser(callbackPath);
  const order = await getOrderDetails(id, user.id, orderView);

  if (!order || (order.viewerRole === "seller" && !user.isMember)) {
    notFound();
  }

  const isRecipient = user.id === order.recipientId;
  const isSender = user.id === order.senderId;
  const isParticipant = order.viewerRole === "participant";
  const acceptancePath = order.card?.acceptancePath;
  const groupParticipantCount = order.type === "group"
    ? getGroupParticipantCount(order.contributions)
    : 0;

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

      {order.card && order.type !== "group" && (isSender || isRecipient) && (
        <article
          className={`gift-card gift-card-${order.card.theme ?? "warm-confetti"}`}
          aria-label={`${order.recipient?.name ?? "친구"}님에게 도착한 축하 카드`}
        >
          <span className="gift-card-icon" aria-hidden="true"><GiftIcon size={20} /></span>
          <p className="gift-card-intro">
            {order.recipient?.name ?? "친구"}님에게 선물이 도착했어요
          </p>
          <blockquote>{order.card.message}</blockquote>
          <p className="gift-card-sender">
            <span>From.</span>
            <strong>{order.sender?.name ?? "친구"}</strong>
          </p>
        </article>
      )}

      {order.type === "group" && (isSender || isRecipient || isParticipant) && (
        <GroupGiftMessageCards
          contributions={order.contributions}
          heading={`${groupParticipantCount}명의 마음을 모았어요`}
          showParticipantBadges
          totalAmount={order.groupGift?.targetAmount ?? order.totalAmount}
        />
      )}

      <div className="info-card order-result-card">
        <ProductImage
          src={order.productSnapshot.imageUrl ?? order.productSnapshot.image}
          alt={order.productSnapshot.name}
        />
        <div>
          <p className="eyebrow">{order.type === "group" ? "함께 선물하기" : "선물 상품"}</p>
          <h2>{order.productSnapshot.name}</h2>
          <strong>{formatWon(order.totalAmount)}</strong>
          <p>
            {order.type === "group"
              ? `받는 사람 · ${order.recipient?.name ?? "친구"}`
              : `${order.sender?.name ?? "보낸 사람"} → ${order.recipient?.name ?? "받는 사람"}`}
          </p>
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
        <Link href={isRecipient && user.isMember ? "/mypage/gifts" : "/"} className="button button-secondary">
          {isRecipient && user.isMember ? "받은 선물 보기" : "상품 더 둘러보기"}
        </Link>
      </div>
    </section>
  );
}

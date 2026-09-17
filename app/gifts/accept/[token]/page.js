import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import AcceptGiftForm from "@/app/gifts/accept/[token]/accept-gift-form";
import { GiftIcon } from "@/components/icons";
import ProductImage from "@/components/product-image";
import { listAddresses } from "@/lib/addresses";
import { getGiftByAcceptanceToken } from "@/lib/orders";
import { requireUser } from "@/lib/session";

export const metadata = { title: "선물 수락" };

export default async function AcceptGiftPage({ params }) {
  await connection();
  const { token } = await params;
  const user = await requireUser(`/gifts/accept/${token}`);
  const gift = await getGiftByAcceptanceToken(token);

  if (!gift || gift.order.recipientId !== user.id) {
    notFound();
  }

  const addresses = await listAddresses(user.id);

  return (
    <section className="container page-section acceptance-grid">
      <article
        className={`gift-card gift-card-${gift.card.theme ?? "warm-confetti"}`}
        aria-label={`${user.name ?? "친구"}님에게 도착한 축하 카드`}
      >
        <span className="gift-card-icon" aria-hidden="true"><GiftIcon size={20} /></span>
        <p className="gift-card-intro">{user.name ?? "친구"}님에게 선물이 도착했어요</p>
        <blockquote>{gift.card.message}</blockquote>
        <p className="gift-card-sender">
          <span>From.</span>
          <strong>{gift.sender?.name ?? "친구"}</strong>
        </p>
      </article>
      <div>
        <div className="info-card acceptance-product">
          <ProductImage
            src={gift.order.productSnapshot.imageUrl ?? gift.order.productSnapshot.image}
            alt={gift.order.productSnapshot.name}
          />
          <div><p className="eyebrow">도착한 선물</p><h2>{gift.order.productSnapshot.name}</h2></div>
        </div>
        {gift.card.acceptedAt ? (
          <div className="action-panel vertical-panel">
            <h2>이미 선물을 수락했어요</h2>
            <p>주문 상세에서 목업 배송 상태를 확인할 수 있습니다.</p>
            <Link href={`/orders/${gift.order.id}`} className="button button-primary">주문 상세 보기</Link>
          </div>
        ) : (
          <>
            <div className="page-heading compact-heading">
              <p className="eyebrow">선물 수락</p>
              <h2>배송지를 확인해 주세요</h2>
              <p>입력한 주소는 이 목업 주문의 배송 정보로만 사용됩니다.</p>
            </div>
            <AcceptGiftForm token={token} addresses={addresses} userName={user.name} />
          </>
        )}
      </div>
    </section>
  );
}

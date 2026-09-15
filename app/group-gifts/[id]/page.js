import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import {
  ContributionForm,
  RetryGroupGiftForm,
} from "@/app/group-gifts/group-gift-forms";
import ProductImage from "@/components/product-image";
import ShareButton from "@/components/share-button";
import StatusBadge from "@/components/status-badge";
import { getGroupGiftById } from "@/lib/group-gifts";
import { getCurrentUser } from "@/lib/session";
import {
  formatDate,
  formatWon,
  getGroupGiftStatusLabel,
} from "@/lib/utils/format";

function statusTone(status) {
  if (status === "completed") return "success";
  if (status === "payment_failed" || status === "cancelled") return "danger";
  if (status === "funded" || status === "processing") return "accent";
  return "warm";
}

export default async function GroupGiftPage({ params }) {
  await connection();
  const { id } = await params;
  const [groupGift, user] = await Promise.all([
    getGroupGiftById(id),
    getCurrentUser(),
  ]);

  if (!groupGift || !groupGift.product) {
    notFound();
  }

  const percent = Math.min(
    100,
    Math.round((groupGift.currentAmount / groupGift.targetAmount) * 100),
  );
  const isRecipient = user?.id === groupGift.recipientId;
  const hasContribution = groupGift.contributions.some(
    (contribution) => contribution.userId === user?.id,
  );

  return (
    <section className="container page-section">
      <div className="page-heading heading-with-action">
        <div>
          <p className="eyebrow">같이 선물하기</p>
          <h1>{groupGift.title}</h1>
          <p>{groupGift.recipient?.name ?? "친구"}님을 위해 마음을 모으고 있어요.</p>
        </div>
        <ShareButton
          path={`/group-gifts/${groupGift.id}`}
          title={groupGift.title}
          text="같이 준비하는 선물에 마음을 보태 주세요."
          label="참여 링크 공유하기"
        />
      </div>

      <div className="group-gift-grid">
        <div className="group-gift-main">
          <div className="info-card group-product-summary">
            <ProductImage src={groupGift.product.imageUrl} alt={groupGift.product.name} />
            <div>
              <p className="eyebrow">{groupGift.product.category}</p>
              <h2>{groupGift.product.name}</h2>
              <p>{groupGift.organizer?.name ?? "친구"}님이 같이 선물을 시작했어요.</p>
            </div>
            <StatusBadge tone={statusTone(groupGift.status)}>
              {getGroupGiftStatusLabel(groupGift.status)}
            </StatusBadge>
          </div>

          <div className="progress-card">
            <div className="progress-heading">
              <div><span>현재까지</span><strong>{formatWon(groupGift.currentAmount)}</strong></div>
              <div><span>목표 금액</span><strong>{formatWon(groupGift.targetAmount)}</strong></div>
            </div>
            <div className="progress-track" aria-label={`목표 금액의 ${percent}% 달성`}>
              <span style={{ width: `${percent}%` }} />
            </div>
            <div className="progress-meta"><strong>{percent}% 달성</strong><span>{formatDate(groupGift.expiresAt)}까지</span></div>
          </div>

          <div className="info-card contribution-list">
            <div className="section-heading compact-section-heading">
              <div><p className="eyebrow">함께한 마음</p><h2>{groupGift.contributions.length}명이 참여했어요</h2></div>
            </div>
            {groupGift.contributions.length > 0 ? (
              <ul>
                {groupGift.contributions.map((contribution) => (
                  <li key={contribution.id}>
                    <span className="contributor-avatar">{contribution.nickname.slice(0, 1)}</span>
                    <div><strong>{contribution.nickname}</strong><p>{contribution.message || "함께 마음을 보탰어요."}</p></div>
                    <span>{formatWon(contribution.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted-copy">첫 번째 마음을 보태 주세요.</p>
            )}
          </div>
        </div>

        <aside className="participation-panel">
          {groupGift.status === "funding" && !user && (
            <div className="stack-form">
              <h2>같이 참여해 볼까요?</h2>
              <p>로그인하면 원하는 금액과 축하 메시지를 보탤 수 있어요.</p>
              <Link href={`/login?callback=${encodeURIComponent(`/group-gifts/${groupGift.id}`)}`} className="button button-primary button-full">로그인하고 참여하기</Link>
            </div>
          )}
          {groupGift.status === "funding" && user && !isRecipient && (
            <>
              <h2>마음 보태기</h2>
              <p>실제 결제 없이 선택한 금액만 목표에 반영됩니다.</p>
              <ContributionForm groupGift={groupGift} user={user} />
            </>
          )}
          {groupGift.status === "funding" && isRecipient && (
            <div className="stack-form"><h2>친구들이 준비 중이에요</h2><p>링크를 공유하면 더 많은 친구가 함께할 수 있어요.</p></div>
          )}
          {groupGift.status === "payment_failed" && (
            <div className="stack-form">
              <h2>데모 결제를 다시 처리해 주세요</h2>
              <p>참여 내역이 있는 회원만 다시 시도할 수 있습니다.</p>
              {hasContribution ? <RetryGroupGiftForm groupGiftId={groupGift.id} /> : <p className="muted-copy">참여한 회원이 다시 처리할 수 있어요.</p>}
            </div>
          )}
          {groupGift.status === "completed" && (
            <div className="stack-form">
              <h2>목표 금액을 모두 모았어요!</h2>
              <p>AI 축하 카드와 선물이 준비되었습니다.</p>
              {groupGift.orderId && [groupGift.organizerId, groupGift.recipientId].includes(user?.id) && (
                <Link href={`/orders/${groupGift.orderId}`} className="button button-primary button-full">완성된 선물 보기</Link>
              )}
            </div>
          )}
          {groupGift.status === "cancelled" && (
            <div className="stack-form"><h2>모집이 종료되었어요</h2><p>모집 기간 안에 목표 금액에 도달하지 못했습니다.</p></div>
          )}
          {["funded", "processing"].includes(groupGift.status) && (
            <div className="stack-form"><h2>선물을 준비하고 있어요</h2><p>목표를 달성해 데모 결제와 축하 카드를 처리 중입니다.</p></div>
          )}
        </aside>
      </div>
    </section>
  );
}

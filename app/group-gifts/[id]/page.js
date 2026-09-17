import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import {
  ContributionForm,
  GuestOtpForm,
  RetryGroupGiftForm,
} from "@/app/group-gifts/group-gift-forms";
import GroupGiftMessageCards from "@/components/group-gift-message-cards";
import ProductImage from "@/components/product-image";
import ShareButton from "@/components/share-button";
import StatusBadge from "@/components/status-badge";
import { getGuestGroupGiftSession } from "@/lib/group-gift-otp";
import { getGroupGiftById, hasGroupGiftContribution } from "@/lib/group-gifts";
import { getCurrentUser } from "@/lib/session";
import {
  formatDate,
  formatWon,
  getGroupGiftStatusLabel,
} from "@/lib/utils/format";
import { hasGroupGiftStarted } from "@/lib/utils/group-gift";
import { getSharedWishlistReturnPath } from "@/lib/utils/group-gift-navigation";

function statusTone(status) {
  if (status === "completed") return "success";
  if (status === "payment_failed" || status === "cancelled") return "danger";
  if (status === "funded" || status === "processing") return "accent";
  return "warm";
}

export default async function GroupGiftPage({ params, searchParams }) {
  await connection();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const returnTo = getSharedWishlistReturnPath(query?.returnTo);
  const [groupGift, user] = await Promise.all([
    getGroupGiftById(id),
    getCurrentUser(),
  ]);

  if (!groupGift || !groupGift.product) {
    notFound();
  }

  const guestSession = user ? null : await getGuestGroupGiftSession(groupGift.id);

  const percent = Math.min(
    100,
    Math.round((groupGift.currentAmount / groupGift.targetAmount) * 100),
  );
  const isRecipient = user?.id === groupGift.recipientId;
  const groupGiftStarted = hasGroupGiftStarted(groupGift);
  const waitingForFirstContribution = groupGift.status === "funding" && !groupGiftStarted;
  const hasContribution = user || guestSession
    ? await hasGroupGiftContribution({
      groupGiftId: groupGift.id,
      userId: user?.id,
      guestEmail: guestSession?.email,
    })
    : false;
  const guestNickname = guestSession?.email.split("@")[0].slice(0, 20);

  return (
    <section className="container page-section">
      {returnTo && (
        <Link href={returnTo} className="back-link">← 위시리스트로 돌아가기</Link>
      )}
      <div className="page-heading heading-with-action">
        <div>
          <p className="eyebrow">함께 선물하기</p>
          <h1>{groupGift.title}</h1>
          <p>
            {waitingForFirstContribution
              ? "금액 참여를 완료하면 공동선물이 시작돼요."
              : `${groupGift.recipient?.name ?? "친구"}님을 위한 선물을 함께 준비하고 있어요.`}
          </p>
        </div>
        <ShareButton
          path={`/group-gifts/${groupGift.id}`}
          title={groupGift.title}
          text="함께 준비하는 선물에 참여해 주세요."
          label="참여 링크 복사"
          copyOnly
        />
      </div>

      <div className="group-gift-grid">
        <div className="group-gift-main">
          <div className="info-card group-product-summary">
            <ProductImage src={groupGift.product.imageUrl} alt={groupGift.product.name} />
            <div>
              <p className="eyebrow">{groupGift.product.category}</p>
              <h2>{groupGift.product.name}</h2>
              <p>
                {waitingForFirstContribution
                  ? `${groupGift.organizer?.name ?? "친구"}님이 함께 선물할 친구를 초대했어요.`
                  : `${groupGift.organizer?.name ?? "친구"}님이 함께 선물하기를 시작했어요.`}
              </p>
            </div>
            {!waitingForFirstContribution && (
              <StatusBadge tone={statusTone(groupGift.status)}>
                {getGroupGiftStatusLabel(groupGift.status)}
              </StatusBadge>
            )}
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

          <GroupGiftMessageCards
            contributions={groupGift.contributions}
            heading={`${groupGift.contributions.length}명이 참여했어요`}
            totalAmount={groupGift.targetAmount}
          />
        </div>

        <aside className="participation-panel">
          {groupGift.status === "funding" && !user && !guestSession && (
            <GuestOtpForm groupGiftId={groupGift.id} returnTo={returnTo} />
          )}
          {groupGift.status === "funding" && (user || guestSession) && !isRecipient && (
            <>
              <h2>함께 선물하기</h2>
              <p>실제 결제 없이 선택한 금액만 목표에 반영됩니다.</p>
              {guestSession && <p className="verified-participant">이메일 인증으로 참여 중이에요.</p>}
              <ContributionForm
                groupGift={groupGift}
                defaultNickname={user?.name ?? (guestNickname?.length >= 2 ? guestNickname : "게스트")}
                initialHasContribution={hasContribution}
                returnTo={returnTo}
              />
            </>
          )}
          {groupGift.status === "funding" && isRecipient && (
            <div className="stack-form"><h2>친구들이 준비 중이에요</h2><p>링크를 공유하면 더 많은 친구가 함께할 수 있어요.</p></div>
          )}
          {groupGift.status === "payment_failed" && (
            <div className="stack-form">
              <h2>데모 결제를 다시 처리해 주세요</h2>
              <p>참여 내역이 있는 사용자만 다시 시도할 수 있습니다.</p>
              {hasContribution ? (
                <RetryGroupGiftForm groupGiftId={groupGift.id} returnTo={returnTo} />
              ) : (
                <p className="muted-copy">참여한 사용자가 다시 처리할 수 있어요.</p>
              )}
            </div>
          )}
          {groupGift.status === "completed" && (
            <div className="stack-form">
              <h2>목표 금액을 모두 모았어요!</h2>
              <p>AI 축하 카드와 선물이 준비되었습니다.</p>
              {groupGift.orderId && user && (
                [groupGift.organizerId, groupGift.recipientId].includes(user.id) || hasContribution
              ) && (
                <Link href={`/orders/${groupGift.orderId}`} className="button button-primary button-full">완성된 선물 보기</Link>
              )}
            </div>
          )}
          {groupGift.status === "cancelled" && (
            <div className="stack-form"><h2>모집이 종료되었어요</h2><p>이 공동선물에는 더 이상 참여할 수 없습니다.</p></div>
          )}
          {["funded", "processing"].includes(groupGift.status) && (
            <div className="stack-form"><h2>선물을 준비하고 있어요</h2><p>목표를 달성해 데모 결제와 축하 카드를 처리 중입니다.</p></div>
          )}
        </aside>
      </div>
    </section>
  );
}

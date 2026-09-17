function getContributionWidth(amount, totalAmount) {
  const contributionAmount = Number(amount);
  const groupGiftAmount = Number(totalAmount);

  if (
    !Number.isFinite(contributionAmount) ||
    !Number.isFinite(groupGiftAmount) ||
    contributionAmount <= 0 ||
    groupGiftAmount <= 0
  ) {
    return 0;
  }

  return Math.min(100, (contributionAmount / groupGiftAmount) * 100);
}

export default function GroupGiftMessageCards({
  contributions,
  heading,
  totalAmount,
}) {
  const messages = contributions.filter(
    (contribution) => String(contribution.message ?? "").trim(),
  );

  if (messages.length === 0) {
    return null;
  }

  return (
    <section className="group-message-section" aria-label="공동선물 축하 메시지">
      <div className="group-message-heading">
        <p className="eyebrow">축하 메시지</p>
        <h2>{heading ?? `${messages.length}개의 마음이 도착했어요`}</h2>
      </div>
      <div className="group-message-grid">
        {messages.map((contribution) => {
          const contributorName = contribution.name ?? contribution.nickname ?? "익명의 친구";
          const contributionWidth = getContributionWidth(
            contribution.amount,
            totalAmount,
          );

          return (
            <article className="group-message-card" key={contribution.id}>
              <span className="group-message-card-sparkle" aria-hidden="true">✦</span>
              <strong>{contributorName}</strong>
              <blockquote>{contribution.message}</blockquote>
              <div
                className="contribution-progress-track group-message-contribution-track"
                role="img"
                aria-label={`${contributorName}님의 상대적인 기여도`}
              >
                <span style={{ width: `${contributionWidth}%` }} />
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

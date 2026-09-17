export default function GroupGiftMessageCards({ contributions, heading }) {
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
        {messages.map((contribution) => (
          <article className="group-message-card" key={contribution.id}>
            <strong>{contribution.name ?? contribution.nickname ?? "익명의 친구"}</strong>
            <blockquote>{contribution.message}</blockquote>
          </article>
        ))}
      </div>
    </section>
  );
}

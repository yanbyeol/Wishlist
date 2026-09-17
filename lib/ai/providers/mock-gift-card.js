export async function generateMockGiftCard(input) {
  const messages = input.messages.map((message) => message.trim()).filter(Boolean);
  const combinedMessage = messages.length
    ? messages.join(" · ")
    : `${input.recipientName}님의 특별한 날을 진심으로 축하해요!`;

  return {
    title: `${input.recipientName}님에게 선물이 도착했어요`,
    message: combinedMessage,
    theme: "warm-confetti",
    generationProvider: "mock",
    status: "generated",
  };
}

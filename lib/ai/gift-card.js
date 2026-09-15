import { generateMockGiftCard } from "@/lib/ai/providers/mock-gift-card";

const providers = {
  mock: generateMockGiftCard,
};

export async function generateGiftCard(input) {
  const providerName = process.env.GIFT_CARD_PROVIDER || "mock";
  const provider = providers[providerName];

  if (!provider) {
    throw new Error(`지원하지 않는 축하 카드 제공자입니다: ${providerName}`);
  }

  return provider(input);
}

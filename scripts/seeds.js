/**
 * WishMate 개발용 시드 (docs/README.md 기준).
 * 실행: node scripts/seeds.js / 초기화 후 실행: node scripts/seeds.js --reset
 * 검사만: node scripts/seeds.js --dry-run
 * 프로젝트 루트 .env.local 등에 MONGODB_URI, MONGODB_DB 설정.
 * 로그인: minji@example.com 등 / 비밀번호: 12345678
 * 금액은 원(KRW), 앱 데이터의 참조 ID는 문자열. 인증 컬렉션은 Better Auth 기본 이름.
 * 고정 ID로 없는 데이터만 추가하며, 데모 상품·주문의 이미지 경로만 최신 자산으로 맞춘다.
 * 결제·AI 카드·배송은 모두 목업이며 외부 서비스 호출은 하지 않는다.
 * 상품/주문 컬렉션은 현재 lib 모듈에서 사용하는 스키마와 동일하게 유지한다.
 */
const { resolve } = require("node:path");
const { createHash } = require("node:crypto");
const assert = require("node:assert/strict");
const { MongoClient, ObjectId } = require("mongodb");
const { loadEnvConfig } = require("@next/env");

loadEnvConfig(resolve(__dirname, ".."), true);

const TEST_LOGIN_PASSWORD = "12345678";
const RESET_RELATED_COLLECTIONS = [
  "productImages.chunks",
  "productImages.files",
  "groupGiftGuestSessions",
  "groupGiftOtpChallenges",
  "session",
  "verification",
];
const id = (number) => new ObjectId(`57495348${number.toString(16).padStart(16, "0")}`);
const now = new Date("2026-09-15T00:00:00.000Z");
const document = (number, fields) => ({ _id: id(number), ...fields, createdAt: now, updatedAt: now });
const notificationDocument = (eventKey, fields) => ({
  _id: new ObjectId(createHash("sha256").update(eventKey).digest("hex").slice(0, 24)),
  ...fields,
  eventKey,
  createdAt: now,
  updatedAt: now,
});

async function createSeed() {
  const { hashPassword } = await import("better-auth/crypto");
  const passwordHash = await hashPassword(TEST_LOGIN_PASSWORD);
  const user = [
    [1, "김민지", "minji"], [2, "이준호", "junho"],
    [3, "박서연", "seoyeon"], [4, "최도윤", "doyun"],
  ].map(([number, name, email]) => document(number, {
    name, email: `${email}@example.com`, emailVerified: true, image: null,
  }));
  const account = user.map((member, index) => document(11 + index, {
    userId: member._id, accountId: member._id.toHexString(), providerId: "credential", password: passwordHash,
  }));
  const categories = ["디지털", "리빙", "패션", "뷰티", "식품", "취미"].map((name, index) =>
    document(21 + index, { name, sortOrder: index }));
  const products = [
    [31, 2, 21, "무선 노이즈 캔슬링 헤드폰", 240000, 12, "음악에 집중하는 시간을 위한 무선 헤드폰. 충전 케이블과 보관 케이스 포함.", "headphones.jpg"],
    [32, 3, 22, "세라믹 머그 2종 세트", 32000, 25, "따뜻한 커피를 함께 즐기는 350ml 머그 세트. 크림과 그린 색상.", "ceramic-mugs.jpg"],
    [33, 4, 23, "데일리 캔버스 토트백", 45000, 18, "책과 노트북을 넉넉하게 담는 면 소재 가방. 내부 수납 포켓 포함.", "canvas-tote.jpg"],
    [34, 2, 24, "핸드크림 선물 세트", 28000, 40, "서로 다른 향의 30ml 핸드크림 3종. 선물 포장 포함.", "hand-cream-set.jpg"],
    [35, 3, 25, "드립백 커피 컬렉션", 18000, 30, "세 가지 원두를 담은 드립백 12개입. 간편하게 즐기는 커피 선물.", "drip-coffee.jpg"],
    [36, 4, 26, "입문용 수채화 키트", 56000, 9, "24색 물감, 붓, 전용 스케치북으로 시작하는 나만의 취미.", "watercolor-kit.jpg"],
    [37, 1, 21, "휴대용 블루투스 스피커", 120000, 8, "책상 위와 나들이에서 사용하는 소형 스피커. USB-C 충전 지원.", "bluetooth-speaker.jpg"],
    [38, 1, 22, "포근한 니트 블랭킷", 68000, 0, "소파 위에서 덮기 좋은 100×150cm 담요. 현재 품절된 상품 예시.", "knit-blanket.jpg"],
  ].map(([number, seller, category, name, price, quantity, description, imageFile]) => document(number, {
    sellerId: id(seller).toHexString(),
    category: categories.find((entry) => entry._id.equals(id(category))).name,
    name, price, currency: "KRW", quantity, description,
    imageUrl: `/images/products/${imageFile}`,
    status: quantity ? "active" : "sold_out",
  }));
  const addresses = user.slice(0, 2).map((member, index) => document(41 + index, {
    userId: member._id.toHexString(), label: "집 (테스트)", recipientName: member.name,
    phone: "010-0000-0000", postalCode: "00000", address1: "테스트시 선물로 123",
    address2: `${index + 1}동 101호 (가상 주소)`, isDefault: true,
  }));
  const wishlists = user.map((member, index) => document(51 + index, {
    userId: member._id.toHexString(), title: `${member.name}의 위시리스트`,
    shareToken: `wishmate-demo-${index + 1}`, visibility: "public",
  }));
  // 도윤의 위시리스트는 빈 상태 UI 확인용.
  // 이미 주문 완료된 32번·37번 상품은 실제 주문 흐름처럼 민지의 목록에서 제외한다.
  const wishlistItems = [[61, 51, 31], [66, 51, 33], [64, 52, 36], [65, 53, 34]]
    .map(([number, wishlist, product]) => document(number, {
      wishlistId: id(wishlist).toHexString(),
      productId: id(product).toHexString(),
    }));
  const groupGifts = [
    document(71, { organizerId: id(2).toHexString(), recipientId: id(1).toHexString(), productId: id(31).toHexString(), wishlistId: id(51).toHexString(),
      title: "민지의 생일 헤드폰", targetAmount: 240000, currentAmount: 90000,
      status: "funding", expiresAt: new Date("2099-12-31T00:00:00Z"), orderId: null }),
    document(72, { organizerId: id(2).toHexString(), recipientId: id(1).toHexString(), productId: id(37).toHexString(), wishlistId: id(51).toHexString(),
      title: "민지의 새 출발을 응원해", targetAmount: 120000, currentAmount: 120000,
      status: "completed", expiresAt: new Date("2026-09-20T00:00:00Z"), orderId: id(93).toHexString() }),
  ];
  const contributions = [
    [81, 71, 2, "준호", 50000],
    [82, 71, 3, "서연", 40000],
    [83, 72, 2, "준호", 70000],
    [84, 72, 4, "도윤", 50000],
  ].map(([number, group, sender, nickname, amount]) => document(number, {
      groupGiftId: id(group).toHexString(), participantType: "member",
      userId: id(sender).toHexString(), guestEmail: null,
      nickname, amount, message: "새로운 하루도 행복하게 보내!",
      paymentStatus: "paid", paymentProvider: "mock", paymentId: `mock-contribution-${number}`,
    }));
  const orders = [
    [91, "self", 2, 2, 35, null, 42, "delivered"],
    [92, "single", 3, 1, 32, null, null, "awaiting_address"],
    [93, "group", 2, 1, 37, 72, 41, "shipped"],
  ].map(([number, type, sender, recipient, product, group, address, status]) => {
    const item = products.find((entry) => entry._id.equals(id(product)));
    return document(number, {
      type, senderId: id(sender).toHexString(), recipientId: id(recipient).toHexString(), sellerId: item.sellerId,
      productId: item._id.toHexString(), productSnapshot: { name: item.name, price: item.price, imageUrl: item.imageUrl },
      quantity: 1, totalAmount: item.price, currency: "KRW", groupGiftId: group ? id(group).toHexString() : null,
      message: "소중한 너에게, 행복한 하루를 선물해!", status,
      paymentStatus: "paid", paymentProvider: "mock",
      paymentId: type === "group" ? null : `mock-order-${number}`,
      shippingAddress: address ? (() => {
        const savedAddress = addresses.find((entry) => entry._id.equals(id(address)));
        return {
          recipientName: savedAddress.recipientName,
          phone: savedAddress.phone,
          postalCode: savedAddress.postalCode,
          address1: savedAddress.address1,
          address2: savedAddress.address2,
        };
      })() : null,
      delivery: { provider: "mock", trackingNumber: address ? `MOCK-${number}` : null,
        shippedAt: address ? now : null, deliveredAt: status === "delivered" ? now : null },
    });
  });
  const giftCards = orders.map((order, index) => document(101 + index, {
    orderId: order._id.toHexString(), recipientId: order.recipientId, title: "너의 모든 날을 응원해",
    message: order.type === "group" ? "함께 준비했어. 새로운 시작에 즐거운 음악이 가득하길!" : order.message,
    generationProvider: "mock", status: "generated",
    // 실제 서비스에서는 안전한 임의 토큰과 수신자 인증, 만료 검증이 필요하다.
    acceptanceToken: `wishmate-demo-gift-${index + 1}`,
    acceptancePath: `/gifts/accept/wishmate-demo-gift-${index + 1}`,
    acceptedAt: order.status === "awaiting_address" ? null : now,
  }));
  const notifications = [
    notificationDocument(`GIFT_RECEIVED:${id(92).toHexString()}`, {
      userId: id(1).toHexString(), type: "GIFT_RECEIVED", title: "선물이 도착했어요!",
      message: "세라믹 머그 2종 세트 선물이 도착했습니다.", link: `/orders/${id(92).toHexString()}`, read: false,
    }),
    notificationDocument(`GIFT_ADDRESS_REQUIRED:${id(92).toHexString()}`, {
      userId: id(1).toHexString(), type: "GIFT_ADDRESS_REQUIRED", title: "배송지를 입력해주세요.",
      message: "세라믹 머그 2종 세트 선물을 받으려면 배송지를 입력해 주세요.",
      link: "/gifts/accept/wishmate-demo-gift-2", read: false,
    }),
    notificationDocument(`GROUP_GIFT_COMPLETED:${id(72).toHexString()}`, {
      userId: id(1).toHexString(), type: "GROUP_GIFT_COMPLETED", title: "공동선물이 완성됐어요!",
      message: "민지의 새 출발을 응원해의 목표 금액이 모두 모였습니다.",
      link: `/orders/${id(93).toHexString()}`, read: true, readAt: now,
    }),
    notificationDocument(`GROUP_GIFT_CONTRIBUTION:${id(84).toHexString()}`, {
      userId: id(2).toHexString(), type: "GROUP_GIFT_CONTRIBUTION",
      title: "도윤님이 공동선물에 참여했어요.", message: "민지의 새 출발을 응원해에 새로운 마음이 모였습니다.",
      link: `/group-gifts/${id(72).toHexString()}`, read: false,
    }),
  ];
  return { user, account, categories, products, addresses, wishlists, wishlistItems, groupGifts, contributions, orders, giftCards, notifications };
}

function validate(data) {
  const exists = (collection, value) => data[collection].some(
    (entry) => entry._id.toHexString() === String(value),
  );
  const references = {
    account: { userId: "user" }, products: { sellerId: "user" },
    addresses: { userId: "user" }, wishlists: { userId: "user" },
    wishlistItems: { wishlistId: "wishlists", productId: "products" },
    groupGifts: { organizerId: "user", recipientId: "user", productId: "products", wishlistId: "wishlists", orderId: "orders" },
    contributions: { groupGiftId: "groupGifts", userId: "user" },
    orders: { senderId: "user", recipientId: "user", sellerId: "user", productId: "products", groupGiftId: "groupGifts" },
    giftCards: { orderId: "orders", recipientId: "user" },
    notifications: { userId: "user" },
  };
  for (const [collection, fields] of Object.entries(references)) {
    for (const entry of data[collection]) {
      for (const [field, target] of Object.entries(fields)) {
        assert(entry[field] === null || exists(target, entry[field]), `${collection}.${field} 참조 오류`);
      }
    }
  }
  for (const group of data.groupGifts) {
    const total = data.contributions.filter((entry) => entry.groupGiftId === group._id.toHexString() && entry.paymentStatus === "paid")
      .reduce((sum, entry) => sum + entry.amount, 0);
    assert.equal(total, group.currentAmount);
    assert(total <= group.targetAmount);
    assert.equal(group.status === "completed", total === group.targetAmount);
  }
  for (const order of data.orders) assert.equal(order.totalAmount, order.productSnapshot.price * order.quantity);
}

function parseSeedOptions(args) {
  const supportedOptions = new Set(["--dry-run", "--reset"]);
  assert(args.every((arg) => supportedOptions.has(arg)), "지원 옵션: --dry-run, --reset");
  const dryRun = args.includes("--dry-run");
  const reset = args.includes("--reset");
  assert(!(dryRun && reset), "--dry-run과 --reset은 함께 사용할 수 없습니다.");
  return { dryRun, reset };
}

async function deleteExistingSeedData(db, data, log = console.log) {
  const seedCollections = [...Object.keys(data)].reverse();
  const collectionNames = [...RESET_RELATED_COLLECTIONS, ...seedCollections];

  log("[1/2] 기존 seed 관련 데이터 삭제 시작");
  for (const name of collectionNames) {
    const result = await db.collection(name).deleteMany({});
    log(`삭제 ${name}: ${result.deletedCount}개`);
  }
  log("[1/2] 기존 seed 관련 데이터 삭제 완료");
}

async function verifyResetCredentials(db, users) {
  const { verifyPassword } = await import("better-auth/crypto");

  for (const member of users) {
    const credentialAccount = await db.collection("account").findOne({
      userId: member._id,
      accountId: member._id.toHexString(),
      providerId: "credential",
    });
    assert(credentialAccount?.password, `${member.email} 인증 계정을 찾을 수 없습니다.`);
    assert.notEqual(credentialAccount.password, TEST_LOGIN_PASSWORD, `${member.email} 비밀번호가 평문으로 저장됐습니다.`);
    assert(
      await verifyPassword({ hash: credentialAccount.password, password: TEST_LOGIN_PASSWORD }),
      `${member.email} 비밀번호 hash 검증에 실패했습니다.`,
    );
  }

  console.log(`Better Auth 테스트 계정 ${users.length}개의 비밀번호 hash 검증 완료`);
}

async function main() {
  const { dryRun, reset } = parseSeedOptions(process.argv.slice(2));
  if (!dryRun) {
    assert(process.env.NODE_ENV !== "production", "개발용 시드는 production에서 실행할 수 없습니다.");
    assert(process.env.MONGODB_URI && process.env.MONGODB_DB, "MONGODB_URI와 MONGODB_DB를 설정해 주세요.");
  }
  const data = await createSeed();
  validate(data);
  if (dryRun) {
    console.table(Object.fromEntries(Object.entries(data).map(([name, entries]) => [name, entries.length])));
    console.log("시드 참조·공동선물 금액·주문 합계 검증 완료. DB에는 연결하지 않았습니다.");
    return;
  }
  const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  try {
    await client.connect();
    const db = client.db(process.env.MONGODB_DB);
    if (reset) {
      await deleteExistingSeedData(db, data);
      console.log("[2/2] 새로운 seed 데이터 추가 시작");
    } else {
      // 같은 이메일의 일반 가입 계정이 있으면 쓰기 전에 중단한다.
      for (const member of data.user) {
        const conflict = await db.collection("user").findOne({ email: member.email, _id: { $ne: member._id } });
        assert(!conflict, `기존 계정과 이메일이 겹칩니다: ${member.email}`);
      }
    }

    for (const [name, entries] of Object.entries(data)) {
      if (reset) {
        const result = await db.collection(name).insertMany(entries);
        console.log(`${name}: ${result.insertedCount}개 추가`);
        continue;
      }

      const result = await db.collection(name).bulkWrite(entries.map(({ _id, ...fields }) => ({
        updateOne: { filter: { _id }, update: { $setOnInsert: fields }, upsert: true },
      })));
      console.log(`${name}: ${result.upsertedCount}개 추가, ${result.matchedCount}개 기존 문서 유지`);
    }
    const productImageResult = await db.collection("products").bulkWrite(
      data.products.map((product) => ({
        updateOne: {
          filter: { _id: product._id },
          update: { $set: { imageUrl: product.imageUrl, updatedAt: new Date() } },
        },
      })),
    );
    const orderImageResult = await db.collection("orders").bulkWrite(
      data.orders.map((order) => ({
        updateOne: {
          filter: { _id: order._id },
          update: { $set: { "productSnapshot.imageUrl": order.productSnapshot.imageUrl, updatedAt: new Date() } },
        },
      })),
    );
    console.log(`데모 이미지: 상품 ${productImageResult.matchedCount}개, 주문 ${orderImageResult.matchedCount}개 경로 확인`);
    if (reset) {
      await verifyResetCredentials(db, data.user);
      console.log("[2/2] 새로운 seed 데이터 추가 완료");
    }
    console.log(`WishMate 시드 생성 완료. 테스트 로그인: minji@example.com / ${TEST_LOGIN_PASSWORD}`);
  } finally {
    await client.close();
    console.log("MongoDB 연결 종료 완료.");
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`시드 생성 실패: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  deleteExistingSeedData,
  parseSeedOptions,
  RESET_RELATED_COLLECTIONS,
  TEST_LOGIN_PASSWORD,
};

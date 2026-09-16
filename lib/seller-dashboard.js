import { getDatabase } from "./mongodb.js";
import { foreignKeyFilter } from "./utils/mongo.js";

export async function getSellerDashboard(sellerId) {
  const db = await getDatabase();
  const sellerFilter = foreignKeyFilter("sellerId", sellerId);
  const products = db.collection("products");
  const orders = db.collection("orders");

  // 모든 집계와 목록 조회에 로그인한 판매자의 조건을 먼저 적용합니다.
  const [productCounts, orderCounts, recentOrders, soldOutProducts] = await Promise.all([
    products.aggregate([
      { $match: sellerFilter },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]).toArray(),
    orders.aggregate([
      { $match: sellerFilter },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]).toArray(),
    orders.find(sellerFilter, {
      projection: { _id: 1, "productSnapshot.name": 1, totalAmount: 1, status: 1, createdAt: 1 },
    }).sort({ createdAt: -1, _id: -1 }).limit(5).toArray(),
    products.find({ ...sellerFilter, status: "sold_out" }, {
      projection: { _id: 1, name: 1, quantity: 1, imageUrl: 1, images: 1 },
    }).sort({ updatedAt: -1, _id: -1 }).limit(5).toArray(),
  ]);

  const counts = {
    activeProducts: productCounts.find((item) => item._id === "active")?.count ?? 0,
    soldOutProducts: productCounts.find((item) => item._id === "sold_out")?.count ?? 0,
    awaitingAddressOrders: orderCounts.find((item) => item._id === "awaiting_address")?.count ?? 0,
    preparingOrders: orderCounts.find((item) => item._id === "preparing")?.count ?? 0,
    shippedOrders: orderCounts.find((item) => item._id === "shipped")?.count ?? 0,
  };

  return {
    counts,
    totalProducts: productCounts.reduce((total, item) => total + item.count, 0),
    recentOrders,
    soldOutProducts,
  };
}

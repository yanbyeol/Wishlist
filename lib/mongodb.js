import { MongoClient } from "mongodb";

let productionClient;
let productionClientPromise;

function createClient() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error(
      "MONGODB_URI가 없습니다. .env.local에 MongoDB 연결 문자열을 설정해 주세요.",
    );
  }

  return new MongoClient(uri);
}

export function getMongoClient() {
  if (process.env.NODE_ENV === "development") {
    if (!global._wishMateMongoClient) {
      global._wishMateMongoClient = createClient();
    }

    return global._wishMateMongoClient;
  }

  if (!productionClient) {
    productionClient = createClient();
  }

  return productionClient;
}

export function getMongoClientPromise() {
  if (process.env.NODE_ENV === "development") {
    if (!global._wishMateMongoClientPromise) {
      global._wishMateMongoClientPromise = getMongoClient().connect();
    }

    return global._wishMateMongoClientPromise;
  }

  if (!productionClientPromise) {
    productionClientPromise = getMongoClient().connect();
  }

  return productionClientPromise;
}

export async function getDatabase() {
  const databaseName = process.env.MONGODB_DB;

  if (!databaseName) {
    throw new Error(
      "MONGODB_DB가 없습니다. .env.local에 데이터베이스 이름을 설정해 주세요.",
    );
  }

  const client = await getMongoClientPromise();
  return client.db(databaseName);
}

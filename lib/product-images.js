import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { GridFSBucket, ObjectId } from "mongodb";
import { getDatabase } from "@/lib/mongodb";

const bucketName = "productImages";
const supportedContentTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

async function getProductImageBucket() {
  const database = await getDatabase();
  return new GridFSBucket(database, { bucketName });
}

function parseProductImageId(fileId) {
  if (!/^[a-f\d]{24}$/i.test(fileId)) {
    return null;
  }

  return new ObjectId(fileId);
}

export async function uploadProductImage({ file, imageType, sellerId }) {
  const bucket = await getProductImageBucket();
  const filename = `${randomUUID()}.${imageType.extension}`;
  const uploadStream = bucket.openUploadStream(filename, {
    metadata: {
      contentType: imageType.contentType,
      sellerId: String(sellerId),
    },
  });

  try {
    await pipeline(Readable.fromWeb(file.stream()), uploadStream);
  } catch (error) {
    try {
      await uploadStream.abort();
    } catch {
      // 업로드 스트림이 이미 종료된 경우에는 원래 오류를 그대로 전달한다.
    }

    throw error;
  }

  const fileId = uploadStream.id.toHexString();
  return { fileId, imageUrl: `/product-images/${fileId}` };
}

export async function deleteProductImage(fileId) {
  const objectId = parseProductImageId(fileId);

  if (!objectId) {
    return;
  }

  const bucket = await getProductImageBucket();
  await bucket.delete(objectId);
}

export async function openProductImage(fileId) {
  const objectId = parseProductImageId(fileId);

  if (!objectId) {
    return null;
  }

  const database = await getDatabase();
  const file = await database
    .collection(`${bucketName}.files`)
    .findOne({ _id: objectId });

  if (!file) {
    return null;
  }

  const bucket = new GridFSBucket(database, { bucketName });
  const contentType = file.metadata?.contentType;

  return {
    contentType: supportedContentTypes.has(contentType)
      ? contentType
      : "application/octet-stream",
    filename: file.filename,
    length: file.length,
    stream: bucket.openDownloadStream(objectId),
  };
}

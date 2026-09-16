import { Readable } from "node:stream";
import { openProductImage } from "@/lib/product-images";

export const runtime = "nodejs";

export async function GET(request, { params }) {
  const { id } = await params;

  try {
    const image = await openProductImage(id);

    if (!image) {
      return new Response(null, { status: 404 });
    }

    const etag = `"${id}"`;
    const safeFilename = image.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const headers = {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Disposition": `inline; filename="${safeFilename}"`,
      "Content-Length": String(image.length),
      "Content-Type": image.contentType,
      ETag: etag,
      "X-Content-Type-Options": "nosniff",
    };

    if (request.headers.get("if-none-match") === etag) {
      image.stream.destroy();
      return new Response(null, { status: 304, headers });
    }

    return new Response(Readable.toWeb(image.stream), { headers });
  } catch (error) {
    console.error("상품 이미지를 불러오지 못했습니다.", error);
    return new Response(null, { status: 500 });
  }
}

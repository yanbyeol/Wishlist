"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PRODUCT_CATEGORIES } from "@/lib/constants";
import { getSellerProductsReturnPath } from "@/lib/seller-product-filter";
import {
  createProduct,
  deleteProductOwned,
  updateProductOwned,
} from "@/lib/products";
import {
  deleteProductImage,
  uploadProductImage,
} from "@/lib/product-images";
import { requireUser } from "@/lib/session";
import {
  hasSelectedProductImage,
  validateProductImageFile,
} from "@/app/products/product-image-validation";
import {
  isValidImageUrl,
  parseNonNegativeInteger,
  parsePositiveInteger,
} from "@/lib/utils/validation";

function readProductFields(formData, allowZeroQuantity) {
  const fields = {
    name: String(formData.get("name") ?? "").trim(),
    price: parsePositiveInteger(formData.get("price")),
    category: String(formData.get("category") ?? ""),
    quantity: allowZeroQuantity
      ? parseNonNegativeInteger(formData.get("quantity"))
      : parsePositiveInteger(formData.get("quantity")),
    description: String(formData.get("description") ?? "").trim(),
  };

  if (fields.name.length < 2) {
    return { error: "상품명은 2자 이상 입력해 주세요." };
  }

  if (!fields.price) {
    return { error: "가격은 1원 이상의 정수로 입력해 주세요." };
  }

  if (!PRODUCT_CATEGORIES.includes(fields.category)) {
    return { error: "상품 카테고리를 선택해 주세요." };
  }

  if (fields.quantity === null) {
    return { error: allowZeroQuantity ? "수량은 0 이상의 정수로 입력해 주세요." : "수량은 1개 이상 입력해 주세요." };
  }

  if (fields.description.length < 10) {
    return { error: "상품 설명은 10자 이상 입력해 주세요." };
  }

  return { fields };
}

function readDevelopmentImageUrl(formData) {
  const imageUrl = String(formData.get("imageUrl") ?? "").trim();

  if (!isValidImageUrl(imageUrl)) {
    return { error: "올바른 개발용 이미지 URL을 입력해 주세요." };
  }

  return { imageUrl };
}

export async function createProductAction(previousState, formData) {
  const user = await requireUser("/products/new");
  const parsed = readProductFields(formData, false);

  if (parsed.error) {
    return { message: parsed.error };
  }

  const imageFile = formData.get("imageFile");
  let uploadedImage = null;
  let imageUrl = "";

  if (hasSelectedProductImage(imageFile)) {
    const imageValidation = await validateProductImageFile(imageFile);

    if (imageValidation.error) {
      return { message: imageValidation.error };
    }

    try {
      uploadedImage = await uploadProductImage({
        file: imageFile,
        imageType: imageValidation.imageType,
        sellerId: user.id,
      });
      imageUrl = uploadedImage.imageUrl;
    } catch (error) {
      console.error("상품 이미지 업로드에 실패했습니다.", error);
      return { message: "상품 이미지를 업로드하지 못했습니다. 잠시 후 다시 시도해 주세요." };
    }
  } else if (process.env.NODE_ENV === "development") {
    const developmentImage = readDevelopmentImageUrl(formData);

    if (developmentImage.error) {
      return { message: "상품 이미지 파일을 선택하거나 개발용 이미지 URL을 입력해 주세요." };
    }

    imageUrl = developmentImage.imageUrl;
  } else {
    return { message: "상품 이미지 파일을 선택해 주세요." };
  }

  let product;

  try {
    product = await createProduct({
      ...parsed.fields,
      imageUrl,
      sellerId: user.id,
    });
  } catch (error) {
    if (uploadedImage) {
      try {
        await deleteProductImage(uploadedImage.fileId);
      } catch (cleanupError) {
        console.error("등록에 실패한 상품 이미지를 정리하지 못했습니다.", cleanupError);
      }
    }

    console.error("상품 등록에 실패했습니다.", error);
    return { message: "상품을 등록하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }

  revalidatePath("/");
  revalidatePath("/seller/products");
  redirect(`/products/${product.id}`);
}

export async function updateProductAction(productId, previousState, formData) {
  const user = await requireUser(`/products/${productId}/edit`);
  const parsed = readProductFields(formData, true);

  if (parsed.error) {
    return { message: parsed.error };
  }

  if (process.env.NODE_ENV === "development") {
    const developmentImage = readDevelopmentImageUrl(formData);

    if (developmentImage.error) {
      return { message: developmentImage.error };
    }

    parsed.fields.imageUrl = developmentImage.imageUrl;
  }

  const product = await updateProductOwned(productId, user.id, parsed.fields);

  if (!product) {
    return { message: "수정 권한이 없거나 상품을 찾을 수 없습니다." };
  }

  revalidatePath("/");
  revalidatePath(`/products/${productId}`);
  revalidatePath("/seller/products");
  redirect(`/products/${productId}`);
}

export async function deleteProductAction(formData) {
  const productId = String(formData.get("productId") ?? "");
  const filterStatuses = formData.getAll("filterStatus");
  const user = await requireUser("/seller/products");
  const result = await deleteProductOwned(productId, user.id);

  if (!result.deleted) {
    redirect(getSellerProductsReturnPath(filterStatuses, "not-found"));
  }

  revalidatePath("/");
  revalidatePath("/wishlist");
  revalidatePath("/seller/products");
  redirect(getSellerProductsReturnPath(filterStatuses, result.archived ? "archived" : "deleted"));
}

import { getDatabase } from "@/lib/mongodb";
import {
  documentIdFilter,
  foreignKeyFilter,
  normalizeId,
} from "@/lib/utils/mongo";

function presentAddress(address) {
  if (!address) {
    return null;
  }

  return {
    id: normalizeId(address._id),
    userId: normalizeId(address.userId),
    label: address.label,
    recipientName: address.recipientName,
    phone: address.phone,
    postalCode: address.postalCode,
    address1: address.address1,
    address2: address.address2 ?? "",
    isDefault: Boolean(address.isDefault),
  };
}

export async function listAddresses(userId) {
  const db = await getDatabase();
  const addresses = await db
    .collection("addresses")
    .find(foreignKeyFilter("userId", userId))
    .sort({ isDefault: -1, createdAt: -1 })
    .toArray();
  return addresses.map(presentAddress);
}

export async function getDefaultAddress(userId) {
  const db = await getDatabase();
  const address = await db.collection("addresses").findOne(
    foreignKeyFilter("userId", userId),
    { sort: { isDefault: -1, createdAt: -1 } },
  );
  return presentAddress(address);
}

export async function createAddress(userId, fields) {
  const db = await getDatabase();
  const existingCount = await db
    .collection("addresses")
    .countDocuments(foreignKeyFilter("userId", userId));
  const isDefault = fields.isDefault || existingCount === 0;

  if (isDefault) {
    await db
      .collection("addresses")
      .updateMany(foreignKeyFilter("userId", userId), {
        $set: { isDefault: false, updatedAt: new Date() },
      });
  }

  const now = new Date();
  const address = {
    userId: normalizeId(userId),
    label: fields.label,
    recipientName: fields.recipientName,
    phone: fields.phone,
    postalCode: fields.postalCode,
    address1: fields.address1,
    address2: fields.address2,
    isDefault,
    createdAt: now,
    updatedAt: now,
  };
  const result = await db.collection("addresses").insertOne(address);
  return presentAddress({ ...address, _id: result.insertedId });
}

export async function updateAddressOwned(addressId, userId, fields) {
  const db = await getDatabase();
  const filter = {
    ...documentIdFilter(addressId),
    ...foreignKeyFilter("userId", userId),
  };
  const address = await db.collection("addresses").findOne(filter);

  if (!address) {
    return false;
  }

  if (fields.isDefault && !address.isDefault) {
    await db.collection("addresses").updateMany(
      foreignKeyFilter("userId", userId),
      { $set: { isDefault: false, updatedAt: new Date() } },
    );
  }

  const result = await db.collection("addresses").updateOne(filter, {
    $set: {
      label: fields.label,
      recipientName: fields.recipientName,
      phone: fields.phone,
      postalCode: fields.postalCode,
      address1: fields.address1,
      address2: fields.address2,
      isDefault: Boolean(fields.isDefault || address.isDefault),
      updatedAt: new Date(),
    },
  });
  return result.matchedCount === 1;
}

export async function deleteAddressOwned(addressId, userId) {
  const db = await getDatabase();
  const filter = {
    ...documentIdFilter(addressId),
    ...foreignKeyFilter("userId", userId),
  };
  const address = await db.collection("addresses").findOne(filter);

  if (!address) {
    return false;
  }

  await db.collection("addresses").deleteOne(filter);

  if (address.isDefault) {
    const nextAddress = await db
      .collection("addresses")
      .findOne(foreignKeyFilter("userId", userId), { sort: { createdAt: -1 } });

    if (nextAddress) {
      await db.collection("addresses").updateOne(
        { _id: nextAddress._id },
        { $set: { isDefault: true, updatedAt: new Date() } },
      );
    }
  }

  return true;
}

export async function setDefaultAddressOwned(addressId, userId) {
  const db = await getDatabase();
  const filter = {
    ...documentIdFilter(addressId),
    ...foreignKeyFilter("userId", userId),
  };
  const address = await db.collection("addresses").findOne(filter);

  if (!address) {
    return false;
  }

  await db.collection("addresses").updateMany(
    foreignKeyFilter("userId", userId),
    { $set: { isDefault: false, updatedAt: new Date() } },
  );
  await db.collection("addresses").updateOne(
    { _id: address._id },
    { $set: { isDefault: true, updatedAt: new Date() } },
  );
  return true;
}

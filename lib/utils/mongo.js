import { ObjectId } from "mongodb";

export function normalizeId(value) {
  if (!value) {
    return "";
  }

  if (value instanceof ObjectId) {
    return value.toHexString();
  }

  return String(value);
}

export function toObjectId(value) {
  const id = normalizeId(value);
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

export function documentIdFilter(value) {
  const objectId = toObjectId(value);

  if (!objectId) {
    return { _id: "__invalid_id__" };
  }

  return { _id: objectId };
}

export function foreignKeyFilter(field, value) {
  const id = normalizeId(value);
  const objectId = toObjectId(id);
  const candidates = objectId ? [id, objectId] : [id];
  return { [field]: { $in: candidates } };
}

export function foreignKeyCandidates(values) {
  const candidates = [];

  for (const value of values) {
    const id = normalizeId(value);
    const objectId = toObjectId(id);
    candidates.push(id);

    if (objectId) {
      candidates.push(objectId);
    }
  }

  return candidates;
}

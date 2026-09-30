// 入力値の検査
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function requireUuid(value: unknown, name = "id"): string {
  if (typeof value !== "string" || !UUID.test(value)) {
    throw createError({ statusCode: 400, statusMessage: `invalid_${name}` });
  }
  return value.toLowerCase();
}

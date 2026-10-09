// 先生の管理（運営画面 /ops/experts）で共通の入力検査。未決事項 2.19
import { serviceDb } from "./db";
import type { H3Event } from "h3";
import { requireUuid } from "../utils/validate";

export type ExpertProfileInput = {
  displayName: string;
  qualification: string;
  affiliation: string | null;
  bio: string | null;
};

function optionalText(value: unknown, name: string, max: number): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.trim().length > max) throw createError({ statusCode: 400, statusMessage: `invalid_${name}` });
  return value.trim() || null;
}

function requiredText(value: unknown, name: string, max: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length === 0 || text.length > max) throw createError({ statusCode: 400, statusMessage: `${name}_required` });
  return text;
}

export function parseProfile(body: Record<string, unknown> | null | undefined): ExpertProfileInput {
  return {
    displayName: requiredText(body?.displayName, "display_name", 50),
    qualification: requiredText(body?.qualification, "qualification", 50),
    affiliation: optionalText(body?.affiliation, "affiliation", 100),
    bio: optionalText(body?.bio, "bio", 1000),
  };
}

// 担当ジャンルの指定。1つ以上・実在するジャンルのみ・重複なし
export async function requireGenreIds(event: H3Event, value: unknown): Promise<string[]> {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) throw createError({ statusCode: 400, statusMessage: "genres_required" });
  const ids = [...new Set(value.map((v) => requireUuid(v, "genre")))];
  const { data, error } = await serviceDb(event).from("genres").select("genre_id").in("genre_id", ids);
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  if ((data ?? []).length !== ids.length) throw createError({ statusCode: 400, statusMessage: "invalid_genre" });
  return ids;
}

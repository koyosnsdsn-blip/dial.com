// 緊急時の案内ページに表示する公的窓口の一覧（要件 3.5）。ログインしていなくても取得できる。
// 相談員チームが管理画面で維持管理する一覧（public_contacts）のうち、表示するものだけを返す。
// 取得に失敗しても、案内ページ自体（110・119）は表示できるよう、空の一覧を返す（障害時も案内は出す：要件 10.7）
export default defineEventHandler(async (event) => {
  try {
    const { data, error } = await serviceDb(event)
      .from("public_contacts")
      .select("name, phone, hours, note, url, sort_order")
      .eq("active", true)
      .order("sort_order")
      .order("name");
    if (error) throw error;
    setHeader(event, "Cache-Control", "public, max-age=60");
    return (data ?? []).map((c: any) => ({
      name: c.name as string,
      phone: c.phone as string | null,
      hours: c.hours as string | null,
      note: c.note as string | null,
      url: c.url as string | null,
    }));
  } catch {
    return [];
  }
});

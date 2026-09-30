// 相談開始前に表示するアンケート（要件 3.11）
// - 主訴は毎回すべて聴取する。属性は、まだ回答のない設問だけ聴取する（要件 3.11.6）
// - 相談開始前の確認として、往復の回数と返信の目安を返す（要件 3.3.1：開始前の画面には表示する）
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event);
  const m = await membership(event, account);
  if (!m.canConsult) throw createError({ statusCode: 403, statusMessage: "not_eligible" });

  const [questions, attrs] = await Promise.all([activeQuestions(event, account), accountAttributes(event, account)]);
  const answered = new Set(attrs.map((a) => a.questionId));
  return {
    contractType: m.contractType,
    rallyMax: m.rallyMax,
    slaHours: m.slaHours,
    questions: questions.filter((q) => q.kind === "chief" || !answered.has(q.questionId)),
  };
});

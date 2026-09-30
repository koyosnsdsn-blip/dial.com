// 属性の現在の回答（マイページ。要件 3.11.9）
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event);
  const [questions, attrs] = await Promise.all([activeQuestions(event, account), accountAttributes(event, account)]);
  const byQuestion = new Map(attrs.map((a) => [a.questionId, a]));
  return {
    // 一度も相談を開始していない場合は回答がないため、修正の対象もない
    items: questions
      .filter((q) => q.kind === "attr" && byQuestion.has(q.questionId))
      .map((q) => ({
        questionId: q.questionId,
        text: q.text,
        options: q.options,
        currentLabel: byQuestion.get(q.questionId)!.label,
        updatedAt: byQuestion.get(q.questionId)!.updatedAt,
      })),
  };
});

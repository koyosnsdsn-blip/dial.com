// ログイン中の先生の情報（画面の表示と遷移の判断用）。判定の正本は requireExpert()
import { requireExpert } from "../../../ops/expert";
export default defineEventHandler(async (event) => {
  return await requireExpert(event);
});

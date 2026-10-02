// ログイン中の相談員・運営管理者の情報を返す。
// 返すのは本人の氏名・ロールのみ（counselors.name は利用者向け経路に載せない：要件 3.6.1。運営画面内の表示に限る）
import { requireStaff } from "../../ops/auth";
export default defineEventHandler(async (event) => {
  return await requireStaff(event);
});

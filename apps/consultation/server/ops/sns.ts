// 外部SNS（LINE など）連携の受け皿（技術基盤設計書 8章・要件 3.1）。実際の接続は行わない。
// 連携の要否そのものが未決（未決事項 No.5）。決まるまで、相談は自社サイト内のメッセージボックスだけで受ける。
// 連携する場合に必要になる入口を、型としてだけ置いておく
export type ExternalInbound = { channel: "line"; externalUserId: string; text: string; receivedAt: string };
export type ExternalOutbound = { channel: "line"; externalUserId: string; text: string };

export interface ExternalChannel {
  // 外部から届いたメッセージを、案件のメッセージとして取り込む
  receive(message: ExternalInbound): Promise<void>;
  // 相談員の返信を、外部へ届ける。本文を外部の事業者に預けることになるため、利用者への説明と同意が前提
  send(message: ExternalOutbound): Promise<void>;
}

export function externalChannel(): ExternalChannel | null {
  return null;
}

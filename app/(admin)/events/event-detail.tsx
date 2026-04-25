'use client';

// イベント詳細モーダル
// テーブル行クリックで Dialog を開いて、入力コンテキスト / プロンプト全文 / 画像 / AI 編集履歴を表示。
// 画像 thumbnail は既にサーバー側で base64 dataURL に変換済み(Buffer はクライアントに渡せない)。

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

export type EventDetailImage = {
  id: number;
  imageIndex: number;
  dataUrl: string | null;
  downloaded: boolean;
  aiEdited: boolean;
};

export type EventDetailAiEdit = {
  id: number;
  kind: string;
  instruction: string;
  createdAt: string; // ISO
};

export type EventDetailPayload = {
  id: number;
  abSystemUserId: string;
  abSystemUserName: string | null;
  endpoint: string;
  model: string | null;
  createdAt: string; // ISO
  genre: string | null;
  subGenre: string | null;
  gender: string | null;
  ageGroup: string | null;
  platform: string | null;
  appealType: string | null;
  appealText: string | null;
  additionalNote: string | null;
  styleAxesJson: string | null;
  urlAnalysisSummary: string | null;
  promptFull: string | null;
  promptHash: string | null;
  imageCount: number;
  downloaded: boolean;
  horizontallyExpanded: boolean;
  aiEdited: boolean;
  regeneratedCount: number;
  hitScore: number | null;
  images: EventDetailImage[];
  aiEdits: EventDetailAiEdit[];

  // ① 信号粒度・評価
  decisionTimeMs: number | null;
  regenerationReason: string | null;
  rating: number | null;
  ratingComment: string | null;
  tagsJson: string | null;

  // ② 文脈入力
  campaignGoal: string | null;
  targetInterestsJson: string | null;
  targetRegion: string | null;
  targetIncomeRange: string | null;
  budgetRange: string | null;
  targetCpa: number | null;
  landingPageUrl: string | null;
  cvPointType: string | null;

  // ⑤ 暗黙シグナル
  sessionDurationMs: number | null;
  totalHoverMs: number | null;
  zoomCount: number | null;
  tabSwitchCount: number | null;
  comparisonViewMs: number | null;
  rightClickSaveCount: number | null;

  // ⑥ ネガティブ学習
  discardedAfterEdit: boolean;
  regenerationDiffJson: string | null;
};

// ============================================================
// クリック可能な行(Server Component 側から children に <tr> の内容を貰う)
// ============================================================
export function EventRow({
  event,
  children,
}: {
  event: EventDetailPayload;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr
        onClick={() => setOpen(true)}
        className="border-b hover:bg-muted/50 cursor-pointer transition-colors"
      >
        {children}
      </tr>
      <EventDetailDialog event={event} open={open} onOpenChange={setOpen} />
    </>
  );
}

// ============================================================
// 詳細 Dialog
// ============================================================
function EventDetailDialog({
  event,
  open,
  onOpenChange,
}: {
  event: EventDetailPayload;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [promptOpen, setPromptOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            生成画像 #{event.id}
            <Badge variant="secondary" className="ml-2">
              {endpointLabel(event.endpoint)}
            </Badge>
            {event.model && (
              <Badge variant="outline" className="ml-1 font-mono">
                {event.model}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {formatDateTime(event.createdAt)} / user:{' '}
            {event.abSystemUserName ? (
              <>
                <span>{event.abSystemUserName}</span>{' '}
                <span className="font-mono text-xs text-muted-foreground">
                  ({event.abSystemUserId})
                </span>
              </>
            ) : (
              <span className="font-mono">{event.abSystemUserId}</span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* シグナル */}
          <Section title="行動シグナル">
            <div className="flex flex-wrap gap-2">
              <SignalBadge on={event.downloaded} label="DL" />
              <SignalBadge on={event.horizontallyExpanded} label="横展開" />
              <SignalBadge on={event.aiEdited} label="AI編集" />
              <Badge variant="outline">画像 {event.imageCount}</Badge>
              <Badge variant="outline">再生成 {event.regeneratedCount}</Badge>
              {event.hitScore !== null && (
                <Badge variant="default">
                  刺さり度 {event.hitScore.toFixed(2)}
                </Badge>
              )}
            </div>
          </Section>

          {/* 入力コンテキスト */}
          <Section title="入力コンテキスト">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              <Field k="ジャンル" v={event.genre} />
              <Field k="サブジャンル" v={event.subGenre} />
              <Field k="性別" v={event.gender} />
              <Field k="年齢層" v={event.ageGroup} />
              <Field k="プラットフォーム" v={event.platform} />
              <Field k="訴求タイプ" v={event.appealType} />
            </dl>
            {event.appealText && (
              <div className="mt-3 space-y-1">
                <div className="text-xs text-muted-foreground">訴求文</div>
                <div className="text-sm whitespace-pre-wrap bg-muted/50 rounded-md p-2">
                  {event.appealText}
                </div>
              </div>
            )}
            {event.additionalNote && (
              <div className="mt-2 space-y-1">
                <div className="text-xs text-muted-foreground">追加メモ</div>
                <div className="text-sm whitespace-pre-wrap bg-muted/50 rounded-md p-2">
                  {event.additionalNote}
                </div>
              </div>
            )}
            {event.styleAxesJson && (
              <details className="mt-2">
                <summary className="text-xs text-muted-foreground cursor-pointer">
                  スタイル軸 (JSON)
                </summary>
                <pre className="mt-1 text-xs whitespace-pre-wrap bg-muted/50 rounded-md p-2 font-mono overflow-x-auto">
                  {tryFormatJson(event.styleAxesJson)}
                </pre>
              </details>
            )}
            {event.urlAnalysisSummary && (
              <details className="mt-2">
                <summary className="text-xs text-muted-foreground cursor-pointer">
                  URL 解析サマリ
                </summary>
                <div className="mt-1 text-sm whitespace-pre-wrap bg-muted/50 rounded-md p-2">
                  {event.urlAnalysisSummary}
                </div>
              </details>
            )}
          </Section>

          {/* ② 文脈入力 */}
          {hasContextInput(event) && (
            <Section title="広告運用コンテキスト">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                <Field k="キャンペーン目的" v={labelCampaignGoal(event.campaignGoal)} />
                <Field k="CV ポイント" v={labelCvPointType(event.cvPointType)} />
                <Field k="居住地" v={event.targetRegion} />
                <Field k="年収帯" v={event.targetIncomeRange} />
                <Field k="予算帯" v={event.budgetRange} />
                <Field k="目標 CPA" v={event.targetCpa != null ? `¥${event.targetCpa.toLocaleString()}` : null} />
              </dl>
              {event.landingPageUrl && (
                <div className="mt-2 text-sm">
                  <span className="text-xs text-muted-foreground">LP URL: </span>
                  <a
                    href={event.landingPageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline break-all"
                  >
                    {event.landingPageUrl}
                  </a>
                </div>
              )}
              {event.targetInterestsJson && (
                <div className="mt-2">
                  <div className="text-xs text-muted-foreground mb-1">興味関心</div>
                  <div className="flex flex-wrap gap-1">
                    {parseArray(event.targetInterestsJson).map((t, i) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        {t}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </Section>
          )}

          {/* ① ユーザー評価 */}
          {(event.rating != null || event.ratingComment || event.tagsJson) && (
            <Section title="ユーザー評価">
              {event.rating != null && (
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">
                    {'★'.repeat(event.rating)}
                    <span className="text-muted-foreground">
                      {'★'.repeat(5 - event.rating)}
                    </span>
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {event.rating} / 5
                  </span>
                </div>
              )}
              {event.tagsJson && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {parseArray(event.tagsJson).map((t, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      {t}
                    </Badge>
                  ))}
                </div>
              )}
              {event.ratingComment && (
                <div className="text-sm whitespace-pre-wrap bg-muted/50 rounded-md p-2">
                  {event.ratingComment}
                </div>
              )}
            </Section>
          )}

          {/* ⑤ 暗黙シグナル */}
          {hasImplicitSignals(event) && (
            <Section title="行動シグナル (暗黙)">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                <Field k="決定時間" v={event.decisionTimeMs != null ? `${(event.decisionTimeMs / 1000).toFixed(1)}秒` : null} />
                <Field k="セッション滞在" v={event.sessionDurationMs != null ? `${(event.sessionDurationMs / 1000).toFixed(1)}秒` : null} />
                <Field k="合計ホバー" v={event.totalHoverMs != null ? `${(event.totalHoverMs / 1000).toFixed(1)}秒` : null} />
                <Field k="拡大表示" v={event.zoomCount != null ? `${event.zoomCount}回` : null} />
                <Field k="タブ切替" v={event.tabSwitchCount != null ? `${event.tabSwitchCount}回` : null} />
                <Field k="比較画面滞在" v={event.comparisonViewMs != null ? `${(event.comparisonViewMs / 1000).toFixed(1)}秒` : null} />
                <Field k="右クリ保存" v={event.rightClickSaveCount != null ? `${event.rightClickSaveCount}回` : null} />
              </dl>
            </Section>
          )}

          {/* ⑥ ネガティブ学習 */}
          {(event.regenerationReason || event.discardedAfterEdit || event.regenerationDiffJson) && (
            <Section title="ネガティブシグナル">
              {event.regenerationReason && (
                <div className="text-sm mb-2">
                  <span className="text-xs text-muted-foreground">再生成理由: </span>
                  <Badge variant="outline">
                    {labelRegenerationReason(event.regenerationReason)}
                  </Badge>
                </div>
              )}
              {event.discardedAfterEdit && (
                <div className="text-sm mb-2">
                  <Badge variant="destructive" className="text-xs">
                    AI 編集後に破棄
                  </Badge>
                  <span className="ml-2 text-xs text-muted-foreground">
                    編集しても満足できなかった = 元の出力が弱かった
                  </span>
                </div>
              )}
              {event.regenerationDiffJson && (
                <details className="mt-2">
                  <summary className="text-xs text-muted-foreground cursor-pointer">
                    再生成差分
                  </summary>
                  <pre className="mt-1 text-xs whitespace-pre-wrap bg-muted/50 rounded-md p-2 font-mono overflow-x-auto">
                    {tryFormatJson(event.regenerationDiffJson)}
                  </pre>
                </details>
              )}
            </Section>
          )}

          {/* プロンプト全文(折りたたみ) */}
          <Section title="プロンプト(Gemini 送信)">
            {event.promptFull ? (
              <>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => setPromptOpen((v) => !v)}
                  >
                    {promptOpen ? '折りたたむ' : '全文を表示'}
                  </Button>
                  {event.promptHash && (
                    <span className="text-[10px] font-mono text-muted-foreground">
                      hash: {event.promptHash.slice(0, 12)}…
                    </span>
                  )}
                </div>
                {promptOpen && (
                  <pre className="mt-2 text-xs whitespace-pre-wrap bg-muted/50 rounded-md p-3 font-mono max-h-80 overflow-y-auto">
                    {event.promptFull}
                  </pre>
                )}
              </>
            ) : (
              <div className="text-sm text-muted-foreground">(未記録)</div>
            )}
          </Section>

          {/* 画像 */}
          <Section title={`生成画像 (${event.images.length})`}>
            {event.images.length === 0 ? (
              <div className="text-sm text-muted-foreground">(画像なし)</div>
            ) : (
              <div className="grid grid-cols-4 gap-3">
                {event.images.map((img) => (
                  <div
                    key={img.id}
                    className="space-y-1.5 rounded-md ring-1 ring-border overflow-hidden"
                  >
                    {img.dataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={img.dataUrl}
                        alt={`image ${img.imageIndex}`}
                        className="w-full aspect-square object-cover bg-muted"
                      />
                    ) : (
                      <div className="w-full aspect-square bg-muted flex items-center justify-center text-xs text-muted-foreground">
                        (no thumb)
                      </div>
                    )}
                    <div className="px-2 pb-1.5 flex items-center gap-1 flex-wrap">
                      <Badge variant="outline" className="font-mono">
                        #{img.imageIndex}
                      </Badge>
                      {img.downloaded && (
                        <Badge variant="default">DL</Badge>
                      )}
                      {img.aiEdited && (
                        <Badge variant="secondary">AI編集</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* AI編集履歴 */}
          <Section title={`AI編集履歴 (${event.aiEdits.length})`}>
            {event.aiEdits.length === 0 ? (
              <div className="text-sm text-muted-foreground">(編集なし)</div>
            ) : (
              <ul className="space-y-2">
                {event.aiEdits.map((edit) => (
                  <li
                    key={edit.id}
                    className="rounded-md ring-1 ring-border p-2 text-sm"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="secondary" className="font-mono">
                        {edit.kind}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">
                        {formatDateTime(edit.createdAt)}
                      </span>
                    </div>
                    <div className="whitespace-pre-wrap">
                      {edit.instruction}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// 補助コンポーネント
// ============================================================
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        {title}
      </h3>
      <Separator />
      <div className="pt-1">{children}</div>
    </section>
  );
}

function Field({ k, v }: { k: string; v: string | null | undefined }) {
  return (
    <>
      <dt className="text-xs text-muted-foreground">{k}</dt>
      <dd className="text-sm">{v || <span className="text-muted-foreground">—</span>}</dd>
    </>
  );
}

function SignalBadge({ on, label }: { on: boolean; label: string }) {
  return on ? (
    <Badge variant="default">{label}</Badge>
  ) : (
    <Badge variant="outline" className="opacity-50">
      {label}
    </Badge>
  );
}

// ======= 新フィールド用ラベル/ヘルパー =======
function labelCampaignGoal(v: string | null): string | null {
  if (!v) return null;
  const m: Record<string, string> = {
    cv: 'CV (購入/申込)',
    awareness: '認知拡大',
    lead: 'リード獲得',
    retargeting: 'リターゲティング',
  };
  return m[v] ?? v;
}

function labelCvPointType(v: string | null): string | null {
  if (!v) return null;
  const m: Record<string, string> = {
    purchase: '購入',
    signup: '会員登録',
    call: '電話',
    download: '資料 DL',
    other: 'その他',
  };
  return m[v] ?? v;
}

function labelRegenerationReason(v: string): string {
  const m: Record<string, string> = {
    color: '色味が違う',
    person: '人物が違う',
    background: '背景が違う',
    copy: 'コピーが弱い',
    layout: 'レイアウト',
    appeal: '訴求が合わない',
    quality: '品質全般',
    other: 'その他',
  };
  return m[v] ?? v;
}

function hasContextInput(event: EventDetailPayload): boolean {
  return !!(
    event.campaignGoal ||
    event.cvPointType ||
    event.targetRegion ||
    event.targetIncomeRange ||
    event.budgetRange ||
    event.targetCpa != null ||
    event.landingPageUrl ||
    event.targetInterestsJson
  );
}

function hasImplicitSignals(event: EventDetailPayload): boolean {
  return (
    event.decisionTimeMs != null ||
    event.sessionDurationMs != null ||
    event.totalHoverMs != null ||
    event.zoomCount != null ||
    event.tabSwitchCount != null ||
    event.comparisonViewMs != null ||
    event.rightClickSaveCount != null
  );
}

function parseArray(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

function endpointLabel(endpoint: string): string {
  const m: Record<string, string> = {
    'generate-images': '画像生成',
    'generate-similar-one': '横展開',
    'improve-images': '改善',
    'edit-region': 'AI編集',
  };
  return m[endpoint] ?? endpoint;
}

function formatDateTime(iso: string) {
  try {
    return new Intl.DateTimeFormat('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function tryFormatJson(s: string) {
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}

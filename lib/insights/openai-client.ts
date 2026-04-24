// OpenAI クライアントの薄い wrapper。
// - API キー未設定時の安全 fallback
// - タイムアウト設定(Vercel Hobby 60s 制限を踏まえて 50s デフォルト)
// - 呼び出し側でのエラーハンドリングを簡素化するため、例外は catch して null 返却する helper あり

const DEFAULT_TIMEOUT_MS = 50_000;

export function hasOpenAIKey(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

/**
 * OpenAI Chat Completion を呼ぶ薄い wrapper。
 * 失敗時は null を返す(呼び出し側でルールベース fallback へ)。
 */
export async function callChatCompletion(opts: {
  model: string;
  systemPrompt: string;
  userContent: Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } }
  >;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<{ text: string; model: string } | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({
    apiKey,
    timeout: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxRetries: 0,
  });

  try {
    const completion = await client.chat.completions.create({
      model: opts.model,
      temperature: opts.temperature ?? 0.4,
      max_tokens: opts.maxTokens,
      messages: [
        { role: 'system', content: opts.systemPrompt },
        { role: 'user', content: opts.userContent },
      ],
    });
    const text = completion.choices[0]?.message?.content?.trim();
    if (!text) return null;
    return { text, model: opts.model };
  } catch (e) {
    console.warn('[openai] callChatCompletion failed:', (e as Error).message);
    return null;
  }
}

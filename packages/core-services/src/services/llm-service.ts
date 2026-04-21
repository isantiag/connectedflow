/**
 * LLM Service — Claude/Gemini dual provider with automatic fallback.
 * Same pattern as AssureFlow for cross-platform consistency.
 */
export type LlmProvider = 'claude' | 'gemini';

interface LlmResponse { text: string; provider: LlmProvider; model: string; }

export class LlmService {
  private claudeKey: string;
  private geminiKey: string;

  constructor() {
    this.claudeKey = process.env.ANTHROPIC_API_KEY ?? '';
    this.geminiKey = process.env.GEMINI_API_KEY ?? '';
  }

  get availableProviders(): LlmProvider[] {
    const p: LlmProvider[] = [];
    if (this.claudeKey) p.push('claude');
    if (this.geminiKey) p.push('gemini');
    return p;
  }

  async chat(prompt: string, systemPrompt: string, provider?: LlmProvider): Promise<LlmResponse> {
    const p = provider ?? (this.claudeKey ? 'claude' : 'gemini');
    try {
      const res = p === 'claude' ? await this.callClaude(prompt, systemPrompt) : await this.callGemini(prompt, systemPrompt);
      if (res.text.includes('error') || res.text.includes('quota') || res.text.includes('not_found')) {
        const fb = p === 'claude' ? 'gemini' : 'claude';
        if ((fb === 'claude' && this.claudeKey) || (fb === 'gemini' && this.geminiKey))
          return fb === 'claude' ? this.callClaude(prompt, systemPrompt) : this.callGemini(prompt, systemPrompt);
      }
      return res;
    } catch {
      const fb = p === 'claude' ? 'gemini' : 'claude';
      if ((fb === 'claude' && this.claudeKey) || (fb === 'gemini' && this.geminiKey))
        return fb === 'claude' ? this.callClaude(prompt, systemPrompt) : this.callGemini(prompt, systemPrompt);
      return { text: 'Both LLM providers unavailable', provider: p, model: 'none' };
    }
  }

  private async callClaude(prompt: string, systemPrompt: string): Promise<LlmResponse> {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': this.claudeKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 4096, system: systemPrompt, messages: [{ role: 'user', content: prompt }] }),
    });
    const data = await res.json() as any;
    return { text: data.content?.[0]?.text ?? data.error?.message ?? 'No response', provider: 'claude', model: 'claude-sonnet-4-5' };
  }

  private async callGemini(prompt: string, systemPrompt: string): Promise<LlmResponse> {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${this.geminiKey}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system_instruction: { parts: [{ text: systemPrompt }] }, contents: [{ parts: [{ text: prompt }] }] }),
    });
    const data = await res.json() as any;
    return { text: data.candidates?.[0]?.content?.parts?.[0]?.text ?? data.error?.message ?? 'No response', provider: 'gemini', model: 'gemini-2.0-flash' };
  }
}

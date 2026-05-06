import type { LLMConfig } from '@/types/annotation';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | LLMContentPart[];
}

export interface LLMContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

export interface LLMResponse {
  content: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

export async function callLLM(
  config: LLMConfig,
  messages: LLMMessage[],
  options?: { jsonMode?: boolean; maxTokens?: number }
): Promise<LLMResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    max_tokens: options?.maxTokens || 4096,
  };

  if (options?.jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  const response = await fetch(`${config.apiUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`LLM API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  
  return {
    content: data.choices[0]?.message?.content || '',
    usage: data.usage,
  };
}

export async function segmentImage(
  config: LLMConfig,
  imageDataUrl: string,
  prompt: string
): Promise<{ segments: Array<{ label: string; description: string }> }> {
  const messages: LLMMessage[] = [
    {
      role: 'system',
      content: '你是一个图像分析助手。分析图片并返回分割建议，以JSON格式输出。',
    },
    {
      role: 'user',
      content: [
        { type: 'text', text: prompt || '请分析这张图片，识别主要区域/对象，返回分割建议。' },
        { type: 'image_url', image_url: { url: imageDataUrl } },
      ],
    },
  ];

  const response = await callLLM(config, messages, { jsonMode: true });
  
  try {
    return JSON.parse(response.content);
  } catch {
    return { segments: [] };
  }
}

export async function generateStructuredOutput(
  config: LLMConfig,
  annotationData: Record<string, unknown>,
  template: string,
  format: 'json' | 'custom'
): Promise<string> {
  const systemPrompt = format === 'json'
    ? '你是一个数据转换助手。根据标注数据和用户要求，输出JSON格式的结构化数据。'
    : '你是一个数据转换助手。根据标注数据和用户模板，输出格式化文本。';

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: `标注数据：\n${JSON.stringify(annotationData, null, 2)}\n\n${format === 'json' ? '要求：' : '模板：'}\n${template}`,
    },
  ];

  const response = await callLLM(config, messages, { jsonMode: format === 'json' });
  return response.content;
}

export async function testConnection(config: LLMConfig): Promise<boolean> {
  try {
    const response = await callLLM(config, [
      { role: 'user', content: 'Say "OK" if you can hear me.' },
    ], { maxTokens: 10 });
    return response.content.toLowerCase().includes('ok');
  } catch {
    return false;
  }
}

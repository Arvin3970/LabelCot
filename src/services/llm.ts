import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
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

const PROXY_URL = 'http://localhost:3001/api/chat/completions';

function getTargetUrl(config: LLMConfig): string {
  let baseURL = config.apiUrl.trim();
  
  if (baseURL.endsWith('/v1/') || baseURL.endsWith('/v1')) {
    // 已经包含 /v1
  } else if (baseURL.endsWith('/')) {
    baseURL = baseURL + 'v1';
  } else {
    baseURL = baseURL + '/v1';
  }
  
  return `${baseURL}/chat/completions`;
}

function formatMessages(messages: LLMMessage[]): ChatCompletionMessageParam[] {
  return messages.map(msg => {
    if (typeof msg.content === 'string') {
      return {
        role: msg.role,
        content: msg.content,
      } as ChatCompletionMessageParam;
    }
    
    return {
      role: msg.role,
      content: msg.content.map(part => {
        if (part.type === 'text') {
          return { type: 'text', text: part.text || '' };
        }
        return { type: 'image_url', image_url: part.image_url };
      }),
    } as ChatCompletionMessageParam;
  });
}

async function callViaProxy(config: LLMConfig, body: Record<string, unknown>): Promise<any> {
  const response = await fetch(PROXY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      targetUrl: getTargetUrl(config),
      apiKey: config.apiKey,
      ...body,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

export async function callLLM(
  config: LLMConfig,
  messages: LLMMessage[],
  options?: { jsonMode?: boolean; maxTokens?: number }
): Promise<LLMResponse> {
  const body: Record<string, unknown> = {
    model: config.model,
    messages: formatMessages(messages),
    max_tokens: options?.maxTokens || 4096,
  };

  if (options?.jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  const data = await callViaProxy(config, body);

  return {
    content: data.choices[0]?.message?.content || '',
    usage: data.usage ? {
      prompt_tokens: data.usage.prompt_tokens,
      completion_tokens: data.usage.completion_tokens,
    } : undefined,
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

export async function testConnection(config: LLMConfig): Promise<{ success: boolean; error?: string }> {
  try {
    const body: Record<string, unknown> = {
      model: config.model,
      messages: [{ role: 'user', content: 'Hello' }],
      max_tokens: 5,
    };

    const data = await callViaProxy(config, body);

    return { success: !!(data.choices && data.choices.length > 0) };
  } catch (error: any) {
    return { success: false, error: error.message || '网络请求失败' };
  }
}

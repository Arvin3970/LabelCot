export type FieldType = 'checkbox' | 'text' | 'richtext';

export type DataType = 'text' | 'image';

export type LLMProviderType = 'openai' | 'ollama' | 'vllm' | 'gpustack' | 'custom';

export interface TemplateField {
  id: string;
  type: FieldType;
  label: string;
  options?: string;
  enableLLM?: boolean;
  llmPromptId?: string;
  readonly?: boolean;
}

export interface LLMConfig {
  provider: LLMProviderType;
  apiUrl: string;
  apiKey?: string;
  model: string;
  supportsVision: boolean;
}

export interface OutputTemplate {
  id: string;
  name: string;
  format: 'json' | 'custom';
  template: string;
}

export interface LLMPrompt {
  id: string;
  name: string;
  content: string;
  forVision?: boolean;
}

export interface AnnotationTemplate {
  id: string;
  name: string;
  description?: string;
  dataType: DataType;
  fields: TemplateField[];
  createdAt: string;
  useLLM?: boolean;
  llmConfigs?: LLMConfig[];
  llmPrompts?: LLMPrompt[];
}

export interface FileNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  path: string;
  children?: FileNode[];
  file?: File;
  dataUrl?: string;
  entry?: FileSystemEntry;
}

export interface DatasetItem {
  id: string;
  content?: string;
  imageData?: string;
  fileName: string;
  status: 'pending' | 'annotated';
  templateId?: string;
  fileEntry?: FileSystemFileEntry;
  file?: File;
  loaded?: boolean;
}

export interface AnnotationResult {
  itemId: string;
  templateId: string;
  data: Record<string, string | string[]>;
  updatedAt: string;
}

export interface TemplateStorage {
  [templateId: string]: {
    files: FileNode[];
    items: DatasetItem[];
    results: AnnotationResult[];
    currentIndex: number;
  };
}

export interface LLMProvider {
  id: LLMProviderType;
  name: string;
  defaultApiUrl: string;
  requiresApiKey: boolean;
}

export const LLM_PROVIDERS: LLMProvider[] = [
  { id: 'openai', name: 'OpenAI', defaultApiUrl: 'https://api.openai.com/v1', requiresApiKey: true },
  { id: 'ollama', name: 'Ollama', defaultApiUrl: 'http://localhost:11434/v1', requiresApiKey: false },
  { id: 'vllm', name: 'vLLM', defaultApiUrl: 'http://localhost:8000/v1', requiresApiKey: false },
  { id: 'gpustack', name: 'GPUStack', defaultApiUrl: 'http://localhost:8080/v1', requiresApiKey: true },
  { id: 'custom', name: '自定义', defaultApiUrl: '', requiresApiKey: false },
];

export const VISION_MODEL_EXAMPLES: Record<LLMProviderType, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4-vision-preview'],
  ollama: ['llava', 'bakllava', 'moondream', 'llava-llama3'],
  vllm: ['llava-hf/llava-1.5-7b-hf', 'Qwen/Qwen2-VL-7B-Instruct'],
  gpustack: ['qwen3-vl-32b-instruct', 'llava-v1.6', 'qwen2-vl-7b-instruct'],
  custom: [],
};

export const TEXT_MODEL_EXAMPLES: Record<LLMProviderType, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  ollama: ['llama3', 'llama3.1', 'mistral', 'qwen2', 'deepseek-coder'],
  vllm: ['meta-llama/Llama-3-8b', 'Qwen/Qwen2-7B-Instruct'],
  gpustack: ['qwen3-32b-instruct', 'llama-3-70b', 'deepseek-v3', 'mistral-large'],
  custom: [],
};
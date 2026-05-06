import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { CheckCircle2Icon, XCircleIcon, Loader2Icon, SettingsIcon, EyeIcon, FileTextIcon } from 'lucide-react';
import type { LLMConfig, LLMProviderType, DataType } from '@/types/annotation';
import { LLM_PROVIDERS, VISION_MODEL_EXAMPLES, TEXT_MODEL_EXAMPLES } from '@/types/annotation';
import { testConnection } from '@/services/llm';

interface LLMSettingsProps {
  value?: LLMConfig;
  onChange: (config: LLMConfig) => void;
  dataType: DataType;
}

const LLMSettings: React.FC<LLMSettingsProps> = ({ value, onChange, dataType }) => {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'failed' | null>(null);
  const requiresVision = dataType === 'image';
  
  const selectedProvider = LLM_PROVIDERS.find(p => p.id === value?.provider) || LLM_PROVIDERS[0];
  const modelExamples = requiresVision 
    ? VISION_MODEL_EXAMPLES[value?.provider || 'openai'] 
    : TEXT_MODEL_EXAMPLES[value?.provider || 'openai'];

  useEffect(() => {
    if (!value) {
      const defaultProvider = requiresVision ? 'openai' : 'ollama';
      const provider = LLM_PROVIDERS.find(p => p.id === defaultProvider)!;
      onChange({
        provider: defaultProvider,
        apiUrl: provider.defaultApiUrl,
        model: requiresVision 
          ? VISION_MODEL_EXAMPLES[defaultProvider][0] 
          : TEXT_MODEL_EXAMPLES[defaultProvider][0],
        supportsVision: requiresVision,
      });
    }
  }, [value, onChange, requiresVision]);

  const handleProviderChange = (providerId: string) => {
    const provider = LLM_PROVIDERS.find(p => p.id === providerId as LLMProviderType);
    if (!provider) return;
    
    const modelExamples = requiresVision 
      ? VISION_MODEL_EXAMPLES[providerId as LLMProviderType]
      : TEXT_MODEL_EXAMPLES[providerId as LLMProviderType];
    
    onChange({
      provider: providerId as LLMProviderType,
      apiUrl: provider.defaultApiUrl,
      model: modelExamples[0] || '',
      apiKey: provider.requiresApiKey ? (value?.apiKey || '') : undefined,
      supportsVision: requiresVision,
    });
    setTestResult(null);
  };

  const handleTest = async () => {
    if (!value) return;
    
    setTesting(true);
    setTestResult(null);
    
    const result = await testConnection(value);
    setTestResult(result ? 'success' : 'failed');
    setTesting(false);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <SettingsIcon size={18} />
          大模型配置
        </CardTitle>
        <CardDescription className="text-xs">
          {requiresVision ? (
            <span className="flex items-center gap-1">
              <EyeIcon size={12} />
              图片标注需要支持视觉的模型
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <FileTextIcon size={12} />
              文本标注可使用任意模型
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>部署方式</Label>
          <Select value={value?.provider || 'ollama'} onValueChange={handleProviderChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LLM_PROVIDERS.map(p => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>API 地址</Label>
          <Input
            value={value?.apiUrl || ''}
            onChange={e => onChange({ ...value!, apiUrl: e.target.value })}
            placeholder={selectedProvider.defaultApiUrl || "https://api.example.com/v1"}
          />
          <p className="text-xs text-muted-foreground">
            {value?.provider === 'ollama' && '默认: http://localhost:11434/v1'}
            {value?.provider === 'vllm' && '默认: http://localhost:8000/v1'}
            {value?.provider === 'openai' && '默认: https://api.openai.com/v1'}
          </p>
        </div>

        {selectedProvider.requiresApiKey && (
          <div className="space-y-2">
            <Label>API Key</Label>
            <Input
              type="password"
              value={value?.apiKey || ''}
              onChange={e => onChange({ ...value!, apiKey: e.target.value })}
              placeholder="sk-..."
            />
          </div>
        )}

        <div className="space-y-2">
          <Label>模型名称</Label>
          <Input
            value={value?.model || ''}
            onChange={e => onChange({ ...value!, model: e.target.value })}
            placeholder={modelExamples[0] || "输入模型名称"}
          />
          {modelExamples.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {modelExamples.slice(0, 4).map(m => (
                <button
                  key={m}
                  type="button"
                  className="text-xs px-2 py-0.5 bg-secondary rounded hover:bg-secondary/80"
                  onClick={() => onChange({ ...value!, model: m })}
                >
                  {m}
                </button>
              ))}
            </div>
          )}
        </div>

        {requiresVision && value?.provider !== 'openai' && (
          <div className="flex items-center gap-2 p-2 bg-amber-50 dark:bg-amber-950/30 rounded text-xs">
            <EyeIcon size={14} className="text-amber-600" />
            <span className="text-amber-700 dark:text-amber-400">
              请确认该模型支持图片输入
            </span>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleTest} disabled={testing || !value?.apiUrl || !value?.model}>
            {testing ? (
              <>
                <Loader2Icon className="animate-spin mr-2" size={14} />
                测试中...
              </>
            ) : (
              '测试连接'
            )}
          </Button>
          
          {testResult === 'success' && (
            <span className="flex items-center gap-1 text-green-600 text-sm">
              <CheckCircle2Icon size={14} />
              连接成功
            </span>
          )}
          {testResult === 'failed' && (
            <span className="flex items-center gap-1 text-red-600 text-sm">
              <XCircleIcon size={14} />
              连接失败
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default LLMSettings;

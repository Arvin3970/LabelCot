import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { SaveIcon, PlusIcon, BotIcon, Trash2Icon, GripVerticalIcon, FileTextIcon, ImageIcon, EyeIcon, CheckCircle2Icon, XCircleIcon, Loader2Icon, SettingsIcon, MessageSquareIcon, DownloadIcon, UploadIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { TemplateField, FieldType, DataType, LLMConfig, LLMProviderType, LLMPrompt, AnnotationTemplate } from '@/types/annotation';
import { LLM_PROVIDERS } from '@/types/annotation';
import { testConnection } from '@/services/llm';

const STORAGE_KEY = 'labelcot_templates';

const loadTemplates = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('Failed to load templates from localStorage:', error);
  }
  return [];
};

const saveTemplates = (templates: any[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  } catch (error) {
    console.error('Failed to save templates to localStorage:', error);
  }
};

const TemplateBuilder: React.FC = () => {
  console.log('TemplateBuilder rendered: Constructing new template');
  const navigate = useNavigate();
  const location = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [description, setDescription] = useState('');
  const [dataType, setDataType] = useState<DataType>('text');
  const [useLLM, setUseLLM] = useState(false);
  const [llmConfigs, setLlmConfigs] = useState<LLMConfig[]>([]);
  const [llmPrompts, setLlmPrompts] = useState<LLMPrompt[]>([]);
  const [fields, setFields] = useState<TemplateField[]>([
    { id: 'f1', type: 'checkbox', label: '情感极性', options: '正面, 负面, 中性' }
  ]);

  useEffect(() => {
    const state = location.state as any;
    if (state?.template) {
      const t = state.template;
      setEditingTemplateId(t.id);
      setTemplateName(t.name.replace(' (副本)', ''));
      setDescription(t.desc || '');
      setDataType(t.dataType || 'text');
      setUseLLM(t.llm || false);
      const loadedFields = t.fieldDetails || t.fields;
      setFields(loadedFields && loadedFields.length > 0 ? loadedFields : [{ id: 'f1', type: 'checkbox', label: '情感极性', options: '正面, 负面, 中性' }]);
      setLlmConfigs(t.llmConfigs && t.llmConfigs.length > 0 ? t.llmConfigs : []);
      setLlmPrompts(t.llmPrompts && t.llmPrompts.length > 0 ? t.llmPrompts : []);
    }
  }, [location.state]);

  const [showAddModelDialog, setShowAddModelDialog] = useState(false);
  const [editingConfigIndex, setEditingConfigIndex] = useState<number | null>(null);
  const [tempConfig, setTempConfig] = useState<LLMConfig>({
    provider: 'ollama',
    apiUrl: 'http://localhost:11434/v1',
    model: '',
    supportsVision: false,
  });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'failed' | null>(null);
  const [testError, setTestError] = useState<string>('');
  
  const [showAddPromptDialog, setShowAddPromptDialog] = useState(false);
  const [editingPromptIndex, setEditingPromptIndex] = useState<number | null>(null);
  const [tempPrompt, setTempPrompt] = useState<LLMPrompt>({
    id: '',
    name: '',
    content: '',
    forVision: false,
  });

  const addField = () => {
    console.log('Adding new field to template');
    setFields([
      ...fields,
      { id: Date.now().toString(), type: 'text', label: '新建字段', options: '' }
    ]);
  };

  const updateField = (id: string, key: keyof TemplateField, value: string | boolean) => {
    setFields(fields.map(f => f.id === id ? { ...f, [key]: value } : f));
  };

  const removeField = (id: string) => {
    setFields(fields.filter(f => f.id !== id));
  };

  const openAddModelDialog = (index?: number) => {
    if (index !== undefined) {
      setEditingConfigIndex(index);
      setTempConfig(llmConfigs[index]);
    } else {
      setEditingConfigIndex(null);
      setTempConfig({
        provider: 'ollama',
        apiUrl: 'http://localhost:11434/v1',
        model: '',
        supportsVision: false,
      });
    }
    setTestResult(null);
    setTestError('');
    setShowAddModelDialog(true);
  };

  const handleProviderChange = (providerId: string) => {
    const provider = LLM_PROVIDERS.find(p => p.id === providerId as LLMProviderType);
    if (!provider) return;
    setTempConfig(prev => ({
      ...prev,
      provider: providerId as LLMProviderType,
      apiUrl: provider.defaultApiUrl,
      apiKey: provider.requiresApiKey ? (prev.apiKey || '') : undefined,
    }));
    setTestResult(null);
    setTestError('');
  };

  const handleTestConnection = async () => {
    if (!tempConfig.apiUrl || !tempConfig.model) {
      setTestResult('failed');
      setTestError('请填写API地址和模型名称');
      return;
    }

    setTesting(true);
    setTestResult(null);
    setTestError('');
    
    const result = await testConnection(tempConfig);
    
    if (result.success) {
      setTestResult('success');
    } else {
      setTestResult('failed');
      let errorMsg = result.error || '连接失败';
      
      if (errorMsg.includes('CORS') || errorMsg.includes('跨域')) {
        const providerName = LLM_PROVIDERS.find(p => p.id === tempConfig.provider)?.name || tempConfig.provider;
        errorMsg = `跨域错误(CORS)：${providerName} 服务不允许跨域请求。\n\n解决方案：\n`;
        
        if (tempConfig.provider === 'vllm') {
          errorMsg += '启动 vLLM 时添加参数: --allow-origin "*"';
        } else if (tempConfig.provider === 'ollama') {
          errorMsg += '设置环境变量: OLLAMA_ORIGINS="*" 后重启 Ollama';
        } else {
          errorMsg += '请在服务端配置允许跨域请求';
        }
      }
      
      setTestError(errorMsg);
    }
    setTesting(false);
  };

  const saveModelConfig = () => {
    if (editingConfigIndex !== null) {
      setLlmConfigs(prev => prev.map((c, i) => i === editingConfigIndex ? tempConfig : c));
    } else {
      setLlmConfigs(prev => [...prev, tempConfig]);
    }
    setShowAddModelDialog(false);
  };

  const removeModelConfig = (index: number) => {
    setLlmConfigs(prev => prev.filter((_, i) => i !== index));
  };

  const openAddPromptDialog = (index?: number) => {
    if (index !== undefined) {
      setEditingPromptIndex(index);
      setTempPrompt(llmPrompts[index]);
    } else {
      setEditingPromptIndex(null);
      setTempPrompt({
        id: Date.now().toString(),
        name: '',
        content: '',
        forVision: false,
      });
    }
    setShowAddPromptDialog(true);
  };

  const savePromptConfig = () => {
    if (editingPromptIndex !== null) {
      setLlmPrompts(prev => prev.map((p, i) => i === editingPromptIndex ? tempPrompt : p));
    } else {
      setLlmPrompts(prev => [...prev, tempPrompt]);
    }
    setShowAddPromptDialog(false);
  };

  const removePromptConfig = (index: number) => {
    setLlmPrompts(prev => prev.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    if (!templateName.trim()) {
      alert('请输入模板名称');
      return;
    }
    
    const templates = loadTemplates();
    const newTemplate = {
      id: editingTemplateId || Date.now().toString(),
      name: templateName,
      desc: description,
      llm: useLLM,
      fields: fields.length,
      date: new Date().toISOString().slice(0, 10),
      dataType,
      fieldDetails: fields,
      llmConfigs,
      llmPrompts,
      status: 'draft',
    };

    const existingIndex = templates.findIndex((t: any) => t.id === newTemplate.id);
    if (existingIndex >= 0) {
      templates[existingIndex] = newTemplate;
    } else {
      templates.push(newTemplate);
    }

    saveTemplates(templates);
    console.log('Saving template:', newTemplate);
    alert('模板已保存为草稿！');
    navigate('/templates');
  };

  const handlePublish = () => {
    if (!templateName.trim()) {
      alert('请输入模板名称');
      return;
    }
    
    const templates = loadTemplates();
    const newTemplate = {
      id: editingTemplateId || Date.now().toString(),
      name: templateName,
      desc: description,
      llm: useLLM,
      fields: fields.length,
      date: new Date().toISOString().slice(0, 10),
      dataType,
      fieldDetails: fields,
      llmConfigs,
      llmPrompts,
      status: 'published',
    };

    const existingIndex = templates.findIndex((t: any) => t.id === newTemplate.id);
    if (existingIndex >= 0) {
      templates[existingIndex] = newTemplate;
    } else {
      templates.push(newTemplate);
    }

    saveTemplates(templates);
    console.log('Publishing template:', newTemplate);
    alert('模板已发布！可以前往工作台使用。');
    navigate('/templates');
  };

  const handleExport = () => {
    const exportData: AnnotationTemplate = {
      id: Date.now().toString(),
      name: templateName,
      dataType,
      fields,
      createdAt: new Date().toISOString().slice(0, 10),
      useLLM,
      llmConfigs,
      llmPrompts,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `template_${templateName.replace(/\s+/g, '_') || 'untitled'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const template = JSON.parse(e.target?.result as string) as AnnotationTemplate;
        setTemplateName(template.name);
        setDescription(template.description || '');
        setDataType(template.dataType);
        setFields(template.fields || [{ id: 'f1', type: 'checkbox', label: '情感极性', options: '正面, 负面, 中性' }]);
        setUseLLM(template.useLLM || false);
        setLlmConfigs(template.llmConfigs || []);
        setLlmPrompts(template.llmPrompts || []);
        alert(`成功导入模板: ${template.name}`);
      } catch (error) {
        alert('导入失败：文件格式不正确');
        console.error('Import error:', error);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  return (
    <div className="w-full h-[calc(100vh-64px)] flex bg-secondary/30">
      {/* Left side: Configuration Form */}
      <div className="w-[500px] border-r border-border bg-card flex flex-col h-full shadow-custom z-10">
        <div className="p-6 border-b border-border bg-card">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold text-foreground mb-1">创建标注模板</h1>
              <p className="text-sm text-muted-foreground">配置您的标注结构及大模型参数</p>
            </div>
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileChange}
                className="hidden"
              />
              <Button variant="outline" size="sm" onClick={handleImportClick} className="gap-1">
                <UploadIcon size={14} />
                导入
              </Button>
              <Button variant="outline" size="sm" onClick={handleExport} className="gap-1">
                <DownloadIcon size={14} />
                导出
              </Button>
            </div>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">模板名称</Label>
              <Input 
                id="name" 
                placeholder="例如：通用实体识别模板" 
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="desc">模板描述</Label>
              <Input 
                id="desc" 
                placeholder="简要描述模板用途" 
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label>数据类型</Label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setDataType('text')}
                  className={`flex-1 flex items-center gap-2 p-3 rounded-lg border transition-all ${
                    dataType === 'text' 
                      ? 'border-primary bg-primary/5 text-primary' 
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <FileTextIcon size={18} />
                  <span className="font-medium">文本标注</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDataType('image')}
                  className={`flex-1 flex items-center gap-2 p-3 rounded-lg border transition-all ${
                    dataType === 'image' 
                      ? 'border-primary bg-primary/5 text-primary' 
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <ImageIcon size={18} />
                  <span className="font-medium">图片标注</span>
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-4 p-5 bg-secondary/50 rounded-xl border border-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-primary/10 rounded-md">
                  <BotIcon className="text-primary" size={18} />
                </div>
                <div>
                  <Label className="text-base font-semibold">大模型辅助 (LLM)</Label>
                  <p className="text-xs text-muted-foreground">自动预填充标注结果</p>
                </div>
              </div>
              <Switch checked={useLLM} onCheckedChange={setUseLLM} />
            </div>
            
            {useLLM && (
              <div className="pt-2 space-y-5 animate-in slide-in-from-top-2 duration-300">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">模型配置</Label>
                    <Button variant="outline" size="sm" onClick={() => openAddModelDialog()}>
                      <PlusIcon size={14} className="mr-1" /> 添加模型
                    </Button>
                  </div>
                  
                  {llmConfigs.length === 0 ? (
                    <div className="text-sm text-muted-foreground py-4 text-center border border-dashed rounded-lg">
                      暂无模型配置，点击上方按钮添加
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {llmConfigs.map((config, index) => (
                        <div key={index} className="flex items-center justify-between p-3 bg-background rounded-lg border">
                          <div className="flex items-center gap-3">
                            <SettingsIcon size={16} className="text-muted-foreground" />
                            <div>
                              <div className="font-medium text-sm">{config.model || '未命名模型'}</div>
                              <div className="text-xs text-muted-foreground">
                                {LLM_PROVIDERS.find(p => p.id === config.provider)?.name}
                                {config.supportsVision && <span className="ml-2 text-primary"><EyeIcon size={12} className="inline" /> 视觉</span>}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" onClick={() => openAddModelDialog(index)}>编辑</Button>
                            <Button variant="ghost" size="sm" onClick={() => removeModelConfig(index)} className="text-destructive hover:text-destructive">
                              <Trash2Icon size={14} />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">提示词配置</Label>
                    <Button variant="outline" size="sm" onClick={() => openAddPromptDialog()}>
                      <PlusIcon size={14} className="mr-1" /> 添加提示词
                    </Button>
                  </div>
                  
                  {llmPrompts.length === 0 ? (
                    <div className="text-sm text-muted-foreground py-4 text-center border border-dashed rounded-lg">
                      暂无提示词配置，点击上方按钮添加
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {llmPrompts.map((prompt, index) => (
                        <div key={prompt.id} className="flex items-center justify-between p-3 bg-background rounded-lg border">
                          <div className="flex items-center gap-3">
                            <MessageSquareIcon size={16} className="text-muted-foreground" />
                            <div>
                              <div className="font-medium text-sm">{prompt.name || '未命名提示词'}</div>
                              <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                                {prompt.content.slice(0, 50)}...
                                {prompt.forVision && <span className="ml-2 text-primary"><EyeIcon size={12} className="inline" /> 视觉</span>}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" onClick={() => openAddPromptDialog(index)}>编辑</Button>
                            <Button variant="ghost" size="sm" onClick={() => removePromptConfig(index)} className="text-destructive hover:text-destructive">
                              <Trash2Icon size={14} />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <Dialog open={showAddModelDialog} onOpenChange={setShowAddModelDialog}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{editingConfigIndex !== null ? '编辑模型' : '添加模型'}</DialogTitle>
              </DialogHeader>
              
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>部署方式</Label>
                  <Select value={tempConfig.provider} onValueChange={handleProviderChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LLM_PROVIDERS.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>API 地址</Label>
                  <Input
                    value={tempConfig.apiUrl}
                    onChange={e => setTempConfig(prev => ({ ...prev, apiUrl: e.target.value }))}
                    placeholder="https://api.example.com/v1"
                  />
                  <p className="text-xs text-muted-foreground">
                    {tempConfig.provider === 'ollama' && '默认: http://localhost:11434/v1'}
                    {tempConfig.provider === 'vllm' && '默认: http://localhost:8000/v1'}
                    {tempConfig.provider === 'openai' && '默认: https://api.openai.com/v1'}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>API Key <span className="text-muted-foreground font-normal">(可选)</span></Label>
                  <Input
                    type="password"
                    value={tempConfig.apiKey || ''}
                    onChange={e => setTempConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                    placeholder="sk-..."
                  />
                </div>

                <div className="space-y-2">
                  <Label>模型名称</Label>
                  <Input
                    value={tempConfig.model}
                    onChange={e => setTempConfig(prev => ({ ...prev, model: e.target.value }))}
                    placeholder="例如: llama3, gpt-4o"
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="vision" 
                    checked={tempConfig.supportsVision}
                    onCheckedChange={(checked) => setTempConfig(prev => ({ ...prev, supportsVision: !!checked }))}
                  />
                  <label htmlFor="vision" className="text-sm flex items-center gap-2 cursor-pointer">
                    <EyeIcon size={14} />
                    支持视觉（可处理图片）
                  </label>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={handleTestConnection} disabled={testing || !tempConfig.apiUrl || !tempConfig.model}>
                      {testing ? (
                        <>
                          <Loader2Icon className="animate-spin mr-2" size={14} />
                          测试中...
                        </>
                      ) : '测试连接'}
                    </Button>
                    {testResult === 'success' && (
                      <span className="flex items-center gap-1 text-green-600 text-sm">
                        <CheckCircle2Icon size={14} /> 连接成功
                      </span>
                    )}
                    {testResult === 'failed' && (
                      <span className="flex items-center gap-1 text-red-600 text-sm">
                        <XCircleIcon size={14} /> 连接失败
                      </span>
                    )}
                  </div>
                  {testError && testResult === 'failed' && (
                    <p className="text-xs text-red-500 bg-red-50 p-2 rounded border border-red-200">
                      {testError}
                    </p>
                  )}
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAddModelDialog(false)}>取消</Button>
                <Button onClick={saveModelConfig} disabled={!tempConfig.model || !tempConfig.apiUrl}>确定</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={showAddPromptDialog} onOpenChange={setShowAddPromptDialog}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{editingPromptIndex !== null ? '编辑提示词' : '添加提示词'}</DialogTitle>
              </DialogHeader>
              
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>提示词名称</Label>
                  <Input
                    value={tempPrompt.name}
                    onChange={e => setTempPrompt(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="例如: 情感分析、实体识别"
                  />
                </div>

                <div className="space-y-2">
                  <Label>提示词内容</Label>
                  <Textarea
                    value={tempPrompt.content}
                    onChange={e => setTempPrompt(prev => ({ ...prev, content: e.target.value }))}
                    placeholder="请根据给定的文本，分析其情感极性，并输出对应的分类..."
                    className="min-h-[150px] font-mono text-sm resize-y"
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="forVision" 
                    checked={tempPrompt.forVision}
                    onCheckedChange={(checked) => setTempPrompt(prev => ({ ...prev, forVision: !!checked }))}
                  />
                  <label htmlFor="forVision" className="text-sm flex items-center gap-2 cursor-pointer">
                    <EyeIcon size={14} />
                    应用于视觉模型
                  </label>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAddPromptDialog(false)}>取消</Button>
                <Button onClick={savePromptConfig} disabled={!tempPrompt.name || !tempPrompt.content}>确定</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">字段配置</Label>
              <Button variant="outline" size="sm" onClick={addField} className="h-8 flex gap-1">
                <PlusIcon size={14} /> 添加字段
              </Button>
            </div>
            
            <div className="space-y-4">
              {fields.map((field) => (
                <Card key={field.id} className="shadow-none border-border relative group">
                  <div className="absolute left-0 top-0 bottom-0 w-8 flex items-center justify-center text-muted-foreground/30 cursor-grab hover:text-foreground">
                    <GripVerticalIcon size={16} />
                  </div>
                  <CardContent className="p-4 pl-10 space-y-4">
                    <div className="flex gap-4">
                      <div className="flex-1 space-y-2">
                        <Label className="text-xs text-muted-foreground">字段标题</Label>
                        <Input 
                          value={field.label} 
                          onChange={(e) => updateField(field.id, 'label', e.target.value)}
                          className="h-9"
                        />
                      </div>
                      <div className="w-[140px] space-y-2">
                        <Label className="text-xs text-muted-foreground">字段类型</Label>
                        <Select 
                          value={field.type} 
                          onValueChange={(val: FieldType) => updateField(field.id, 'type', val)}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">单行文本</SelectItem>
                            <SelectItem value="richtext">多行富文本</SelectItem>
                            <SelectItem value="checkbox">复选框/单选</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="pt-6">
                        <Button variant="ghost" size="icon" onClick={() => removeField(field.id)} className="h-9 w-9 text-destructive hover:text-destructive hover:bg-destructive/10">
                          <Trash2Icon size={16} />
                        </Button>
                      </div>
                    </div>
                    
                    {field.type === 'checkbox' && (
                      <div className="space-y-2 pt-2 border-t border-border/50">
                        <Label className="text-xs text-muted-foreground">选项内容 (使用逗号分隔)</Label>
                        <Input 
                          placeholder="例如: 选项A, 选项B, 选项C" 
                          value={field.options}
                          onChange={(e) => updateField(field.id, 'options', e.target.value)}
                          className="h-9"
                        />
                      </div>
                    )}
                    
                    {useLLM && llmConfigs.length > 0 && (
                      <div className="space-y-3 pt-3 border-t border-border/50">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Switch 
                              checked={field.enableLLM || false}
                              onCheckedChange={(checked) => updateField(field.id, 'enableLLM', checked)}
                            />
                            <Label className="text-xs">启用大模型优化</Label>
                          </div>
                        </div>
                        
                        {field.enableLLM && (
                          <div className="space-y-3 pl-2 animate-in slide-in-from-top-2 duration-200">
                            <div className="flex gap-4">
                              <div className="flex-1 space-y-2">
                                <Label className="text-xs text-muted-foreground">选择提示词</Label>
                                <Select
                                  value={field.llmPromptId || ''}
                                  onValueChange={(val) => updateField(field.id, 'llmPromptId', val)}
                                >
                                  <SelectTrigger className="h-9">
                                    <SelectValue placeholder="选择提示词" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {llmPrompts.map(p => (
                                      <SelectItem key={p.id} value={p.id}>
                                        {p.name}
                                        {p.forVision && <span className="ml-1 text-primary">(视觉)</span>}
                                      </SelectItem>
                                    ))}
                                    {llmPrompts.length === 0 && (
                                      <SelectItem value="_none" disabled>请先添加提示词</SelectItem>
                                    )}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="flex items-end gap-2 pb-1">
                                <Switch 
                                  checked={field.readonly || false}
                                  onCheckedChange={(checked) => updateField(field.id, 'readonly', checked)}
                                />
                                <Label className="text-xs text-muted-foreground">结果不可修改</Label>
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              大模型将根据提示词生成内容并填充到此字段
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
              
              {fields.length === 0 && (
                <div className="text-center py-10 border-2 border-dashed border-border rounded-xl text-muted-foreground">
                  暂无字段，请点击上方按钮添加
                </div>
              )}
            </div>
          </div>
        </div>
        
        <div className="p-6 border-t border-border bg-card">
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1 flex gap-2 h-11 text-base" onClick={handleSave}>
              <SaveIcon size={18} />
              保存草稿
            </Button>
            <Button className="flex-1 flex gap-2 h-11 text-base" onClick={handlePublish}>
              <SaveIcon size={18} />
              发布模板
            </Button>
          </div>
        </div>
      </div>

      {/* Right side: Live Preview */}
      <div className="flex-1 bg-background flex flex-col p-8 overflow-y-auto items-center">
        <div className="w-full max-w-[600px]">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-muted-foreground flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              标注界面实时预览
            </h2>
          </div>
          
          <Card className="shadow-custom border-border">
            <CardContent className="p-8 space-y-8">
              <div className="text-center pb-6 border-b border-border">
                <h3 className="text-2xl font-bold text-foreground">
                  {templateName || '未命名模板'}
                </h3>
              </div>
              
              <div className="space-y-6">
                {fields.map((field) => (
                  <div key={field.id} className="space-y-3">
                    <Label className="text-base font-medium">{field.label || '未命名字段'}</Label>
                    
                    {field.type === 'text' && (
                      <Input placeholder="文本输入..." disabled className="bg-secondary/50" />
                    )}
                    
                    {field.type === 'richtext' && !field.enableLLM && (
                      <Textarea placeholder="详细内容输入..." disabled className="min-h-[80px] bg-secondary/50" />
                    )}
                    
                    {field.type === 'checkbox' && (
                      <div className="flex flex-wrap gap-4 pt-1">
                        {field.options ? field.options.split(',').map((opt, i) => (
                          <div key={i} className="flex items-center space-x-2">
                            <div className="w-4 h-4 rounded border border-input bg-secondary/50" />
                            <Label className="font-normal text-muted-foreground">{opt.trim() || `选项 ${i+1}`}</Label>
                          </div>
                        )) : (
                          <span className="text-sm text-muted-foreground italic">请在左侧配置选项</span>
                        )}
                      </div>
                    )}
                    
                    {field.enableLLM && (
                      <div className="mt-3 pt-3 border-t border-dashed border-border space-y-2">
                        <Label className="text-xs text-primary flex items-center gap-1">
                          <BotIcon size={12} />
                          大模型优化
                        </Label>
                        <Textarea 
                          placeholder="大模型将根据提示词生成内容..."
                          disabled 
                          className="min-h-[80px] bg-primary/5 border-primary/30 text-primary/70" 
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default TemplateBuilder;
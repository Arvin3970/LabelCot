import React, { useRef, useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PlusIcon, Settings2Icon, BotIcon, DownloadIcon, UploadIcon, Trash2Icon, CopyIcon, EditIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AnnotationTemplate } from '@/types/annotation';

const STORAGE_KEY = 'labelcot_templates';

const defaultTemplates = [
  { id: '1', name: '情感极性分析模板', desc: '用于判断文本的正面、负面或中性情绪。', llm: true, fields: 2, date: '2023-10-24', status: 'published' },
  { id: '2', name: '实体识别 (NER) 基础版', desc: '提取文本中的人名、地名、机构名。', llm: false, fields: 4, date: '2023-10-25', status: 'published' },
  { id: '3', name: '客服对话意图分类', desc: '针对多轮对话进行用户意图的打标分类。', llm: true, fields: 3, date: '2023-10-26', status: 'published' },
];

const loadTemplates = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('Failed to load templates from localStorage:', error);
  }
  return defaultTemplates;
};

const saveTemplates = (templates: typeof defaultTemplates) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  } catch (error) {
    console.error('Failed to save templates to localStorage:', error);
  }
};

const Templates: React.FC = () => {
  console.log('Templates page rendered: Displaying template list');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const [templates, setTemplates] = useState(loadTemplates);

  useEffect(() => {
    saveTemplates(templates);
  }, [templates]);

  const handleExportTemplate = (template: typeof templates[0]) => {
    const exportData: AnnotationTemplate = {
      id: template.id,
      name: template.name,
      description: template.desc,
      dataType: template.dataType || 'text',
      fields: template.fieldDetails || [],
      createdAt: template.date,
      useLLM: template.llm,
      llmConfigs: template.llmConfigs,
      llmPrompts: template.llmPrompts,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `template_${template.name.replace(/\s+/g, '_')}.json`;
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
        
        const newTemplate = {
          id: Date.now().toString(),
          name: template.name,
          desc: template.description || '',
          llm: template.useLLM || false,
          fields: template.fields?.length || 0,
          date: template.createdAt || new Date().toISOString().slice(0, 10),
          dataType: template.dataType || 'text',
          fieldDetails: template.fields || [],
          llmConfigs: template.llmConfigs || [],
          llmPrompts: template.llmPrompts || [],
          status: 'draft',
        };
        
        setTemplates(prev => [...prev, newTemplate]);
        alert(`成功导入模板: ${template.name}`);
      } catch (error) {
        alert('导入失败：文件格式不正确');
        console.error('Import error:', error);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const handleExportAll = () => {
    const exportData: AnnotationTemplate[] = templates.map(t => ({
      id: t.id,
      name: t.name,
      description: t.desc,
      dataType: t.dataType || 'text',
      fields: t.fieldDetails || [],
      createdAt: t.date,
      useLLM: t.llm,
      llmConfigs: t.llmConfigs,
      llmPrompts: t.llmPrompts,
    }));

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `templates_all_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDeleteTemplate = (id: string) => {
    if (confirm('确定要删除此模板吗？')) {
      setTemplates(prev => prev.filter(t => t.id !== id));
    }
  };

  const handleCopyTemplate = (template: typeof templates[0]) => {
    const newTemplate = {
      ...template,
      id: Date.now().toString(),
      name: `${template.name} (副本)`,
      date: new Date().toISOString().slice(0, 10),
      status: 'draft',
    };
    setTemplates(prev => [...prev, newTemplate]);
    navigate('/template-builder', { state: { template: newTemplate } });
  };

  const handleEditTemplate = (template: typeof templates[0]) => {
    navigate('/template-builder', { state: { template } });
  };

  const handleApplyTemplate = (templateId: string) => {
    setTemplates(prev => prev.map(t => 
      t.id === templateId ? { ...t, status: 'published' } : t
    ));
    navigate('/workspace', { state: { templateId } });
  };

  return (
    <div className="p-8 w-full max-w-[1200px] mx-auto animate-in fade-in duration-500">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">标注模板库</h1>
          <p className="text-muted-foreground">管理和配置您的所有数据标注结构。</p>
        </div>
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileChange}
            className="hidden"
          />
          <Button variant="outline" onClick={handleImportClick} className="flex gap-2">
            <UploadIcon size={16} />
            导入模板
          </Button>
          <Button variant="outline" onClick={handleExportAll} className="flex gap-2">
            <DownloadIcon size={16} />
            全部导出
          </Button>
          <Link to="/template-builder">
            <Button className="flex gap-2">
              <PlusIcon size={16} />
              新建模板
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {templates.map((tpl) => {
          const isPublished = tpl.status === 'published';
          return (
          <Card key={tpl.id} className="shadow-custom border-border flex flex-col">
            <CardHeader className="pb-4">
              <div className="flex justify-between items-start mb-2">
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => !isPublished && handleEditTemplate(tpl)}
                    disabled={isPublished}
                    className={`p-2 h-9 w-9 ${isPublished ? 'opacity-50 cursor-not-allowed' : 'hover:bg-secondary'}`}
                    title={isPublished ? '已发布模板不可编辑' : '编辑模板'}
                  >
                    <Settings2Icon size={16} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopyTemplate(tpl)}
                    className="p-2 h-9 w-9"
                    title="复制模板"
                  >
                    <CopyIcon size={16} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteTemplate(tpl.id)}
                    className="p-2 h-9 w-9 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                    title="删除模板"
                  >
                    <Trash2Icon size={16} />
                  </Button>
                </div>
                <div className="flex gap-2">
                  {tpl.status === 'draft' && (
                    <Badge variant="secondary" className="text-xs">草稿</Badge>
                  )}
                  {tpl.llm && (
                    <Badge variant="default" className="bg-primary/10 text-primary hover:bg-primary/20 border-none flex gap-1 items-center">
                      <BotIcon size={12} />
                      LLM 辅助
                    </Badge>
                  )}
                </div>
              </div>
              <CardTitle className="text-lg">{tpl.name}</CardTitle>
              <CardDescription className="line-clamp-2 mt-1">{tpl.desc}</CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              <div className="text-sm text-muted-foreground flex gap-4">
                <span>字段数量: <strong className="text-foreground">{tpl.fields}</strong></span>
                <span>创建于: <strong className="text-foreground">{tpl.date}</strong></span>
              </div>
            </CardContent>
            <CardFooter className="border-t border-border pt-4 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExportTemplate(tpl)}
                className="flex-1 gap-1"
              >
                <DownloadIcon size={14} />
                导出
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => handleApplyTemplate(tpl.id)}
              >
                应用此模板
              </Button>
            </CardFooter>
          </Card>
        )})}
      </div>
    </div>
  );
};

export default Templates;
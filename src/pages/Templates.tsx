import React, { useRef } from 'react';
import { Link } from 'react-router-dom';
import { PlusIcon, Settings2Icon, BotIcon, DownloadIcon, UploadIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AnnotationTemplate } from '@/types/annotation';

const Templates: React.FC = () => {
  console.log('Templates page rendered: Displaying template list');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const mockTemplates = [
    { id: '1', name: '情感极性分析模板', desc: '用于判断文本的正面、负面或中性情绪。', llm: true, fields: 2, date: '2023-10-24' },
    { id: '2', name: '实体识别 (NER) 基础版', desc: '提取文本中的人名、地名、机构名。', llm: false, fields: 4, date: '2023-10-25' },
    { id: '3', name: '客服对话意图分类', desc: '针对多轮对话进行用户意图的打标分类。', llm: true, fields: 3, date: '2023-10-26' },
  ];

  const handleExportTemplate = (template: typeof mockTemplates[0]) => {
    const exportData: AnnotationTemplate = {
      id: template.id,
      name: template.name,
      description: template.desc,
      dataType: 'text',
      fields: [],
      createdAt: template.date,
      useLLM: template.llm,
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
        console.log('Imported template:', template);
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
    const exportData: AnnotationTemplate[] = mockTemplates.map(t => ({
      id: t.id,
      name: t.name,
      description: t.desc,
      dataType: 'text',
      fields: [],
      createdAt: t.date,
      useLLM: t.llm,
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
        {mockTemplates.map((tpl) => (
          <Card key={tpl.id} className="shadow-custom border-border flex flex-col">
            <CardHeader className="pb-4">
              <div className="flex justify-between items-start mb-2">
                <div className="p-2 bg-secondary rounded-md">
                  <Settings2Icon className="text-secondary-foreground" size={20} />
                </div>
                {tpl.llm && (
                  <Badge variant="default" className="bg-primary/10 text-primary hover:bg-primary/20 border-none flex gap-1 items-center">
                    <BotIcon size={12} />
                    LLM 辅助
                  </Badge>
                )}
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
              <Link to="/workspace" className="flex-1">
                <Button variant="outline" className="w-full">应用此模板</Button>
              </Link>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default Templates;
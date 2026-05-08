import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  UploadCloudIcon, 
  DownloadCloudIcon, 
  PlusCircleIcon, 
  PlayCircleIcon,
  FileJsonIcon,
  DatabaseIcon,
  ActivityIcon
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { AnnotationTemplate, DatasetItem } from '@/types/annotation';

const STORAGE_KEY = 'labelcot_templates';
const WORKSPACE_FILES_KEY = 'labelcot_workspace_files';

const loadTemplates = (): AnnotationTemplate[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('Failed to load templates:', error);
  }
  return [];
};

const loadAnnotatedCount = (): number => {
  try {
    const stored = localStorage.getItem(WORKSPACE_FILES_KEY);
    if (stored) {
      const allFiles = JSON.parse(stored);
      let count = 0;
      for (const templateId in allFiles) {
        const items: DatasetItem[] = allFiles[templateId].items || [];
        count += items.filter(item => item.status === 'annotated').length;
      }
      return count;
    }
  } catch (error) {
    console.error('Failed to load annotated count:', error);
  }
  return 0;
};

const Dashboard: React.FC = () => {
  console.log('Dashboard page rendered');

  const [templates, setTemplates] = useState<AnnotationTemplate[]>([]);
  const [annotatedCount, setAnnotatedCount] = useState(0);

  useEffect(() => {
    setTemplates(loadTemplates());
    setAnnotatedCount(loadAnnotatedCount());
  }, []);

  const handleImport = () => {
    console.log('Triggering import flow: JSON + Dataset + Template');
    alert('系统提示：请选择包含 JSON、数据集和独立模板的压缩包进行导入，系统将自动隔离模板环境。');
  };

  const handleExport = () => {
    console.log('Triggering export flow: Exporting current project');
    alert('系统提示：正在打包导出当前项目的内容（包含标注模板、原始数据集及已标注的 JSON 数据）...');
  };

  return (
    <div className="p-8 w-full max-w-[1200px] mx-auto animate-in fade-in duration-500">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight mb-2">项目概览</h1>
          <p className="text-muted-foreground">管理您的数据集、标注模板和整体进度。</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="flex gap-2 border-border" onClick={handleImport}>
            <UploadCloudIcon size={16} />
            导入项目
          </Button>
          <Button variant="outline" className="flex gap-2 border-border" onClick={handleExport}>
            <DownloadCloudIcon size={16} />
            导出打包
          </Button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <Card className="shadow-custom border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">活跃项目</CardTitle>
            <DatabaseIcon className="text-primary" size={18} />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">3</div>
            <p className="text-xs text-muted-foreground mt-1">+1 个本周新增</p>
          </CardContent>
        </Card>
        <Card className="shadow-custom border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">可用模板</CardTitle>
            <FileJsonIcon className="text-primary" size={18} />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{templates.length}</div>
            <p className="text-xs text-muted-foreground mt-1">支持大模型辅助</p>
          </CardContent>
        </Card>
        <Card className="shadow-custom border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">今日标注量</CardTitle>
            <ActivityIcon className="text-primary" size={18} />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{annotatedCount}</div>
            <p className="text-xs text-muted-foreground mt-1">已完成标注</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <h2 className="text-xl font-semibold text-foreground mb-4">快速开始</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link to="/template-builder" className="block">
          <Card className="hover:border-primary/50 transition-colors shadow-custom border-border group relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <CardHeader>
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <PlusCircleIcon className="text-primary" size={24} />
              </div>
              <CardTitle className="text-xl">制定标注模板</CardTitle>
              <CardDescription className="text-base mt-2">
                创建新的标注结构，支持复选框、文本输入，可配置大模型（LLM）自动化提示词。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full mt-2">新建模板</Button>
            </CardContent>
          </Card>
        </Link>

        <Link to="/workspace" className="block">
          <Card className="hover:border-primary/50 transition-colors shadow-custom border-border group relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <CardHeader>
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <PlayCircleIcon className="text-primary" size={24} />
              </div>
              <CardTitle className="text-xl">进入工作台</CardTitle>
              <CardDescription className="text-base mt-2">
                加载数据集并应用选定的模板，开始高效的数据标注工作，全程自动实时保存。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="secondary" className="w-full mt-2">开始标注</Button>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
};

export default Dashboard;
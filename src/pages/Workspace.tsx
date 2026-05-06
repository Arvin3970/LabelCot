import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { 
  CheckCircle2Icon, Loader2Icon, ChevronLeftIcon, ChevronRightIcon, 
  FolderUpIcon, ImageIcon, FileIcon, FolderIcon, ChevronDownIcon, 
  ChevronRightIcon as TreeChevronIcon, PlusIcon, CheckSquareIcon, XIcon,
  LayoutGridIcon, ListIcon, ZoomInIcon, ZoomOutIcon, SparklesIcon, FileJsonIcon,
  DownloadIcon, UploadIcon
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter 
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import LLMSettings from '@/components/LLMSettings';
import { segmentImage, generateStructuredOutput } from '@/services/llm';
import type { FileNode, DatasetItem, AnnotationResult, AnnotationTemplate, TemplateStorage, LLMConfig } from '@/types/annotation';

const STORAGE_KEY = 'labelcot_templates';

const loadTemplates = (): AnnotationTemplate[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const templates = JSON.parse(stored);
      return templates.map((t: any) => ({
        id: t.id,
        name: t.name,
        description: t.desc,
        dataType: t.dataType || 'text',
        fields: t.fieldDetails || t.fields || [],
        useLLM: t.llm || false,
        llmConfigs: t.llmConfigs || [],
        llmPrompts: t.llmPrompts || [],
        createdAt: t.date || new Date().toISOString().slice(0, 10),
      }));
    }
  } catch (error) {
    console.error('Failed to load templates:', error);
  }
  return [];
};

const defaultLLMConfig: LLMConfig = {
  provider: 'ollama',
  apiUrl: 'http://localhost:11434/v1',
  model: 'llama3',
  supportsVision: false,
};

const Workspace: React.FC = () => {
  const location = useLocation();
  const [templates, setTemplates] = useState<AnnotationTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [templateStorage, setTemplateStorage] = useState<TemplateStorage>({});
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [imageZoom, setImageZoom] = useState(1);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');
  const [formData, setFormData] = useState<Record<string, string | string[]>>({});
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; visible: boolean }>({
    current: 0,
    total: 0,
    visible: false
  });
  const [llmConfig, setLlmConfig] = useState<LLMConfig>(defaultLLMConfig);
  const [showLLMSettings, setShowLLMSettings] = useState(false);
  const [llmLoading, setLlmLoading] = useState(false);
  const [segmentResult, setSegmentResult] = useState<string>('');
  const [outputResult, setOutputResult] = useState<string>('');
  const [outputTemplate, setOutputTemplate] = useState<string>('将标注数据转换为JSON格式');
  const [showOutputDialog, setShowOutputDialog] = useState(false);
  const annotationImportRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loadedTemplates = loadTemplates();
    setTemplates(loadedTemplates);
    
    const state = location.state as any;
    if (state?.templateId) {
      const templateId = state.templateId;
      setSelectedTemplateId(templateId);
      setTemplateStorage(prev => ({
        ...prev,
        [templateId]: prev[templateId] || {
          files: [],
          items: [],
          results: [],
          currentIndex: 0
        }
      }));
      
      const template = loadedTemplates.find((t: AnnotationTemplate) => t.id === templateId);
      if (template?.llmConfigs && template.llmConfigs.length > 0) {
        setLlmConfig(template.llmConfigs[0]);
      }
    }
  }, [location.state]);

  useEffect(() => {
    if (selectedTemplateId && templates.length > 0) {
      const template = templates.find(t => t.id === selectedTemplateId);
      if (template?.llmConfigs && template.llmConfigs.length > 0) {
        setLlmConfig(template.llmConfigs[0]);
      }
    }
  }, [selectedTemplateId, templates]);

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);
  const currentStorage = selectedTemplateId ? templateStorage[selectedTemplateId] : null;
  const currentItem = currentStorage && currentStorage.items[currentStorage.currentIndex] || null;
  const totalItems = currentStorage?.items.length || 0;
  const currentIndex = currentStorage?.currentIndex || 0;

  const saveFormDataRef = useRef(formData);
  const currentItemRef = useRef(currentItem);
  const currentStorageRef = useRef(currentStorage);
  
  useEffect(() => {
    saveFormDataRef.current = formData;
    currentItemRef.current = currentItem;
    currentStorageRef.current = currentStorage;
  });

  const itemIdRef = useRef<string | null>(null);
  
  useEffect(() => {
    const item = currentItemRef.current;
    const storage = currentStorageRef.current;
    if (item && selectedTemplateId && storage) {
      if (itemIdRef.current !== item.id) {
        itemIdRef.current = item.id;
        const existingResult = storage.results.find(r => r.itemId === item.id);
        setFormData(existingResult?.data || {});
      }
    }
  }, [currentItem?.id, selectedTemplateId]);

  useEffect(() => {
    const data = saveFormDataRef.current;
    const item = currentItemRef.current;
    if (Object.keys(data).length > 0 && selectedTemplateId && item) {
      setSaveStatus('saving');
      const timer = setTimeout(() => {
        setTemplateStorage(prev => ({
          ...prev,
          [selectedTemplateId]: {
            ...prev[selectedTemplateId],
            results: prev[selectedTemplateId].results.map(r => 
              r.itemId === item.id ? { ...r, data } : r
            )
          }
        }));
        setSaveStatus('saved');
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [formData, selectedTemplateId]);

  const handleSelectTemplate = (templateId: string) => {
    const template = templates.find(t => t.id === templateId);
    if (!template) return;

    setSelectedTemplateId(templateId);
    
    if (!templateStorage[templateId]) {
      setTemplateStorage(prev => ({
        ...prev,
        [templateId]: {
          files: [],
          items: [],
          results: [],
          currentIndex: 0
        }
      }));
    }
  };

  const readAllEntries = useCallback((reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> => {
    return new Promise((resolve) => {
      const allEntries: FileSystemEntry[] = [];
      const readBatch = () => {
        reader.readEntries((entries) => {
          if (entries.length === 0) {
            resolve(allEntries);
          } else {
            allEntries.push(...entries);
            readBatch();
          }
        }, () => resolve(allEntries));
      };
      readBatch();
    });
  }, []);

  const buildFileTreeLazyRef = useRef<{
    fn: (entries: FileSystemEntry[], path: string) => Promise<FileNode[]>
  } | null>(null);

  const buildFileTreeLazy = useCallback(async (entries: FileSystemEntry[], path: string = ''): Promise<FileNode[]> => {
    const nodes: FileNode[] = [];
    
    for (const entry of entries) {
      const node: FileNode = {
        id: `${path}/${entry.name}`,
        name: entry.name,
        type: entry.isDirectory ? 'folder' : 'file',
        path: `${path}/${entry.name}`,
        children: entry.isDirectory ? [] : undefined,
        entry: entry,
      };
      
      if (entry.isDirectory) {
        const reader = (entry as FileSystemDirectoryEntry).createReader();
        const childEntries = await readAllEntries(reader);
        
        if (childEntries.length > 0) {
          node.children = await buildFileTreeLazyRef.current!.fn(childEntries, node.path);
        }
      }
      
      nodes.push(node);
    }
    
    return nodes.sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === 'folder' ? -1 : 1;
    });
  }, [readAllEntries]);

  useEffect(() => {
    buildFileTreeLazyRef.current = { fn: buildFileTreeLazy };
  }, [buildFileTreeLazy]);

  const collectFilesFromTree = useCallback((nodes: FileNode[], template: AnnotationTemplate): { node: FileNode; entry: FileSystemFileEntry }[] => {
    const files: { node: FileNode; entry: FileSystemFileEntry }[] = [];
    
    const traverse = (nodeList: FileNode[]) => {
      for (const node of nodeList) {
        if (node.type === 'file' && node.entry && !node.entry.isDirectory) {
          const fileEntry = node.entry as FileSystemFileEntry;
          const isImage = template.dataType === 'image' && fileEntry.name.match(/\.(jpg|jpeg|png|gif|webp|bmp)$/i);
          const isText = template.dataType === 'text' && fileEntry.name.endsWith('.txt');
          
          if (isImage || isText) {
            files.push({ node, entry: fileEntry });
          }
        } else if (node.children) {
          traverse(node.children);
        }
      }
    };
    
    traverse(nodes);
    return files;
  }, []);

  const processEntriesLazy = useCallback(async (entries: FileSystemEntry[], templateId: string, template: AnnotationTemplate) => {
    setUploadProgress({ current: 0, total: 1, visible: true });

    const tree = await buildFileTreeLazy(entries);
    const files = collectFilesFromTree(tree, template);

    setUploadProgress({ current: 1, total: files.length, visible: true });

    const items: DatasetItem[] = [];
    const results: AnnotationResult[] = [];
    const batchSize = 50;

    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      
      for (const { node, entry } of batch) {
        const itemId = `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        items.push({
          id: itemId,
          fileName: entry.name,
          status: 'pending',
          templateId,
          fileEntry: entry,
          loaded: false,
        });
        
        results.push({
          itemId,
          templateId,
          data: {},
          updatedAt: new Date().toISOString()
        });
      }
      
      setUploadProgress(prev => ({ ...prev, current: Math.min(i + batchSize, files.length) }));
      
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    setTemplateStorage(prev => ({
      ...prev,
      [templateId]: {
        ...prev[templateId],
        files: tree,
        items: prev[templateId].items.concat(items),
        results: prev[templateId].results.concat(results)
      }
    }));
    
    setTimeout(() => {
      setUploadProgress(prev => ({ ...prev, visible: false }));
    }, 500);
  }, [buildFileTreeLazy, collectFilesFromTree]);

  const loadItemContent = useCallback(async (item: DatasetItem) => {
    if (item.loaded) return;
    
    let file: File | null = null;
    
    if (item.file) {
      file = item.file;
    } else if (item.fileEntry) {
      file = await new Promise<File>((resolve, reject) => {
        item.fileEntry!.file(resolve, reject);
      });
    }
    
    if (!file) return;
    
    const isImage = file.type.startsWith('image/');
    
    if (isImage) {
      const dataUrl = URL.createObjectURL(file);
      setTemplateStorage(prev => ({
        ...prev,
        [selectedTemplateId]: {
          ...prev[selectedTemplateId],
          items: prev[selectedTemplateId].items.map(i =>
            i.id === item.id ? { ...i, imageData: dataUrl, loaded: true } : i
          )
        }
      }));
    } else {
      const content = await file.text();
      setTemplateStorage(prev => ({
        ...prev,
        [selectedTemplateId]: {
          ...prev[selectedTemplateId],
          items: prev[selectedTemplateId].items.map(i =>
            i.id === item.id ? { ...i, content, loaded: true } : i
          )
        }
      }));
    }
  }, [selectedTemplateId]);

  const loadItemRef = useRef(loadItemContent);
  const currentItemForLoadRef = useRef<DatasetItem | null>(null);
  
  useEffect(() => {
    loadItemRef.current = loadItemContent;
  }, [loadItemContent]);

  useEffect(() => {
    if (currentItem && !currentItem.loaded) {
      currentItemForLoadRef.current = currentItem;
      const load = async () => {
        if (currentItemForLoadRef.current && !currentItemForLoadRef.current.loaded) {
          await loadItemRef.current(currentItemForLoadRef.current);
        }
      };
      load();
    }
  }, [currentItem?.id, currentItem]);

  const handleFolderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !selectedTemplate) return;

    const validFiles: File[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const isImage = selectedTemplate.dataType === 'image' && file.type.startsWith('image/');
      const isText = selectedTemplate.dataType === 'text' && (file.type === 'text/plain' || file.name.endsWith('.txt'));
      if (isImage || isText) validFiles.push(file);
    }

    if (validFiles.length === 0) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setUploadProgress({ current: 0, total: validFiles.length, visible: true });

    const items: DatasetItem[] = [];
    const results: AnnotationResult[] = [];
    const fileNodes: FileNode[] = [];

    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];
      const fileWithPath = file as File & { webkitRelativePath?: string };
      const relativePath = fileWithPath.webkitRelativePath || file.name;
      const itemId = `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      fileNodes.push({
        id: relativePath,
        name: file.name,
        type: 'file',
        path: relativePath,
        file,
      });

      items.push({
        id: itemId,
        fileName: file.name,
        status: 'pending',
        templateId: selectedTemplateId,
        loaded: false,
        file,
      });

      results.push({
        itemId,
        templateId: selectedTemplateId,
        data: {},
        updatedAt: new Date().toISOString()
      });

      if (i % 50 === 0) {
        setUploadProgress(prev => ({ ...prev, current: i }));
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    const buildTree = (nodes: FileNode[]): FileNode[] => {
      const root: FileNode = { id: '', name: '', type: 'folder', path: '', children: [] };
      const map = new Map<string, FileNode>();
      map.set('', root);

      for (const node of nodes) {
        const parts = node.path.split('/').filter(Boolean);
        let current = root;
        
        for (let i = 0; i < parts.length - 1; i++) {
          const folderPath = parts.slice(0, i + 1).join('/');
          if (!map.has(folderPath)) {
            const folder: FileNode = {
              id: folderPath,
              name: parts[i],
              type: 'folder',
              path: folderPath,
              children: []
            };
            map.set(folderPath, folder);
            current.children!.push(folder);
          }
          current = map.get(folderPath)!;
        }
        current.children!.push(node);
      }

      return root.children || [];
    };

    setTemplateStorage(prev => ({
      ...prev,
      [selectedTemplateId]: {
        ...prev[selectedTemplateId],
        files: buildTree(fileNodes),
        items: [...prev[selectedTemplateId].items, ...items],
        results: [...prev[selectedTemplateId].results, ...results]
      }
    }));
    
    setUploadProgress(prev => ({ ...prev, current: validFiles.length }));
    setTimeout(() => setUploadProgress(prev => ({ ...prev, visible: false })), 500);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFilesDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!selectedTemplate) return;

    const items = e.dataTransfer.items;
    const entries: FileSystemEntry[] = [];

    for (let i = 0; i < items.length; i++) {
      const entry = items[i].webkitGetAsEntry();
      if (entry) entries.push(entry);
    }

    if (entries.length > 0) {
      await processEntriesLazy(entries, selectedTemplateId, selectedTemplate);
    }
  };

  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const navigateItem = (direction: 'prev' | 'next') => {
    if (!currentStorage) return;
    
    const newIndex = direction === 'prev' 
      ? Math.max(0, currentIndex - 1)
      : Math.min(totalItems - 1, currentIndex + 1);
    
    setTemplateStorage(prev => ({
      ...prev,
      [selectedTemplateId]: {
        ...prev[selectedTemplateId],
        currentIndex: newIndex
      }
    }));
  };

  const handleCheckboxChange = (fieldId: string, option: string, checked: boolean) => {
    setFormData(prev => {
      const currentArr = prev[fieldId];
      const arr = Array.isArray(currentArr) ? currentArr : [];
      if (checked) {
        return { ...prev, [fieldId]: [...arr, option] };
      } else {
        return { ...prev, [fieldId]: arr.filter((i: string) => i !== option) };
      }
    });
  };

  const handleFieldChange = (fieldId: string, value: string) => {
    setFormData(prev => ({ ...prev, [fieldId]: value }));
  };

  const handleMarkAnnotated = () => {
    if (!currentItem || !selectedTemplateId) return;
    
    setTemplateStorage(prev => ({
      ...prev,
      [selectedTemplateId]: {
        ...prev[selectedTemplateId],
        items: prev[selectedTemplateId].items.map(item =>
          item.id === currentItem.id ? { ...item, status: 'annotated' as const } : item
        )
      }
    }));
    
    navigateItem('next');
  };

  const handleAISegment = async () => {
    if (!currentItem?.imageData) return;
    
    setLlmLoading(true);
    setSegmentResult('');
    
    try {
      const visionConfig = selectedTemplate?.llmConfigs?.find(c => c.supportsVision);
      const visionPrompt = selectedTemplate?.llmPrompts?.find(p => p.forVision);
      const result = await segmentImage(
        visionConfig || llmConfig,
        currentItem.imageData,
        visionPrompt?.content || '请分析这张图片，识别主要区域和对象。'
      );
      
      setSegmentResult(JSON.stringify(result, null, 2));
      
      if (result.segments && result.segments.length > 0) {
        const options = result.segments.map(s => s.label).join(',');
        console.log('AI建议的标签:', options);
      }
    } catch (error) {
      setSegmentResult('分析失败: ' + (error as Error).message);
    } finally {
      setLlmLoading(false);
    }
  };

  const handleGenerateOutput = async () => {
    if (!formData || Object.keys(formData).length === 0) return;
    
    setLlmLoading(true);
    setOutputResult('');
    
    try {
      const textPrompt = selectedTemplate?.llmPrompts?.find(p => !p.forVision);
      const result = await generateStructuredOutput(
        selectedTemplate?.llmConfigs?.[0] || llmConfig,
        formData,
        textPrompt?.content || outputTemplate,
        'json'
      );
      
      setOutputResult(result);
    } catch (error) {
      setOutputResult('生成失败: ' + (error as Error).message);
    } finally {
      setLlmLoading(false);
    }
  };

  const handleBatchOutput = async () => {
    if (!currentStorage?.results.length) return;
    
    setLlmLoading(true);
    setOutputResult('');
    
    try {
      const allResults = currentStorage.results.map(r => ({
        fileName: currentStorage.items.find(i => i.id === r.itemId)?.fileName,
        ...r.data
      }));
      
      const textPrompt = selectedTemplate?.llmPrompts?.find(p => !p.forVision);
      const result = await generateStructuredOutput(
        selectedTemplate?.llmConfigs?.[0] || llmConfig,
        { items: allResults },
        textPrompt?.content || outputTemplate,
        'json'
      );
      
      setOutputResult(result);
    } catch (error) {
      setOutputResult('生成失败: ' + (error as Error).message);
    } finally {
      setLlmLoading(false);
    }
  };

  const handleExportAnnotations = () => {
    if (!currentStorage?.results.length) {
      alert('没有已标注的数据可导出');
      return;
    }

    const exportData = {
      templateId: selectedTemplateId,
      templateName: selectedTemplate?.name,
      exportedAt: new Date().toISOString(),
      items: currentStorage.items.map(item => ({
        id: item.id,
        fileName: item.fileName,
        status: item.status,
      })),
      results: currentStorage.results,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `annotations_${selectedTemplate?.name || 'export'}_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportAnnotations = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        
        if (!data.templateId || !data.results) {
          alert('导入失败：文件格式不正确');
          return;
        }

        if (data.templateId !== selectedTemplateId) {
          alert(`导入失败：模板不匹配（文件模板: ${data.templateName || data.templateId}）`);
          return;
        }

        setTemplateStorage(prev => {
          const existingResults = prev[selectedTemplateId]?.results || [];
          const existingIds = new Set(existingResults.map(r => r.itemId));
          
          const newResults = data.results.filter((r: AnnotationResult) => !existingIds.has(r.itemId));
          
          return {
            ...prev,
            [selectedTemplateId]: {
              ...prev[selectedTemplateId],
              results: [...existingResults, ...newResults],
              items: prev[selectedTemplateId].items.map(item => {
                const hasResult = data.results.some((r: AnnotationResult) => r.itemId === item.id);
                return hasResult ? { ...item, status: 'annotated' as const } : item;
              }),
            }
          };
        });

        alert(`成功导入 ${data.results.length} 条标注数据`);
      } catch (error) {
        alert('导入失败：文件格式不正确');
        console.error('Import error:', error);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const renderFileTree = (nodes: FileNode[], depth: number = 0) => {
    return nodes.map(node => {
      const matchingItemIndex = node.type === 'file' 
        ? currentStorage.items.findIndex(item => item.fileName === node.name || item.id === node.id)
        : -1;
      
      return (
        <div key={node.id}>
          <div 
            className={`flex items-center gap-2 py-1.5 px-2 rounded hover:bg-secondary/50 cursor-pointer ${
              matchingItemIndex !== -1 && matchingItemIndex === currentIndex ? 'bg-primary/10' : ''
            }`}
            style={{ paddingLeft: `${depth * 16 + 8}px` }}
            onClick={() => {
              if (node.type === 'folder') {
                toggleFolder(node.id);
              } else if (matchingItemIndex !== -1) {
                setTemplateStorage(prev => ({
                  ...prev,
                  [selectedTemplateId]: {
                    ...prev[selectedTemplateId],
                    currentIndex: matchingItemIndex
                  }
                }));
              }
            }}
          >
            {node.type === 'folder' ? (
              <>
                {expandedFolders.has(node.id) ? (
                  <TreeChevronIcon size={14} className="text-muted-foreground" />
                ) : (
                  <ChevronDownIcon size={14} className="text-muted-foreground" />
                )}
                <FolderIcon size={16} className="text-amber-500" />
              </>
            ) : (
              <>
                <span className="w-[14px]" />
                {selectedTemplate?.dataType === 'image' ? (
                  <ImageIcon size={16} className="text-green-500" />
                ) : (
                  <FileIcon size={16} className="text-muted-foreground" />
                )}
              </>
            )}
            <span className="text-sm truncate">{node.name}</span>
          </div>
          {node.type === 'folder' && expandedFolders.has(node.id) && node.children && (
            renderFileTree(node.children, depth + 1)
          )}
        </div>
      );
    });
  };

  if (!selectedTemplateId || !currentStorage) {
    return (
      <div className="w-full h-[calc(100vh-64px)] flex items-center justify-center bg-background">
        <Card className="w-[480px] shadow-custom border-border">
          <CardContent className="p-8">
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <CheckSquareIcon className="text-primary" size={32} />
              </div>
              <h2 className="text-2xl font-bold mb-2">选择标注模板</h2>
              <p className="text-muted-foreground">请先选择一个模板开始标注工作</p>
            </div>

            <div className="space-y-3 mb-6">
              {templates.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  <p>暂无模板，请先创建模板</p>
                </div>
              ) : (
                templates.map(template => (
                  <Card 
                    key={template.id}
                    className={`cursor-pointer transition-all hover:border-primary/50 ${templateStorage[template.id]?.items.length ? 'border-green-500/50' : ''}`}
                    onClick={() => handleSelectTemplate(template.id)}
                  >
                    <CardContent className="p-4 flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        {template.dataType === 'image' ? (
                          <ImageIcon className="text-primary" size={20} />
                        ) : (
                          <FileIcon className="text-primary" size={20} />
                        )}
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold">{template.name}</h3>
                        <p className="text-sm text-muted-foreground">{template.description}</p>
                      </div>
                      {templateStorage[template.id]?.items.length ? (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                          {templateStorage[template.id].items.length} 条数据
                        </span>
                      ) : null}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>

            <div className="text-center text-sm text-muted-foreground">
              每个模板的数据相互隔离，互不影响
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full h-[calc(100vh-64px)] flex flex-col bg-background">
      <div className="h-14 border-b border-border bg-card px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <Select value={selectedTemplateId} onValueChange={handleSelectTemplate}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="选择模板" />
            </SelectTrigger>
            <SelectContent>
              {templates.map(t => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name} ({templateStorage[t.id]?.items.length || 0}条)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <div className="h-4 w-[1px] bg-border" />
          
          <span className="text-sm text-muted-foreground">
            数据类型: {selectedTemplate.dataType === 'image' ? '图片' : '文本'}
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm">
            {saveStatus === 'saving' ? (
              <>
                <Loader2Icon className="animate-spin text-primary" size={16} />
                <span className="text-primary">保存中...</span>
              </>
            ) : (
              <>
                <CheckCircle2Icon className="text-green-500" size={16} />
                <span className="text-muted-foreground">已保存</span>
              </>
            )}
          </div>

          <div className="h-4 w-[1px] bg-border" />

          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              className="h-8 gap-1"
              onClick={handleExportAnnotations}
              disabled={!currentStorage?.results.length}
            >
              <DownloadIcon size={14} />
              导出标注
            </Button>
            <input
              ref={annotationImportRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImportAnnotations}
            />
            <Button 
              variant="outline" 
              size="sm" 
              className="h-8 gap-1"
              onClick={() => annotationImportRef.current?.click()}
            >
              <UploadIcon size={14} />
              导入标注
            </Button>
          </div>

          <div className="h-4 w-[1px] bg-border" />

          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              进度: {currentIndex + 1} / {totalItems}
              {currentStorage.items.filter(i => i.status === 'annotated').length > 0 && (
                <span className="text-green-600 ml-2">
                  (已标注 {currentStorage.items.filter(i => i.status === 'annotated').length})
                </span>
              )}
            </span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => navigateItem('prev')} disabled={currentIndex === 0}>
                <ChevronLeftIcon size={16} />
              </Button>
              <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => navigateItem('next')} disabled={currentIndex >= totalItems - 1}>
                <ChevronRightIcon size={16} />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        {uploadProgress.visible && (
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
            <Card className="w-[320px] shadow-lg">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <Loader2Icon className="animate-spin text-primary" size={24} />
                  <div>
                    <p className="font-semibold">正在处理文件</p>
                    <p className="text-sm text-muted-foreground">
                      {uploadProgress.current} / {uploadProgress.total} 个文件
                    </p>
                  </div>
                </div>
                <Progress 
                  value={(uploadProgress.current / uploadProgress.total) * 100} 
                  className="h-2"
                />
              </CardContent>
            </Card>
          </div>
        )}
        
        <div className="w-[280px] border-r border-border bg-card flex flex-col shrink-0">
          <div className="p-4 border-b border-border">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm">数据文件</h3>
              <Button 
                variant="outline" 
                size="sm" 
                className="h-7 text-xs gap-1"
                onClick={() => fileInputRef.current?.click()}
              >
                <FolderUpIcon size={14} />
                上传文件夹
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                {...{ webkitdirectory: '', directory: '' }}
                multiple
                onChange={handleFolderUpload}
                accept={selectedTemplate.dataType === 'image' ? 'image/*' : '.txt'}
              />
            </div>
            
            <div className="flex gap-1">
              <Button 
                variant={viewMode === 'grid' ? 'secondary' : 'ghost'} 
                size="sm" 
                className="h-7 w-7 p-0"
                onClick={() => setViewMode('grid')}
              >
                <LayoutGridIcon size={14} />
              </Button>
              <Button 
                variant={viewMode === 'list' ? 'secondary' : 'ghost'} 
                size="sm" 
                className="h-7 w-7 p-0"
                onClick={() => setViewMode('list')}
              >
                <ListIcon size={14} />
              </Button>
            </div>
          </div>

          <ScrollArea className="flex-1">
            {currentStorage.files.length > 0 ? (
              viewMode === 'list' ? (
                <div className="p-2">
                  {renderFileTree(currentStorage.files)}
                </div>
              ) : (
                <div className="p-3 grid grid-cols-3 gap-2">
                  {currentStorage.items.map((item, idx) => (
                    <div
                      key={item.id}
                      className={`aspect-square rounded border overflow-hidden cursor-pointer transition-all ${
                        idx === currentIndex ? 'ring-2 ring-primary' : 'border-border hover:border-primary/50'
                      } ${item.status === 'annotated' ? 'opacity-60' : ''}`}
                      onClick={() => setTemplateStorage(prev => ({
                        ...prev,
                        [selectedTemplateId]: {
                          ...prev[selectedTemplateId],
                          currentIndex: idx
                        }
                      }))}
                    >
                      {selectedTemplate.dataType === 'image' && item.imageData ? (
                        <img src={item.imageData} alt={item.fileName} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-secondary">
                          <FileIcon size={24} className="text-muted-foreground" />
                        </div>
                      )}
                      {item.status === 'annotated' && (
                        <div className="absolute top-1 right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                          <CheckCircle2Icon size={10} className="text-white" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )
            ) : (
              <div 
                className="m-4 border-2 border-dashed border-border rounded-lg p-8 text-center"
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleFilesDrop}
              >
                <FolderUpIcon size={40} className="mx-auto text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground mb-2">
                  拖拽文件夹到此处
                </p>
                <p className="text-xs text-muted-foreground">
                  或点击上方按钮选择
                </p>
              </div>
            )}
          </ScrollArea>

          <div className="p-4 border-t border-border bg-secondary/30">
            <div className="text-xs text-muted-foreground">
              共 {totalItems} 条数据
            </div>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 border-r border-border bg-secondary/20 p-6 overflow-hidden flex flex-col">
            {currentItem ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-lg">
                    {currentItem.fileName}
                  </h2>
                  {selectedTemplate.dataType === 'image' && currentItem.imageData && (
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-8 w-8 p-0"
                        onClick={() => setImageZoom(z => Math.max(0.25, z - 0.25))}
                      >
                        <ZoomOutIcon size={14} />
                      </Button>
                      <span className="text-sm flex items-center w-12 justify-center">{Math.round(imageZoom * 100)}%</span>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-8 w-8 p-0"
                        onClick={() => setImageZoom(z => Math.min(3, z + 0.25))}
                      >
                        <ZoomInIcon size={14} />
                      </Button>
                    </div>
                  )}
                </div>

                <div className="flex-1 overflow-auto flex items-center justify-center">
                  {selectedTemplate.dataType === 'image' ? (
                    currentItem?.imageData ? (
                      <img 
                        src={currentItem.imageData} 
                        alt={currentItem.fileName}
                        className="max-w-full h-auto rounded-lg shadow-lg transition-transform"
                        style={{ transform: `scale(${imageZoom})` }}
                      />
                    ) : currentItem ? (
                      <div className="flex flex-col items-center gap-3 text-muted-foreground">
                        <Loader2Icon className="animate-spin" size={32} />
                        <span>加载中...</span>
                      </div>
                    ) : (
                      <div className="text-muted-foreground">无内容</div>
                    )
                  ) : currentItem?.content ? (
                    <Card className="w-full max-w-[800px] shadow-custom">
                      <CardContent className="p-6">
                        <pre className="whitespace-pre-wrap text-base leading-relaxed font-sans">
                          {currentItem.content}
                        </pre>
                      </CardContent>
                    </Card>
                  ) : currentItem ? (
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <Loader2Icon className="animate-spin" size={32} />
                      <span>加载中...</span>
                    </div>
                  ) : (
                    <div className="text-muted-foreground">无内容</div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center text-muted-foreground">
                  <FolderUpIcon size={48} className="mx-auto mb-4 opacity-50" />
                  <p>请上传数据开始标注</p>
                </div>
              </div>
            )}
          </div>

          <div className="w-[400px] bg-card p-6 overflow-y-auto shrink-0">
            <h2 className="text-lg font-bold mb-6 pb-4 border-b border-border">
              标注信息
            </h2>

            {currentItem ? (
              <>
                <div className="space-y-6">
                  {selectedTemplate.fields.map(field => (
                    <div key={field.id} className="space-y-3">
                      <Label className="text-base font-semibold">
                        {field.label}
                        {field.type === 'checkbox' && (
                          <span className="text-xs font-normal text-muted-foreground ml-2">(可多选)</span>
                        )}
                      </Label>

                      {field.type === 'checkbox' && field.options && (
                        <div className="grid grid-cols-2 gap-3">
                          {field.options.split(',').map(opt => {
                            const trimmed = opt.trim();
                            return (
                              <div 
                                key={trimmed}
                                className="flex items-center space-x-2 p-2.5 rounded-lg border border-border bg-secondary/30 hover:bg-secondary/60 transition-colors"
                              >
                                <Checkbox
                                  id={`${field.id}-${trimmed}`}
                                  checked={(formData[field.id] || []).includes(trimmed)}
                                  onCheckedChange={(checked) => handleCheckboxChange(field.id, trimmed, !!checked)}
                                />
                                <Label
                                  htmlFor={`${field.id}-${trimmed}`}
                                  className="flex-1 cursor-pointer text-sm"
                                >
                                  {trimmed}
                                </Label>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {field.type === 'richtext' && (
                        <Textarea
                          placeholder="请输入..."
                          className="min-h-[120px] resize-y"
                          value={formData[field.id] || ''}
                          onChange={e => handleFieldChange(field.id, e.target.value)}
                        />
                      )}

                      {field.type === 'text' && (
                        <Input
                          placeholder="请输入..."
                          value={formData[field.id] || ''}
                          onChange={e => handleFieldChange(field.id, e.target.value)}
                        />
                      )}
                    </div>
                  ))}
                </div>

                {selectedTemplate.useLLM && (
                  <div className="mt-6 pt-6 border-t border-border space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-base font-semibold flex items-center gap-2">
                        <SparklesIcon size={16} />
                        AI 辅助
                      </Label>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => setShowLLMSettings(true)}
                      >
                        设置
                      </Button>
                    </div>
                    
                    {selectedTemplate.dataType === 'image' && selectedTemplate.llmConfigs?.some(c => c.supportsVision) && (
                      <Button 
                        variant="outline" 
                        className="w-full"
                        onClick={handleAISegment}
                        disabled={llmLoading || !currentItem?.imageData}
                      >
                        {llmLoading ? (
                          <>
                            <Loader2Icon className="animate-spin mr-2" size={14} />
                            分析中...
                          </>
                        ) : (
                          <>
                            <ImageIcon className="mr-2" size={14} />
                            AI 图片分析
                          </>
                        )}
                      </Button>
                    )}
                    
                    {segmentResult && (
                      <div className="p-3 bg-secondary/50 rounded-lg text-xs font-mono whitespace-pre-wrap max-h-40 overflow-auto">
                        {segmentResult}
                      </div>
                    )}
                    
                    <Button 
                      variant="outline" 
                      className="w-full"
                      onClick={() => setShowOutputDialog(true)}
                      disabled={llmLoading || Object.keys(formData).length === 0}
                    >
                      <FileJsonIcon className="mr-2" size={14} />
                      生成结构化输出
                    </Button>
                  </div>
                )}

                <div className="mt-8 pt-6 border-t border-border space-y-3">
                  <Button 
                    className="w-full h-11"
                    onClick={handleMarkAnnotated}
                    disabled={currentItem.status === 'annotated'}
                  >
                    {currentItem.status === 'annotated' ? '已完成标注' : '标记为已标注'}
                  </Button>
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={() => navigateItem('next')}
                    disabled={currentIndex >= totalItems - 1}
                  >
                    下一条
                  </Button>
                </div>
              </>
            ) : (
              <div className="text-center text-muted-foreground py-12">
                暂无数据
              </div>
            )}
          </div>
        </div>
      </div>

      <Dialog open={showLLMSettings} onOpenChange={setShowLLMSettings}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>大模型配置</DialogTitle>
          </DialogHeader>
          <LLMSettings value={llmConfig} onChange={setLlmConfig} dataType={selectedTemplate?.dataType || 'text'} />
        </DialogContent>
      </Dialog>

      <Dialog open={showOutputDialog} onOpenChange={setShowOutputDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>生成结构化输出</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>输出模板/提示词</Label>
              <Textarea
                value={outputTemplate}
                onChange={e => setOutputTemplate(e.target.value)}
                placeholder="输入输出格式要求或模板..."
                className="min-h-[80px]"
              />
            </div>
            
            <div className="flex gap-2">
              <Button onClick={handleGenerateOutput} disabled={llmLoading}>
                {llmLoading ? (
                  <>
                    <Loader2Icon className="animate-spin mr-2" size={14} />
                    生成中...
                  </>
                ) : (
                  '生成当前项'
                )}
              </Button>
              <Button variant="outline" onClick={handleBatchOutput} disabled={llmLoading}>
                生成全部 ({currentStorage?.results.length || 0} 条)
              </Button>
            </div>
            
            {outputResult && (
              <div className="p-4 bg-secondary/50 rounded-lg">
                <pre className="text-xs font-mono whitespace-pre-wrap max-h-[400px] overflow-auto">
                  {outputResult}
                </pre>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              navigator.clipboard.writeText(outputResult);
            }} disabled={!outputResult}>
              复制结果
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Workspace;

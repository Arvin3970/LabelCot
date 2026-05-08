import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { 
  CheckCircle2Icon, Loader2Icon, ChevronLeftIcon, ChevronRightIcon, 
  FolderUpIcon, ImageIcon, FileIcon, FolderIcon, ChevronDownIcon, 
  ChevronRightIcon as TreeChevronIcon, PlusIcon, CheckSquareIcon, XIcon,
  ZoomInIcon, ZoomOutIcon, SparklesIcon, FileJsonIcon,
  DownloadIcon, UploadIcon, BotIcon, CircleIcon, SquareIcon, MinusIcon, Trash2Icon
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import LLMSettings from '@/components/LLMSettings';
import { segmentImage, generateStructuredOutput, callLLM } from '@/services/llm';
import { saveImage, getImage, deleteImagesByPrefix } from '@/utils/imageStorage';
import type { FileNode, DatasetItem, AnnotationResult, AnnotationTemplate, TemplateStorage, LLMConfig } from '@/types/annotation';

const STORAGE_KEY = 'labelcot_templates';
const WORKSPACE_STATE_KEY = 'labelcot_workspace_state';
const WORKSPACE_FILES_KEY = 'labelcot_workspace_files';
const WORKSPACE_TEMPLATE_ID_KEY = 'labelcot_workspace_template_id';

interface DrawAnnotation {
  id: string;
  type: 'point' | 'rect' | 'line';
  points: number[];
  order: number;
  pointSize?: number;
}

interface WorkspacePersistState {
  formData: Record<string, string | string[]>;
  segmentPromptOverride: string;
  cotPromptOverride: string;
  segmentAnnotations: Array<{ label: string; bbox?: [number, number, number, number]; confidence?: number }>;
  drawAnnotations: DrawAnnotation[];
  segmentError: string;
  cotError: string;
  lastItemId: string | null;
  savedAt: string;
}

interface FileNodeData {
  id: string;
  name: string;
  type: 'file' | 'folder';
  path: string;
  children?: FileNodeData[];
}

interface WorkspaceFilesState {
  templateId: string;
  items: DatasetItem[];
  results: AnnotationResult[];
  currentIndex: number;
  fileNodes: FileNodeData[];
  savedAt: string;
}

const saveWorkspaceState = (templateId: string, itemId: string, state: Partial<WorkspacePersistState>) => {
  try {
    const allStates = JSON.parse(localStorage.getItem(WORKSPACE_STATE_KEY) || '{}');
    const key = `${templateId}_${itemId}`;
    allStates[key] = {
      ...allStates[key],
      ...state,
      lastItemId: itemId,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(WORKSPACE_STATE_KEY, JSON.stringify(allStates));
  } catch (error) {
    console.error('Failed to save workspace state:', error);
  }
};

const loadWorkspaceState = (templateId: string, itemId: string): WorkspacePersistState | null => {
  try {
    const allStates = JSON.parse(localStorage.getItem(WORKSPACE_STATE_KEY) || '{}');
    const key = `${templateId}_${itemId}`;
    return allStates[key] || null;
  } catch (error) {
    console.error('Failed to load workspace state:', error);
    return null;
  }
};

const flattenAllNodes = (nodes: FileNode[]): FileNode[] => {
  const result: FileNode[] = [];
  for (const node of nodes) {
    result.push(node);
    if (node.children) {
      result.push(...flattenAllNodes(node.children));
    }
  }
  return result;
};

const flattenFileNodes = (nodes: FileNode[]): FileNode[] => {
  const result: FileNode[] = [];
  for (const node of nodes) {
    if (node.type === 'file') {
      result.push(node);
    } else if (node.children) {
      result.push(...flattenFileNodes(node.children));
    }
  }
  return result;
};

const saveWorkspaceFiles = async (templateId: string, data: { items: DatasetItem[]; results: AnnotationResult[]; currentIndex: number; fileNodes: FileNode[] }) => {
  try {
    const allFiles = JSON.parse(localStorage.getItem(WORKSPACE_FILES_KEY) || '{}');
    const allNodes = flattenAllNodes(data.fileNodes);
    const serializeFileNodes = (nodes: FileNode[]): FileNodeData[] => {
      return nodes.map(node => ({
        id: node.id,
        name: node.name,
        type: node.type,
        path: node.path,
      }));
    };
    
    for (const item of data.items) {
      if (item.imageData) {
        await saveImage(item.id, item.imageData);
      }
    }
    
    const serializedItems = data.items.map(item => ({
      id: item.id,
      fileName: item.fileName,
      status: item.status,
      templateId: item.templateId,
      textContent: item.textContent,
    }));
    
    allFiles[templateId] = {
      templateId,
      items: serializedItems,
      results: data.results,
      currentIndex: data.currentIndex,
      fileNodes: serializeFileNodes(allNodes),
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(WORKSPACE_FILES_KEY, JSON.stringify(allFiles));
  } catch (error) {
    console.error('Failed to save workspace files:', error);
  }
};

const loadWorkspaceFiles = (templateId: string): WorkspaceFilesState | null => {
  try {
    const allFiles = JSON.parse(localStorage.getItem(WORKSPACE_FILES_KEY) || '{}');
    return allFiles[templateId] || null;
  } catch (error) {
    console.error('Failed to load workspace files:', error);
    return null;
  }
};

const saveSelectedTemplateId = (templateId: string) => {
  try {
    localStorage.setItem(WORKSPACE_TEMPLATE_ID_KEY, templateId);
  } catch (error) {
    console.error('Failed to save selected template ID:', error);
  }
};

const loadSelectedTemplateId = (): string | null => {
  try {
    return localStorage.getItem(WORKSPACE_TEMPLATE_ID_KEY);
  } catch (error) {
    console.error('Failed to load selected template ID:', error);
    return null;
  }
};

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
        globalSegmentPrompt: t.globalSegmentPrompt || '',
        globalCOTPrompt: t.globalCOTPrompt || '',
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
  
  const [segmentLoading, setSegmentLoading] = useState(false);
  const [segmentError, setSegmentError] = useState<string>('');
  const [segmentAnnotations, setSegmentAnnotations] = useState<Array<{ label: string; bbox?: [number, number, number, number]; confidence?: number }>>([]);
  const imageCanvasRef = useRef<HTMLCanvasElement>(null);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  
  const [drawTool, setDrawTool] = useState<'point' | 'rect' | 'line' | 'none'>('none');
  const [drawAnnotations, setDrawAnnotations] = useState<Array<{
    id: string;
    type: 'point' | 'rect' | 'line';
    points: number[];
    order: number;
    pointSize?: number;
  }>>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [pointSize, setPointSize] = useState<number>(6);
  const [showPointSizeSettings, setShowPointSizeSettings] = useState<boolean>(false);
  const pointSizeRef = useRef<HTMLDivElement>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);
  
  const [cotLoading, setCotLoading] = useState(false);
  const [cotError, setCotError] = useState<string>('');
  
  const [globalSegmentPromptOverride, setGlobalSegmentPromptOverride] = useState<string>('');
  const [globalCOTPromptOverride, setGlobalCOTPromptOverride] = useState<string>('');
  const [duplicateFiles, setDuplicateFiles] = useState<string[]>([]);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [deleteConfirmFolder, setDeleteConfirmFolder] = useState<string | null>(null);
  const [deleteFolderName, setDeleteFolderName] = useState<string>('');
  
const annotationImportRef = useRef<HTMLInputElement>(null);

const buildTreeFromNodes = (nodes: FileNodeData[]): FileNode[] => {
  const root: FileNode = { id: '', name: '', type: 'folder', path: '', children: [] };
  const map = new Map<string, FileNode>();
  map.set('', root);

  const sortedNodes = [...nodes].sort((a, b) => {
    const aDepth = a.path.split('/').length;
    const bDepth = b.path.split('/').length;
    return aDepth - bDepth;
  });

  for (const node of sortedNodes) {
    const fileNode: FileNode = {
      id: node.id,
      name: node.name,
      type: node.type,
      path: node.path,
      children: node.type === 'folder' ? [] : undefined,
    };
    map.set(node.path, fileNode);

    const parentPath = node.path.split('/').slice(0, -1).join('/');
    const parent = map.get(parentPath) || root;
    if (parent.children) {
      parent.children.push(fileNode);
    }
  }

  return root.children || [];
};

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
  
  useEffect(() => {
    const loadWorkspace = async () => {
      const loadedTemplates = loadTemplates();
      setTemplates(loadedTemplates);
      
      const state = location.state as any;
      let templateId: string | null = null;
      
      if (state?.templateId) {
        templateId = state.templateId;
      } else {
        templateId = loadSelectedTemplateId();
      }
      
      const templateExists = loadedTemplates.some((t: AnnotationTemplate) => t.id === templateId);
      if (templateId && templateExists) {
        setSelectedTemplateId(templateId);
        saveSelectedTemplateId(templateId);
        
        const savedFiles = loadWorkspaceFiles(templateId);
        if (savedFiles && savedFiles.items.length > 0) {
          const restoredFiles = buildTreeFromNodes(savedFiles.fileNodes || []);
          
          const itemsWithImages = await Promise.all(
            savedFiles.items.map(async (item) => {
              const imageData = await getImage(item.id);
              return { ...item, imageData: imageData || undefined };
            })
          );
          
          setTemplateStorage(prev => ({
            ...prev,
            [templateId!]: {
              files: restoredFiles,
              items: itemsWithImages,
              results: savedFiles.results,
              currentIndex: savedFiles.currentIndex
            }
          }));
        } else {
          setTemplateStorage(prev => ({
            ...prev,
            [templateId!]: prev[templateId!] || {
              files: [],
              items: [],
              results: [],
              currentIndex: 0
            }
          }));
        }
        
        const template = loadedTemplates.find((t: AnnotationTemplate) => t.id === templateId);
        if (template?.llmConfigs && template.llmConfigs.length > 0) {
          setLlmConfig(template.llmConfigs[0]);
        }
      }
    };
    loadWorkspace();
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

  useEffect(() => {
    if (selectedTemplateId && currentItem?.id) {
      const savedState = loadWorkspaceState(selectedTemplateId, currentItem.id);
      if (savedState) {
        setFormData(savedState.formData || {});
        setGlobalSegmentPromptOverride(savedState.segmentPromptOverride || '');
        setGlobalCOTPromptOverride(savedState.cotPromptOverride || '');
        setSegmentAnnotations(savedState.segmentAnnotations || []);
        setDrawAnnotations(savedState.drawAnnotations || []);
        setSegmentError(savedState.segmentError || '');
        setCotError(savedState.cotError || '');
      } else {
        setFormData({});
        setGlobalSegmentPromptOverride('');
        setGlobalCOTPromptOverride('');
        setSegmentAnnotations([]);
        setDrawAnnotations([]);
        setSegmentError('');
        setCotError('');
      }
    }
  }, [selectedTemplateId, currentItem?.id, templates]);

  useEffect(() => {
    if (selectedTemplateId && currentItem?.id) {
      saveWorkspaceState(selectedTemplateId, currentItem.id, {
        formData,
        segmentPromptOverride: globalSegmentPromptOverride,
        cotPromptOverride: globalCOTPromptOverride,
        segmentAnnotations,
        drawAnnotations,
        segmentError,
        cotError,
      });
    }
  }, [formData, globalSegmentPromptOverride, globalCOTPromptOverride, segmentAnnotations, drawAnnotations, segmentError, cotError, selectedTemplateId, currentItem?.id]);

  useEffect(() => {
    if (selectedTemplateId && currentStorage && currentStorage.items.length > 0) {
      saveWorkspaceFiles(selectedTemplateId, {
        items: currentStorage.items,
        results: currentStorage.results,
        currentIndex: currentStorage.currentIndex,
        fileNodes: currentStorage.files,
      });
    }
  }, [currentStorage, selectedTemplateId]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pointSizeRef.current && !pointSizeRef.current.contains(e.target as Node)) {
        setShowPointSizeSettings(false);
      }
    };
    if (showPointSizeSettings) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showPointSizeSettings]);

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
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        setTemplateStorage(prev => ({
          ...prev,
          [selectedTemplateId]: {
            ...prev[selectedTemplateId],
            items: prev[selectedTemplateId].items.map(i =>
              i.id === item.id ? { ...i, imageData: dataUrl, loaded: true } : i
            )
          }
        }));
      };
      reader.readAsDataURL(file);
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

    const currentStorage = templateStorage[selectedTemplateId];
    const existingPaths = new Set(currentStorage?.items?.map(item => item.fileName) || []);

    const validFiles: File[] = [];
    const duplicates: string[] = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const isImage = selectedTemplate.dataType === 'image' && file.type.startsWith('image/');
      const isText = selectedTemplate.dataType === 'text' && (file.type === 'text/plain' || file.name.endsWith('.txt'));
      if (!isImage && !isText) continue;
      
      if (existingPaths.has(file.name)) {
        duplicates.push(file.name);
      } else {
        validFiles.push(file);
      }
    }

    if (duplicates.length > 0) {
      setDuplicateFiles(duplicates);
      setPendingFiles(validFiles);
      setShowDuplicateDialog(true);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (validFiles.length === 0) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    await processFilesUpload(validFiles);
  };

  const processFilesUpload = async (files: File[]) => {
    if (files.length === 0 || !selectedTemplate) return;

    setUploadProgress({ current: 0, total: files.length, visible: true });

    const items: DatasetItem[] = [];
    const results: AnnotationResult[] = [];
    const fileNodes: FileNode[] = [];
    const currentStorage = templateStorage[selectedTemplateId];
    const existingNodes = flattenFileNodes(currentStorage?.files || []);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileWithPath = file as File & { webkitRelativePath?: string };
      const relativePath = fileWithPath.webkitRelativePath || file.name;
      const itemId = `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      let imageData: string | undefined;
      let textContent: string | undefined;
      
      if (selectedTemplate.dataType === 'image' && file.type.startsWith('image/')) {
        imageData = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
      } else if (selectedTemplate.dataType === 'text') {
        textContent = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsText(file);
        });
      }
      
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
        loaded: true,
        file,
        imageData,
        textContent,
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

    const allNodes = [...existingNodes, ...fileNodes];
    
    setTemplateStorage(prev => ({
      ...prev,
      [selectedTemplateId]: {
        ...prev[selectedTemplateId],
        files: buildTree(allNodes),
        items: [...prev[selectedTemplateId].items, ...items],
        results: [...prev[selectedTemplateId].results, ...results]
      }
    }));
    
    setUploadProgress(prev => ({ ...prev, current: files.length }));
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

  const handleDeleteFolder = (folderPath: string, folderName: string) => {
    setDeleteConfirmFolder(folderPath);
    setDeleteFolderName(folderName);
  };

  const confirmDeleteFolder = () => {
    if (!deleteConfirmFolder || !selectedTemplateId) return;

    const folderPath = deleteConfirmFolder;
    const folderName = folderPath.split('/').pop()!;

    try {
      const allStates = JSON.parse(localStorage.getItem(WORKSPACE_STATE_KEY) || '{}');
      const itemsToDelete = templateStorage[selectedTemplateId]?.items.filter(i => 
        i.fileName.startsWith(folderPath + '/') || i.fileName.startsWith(folderName + '/')
      ) || [];
      const itemIdsToDelete = new Set(itemsToDelete.map(i => i.id));
      
      Object.keys(allStates).forEach(key => {
        if (key.startsWith(selectedTemplateId + '_')) {
          const itemId = key.replace(selectedTemplateId + '_', '');
          if (itemIdsToDelete.has(itemId)) {
            delete allStates[key];
          }
        }
      });
      localStorage.setItem(WORKSPACE_STATE_KEY, JSON.stringify(allStates));
    } catch (error) {
      console.error('Failed to clean up workspace states:', error);
    }

    const storage = templateStorage[selectedTemplateId];
    const itemsToDelete = storage.items.filter(i => 
      i.fileName.startsWith(folderPath + '/') || i.fileName.startsWith(folderName + '/')
    );
    itemsToDelete.forEach(item => {
      if (item.id) {
        deleteImagesByPrefix(item.id).catch(err => console.error('Failed to delete image:', err));
      }
    });

    setTemplateStorage(prev => {
      const storage = prev[selectedTemplateId];
      const newItems = storage.items.filter(i => !i.fileName.startsWith(folderPath + '/') && !i.fileName.startsWith(folderName + '/'));
      const newResults = storage.results.filter(r => {
        const item = storage.items.find(i => i.id === r.itemId);
        return item && !item.fileName.startsWith(folderPath + '/') && !item.fileName.startsWith(folderName + '/');
      });
      const existingNodes = flattenFileNodes(storage.files);
      const newNodes = existingNodes.filter(n => !n.path.startsWith(folderPath + '/') && n.path !== folderPath);
      
      let newIndex = storage.currentIndex;
      if (newIndex >= newItems.length) {
        newIndex = Math.max(0, newItems.length - 1);
      }

      return {
        ...prev,
        [selectedTemplateId]: {
          ...storage,
          items: newItems,
          results: newResults,
          files: buildTree(newNodes),
          currentIndex: newIndex
        }
      };
    });

    setDeleteConfirmFolder(null);
    setDeleteFolderName('');
  };

  const handleDuplicateDialogConfirm = async () => {
    setShowDuplicateDialog(false);
    setDuplicateFiles([]);
    if (pendingFiles.length > 0) {
      await processFilesUpload(pendingFiles);
    }
    setPendingFiles([]);
  };

  const handleDuplicateDialogCancel = () => {
    setShowDuplicateDialog(false);
    setDuplicateFiles([]);
    setPendingFiles([]);
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

  const getCanvasCoordinates = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (drawTool === 'none') return;
    const coords = getCanvasCoordinates(e);
    if (!coords) return;
    
    setIsDrawing(true);
    setDrawStart(coords);
    
    if (drawTool === 'point') {
      const newAnnotation = {
        id: `ann-${Date.now()}`,
        type: 'point' as const,
        points: [coords.x, coords.y],
        order: drawAnnotations.length + 1,
        pointSize: pointSize
      };
      setDrawAnnotations(prev => [...prev, newAnnotation]);
      setIsDrawing(false);
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || drawTool === 'none' || drawTool === 'point') return;
    const coords = getCanvasCoordinates(e);
    if (!coords || !drawStart) return;
    
    redrawCanvas();
    const ctx = drawCanvasRef.current?.getContext('2d');
    if (!ctx) return;
    
    ctx.strokeStyle = '#165DFF';
    ctx.lineWidth = 2;
    
    if (drawTool === 'rect') {
      ctx.strokeRect(drawStart.x, drawStart.y, coords.x - drawStart.x, coords.y - drawStart.y);
    } else if (drawTool === 'line') {
      ctx.beginPath();
      ctx.moveTo(drawStart.x, drawStart.y);
      ctx.lineTo(coords.x, coords.y);
      ctx.stroke();
    }
  };

  const handleCanvasMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || drawTool === 'none') return;
    const coords = getCanvasCoordinates(e);
    if (!coords) {
      setIsDrawing(false);
      return;
    }
    
    if (drawTool === 'rect' && drawStart) {
      const newAnnotation = {
        id: `ann-${Date.now()}`,
        type: 'rect' as const,
        points: [drawStart.x, drawStart.y, coords.x, coords.y],
        order: drawAnnotations.length + 1
      };
      setDrawAnnotations(prev => [...prev, newAnnotation]);
    } else if (drawTool === 'line' && drawStart) {
      const newAnnotation = {
        id: `ann-${Date.now()}`,
        type: 'line' as const,
        points: [drawStart.x, drawStart.y, coords.x, coords.y],
        order: drawAnnotations.length + 1
      };
      setDrawAnnotations(prev => [...prev, newAnnotation]);
    }
    
    setIsDrawing(false);
    setDrawStart(null);
  };

  const redrawCanvas = useCallback(() => {
    const canvas = drawCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !currentItem?.imageData) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    for (const ann of drawAnnotations) {
      ctx.strokeStyle = '#165DFF';
      ctx.fillStyle = '#165DFF';
      ctx.lineWidth = 2;
      ctx.font = 'bold 14px sans-serif';
      
      if (ann.type === 'point') {
        const size = ann.pointSize || 6;
        ctx.beginPath();
        ctx.arc(ann.points[0], ann.points[1], size, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillText(`${ann.order}`, ann.points[0] + size + 4, ann.points[1] - size - 2);
      } else if (ann.type === 'rect') {
        const [x1, y1, x2, y2] = ann.points;
        const x = Math.min(x1, x2);
        const y = Math.min(y1, y2);
        const w = Math.abs(x2 - x1);
        const h = Math.abs(y2 - y1);
        ctx.strokeRect(x, y, w, h);
        ctx.fillText(`${ann.order}`, x + 4, y - 6);
      } else if (ann.type === 'line') {
        ctx.beginPath();
        ctx.moveTo(ann.points[0], ann.points[1]);
        ctx.lineTo(ann.points[2], ann.points[3]);
        ctx.stroke();
        ctx.fillText(`${ann.order}`, ann.points[0] + 6, ann.points[1] - 6);
      }
    }
  }, [drawAnnotations, currentItem?.imageData]);

  useEffect(() => {
    if (drawAnnotations.length > 0 && currentItem?.imageData && imageDimensions.width > 0) {
      redrawCanvas();
    }
  }, [drawAnnotations, currentItem?.imageData, imageDimensions, redrawCanvas]);

  useEffect(() => {
    if (currentItem?.imageData && drawCanvasRef.current) {
      const img = new Image();
      img.onload = () => {
        const canvas = drawCanvasRef.current;
        if (canvas) {
          canvas.width = img.width;
          canvas.height = img.height;
          setImageDimensions({ width: img.width, height: img.height });
          if (drawAnnotations.length > 0) {
            redrawCanvas();
          }
        }
      };
      img.src = currentItem.imageData;
    }
  }, [currentItem?.imageData, drawAnnotations, redrawCanvas]);

  const deleteAnnotation = (id: string) => {
    setDrawAnnotations(prev => {
      const filtered = prev.filter(a => a.id !== id);
      return filtered.map((a, idx) => ({ ...a, order: idx + 1 }));
    });
  };

  const clearAllAnnotations = () => {
    setDrawAnnotations([]);
    const ctx = drawCanvasRef.current?.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }
  };

  const drawAnnotationsOnCanvas = useCallback((imageData: string, annotations: typeof segmentAnnotations) => {
    const canvas = imageCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !imageData || annotations.length === 0) return;

    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      const colors = [
        { border: '#3B82F6', fill: 'rgba(59, 130, 246, 0.15)', label: '#3B82F6' },
        { border: '#10B981', fill: 'rgba(16, 185, 129, 0.15)', label: '#10B981' },
        { border: '#F59E0B', fill: 'rgba(245, 158, 11, 0.15)', label: '#F59E0B' },
        { border: '#EF4444', fill: 'rgba(239, 68, 68, 0.15)', label: '#EF4444' },
        { border: '#8B5CF6', fill: 'rgba(139, 92, 246, 0.15)', label: '#8B5CF6' },
      ];

      annotations.forEach((ann, idx) => {
        const color = colors[idx % colors.length];
        
        if (ann.bbox) {
          const [x1, y1, x2, y2] = ann.bbox;
          
          ctx.fillStyle = color.fill;
          ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
          
          ctx.strokeStyle = color.border;
          ctx.lineWidth = 3;
          ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

          const labelText = ann.confidence 
            ? `${ann.label} (${(ann.confidence * 100).toFixed(0)}%)`
            : ann.label;
          
          ctx.font = 'bold 14px Arial';
          const textMetrics = ctx.measureText(labelText);
          const textWidth = textMetrics.width + 8;
          const textHeight = 20;
          
          ctx.fillStyle = color.label;
          ctx.fillRect(x1, y1 - textHeight - 4, textWidth, textHeight);
          
          ctx.fillStyle = '#FFFFFF';
          ctx.fillText(labelText, x1 + 4, y1 - 8);
        }
      });
    };
    img.src = imageData;
  }, []);

  useEffect(() => {
    if (segmentAnnotations.length > 0 && currentItem?.imageData) {
      drawAnnotationsOnCanvas(currentItem.imageData, segmentAnnotations);
    }
  }, [segmentAnnotations, currentItem?.imageData, drawAnnotationsOnCanvas]);

  useEffect(() => {
    if (currentItem?.imageData) {
      const img = new window.Image();
      img.onload = () => {
        setImageDimensions({ width: img.width, height: img.height });
      };
      img.src = currentItem.imageData;
    }
  }, [currentItem?.imageData]);

  const handleMedicalImageSegment = async () => {
    if (!currentItem?.imageData || !selectedTemplate) return;
    
    setSegmentLoading(true);
    setSegmentError('');
    setSegmentAnnotations([]);
    
    try {
      const visionConfig = selectedTemplate.llmConfigs?.find(c => c.supportsVision);
      if (!visionConfig) {
        throw new Error('未配置视觉模型，请在模板中添加支持视觉的模型');
      }
      
      const promptText = globalSegmentPromptOverride || selectedTemplate.globalSegmentPrompt || '分析医学影像，识别主要解剖结构和异常区域，提供详细描述和诊断建议。';
      
      const response = await callLLM(
        visionConfig,
        [
          {
            role: 'system',
            content: '你是专业医学影像分析助手。分析医学影像，返回JSON格式结果，包含病灶/器官的标注信息。返回格式：{"annotations":[{"label":"病灶名称","description":"详细描述","confidence":0.95}]}',
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: promptText },
              { type: 'image_url', image_url: { url: currentItem.imageData } },
            ],
          },
        ],
        { jsonMode: true }
      );
      
      const result = JSON.parse(response.content);
      
      if (result.annotations && Array.isArray(result.annotations)) {
        const annotationsWithBbox = result.annotations.map((ann: any, idx: number) => {
          if (!ann.bbox && imageDimensions.width > 0 && imageDimensions.height > 0) {
            const boxWidth = imageDimensions.width * 0.15;
            const boxHeight = imageDimensions.height * 0.15;
            const x = (idx % 3) * (imageDimensions.width / 3) + (imageDimensions.width / 6) - (boxWidth / 2);
            const y = Math.floor(idx / 3) * (imageDimensions.height / 3) + (imageDimensions.height / 6) - (boxHeight / 2);
            return {
              ...ann,
              bbox: [x, y, x + boxWidth, y + boxHeight] as [number, number, number, number]
            };
          }
          return ann;
        });
        setSegmentAnnotations(annotationsWithBbox);
      } else {
        throw new Error('返回数据格式错误');
      }
    } catch (error) {
      setSegmentError((error as Error).message);
    } finally {
      setSegmentLoading(false);
    }
  };

  const handleCOTGenerate = async () => {
    if (!selectedTemplate || !currentItem) return;
    
    setCotLoading(true);
    setCotError('');
    
    try {
      const config = selectedTemplate.llmConfigs?.[0] || llmConfig;
      const visionConfig = selectedTemplate.llmConfigs?.find(c => c.supportsVision);
      
      const updates: Record<string, string | string[]> = {};
      const promptText = globalCOTPromptOverride || selectedTemplate.globalCOTPrompt || '';
      
      for (const field of selectedTemplate.fields) {
        let messages = [];
        
        if (selectedTemplate.dataType === 'image' && currentItem.imageData && visionConfig) {
          const systemPrompt = promptText || '你是医学数据标注助手，根据医学影像分析结果生成结构化标注内容。';
          const userPrompt = `请为字段"${field.label}"生成标注内容。`;
          
          messages = [
            { role: 'system' as const, content: systemPrompt },
            {
              role: 'user' as const,
              content: [
                { type: 'text' as const, text: userPrompt },
                { type: 'image_url' as const, image_url: { url: currentItem.imageData } },
              ],
            },
          ];
          
          const response = await callLLM(visionConfig, messages);
          updates[field.id] = response.content.trim();
        } else if (selectedTemplate.dataType === 'text' && currentItem.content) {
          const systemPrompt = promptText || '你是医学数据标注助手，根据文本内容生成结构化标注内容。';
          const userPrompt = `请为字段"${field.label}"生成标注内容。\n\n文本内容：\n${currentItem.content}`;
          
          messages = [
            { role: 'system' as const, content: systemPrompt },
            { role: 'user' as const, content: userPrompt },
          ];
          
          const response = await callLLM(config, messages);
          updates[field.id] = response.content.trim();
        }
      }
      
      setFormData(prev => ({ ...prev, ...updates }));
    } catch (error) {
      setCotError((error as Error).message);
    } finally {
      setCotLoading(false);
    }
  };

  const handleExportAnnotations = () => {
    const annotatedItems = currentStorage?.items.filter(item => item.status === 'annotated') || [];
    if (annotatedItems.length === 0) {
      alert('没有已标注的数据可导出');
      return;
    }

    const exportData = {
      templateId: selectedTemplateId,
      templateName: selectedTemplate?.name,
      exportedAt: new Date().toISOString(),
      items: annotatedItems.map(item => ({
        id: item.id,
        fileName: item.fileName,
        status: item.status,
      })),
      results: annotatedItems.map(item => {
        const result = currentStorage?.results.find(r => r.itemId === item.id);
        const stateKey = `${selectedTemplateId}_${item.id}`;
        
        let itemState: WorkspacePersistState | null = null;
        try {
          const allStates = JSON.parse(localStorage.getItem(WORKSPACE_STATE_KEY) || '{}');
          itemState = allStates[stateKey] || null;
        } catch (e) {
          console.error('Failed to load item state:', e);
        }
        
        const formData = itemState?.formData || {};
        const labeledData: Record<string, string | string[]> = {};
        
        selectedTemplate?.fields.forEach(field => {
          const value = formData[field.id];
          if (value !== undefined && value !== null) {
            labeledData[field.label] = value;
          } else {
            labeledData[field.label] = field.type === 'checkbox' ? [] : '';
          }
        });
        
        return {
          itemId: item.id,
          templateId: selectedTemplateId,
          data: {
            segmentation: itemState?.drawAnnotations?.map((ann: DrawAnnotation) => ({
              pointId: ann.order,
              type: ann.type,
              coordinates: ann.points,
              pointSize: ann.pointSize,
            })) || [],
            ...labeledData,
          },
          updatedAt: result?.updatedAt || new Date().toISOString(),
        };
      }),
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
          
          const newResults: AnnotationResult[] = [];
          const itemIdMapping: Record<string, string> = {};
          
          data.items.forEach((importItem: { id: string; fileName: string }) => {
            const existingItem = prev[selectedTemplateId]?.items.find(i => i.fileName === importItem.fileName);
            if (existingItem) {
              itemIdMapping[importItem.id] = existingItem.id;
            }
          });
          
          data.results.forEach((r: { itemId: string; templateId: string; data: Record<string, unknown>; updatedAt: string }) => {
            const mappedItemId = itemIdMapping[r.itemId];
            if (!mappedItemId || existingIds.has(mappedItemId)) return;
            
            const { segmentation, ...restData } = r.data;
            
            const formData: Record<string, string | string[]> = {};
            selectedTemplate?.fields.forEach(field => {
              if (restData[field.label] !== undefined) {
                formData[field.id] = restData[field.label] as string | string[];
              }
            });
            
            newResults.push({
              itemId: mappedItemId,
              templateId: selectedTemplateId,
              data: formData,
              updatedAt: r.updatedAt,
            });
            
            const stateKey = `${selectedTemplateId}_${mappedItemId}`;
            
            const drawAnnotations: DrawAnnotation[] = segmentation && Array.isArray(segmentation)
              ? segmentation.map((seg: { pointId: number; type: string; coordinates: number[]; pointSize?: number }) => ({
                  id: `ann-${Date.now()}-${seg.pointId}`,
                  type: seg.type as 'point' | 'rect' | 'line',
                  points: seg.coordinates,
                  order: seg.pointId,
                  pointSize: seg.pointSize,
                }))
              : [];
            
            try {
              const allStates = JSON.parse(localStorage.getItem(WORKSPACE_STATE_KEY) || '{}');
              allStates[stateKey] = {
                ...allStates[stateKey],
                formData,
                drawAnnotations,
                lastItemId: mappedItemId,
                savedAt: new Date().toISOString(),
              };
              localStorage.setItem(WORKSPACE_STATE_KEY, JSON.stringify(allStates));
            } catch (e) {
              console.error('Failed to save item state:', e);
            }
          });
          
          const mappedItemIds = new Set(Object.values(itemIdMapping));
          
          return {
            ...prev,
            [selectedTemplateId]: {
              ...prev[selectedTemplateId],
              results: [...existingResults, ...newResults],
              items: prev[selectedTemplateId].items.map(item => {
                return mappedItemIds.has(item.id) ? { ...item, status: 'annotated' as const } : item;
              }),
            }
          };
        });

        if (currentItem) {
          const stateKey = `${selectedTemplateId}_${currentItem.id}`;
          try {
            const allStates = JSON.parse(localStorage.getItem(WORKSPACE_STATE_KEY) || '{}');
            const currentState = allStates[stateKey];
            if (currentState) {
              setFormData(currentState.formData || {});
              setDrawAnnotations(currentState.drawAnnotations || []);
            }
          } catch (e) {
            console.error('Failed to reload current item state:', e);
          }
        }

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
      const matchingItem = node.type === 'file' 
        ? currentStorage.items.find(item => item.fileName === node.name || item.id === node.id)
        : null;
      const matchingItemIndex = matchingItem 
        ? currentStorage.items.findIndex(item => item.id === matchingItem.id)
        : -1;
      const isAnnotated = matchingItem?.status === 'annotated';
      
      return (
        <div key={node.id}>
          <div 
            className={`flex items-center gap-2 py-1.5 px-2 rounded hover:bg-secondary/50 cursor-pointer group ${
              matchingItemIndex !== -1 && matchingItemIndex === currentIndex ? 'bg-primary/10' : ''
            } ${isAnnotated ? 'bg-emerald-50/70 border-l-2 border-emerald-400' : matchingItem ? 'bg-amber-50/60 border-l-2 border-amber-300' : ''}`}
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
                  <ImageIcon size={16} className={isAnnotated ? 'text-emerald-500' : matchingItem ? 'text-amber-400' : 'text-muted-foreground'} />
                ) : (
                  <FileIcon size={16} className={isAnnotated ? 'text-emerald-500' : matchingItem ? 'text-amber-400' : 'text-muted-foreground'} />
                )}
              </>
            )}
            <span className={`text-sm truncate flex-1 ${isAnnotated ? 'text-emerald-600 font-medium' : matchingItem ? 'text-amber-600' : ''}`}>
              {node.name}
            </span>
            {node.type === 'folder' && (
              <button
                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 rounded transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteFolder(node.path, node.name);
                }}
                title="删除文件夹"
              >
                <XIcon size={14} className="text-red-500" />
              </button>
            )}
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
            <div className="flex items-center justify-between">
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
          </div>

          <ScrollArea className="flex-1">
            {currentStorage.files.length > 0 ? (
              <div className="p-2">
                {renderFileTree(currentStorage.files)}
              </div>
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
                    <div className="flex gap-2 items-center">
                      <div className="flex gap-1 border-r border-gray-300 pr-2 mr-2">
                        <Button 
                          variant={drawTool === 'none' ? 'secondary' : 'ghost'} 
                          size="sm" 
                          className="h-8 w-8 p-0"
                          onClick={() => setDrawTool('none')}
                          title="选择工具"
                        >
                          <CheckSquareIcon size={14} />
                        </Button>
                        <div className="relative" ref={pointSizeRef}>
                          <Button 
                            variant={drawTool === 'point' ? 'secondary' : 'ghost'} 
                            size="sm" 
                            className="h-8 w-8 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDrawTool('point');
                              setShowPointSizeSettings(!showPointSizeSettings);
                            }}
                            title="点标注"
                          >
                            <CircleIcon size={14} />
                          </Button>
                          {showPointSizeSettings && (
                            <div className="absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-3 z-50">
                              <div className="flex items-center gap-2 whitespace-nowrap">
                                <span className="text-xs text-gray-500">点大小:</span>
                                <input
                                  type="range"
                                  min="2"
                                  max="20"
                                  value={pointSize}
                                  onChange={e => setPointSize(Number(e.target.value))}
                                  className="w-24 h-2"
                                />
                                <span className="text-xs w-6 text-center">{pointSize}</span>
                              </div>
                            </div>
                          )}
                        </div>
                        <Button 
                          variant={drawTool === 'rect' ? 'secondary' : 'ghost'} 
                          size="sm" 
                          className="h-8 w-8 p-0"
                          onClick={() => setDrawTool('rect')}
                          title="矩形框标注"
                        >
                          <SquareIcon size={14} />
                        </Button>
                        <Button 
                          variant={drawTool === 'line' ? 'secondary' : 'ghost'} 
                          size="sm" 
                          className="h-8 w-8 p-0"
                          onClick={() => setDrawTool('line')}
                          title="线条标注"
                        >
                          <MinusIcon size={14} />
                        </Button>
                       </div>
                      <Button
                        variant="outline" 
                        size="sm" 
                        className="h-8 text-xs text-red-600 hover:bg-red-50"
                        onClick={clearAllAnnotations}
                      >
                        清除
                      </Button>
                      <div className="flex gap-1 border-l border-gray-300 pl-2 ml-2">
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
                    </div>
                  )}
                </div>

                <div className="flex-1 overflow-auto flex items-center justify-center">
                  {selectedTemplate.dataType === 'image' ? (
                    currentItem?.imageData ? (
                      <div className="relative inline-block">
                        <img 
                          src={currentItem.imageData} 
                          alt={currentItem.fileName}
                          className="max-w-full h-auto rounded-lg shadow-lg"
                          style={{ display: 'none' }}
                        />
                        <canvas
                          ref={drawCanvasRef}
                          className="max-w-full h-auto rounded-lg shadow-lg cursor-crosshair"
                          style={{ 
                            transform: `scale(${imageZoom})`,
                            transformOrigin: 'center',
                            backgroundImage: `url(${currentItem.imageData})`,
                            backgroundSize: '100% 100%'
                          }}
                          onMouseDown={handleCanvasMouseDown}
                          onMouseMove={handleCanvasMouseMove}
                          onMouseUp={handleCanvasMouseUp}
                          onMouseLeave={handleCanvasMouseUp}
                        />
                        {segmentAnnotations.length > 0 && (
                          <canvas
                            ref={imageCanvasRef}
                            className="max-w-full h-auto rounded-lg shadow-lg absolute top-0 left-0"
                            style={{ transform: `scale(${imageZoom})` }}
                          />
                        )}
                      </div>
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

          <div className="w-[420px] bg-white overflow-y-auto shrink-0 flex flex-col border-l border-gray-200">
            <div className="p-4 border-b border-gray-200 bg-[#F5F7FA]">
              <h2 className="text-lg font-bold flex items-center gap-2 text-gray-800">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{backgroundColor: 'rgba(22, 93, 255, 0.1)'}}>
                  <CheckSquareIcon style={{color: '#165DFF'}} size={18} />
                </div>
                医学标注面板
              </h2>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {selectedTemplate.dataType === 'image' && selectedTemplate.llmConfigs?.some(c => c.supportsVision) && selectedTemplate.useLLM && (
                <div className="bg-[#F5F7FA] rounded-lg border border-gray-300 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{backgroundColor: '#165DFF'}}>
                      <ImageIcon className="text-white" size={14} />
                    </div>
                    <h3 className="text-base font-bold text-gray-800">医学影像分割</h3>
                  </div>
                  
                  <p className="text-xs text-gray-600 mb-3">
                    自动识别病灶/器官位置，生成可视化标注框
                  </p>
                  
                  <div className="space-y-2 mb-3">
                    <Label className="text-xs font-semibold text-gray-700">分割提示词</Label>
                    <Textarea
                      placeholder={selectedTemplate.globalSegmentPrompt || '输入影像分割提示词...'}
                      className="min-h-[60px] resize-none text-xs bg-white border-gray-300 text-gray-800"
                      value={globalSegmentPromptOverride}
                      onChange={e => setGlobalSegmentPromptOverride(e.target.value)}
                    />
                  </div>
                  
                  <Button
                    className="w-full h-9 text-white text-sm font-semibold shadow-sm hover:opacity-90"
                    style={{backgroundColor: '#165DFF'}}
                    onClick={handleMedicalImageSegment}
                    disabled={segmentLoading || !currentItem?.imageData}
                  >
                    {segmentLoading ? (
                      <>
                        <Loader2Icon className="animate-spin mr-2" size={14} />
                        执行分割中...
                      </>
                    ) : (
                      <>
                        <ImageIcon className="mr-2" size={14} />
                        执行影像分割
                      </>
                    )}
                  </Button>
                  
                  {segmentError && (
                    <div className="mt-2.5 p-2.5 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">
                      ⚠️ {segmentError}
                    </div>
                  )}
                  
                  {segmentAnnotations.length > 0 && (
                    <div className="mt-2.5 p-2.5 bg-white border border-gray-300 rounded-md shadow-sm">
                      <div className="text-xs font-bold text-gray-800 mb-1.5">
                        ✓ 识别完成 ({segmentAnnotations.length} 个区域)
                      </div>
                      <div className="space-y-1 max-h-24 overflow-y-auto">
                        {segmentAnnotations.map((ann, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-xs text-gray-700">
                            <div className="w-1.5 h-1.5 rounded-full" style={{backgroundColor: '#165DFF'}} />
                            <span className="font-medium">{ann.label}</span>
                            {ann.confidence && (
                              <span style={{color: '#165DFF'}}>({(ann.confidence * 100).toFixed(0)}%)</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="bg-[#F5F7FA] rounded-lg border border-gray-300 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-md bg-gray-600 flex items-center justify-center">
                    <CheckCircle2Icon className="text-white" size={14} />
                  </div>
                  <h3 className="text-base font-bold text-gray-800">标注信息录入</h3>
                </div>
                
                <div className="space-y-4">
                  {selectedTemplate.fields.map(field => (
                    <div key={field.id} className="space-y-2">
                      <Label className="text-sm font-semibold flex items-center gap-2">
                        {field.label}
                        {field.type === 'checkbox' && (
                          <span className="text-xs font-normal text-muted-foreground">(可多选)</span>
                        )}
                        {field.enableLLM && (
                          <span className="px-1.5 py-0.5 rounded text-xs font-medium flex items-center gap-1" style={{backgroundColor: 'rgba(22, 93, 255, 0.1)', color: '#165DFF'}}>
                            <BotIcon size={10} />
                            AI
                          </span>
                        )}
                      </Label>

                      {field.type === 'checkbox' && field.options && (
                        <div className="grid grid-cols-2 gap-2">
                          {field.options.split(',').map(opt => {
                            const trimmed = opt.trim();
                            return (
                              <div 
                                key={trimmed}
                                className="flex items-center space-x-2 p-2 rounded-md border border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors"
                              >
                                <Checkbox
                                  id={`${field.id}-${trimmed}`}
                                  checked={(formData[field.id] || []).includes(trimmed)}
                                  onCheckedChange={(checked) => handleCheckboxChange(field.id, trimmed, !!checked)}
                                />
                                <Label
                                  htmlFor={`${field.id}-${trimmed}`}
                                  className="flex-1 cursor-pointer text-xs"
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
                          className="min-h-[100px] resize-y text-sm"
                          value={formData[field.id] || ''}
                          onChange={e => handleFieldChange(field.id, e.target.value)}
                        />
                      )}

                      {field.type === 'text' && (
                        <Input
                          placeholder="请输入..."
                          className="text-sm h-9"
                          value={formData[field.id] || ''}
                          onChange={e => handleFieldChange(field.id, e.target.value)}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {selectedTemplate.useLLM && (
                <div className="bg-[#F5F7FA] rounded-lg border border-gray-300 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{backgroundColor: '#165DFF'}}>
                      <SparklesIcon className="text-white" size={14} />
                    </div>
                    <h3 className="text-base font-bold text-gray-800">COT 标注生成</h3>
                  </div>
                  
                  <p className="text-xs text-gray-600 mb-3">
                    按模板配置智能填充标注项，结果自动写入对应输入框
                  </p>
                  
                  <div className="space-y-2 mb-3">
                    <Label className="text-xs font-semibold text-gray-700">生成提示词</Label>
                    <Textarea
                      placeholder={selectedTemplate.globalCOTPrompt || '输入标注生成提示词...'}
                      className="min-h-[60px] resize-none text-xs bg-white border-gray-300 text-gray-800"
                      value={globalCOTPromptOverride}
                      onChange={e => setGlobalCOTPromptOverride(e.target.value)}
                    />
                  </div>
                  
                  <Button
                    className="w-full h-9 text-white text-sm font-semibold shadow-sm hover:opacity-90"
                    style={{backgroundColor: '#165DFF'}}
                    onClick={handleCOTGenerate}
                    disabled={cotLoading}
                  >
                    {cotLoading ? (
                      <>
                        <Loader2Icon className="animate-spin mr-2" size={14} />
                        生成标注中...
                      </>
                    ) : (
                      <>
                        <SparklesIcon className="mr-2" size={14} />
                        生成标注内容
                      </>
                    )}
                  </Button>
                  
                  {cotError && (
                    <div className="mt-2.5 p-2.5 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">
                      ⚠️ {cotError}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-gray-200 bg-[#F5F7FA]">
              <div className="flex gap-2">
                <Button 
                  className="flex-1 h-10 text-white font-semibold"
                  style={{backgroundColor: '#165DFF'}}
                  onClick={handleMarkAnnotated}
                  disabled={currentItem?.status === 'annotated'}
                >
                  {currentItem?.status === 'annotated' ? '✓ 已完成' : '标记完成'}
                </Button>
                <Button 
                  variant="outline" 
                  className="flex-1 h-10 border-gray-300 text-gray-700 hover:bg-gray-100"
                  onClick={() => navigateItem('next')}
                  disabled={currentIndex >= totalItems - 1}
                >
                  下一条 →
                </Button>
              </div>
            </div>
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

      <Dialog open={showDuplicateDialog} onOpenChange={setShowDuplicateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>发现重复文件</DialogTitle>
            <DialogDescription>
              以下文件已存在，将被跳过：
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-60 overflow-y-auto my-4">
            <ul className="space-y-1">
              {duplicateFiles.map((name, idx) => (
                <li key={idx} className="text-sm text-muted-foreground flex items-center gap-2">
                  <XIcon size={14} className="text-red-500 flex-shrink-0" />
                  <span className="truncate">{name}</span>
                </li>
              ))}
            </ul>
          </div>
          {pendingFiles.length > 0 && (
            <p className="text-sm text-muted-foreground mb-4">
              另有 {pendingFiles.length} 个新文件将被上传
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={handleDuplicateDialogCancel}>取消</Button>
            <Button onClick={handleDuplicateDialogConfirm}>
              {pendingFiles.length > 0 ? '继续上传' : '确定'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteConfirmFolder} onOpenChange={() => setDeleteConfirmFolder(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>确认删除文件夹</DialogTitle>
            <DialogDescription>
              确定要删除文件夹 "{deleteFolderName}" 及其所有内容吗？此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmFolder(null)}>取消</Button>
            <Button variant="destructive" onClick={confirmDeleteFolder}>删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Workspace;

import React, { useState, useEffect } from 'react';
import {
  Card,
  Button,
  Space,
  Table,
  Modal,
  Form,
  Input,
  message,
  Popconfirm,
  Tag,
  Typography,
  Row,
  Col,
  Statistic,
  Select,
  Tooltip,
  Progress,
  List,
  Empty
} from 'antd';
import {
  DeleteOutlined,
  ExportOutlined,
  CopyOutlined,
  FolderOpenOutlined,
  ThunderboltOutlined,
  UploadOutlined,
  ReloadOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  StopOutlined,
  EyeOutlined
} from '@ant-design/icons';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { javascript } from '@codemirror/lang-javascript';
import { css } from '@codemirror/lang-css';
import { oneDark } from '@codemirror/theme-one-dark';
import axios from 'axios';
import MultiWorkflowManager from './MultiWorkflowManager';

const { Title, Text } = Typography;
const { Option } = Select;
const {TextArea} = Input

interface WorkflowGroup {
  id: string;
  name: string;
  description: string;
  template?: WorkflowGroupTemplate;
  workflowCount: number;
  status: 'idle' | 'running' | 'completed' | 'failed';
  progress: number;
  createdAt: Date;
  updatedAt: Date;
  executionResults?: {
    totalWorkflows: number;
    completedWorkflows: number;
    failedWorkflows: number;
    startTime: Date;
    endTime?: Date;
    duration?: number;
  };
}

interface WorkflowGroupTemplate {
  id: string;
  name: string;
  description: string;
  workflows: any[];
  workflowOrder: string[];
  createdAt: Date;
}

interface FileSource {
  id: string;
  path: string;
  fileType: string;
  files: string[];
  loading: boolean;
}

// 任务执行状态接口
interface TaskExecution {
  taskId: string;
  isRunning: boolean;
  progress: number;
  startTime: Date;
  endTime?: Date;
  currentWorkflowIndex: number;
  totalWorkflows: number;
}

interface WorkflowGroupManagerProps {
  onOpenGroup?: (group: WorkflowGroup, executionContext?: {
    isRunning: boolean;
    taskExecution?: TaskExecution;
    executingTasks: Set<string>;
  }) => void;
}

const WorkflowGroupManager: React.FC<WorkflowGroupManagerProps> = ({ onOpenGroup }) => {
  const [groups, setGroups] = useState<WorkflowGroup[]>([]);
  const [templates, setTemplates] = useState<WorkflowGroupTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();
  
  // 文件来源管理状态
  const [fileSources, setFileSources] = useState<FileSource[]>([]);

  // 智能批量创建相关状态（带文件来源）
  const [isAdvancedBatchCreateModalVisible, setIsAdvancedBatchCreateModalVisible] = useState(false);
  const [advancedBatchCreateForm] = Form.useForm();

  // 模板管理相关状态
  const [isTemplateModalVisible, setIsTemplateModalVisible] = useState(false);
  const [importTemplateData, setImportTemplateData] = useState('');
  const [isWorkflowImportModalVisible, setIsWorkflowImportModalVisible] = useState(false);
  const [workflowTemplateData, setWorkflowTemplateData] = useState('');

  // 任务执行相关状态
  const [executingTasks, setExecutingTasks] = useState<Set<string>>(new Set());
  const [maxConcurrentTasks] = useState(6);
  
  const [taskExecutions, setTaskExecutions] = useState<Map<string, TaskExecution>>(new Map());
  const [isDetailModalVisible, setIsDetailModalVisible] = useState(false);
  const [selectedTask, setSelectedTask] = useState<WorkflowGroup | null>(null);
  const [selectedExecutionContext, setSelectedExecutionContext] = useState<any>(null);
  const [isStepResultModalVisible, setIsStepResultModalVisible] = useState(false);
  const [currentStepResult, setCurrentStepResult] = useState<any>(null);

  // 加载任务列表
  const loadGroups = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/multi-stream/load');
      
      if (response.data.success && response.data.data) {
        const configData = response.data.data;
        
        if (configData.workflowGroups && Array.isArray(configData.workflowGroups)) {
          const groups = configData.workflowGroups.map((group: any) => ({
            ...group,
            createdAt: new Date(group.createdAt),
            updatedAt: new Date(group.updatedAt),
            executionResults: group.executionResults ? {
              ...group.executionResults,
              startTime: new Date(group.executionResults.startTime),
              endTime: group.executionResults.endTime ? new Date(group.executionResults.endTime) : undefined
            } : undefined
          }));
          
          setGroups(groups);
          messageApi.success(`成功加载 ${groups.length} 个任务`);
        } else {
          setGroups([]);
          messageApi.info('暂无任务数据');
        }

        if (configData.workflowGroupTemplates && Array.isArray(configData.workflowGroupTemplates)) {
          const templates = configData.workflowGroupTemplates.map((template: any) => ({
            ...template,
            createdAt: new Date(template.createdAt)
          }));
          
          setTemplates(templates);
        } else {
          setTemplates([]);
        }
      } else {
        setGroups([]);
        setTemplates([]);
        messageApi.info('未找到保存的多文件流配置');
      }
    } catch (error) {
      console.error('加载任务失败:', error);
      messageApi.error('加载任务失败，请检查网络连接');
      setGroups([]);
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGroups();
  }, []);



  // 文件来源管理函数
  const addFileSource = () => {
    const newSource: FileSource = { 
      id: `source-${Date.now()}`, 
      path: '', 
      fileType: '', 
      files: [], 
      loading: false 
    };
    setFileSources([...fileSources, newSource]);
  };

  const updateFileSource = (id: string, field: keyof FileSource, value: any) => {
    setFileSources(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const removeFileSource = (id: string) => {
    setFileSources(fileSources.filter(s => s.id !== id));
  };

  const handleExtractFiles = async (sourceId: string) => {
    const source = fileSources.find(s => s.id === sourceId);
    if (!source) return;
    if (!source.path || !source.fileType) {
      messageApi.error('请输入文件来源路径和文件类型');
      return;
    }

    updateFileSource(sourceId, 'loading', true);
    try {
      const response = await axios.post<{ success: boolean; data: string[]; message?: string }>('/api/list-files', {
        folderPath: source.path,
        fileType: source.fileType,
      });
      if (response.data.success) {
        updateFileSource(sourceId, 'files', response.data.data);
        messageApi.success(`来源 "${source.path}" 文件提取成功`);
      } else {
        updateFileSource(sourceId, 'files', []);
        messageApi.error(response.data.message || '文件提取失败');
      }
    } catch (error) {
      updateFileSource(sourceId, 'files', []);
      messageApi.error('提取文件失败');
    } finally {
      updateFileSource(sourceId, 'loading', false);
    }
  };

  // 保存配置到服务器
  const saveConfig = async (newGroups: WorkflowGroup[], newTemplates?: WorkflowGroupTemplate[]) => {
    try {
      const response = await axios.get('/api/multi-stream/load');
      let existingConfig = {};
      
      if (response.data.success && response.data.data) {
        existingConfig = response.data.data;
      }

      const configData = {
        ...existingConfig,
        workflowGroups: newGroups.map(group => ({
          ...group,
          template: group.template ? {
            ...group.template,
            workflows: group.template.workflows.map((w: any) => ({
              ...w,
              steps: w.steps.map((step: any) => ({
                ...step,
                status: 'pending',
                result: undefined
              }))
            }))
          } : undefined
        })),
        workflowGroupTemplates: newTemplates || templates,
        lastUpdated: new Date().toISOString()
      };

      const saveResponse = await axios.post('/api/multi-stream/save', configData);
      
      if (!saveResponse.data.success) {
        throw new Error(saveResponse.data.message || '保存失败');
      }
      
      return true;
    } catch (error) {
      console.error('保存配置失败:', error);
      messageApi.error('保存配置失败，请检查网络连接');
      return false;
    }
  };

  // 高级批量创建任务（基于文件来源）
  const handleAdvancedBatchCreate = async (values: any) => {
    if (!values.templateId) {
      messageApi.error('请选择模板');
      return;
    }

    const template = templates.find(t => t.id === values.templateId);
    if (!template) {
      messageApi.error('模板不存在');
      return;
    }

    // 获取选中的文件
    const selectedFiles = values.selectedFiles || [];
    if (selectedFiles.length === 0) {
      messageApi.error('请选择至少一个文件');
      return;
    }

    const newGroups: WorkflowGroup[] = [];
    
    // 为每个选中的文件创建一个任务
    selectedFiles.forEach((fileValue: string, index: number) => {
      try {
        const { sourcePath, file } = JSON.parse(fileValue);
        
        // 从相对路径中提取最后的文件名和目录前缀
        const fullFilePath = file;
        const fileName = fullFilePath.split('/').pop()?.split('\\').pop() || fullFilePath.split('\\').pop() || fullFilePath;
        const fileNameWithoutExt = fileName.includes('.') ? 
          fileName.substring(0, fileName.lastIndexOf('.')) : fileName;
        
        // 提取file的相对路径前缀（目录部分）
        const filePathParts = fullFilePath.split('/').length > 1 ? fullFilePath.split('/') : fullFilePath.split('\\');
        const fileRelativePrefix = filePathParts.length > 1 ? filePathParts.slice(0, -1).join('/') : '';
        
        // 确保文件名使用大驼峰命名法
        let finalFileName = fileNameWithoutExt;
        if (finalFileName && finalFileName.length > 0 && 
            (finalFileName[0] < 'A' || finalFileName[0] > 'Z')) {
          finalFileName = finalFileName[0].toUpperCase() + finalFileName.slice(1);
        }
        
        const groupName = values.namePattern 
          ? values.namePattern.replace('{fileName}', finalFileName)
          : `${values.namePrefix || '任务'}-${finalFileName}`;
        
        // 修改模板中的fileInputs和输出文件配置
        const modifiedWorkflows = template.workflows.map((workflow: any) => ({
          ...workflow,
          steps: workflow.steps.map((step: any) => {
            let modifiedStep = { ...step };
            
            // 修改文件输入步骤 - 统一处理所有fileInputs的path
            if (step.config && step.config.fileInputs) {
              modifiedStep.config = {
                ...step.config,
                fileInputs: step.config.fileInputs.map((input: any) => {
                  // 如果name为'接口文档'，则不修改path
                  if (input.name === '接口文档') {
                    return input;
                  }
                  
                  if (input.path) {
                    // 提取原路径的目录部分
                    const pathParts = input.path.split('\\');
                    const originalFileName = pathParts.pop() || '';
                    const directory = pathParts.join('\\');
                    
                    // 获取原文件的扩展名
                    const originalExtension = originalFileName.includes('.') 
                      ? '.' + originalFileName.split('.').pop() 
                      : '';
                    
                    let newFileName;
                    if (originalExtension === '.jsp') {
                      // jsp文件使用原始文件名（不需要大写首字母）
                      newFileName = fileName;
                    } else {
                      // 非jsp文件使用首字母大写的文件名
                      newFileName = finalFileName + originalExtension;
                    }
                    
                    // 检查目录是否包含和file一样的相对路径
                    let finalDirectory = directory;
                    if (fileRelativePrefix && !directory.includes(fileRelativePrefix.replace(/\//g, '\\'))) {
                      // 如果目录不包含相对路径前缀，则添加
                      finalDirectory = directory ? `${directory}\\${fileRelativePrefix.replace(/\//g, '\\')}` : fileRelativePrefix.replace(/\//g, '\\');
                    }
                    
                    // 如果是jsp文件且name字段为"jsp"，使用完整的源路径
                    if (input.name === 'jsp' && originalExtension === '.jsp') {
                      return {
                        ...input,
                        path: `${sourcePath}\\${fullFilePath}`
                      };
                    } else {
                      // 其他情况使用检查后的目录，只替换文件名
                      return {
                        ...input,
                        path: `${finalDirectory}\\${newFileName}`
                      };
                    }
                  }
                  return input;
                })
              };
            }
            
            // 修改输出文件路径
            if (step.config && step.config.outputFileName) {
              // 使用名称前缀和大写首字母的文件名
              const currentOutputName = step.config.outputFileName;
              const fileExtension = currentOutputName.includes('.') ? currentOutputName.split('.').pop() : '';
              const newOutputFileName = fileExtension 
                ? `${values.namePrefix || ''}${finalFileName}.${fileExtension}`
                : `${values.namePrefix || ''}${finalFileName}`;
              
              modifiedStep.config = {
                ...modifiedStep.config,
                outputFileName: newOutputFileName
              };
            }
            
            // 修改输出文件夹路径（检查并添加相对路径）
            if (step.config && step.config.outputFolder) {
              let outputFolder = step.config.outputFolder;
              
              // 检查输出文件夹是否包含和file一样的相对路径
              if (fileRelativePrefix && !outputFolder.includes(fileRelativePrefix.replace(/\//g, '\\'))) {
                // 如果输出文件夹不包含相对路径前缀，则添加
                outputFolder = `${outputFolder}\\${fileRelativePrefix.replace(/\//g, '\\')}`;
                
                modifiedStep.config = {
                  ...modifiedStep.config,
                  outputFolder: outputFolder
                };
              }
            }
            
            // 修改文件路径中的占位符
            if (step.config && step.config.filePath) {
              const updatedFilePath = step.config.filePath
                .replace(/\{\{文件名\}\}/g, file)
                .replace(/\{\{fileName\}\}/g, file)
                .replace(/\{\{sourcePath\}\}/g, sourcePath)
                .replace(/\{\{filePath\}\}/g, `${sourcePath}\\${file}`);
              
              modifiedStep.config = {
                ...step.config,
                filePath: updatedFilePath
              };
            }
            
            return modifiedStep;
          })
        }));
        
        const group: WorkflowGroup = {
          id: `group-${Date.now()}-${index}`,
          name: groupName,
          description: values.description ? 
            values.description.replace('{fileName}', finalFileName).replace('{sourcePath}', sourcePath) :
            `基于文件 ${file} 创建的任务`,
          template: {
            ...template,
            workflows: modifiedWorkflows
          },
          workflowCount: template.workflows.length,
          status: 'idle',
          progress: 0,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        newGroups.push(group);
      } catch (e) {
        console.error('无法解析文件值:', fileValue);
      }
    });

    if (newGroups.length === 0) {
      messageApi.error('没有有效的文件可以创建任务');
      return;
    }

    const allGroups = [...newGroups, ...groups];
    
    if (await saveConfig(allGroups)) {
      setGroups(allGroups);
      setIsAdvancedBatchCreateModalVisible(false);
      advancedBatchCreateForm.resetFields();
      messageApi.success(`成功创建 ${newGroups.length} 个任务`);
    }
  };



  // 删除任务
  const handleDeleteGroup = async (groupId: string) => {
    const newGroups = groups.filter(g => g.id !== groupId);
    
    if (await saveConfig(newGroups)) {
      setGroups(newGroups);
      messageApi.success('任务删除成功');
    }
  };

  // 查看步骤结果
  const viewStepResult = (step: any) => {
    if (step.result) {
      setCurrentStepResult(step.result);
      setIsStepResultModalVisible(true);
    }
  };

  // 重新执行单个步骤
  const reExecuteStep = async (workflowId: string, stepId: string) => {
    if (!selectedTask?.template) {
      messageApi.error('任务模板不存在');
      return;
    }

    const workflow = selectedTask.template.workflows.find((w: any) => w.id === workflowId);
    if (!workflow) {
      messageApi.error('找不到指定的工作流');
      return;
    }

    const step = workflow.steps.find((s: any) => s.id === stepId);
    if (!step) {
      messageApi.error('找不到指定的步骤');
      return;
    }

    // 收集已成功执行的依赖步骤结果
    const dependencyResults = new Map<string, any>();
    const missingDependencies: string[] = [];
    
    for (const depId of step.dependencies) {
      const depStep = workflow.steps.find((s: any) => s.id === depId);
      if (depStep && depStep.status === 'success' && depStep.result) {
        dependencyResults.set(depId, depStep.result);
      } else {
        missingDependencies.push(depStep?.name || '未知步骤');
      }
    }

    // 如果有未执行的依赖步骤，给出警告但允许继续执行
    if (missingDependencies.length > 0) {
      messageApi.warning(`依赖步骤 "${missingDependencies.join(', ')}" 未成功执行，可能会影响执行结果`);
    }

    // 更新步骤状态为运行中
    step.status = 'running';
    step.result = undefined;
    
    // 强制更新UI
    setSelectedTask({ ...selectedTask });

    try {
      // 执行步骤
      const result = await executeStepWithAPI(step, dependencyResults);
      
      // 更新步骤状态和结果
      step.status = result.success ? 'success' : 'error';
      step.result = result;
      
      // 强制更新UI
      setSelectedTask({ ...selectedTask });

      messageApi.success(`步骤 "${step.name}" 执行成功`);
    } catch (error) {
      const errorResult = { 
        success: false, 
        message: `步骤 "${step.name}" 执行失败: ${error}`
      };
      step.status = 'error';
      step.result = errorResult;
      
      // 强制更新UI
      setSelectedTask({ ...selectedTask });
      
      messageApi.error(`步骤 "${step.name}" 执行失败`);
    }
  };

  // 从指定步骤开始重新向后执行
  const reExecuteFromStep = async (workflowId: string, startStepId: string) => {
    if (!selectedTask?.template) {
      messageApi.error('任务模板不存在');
      return;
    }

    const workflow = selectedTask.template.workflows.find((w: any) => w.id === workflowId);
    if (!workflow) {
      messageApi.error('找不到指定的工作流');
      return;
    }

    const startStep = workflow.steps.find((s: any) => s.id === startStepId);
    if (!startStep) {
      messageApi.error('找不到指定的步骤');
      return;
    }

    // 获取需要重新执行的步骤（从当前步骤开始的所有后续步骤，按order顺序）
    const startStepOrder = startStep.order;
    const stepsToReExecute = workflow.steps
      .filter((step: any) => step.order >= startStepOrder)
      .map((step: any) => step.id);
    
    const sortedSteps = workflow.steps
      .filter((step: any) => stepsToReExecute.includes(step.id))
      .sort((a: any, b: any) => a.order - b.order);

    if (sortedSteps.length === 0) {
      messageApi.error('没有找到需要重新执行的步骤');
      return;
    }

    messageApi.info(`开始从步骤 "${startStep.name}" 重新执行 ${sortedSteps.length} 个步骤`);

    // 记录开始时间
    const executionStartTime = new Date();

    try {
      // 重置要重新执行的步骤状态
      sortedSteps.forEach((step: any) => {
        step.status = 'pending';
        step.result = undefined;
      });
      
      // 强制更新UI
      setSelectedTask({ ...selectedTask });

      const executedSteps = new Set<string>();
      const stepResults = new Map<string, any>();
      
      // 收集已成功执行的依赖步骤结果
      workflow.steps.forEach((step: any) => {
        if (!stepsToReExecute.includes(step.id) && step.status === 'success' && step.result) {
          stepResults.set(step.id, step.result);
          executedSteps.add(step.id);
        }
      });

      // 按顺序执行所有需要重新执行的步骤
      for (const step of sortedSteps) {
        if (executedSteps.has(step.id)) continue;

        // 检查依赖步骤是否已执行（收集可用的依赖结果）
        const availableDependencies = new Map<string, any>();
        const missingDependencies: string[] = [];
        
        for (const depId of step.dependencies) {
          if (stepResults.has(depId)) {
            availableDependencies.set(depId, stepResults.get(depId));
          } else {
            const depStep = workflow.steps.find((s: any) => s.id === depId);
            missingDependencies.push(depStep?.name || '未知步骤');
          }
        }

        // 如果有缺失的依赖，给出警告但继续执行
        if (missingDependencies.length > 0) {
          messageApi.warning(`步骤 "${step.name}" 的依赖步骤 "${missingDependencies.join(', ')}" 未执行，可能会影响结果`);
        }

        // 更新步骤状态为运行中
        step.status = 'running';
        setSelectedTask({ ...selectedTask });

        try {
          messageApi.info(`正在执行步骤: ${step.name}`);
          
          // 调用实际的文件处理接口
          const result = await executeStepWithAPI(step, availableDependencies);
          
          // 存储结果
          stepResults.set(step.id, result);
          
          // 更新UI状态
          step.status = result.success ? 'success' : 'error';
          step.result = result;
          setSelectedTask({ ...selectedTask });

          executedSteps.add(step.id);
          
          messageApi.success(`步骤 "${step.name}" 执行完成`);
        } catch (error) {
          const errorResult = { 
            success: false, 
            message: `步骤 "${step.name}" 执行失败: ${error}`
          };
          step.status = 'error';
          step.result = errorResult;
          setSelectedTask({ ...selectedTask });
          
          messageApi.error(`步骤 "${step.name}" 执行失败: ${error}`);
          // 继续执行下一个步骤，不中断整个流程
        }
      }

      // 计算执行时长
      const executionEndTime = new Date();
      const executionDuration = executionEndTime.getTime() - executionStartTime.getTime();
      const durationSeconds = Math.round(executionDuration / 1000);
      
      messageApi.success(`从步骤 "${startStep.name}" 开始的重新执行完成，耗时 ${durationSeconds} 秒`);
      
    } catch (error) {
      // 计算执行时长（即使失败也记录）
      const executionEndTime = new Date();
      const executionDuration = executionEndTime.getTime() - executionStartTime.getTime();
      const durationSeconds = Math.round(executionDuration / 1000);
      
      messageApi.error(`从步骤 "${startStep.name}" 开始的重新执行失败，耗时 ${durationSeconds} 秒`);
    }
  };

  // 获取CodeMirror扩展
  const getCodeMirrorExtensions = (resultData: any) => {
    const path = resultData?.path || '';
    if (path.endsWith('.json')) return [json()];
    if (path.endsWith('.js') || path.endsWith('.jsx') || path.endsWith('.ts') || path.endsWith('.tsx')) {
      return [javascript({ jsx: true, typescript: true })];
    }
    if (path.endsWith('.css')) return [css()];
    return [];
  };

  // 复制任务
  const handleCopyGroup = async (group: WorkflowGroup) => {
    const copiedGroup: WorkflowGroup = {
      ...group,
      id: `group-${Date.now()}`,
      name: `${group.name} - 副本`,
      status: 'idle',
      progress: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      executionResults: undefined
    };

    const newGroups = [copiedGroup, ...groups];
    
    if (await saveConfig(newGroups)) {
      setGroups(newGroups);
      messageApi.success('任务复制成功');
    }
  };

  // 导出任务为模板
  const handleExportAsTemplate = async (group: WorkflowGroup) => {
    if (!group.template) {
      messageApi.error('该任务没有关联的模板数据');
      return;
    }

    const template: WorkflowGroupTemplate = {
      id: `template-${Date.now()}`,
      name: `${group.name} - 模板`,
      description: `从任务 "${group.name}" 导出的模板`,
      workflows: group.template.workflows,
      workflowOrder: group.template.workflowOrder,
      createdAt: new Date()
    };

    const newTemplates = [template, ...templates];
    
    if (await saveConfig(groups, newTemplates)) {
      setTemplates(newTemplates);
      messageApi.success('模板导出成功');
    }
  };

  // 导入模板
  const handleImportTemplate = async () => {
    try {
      if (!importTemplateData.trim()) {
        messageApi.error('请输入模板数据');
        return;
      }

      const templateData = JSON.parse(importTemplateData);
      
      if (!templateData.name || !Array.isArray(templateData.workflows)) {
        messageApi.error('模板数据格式不正确');
        return;
      }

      const template: WorkflowGroupTemplate = {
        id: `template-${Date.now()}`,
        name: `${templateData.name} - 导入`,
        description: templateData.description || '',
        workflows: templateData.workflows,
        workflowOrder: templateData.workflowOrder || templateData.workflows.map((w: any) => w.id),
        createdAt: new Date()
      };

      const newTemplates = [template, ...templates];
      
      if (await saveConfig(groups, newTemplates)) {
        setTemplates(newTemplates);
        setIsTemplateModalVisible(false);
        setImportTemplateData('');
        messageApi.success('模板导入成功');
      }
    } catch (error) {
      console.error('导入模板失败:', error);
      messageApi.error('导入模板失败，请检查数据格式');
    }
  };

  // 从工作流路由导入多工作流作为模板
  const handleImportFromWorkflowRoute = async () => {
    try {
      // 从工作流路由获取多工作流配置
      const response = await axios.get('/api/config/load');
      
      if (response.data.success && response.data.data) {
        const workflowData = response.data.data;
        
        if (workflowData.workflows && Array.isArray(workflowData.workflows) && workflowData.workflows.length > 0) {
          const templateData = {
            name: `工作流模板 - ${new Date().toLocaleDateString()}`,
            description: `从工作流路由导入的模板，包含 ${workflowData.workflows.length} 个工作流`,
            workflows: workflowData.workflows,
            workflowOrder: workflowData.workflows.map((w: any) => w.id)
          };

          // 在CodeMirror中展示模板数据
          setWorkflowTemplateData(JSON.stringify(templateData, null, 2));
          setIsWorkflowImportModalVisible(true);
          messageApi.success(`成功获取工作流模板，包含 ${workflowData.workflows.length} 个工作流`);
        } else {
          messageApi.warning('工作流路由中没有可用的工作流数据');
        }
      } else {
        messageApi.warning('未找到工作流路由的配置数据');
      }
    } catch (error) {
      console.error('从工作流路由导入失败:', error);
      messageApi.error('从工作流路由导入失败，请检查网络连接');
    }
  };

  // 使用工作流模板
  const handleUseWorkflowTemplate = () => {
    try {
      if (!workflowTemplateData.trim()) {
        messageApi.error('模板数据不能为空');
        return;
      }

      const templateData = JSON.parse(workflowTemplateData);
      
      if (!templateData.name || !Array.isArray(templateData.workflows)) {
        messageApi.error('模板数据格式不正确');
        return;
      }

      // 临时添加到模板列表中（不保存到服务器）
      const template: WorkflowGroupTemplate = {
        id: `temp-template-${Date.now()}`,
        name: templateData.name,
        description: templateData.description || '',
        workflows: templateData.workflows,
        workflowOrder: templateData.workflowOrder || templateData.workflows.map((w: any) => w.id),
        createdAt: new Date()
      };

      // 临时添加到模板列表
      setTemplates([template, ...templates]);
      setIsWorkflowImportModalVisible(false);
      setWorkflowTemplateData('');
      messageApi.success('模板已添加到当前会话，可在选择模板中使用');
    } catch (error) {
      console.error('解析模板数据失败:', error);
      messageApi.error('模板数据格式错误，请检查JSON格式');
    }
  };

  // 删除模板
  const handleDeleteTemplate = async (templateId: string) => {
    const newTemplates = templates.filter(t => t.id !== templateId);
    
    if (await saveConfig(groups, newTemplates)) {
      setTemplates(newTemplates);
      messageApi.success('模板删除成功');
    }
  };

// 添加必要的类型定义和接口
// 文件输入接口
interface FileInput {
  id: string;
  name: string;
  path: string;
  dependsOn?: string; // 依赖的步骤ID，可以引用前置步骤的输出文件
}

// 提示词输入接口
interface PromptInput {
  id: string;
  content: string;
  fileReferences: string[]; // 引用的文件ID列表
}

// 步骤接口定义
interface WorkflowStep {
  id: string;
  name: string;
  description: string;
  type: 'file_process' | 'data_transform' | 'api_call' | 'condition';
  config: {
    fileInputs?: FileInput[];
    promptInputs?: PromptInput[];
    outputFolder?: string;
    outputFileName?: string;
    apiEndpoint?: '/api/process-file' | '/api/process-file-direct'; // 接口选择
    customSettings?: Record<string, any>;
  };
  dependencies: string[]; // 依赖的步骤ID列表
  status: 'pending' | 'running' | 'success' | 'error' | 'skipped';
  result?: {
    success: boolean;
    message: string;
    data?: {
      path?: string;
      content?: string;
      size?: string;
      [key: string]: any;
    };
  };
  order: number;
}

  // 使用FileProcessForm的API执行单个步骤
  const executeStepWithAPI = async (step: WorkflowStep, previousResults: Map<string, any>) => {
    const { fileInputs = [], promptInputs = [], outputFolder, outputFileName, apiEndpoint = '/api/process-file' } = step.config;

    // 验证必要参数
    if (fileInputs.length === 0) {
      throw new Error('缺少文件输入配置');
    }
    if (promptInputs.length === 0) {
      throw new Error('缺少提示词配置');
    }
    if (!outputFolder || !outputFileName) {
      throw new Error('缺少输出配置');
    }

    // 创建文件路径映射表
    const filePathMap = new Map<string, string>();
    
    // 处理文件输入，解析依赖步骤的输出
    for (const fileInput of fileInputs) {
      let filePath = fileInput.path;
      
      // 如果依赖其他步骤，获取其输出路径
      if (fileInput.dependsOn) {
        const depResult = previousResults.get(fileInput.dependsOn);
        if (depResult?.success && depResult.data?.path) {
          filePath = depResult.data.path;
        } else {
          throw new Error(`依赖步骤 "${fileInput.dependsOn}" 未成功执行或无输出文件`);
        }
      }

      if (!filePath) {
        throw new Error(`文件 "${fileInput.name}" 缺少有效路径`);
      }

      // 将文件名映射到路径
      filePathMap.set(fileInput.name, filePath);
    }

    // 处理提示词输入，按 {{}} 标记拆分生成inputs
    const processedInputs: Array<{ type: 'file' | 'prompt'; value: string }> = [];

    for (const promptInput of promptInputs) {
      let content = promptInput.content;
      
      // 使用正则表达式找到所有 {{文件名}} 标记
      const fileReferences = content.match(/\{\{([^}]+)\}\}/g) || [];
      
      if (fileReferences.length === 0) {
        // 如果没有文件引用，直接添加提示词
        processedInputs.push({
          type: 'prompt',
          value: content
        });
      } else {
        // 按文件引用拆分提示词
        let remainingContent = content;
        
        for (const fileRef of fileReferences) {
          const fileName = fileRef.replace(/[{}]/g, ''); // 移除 {{}}
          const filePath = filePathMap.get(fileName);
          
          if (!filePath) {
            throw new Error(`找不到文件 "${fileName}" 的路径配置`);
          }
          
          // 找到文件引用的位置
          const refIndex = remainingContent.indexOf(fileRef);
          
          if (refIndex > 0) {
            // 添加文件引用前的提示词部分
            const beforePrompt = remainingContent.substring(0, refIndex).trim();
            if (beforePrompt) {
              processedInputs.push({
                type: 'prompt',
                value: beforePrompt
              });
            }
          }
          
          // 添加文件
          processedInputs.push({
            type: 'file',
            value: filePath
          });
          
          // 更新剩余内容
          remainingContent = remainingContent.substring(refIndex + fileRef.length);
        }
        
        // 添加最后剩余的提示词部分
        if (remainingContent.trim()) {
          processedInputs.push({
            type: 'prompt',
            value: remainingContent.trim()
          });
        }
      }
    }

    // 构建API请求参数（与FileProcessForm保持一致）
    const requestData = {
      inputs: processedInputs,
      outputFolder: outputFolder,
      outputFileName: outputFileName
    };

    // 调用选择的文件处理API
    const response = await axios.post(apiEndpoint, requestData);
    
    if (response.data.success) {
      return {
        success: true,
        message: `步骤 "${step.name}" 执行成功`,
        data: response.data.data
      };
    } else {
      throw new Error(response.data.message || '处理失败');
    }
  };

  // 执行单个工作流（使用真实的API调用，与MultiWorkflowManager相同的逻辑）
  const executeWorkflowWithRealAPI = async (workflow: any, groupId: string): Promise<void> => {
    return new Promise(async (resolve, reject) => {
      try {
        // 重置所有步骤状态
        const resetSteps = workflow.steps.map((step: any) => ({ ...step, status: 'pending' as const, result: undefined }));
        workflow.steps = resetSteps;

        // 按依赖关系执行步骤
        const executedSteps = new Set<string>();
        const stepResults = new Map<string, any>();
        const totalSteps = workflow.steps.length;
        let completedSteps = 0;

        const executeStep = async (step: WorkflowStep): Promise<void> => {
          // 检查依赖是否已执行
          for (const depId of step.dependencies) {
            if (!executedSteps.has(depId)) {
              const depStep = workflow.steps.find((s: any) => s.id === depId);
              if (depStep) {
                await executeStep(depStep);
              }
            }
          }

          if (executedSteps.has(step.id)) return;

          // 更新步骤状态为运行中
          step.status = 'running';

          try {
            // 调用实际的文件处理接口
            const result = await executeStepWithAPI(step, stepResults);
            
            // 存储结果，用于后续步骤的依赖和界面显示
            stepResults.set(step.id, result);
            
            // 更新步骤状态
            step.status = result.success ? 'success' : 'error';
            step.result = result;

            executedSteps.add(step.id);
            completedSteps++;
          } catch (error) {
            const errorResult = { 
              success: false, 
              message: `步骤 "${step.name}" 执行失败: ${error}`
            };
            step.status = 'error';
            step.result = errorResult;
            completedSteps++;
            throw error;
          }
        };

        // 执行所有步骤
        for (const step of workflow.steps.sort((a: any, b: any) => a.order - b.order)) {
          if (!executedSteps.has(step.id)) {
            await executeStep(step);
          }
        }

        resolve();
      } catch (error) {
        reject(error);
      }
    });
  };

  // 执行单个任务
  const executeTask = async (groupId: string) => {
    // 直接从当前groups状态中查找任务，避免闭包问题
    const currentGroup = groups.find(g => g.id === groupId);
    
    if (!currentGroup || !currentGroup.template) {
      messageApi.error('任务不存在或没有关联的模板');
      return;
    }

    // 检查并发限制
    if (executingTasks.size >= maxConcurrentTasks) {
      messageApi.warning(`已达到最大并发限制（${maxConcurrentTasks}个），请等待其他任务完成`);
      return;
    }

    const executableWorkflows = currentGroup.template.workflows.filter((w: any) => w.steps && w.steps.length > 0);
    
    if (executableWorkflows.length === 0) {
      messageApi.error('该任务没有可执行的工作流（需要至少包含一个步骤）');
      return;
    }

    // 添加到执行中的任务集合
    setExecutingTasks(prev => new Set([...prev, groupId]));

    // 创建任务执行状态
    const taskExecution: TaskExecution = {
      taskId: groupId,
      isRunning: true,
      progress: 0,
      startTime: new Date(),
      currentWorkflowIndex: 0,
      totalWorkflows: executableWorkflows.length
    };

    setTaskExecutions(prev => new Map(prev).set(groupId, taskExecution));

    // 更新任务状态为运行中（仅在内存中）
    setGroups(current => current.map(g => 
      g.id === groupId 
        ? { 
            ...g, 
            status: 'running' as const, 
            progress: 0,
            executionResults: {
              totalWorkflows: executableWorkflows.length,
              completedWorkflows: 0,
              failedWorkflows: 0,
              startTime: new Date()
            }
          }
        : g
    ));

    messageApi.info(`开始执行任务 "${currentGroup.name}"，包含 ${executableWorkflows.length} 个工作流`);

    try {
      let completedWorkflows = 0;
      let failedWorkflows = 0;

      for (let i = 0; i < executableWorkflows.length; i++) {
        const workflow = executableWorkflows[i];
        
        // 更新当前执行的工作流索引
        setTaskExecutions(prev => {
          const newMap = new Map(prev);
          const execution = newMap.get(groupId);
          if (execution) {
            newMap.set(groupId, { ...execution, currentWorkflowIndex: i });
          }
          return newMap;
        });

        messageApi.info(`任务 "${currentGroup.name}" 正在执行工作流 ${i + 1}/${executableWorkflows.length}: ${workflow.name}`);

        try {
          // 执行单个工作流（使用真实的API调用，与MultiWorkflowManager相同的逻辑）
          await executeWorkflowWithRealAPI(workflow, groupId);
          completedWorkflows++;
        } catch (error) {
          failedWorkflows++;
          messageApi.error(`工作流 "${workflow.name}" 执行失败: ${error instanceof Error ? error.message : '执行失败'}`);
        }

        // 更新进度
        const progress = ((i + 1) / executableWorkflows.length) * 100;
        
        setTaskExecutions(prev => {
          const newMap = new Map(prev);
          const execution = newMap.get(groupId);
          if (execution) {
            newMap.set(groupId, { ...execution, progress });
          }
          return newMap;
        });

        // 更新任务组状态（仅在内存中）- 使用函数形式确保获取最新状态
        setGroups(current => current.map(g => 
          g.id === groupId 
            ? { 
                ...g, 
                progress,
                executionResults: {
                  ...g.executionResults!,
                  completedWorkflows,
                  failedWorkflows
                }
              }
            : g
        ));

        // 如果不是最后一个工作流，等待一段时间再执行下一个
        if (i < executableWorkflows.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      // 任务执行完成
      const finalStatus: 'completed' | 'failed' = failedWorkflows === 0 ? 'completed' : (completedWorkflows > 0 ? 'completed' : 'failed');
      const endTime = new Date();
      
      setGroups(current => current.map(g => 
        g.id === groupId 
          ? { 
              ...g, 
              status: finalStatus,
              progress: 100,
              executionResults: {
                ...g.executionResults!,
                completedWorkflows,
                failedWorkflows,
                endTime,
                duration: g.executionResults?.startTime 
                  ? endTime.getTime() - g.executionResults.startTime.getTime()
                  : 0
              }
            }
          : g
      ));
      
      // 记录任务完成信息
      const duration = currentGroup.executionResults?.startTime 
        ? endTime.getTime() - currentGroup.executionResults.startTime.getTime()
        : 0;
      const durationText = duration > 0 ? ` (耗时: ${Math.round(duration / 1000)}秒)` : '';

      // 完成任务执行状态
      setTaskExecutions(prev => {
        const newMap = new Map(prev);
        const execution = newMap.get(groupId);
        if (execution) {
          newMap.set(groupId, { 
            ...execution, 
            isRunning: false, 
            endTime: new Date(),
            progress: 100
          });
        }
        return newMap;
      });

      messageApi.success(
        `任务 "${currentGroup.name}" 执行完成！成功: ${completedWorkflows} 个，失败: ${failedWorkflows} 个${durationText}`
      );

    } catch (error) {
      console.error('执行任务失败:', error);
      const errorEndTime = new Date();
      const errorDuration = currentGroup.executionResults?.startTime 
        ? errorEndTime.getTime() - currentGroup.executionResults.startTime.getTime()
        : 0;
      const errorDurationText = errorDuration > 0 ? ` (耗时: ${Math.round(errorDuration / 1000)}秒)` : '';
      
      messageApi.error(`执行任务失败: ${error instanceof Error ? error.message : '未知错误'}${errorDurationText}`);
      
      // 恢复任务状态（仅在内存中），记录执行时长
      setGroups(current => current.map(g => 
        g.id === groupId ? { 
          ...g, 
          status: 'failed' as const,
          executionResults: g.executionResults ? {
            ...g.executionResults,
            endTime: errorEndTime,
            duration: errorDuration
          } : undefined
        } : g
      ));

      // 完成任务执行状态
      setTaskExecutions(prev => {
        const newMap = new Map(prev);
        const execution = newMap.get(groupId);
        if (execution) {
          newMap.set(groupId, { 
            ...execution, 
            isRunning: false, 
            endTime: errorEndTime
          });
        }
        return newMap;
      });
    } finally {
      // 从执行中的任务集合中移除
      setExecutingTasks(prev => {
        const newSet = new Set(prev);
        newSet.delete(groupId);
        return newSet;
      });
    }
  };

  // 停止任务执行
  const stopTask = async (groupId: string) => {
    try {
      const stopTime = new Date();
      
      // 更新任务执行状态为停止
      setTaskExecutions(prev => {
        const newMap = new Map(prev);
        const execution = newMap.get(groupId);
        if (execution) {
          newMap.set(groupId, { 
            ...execution, 
            isRunning: false, 
            endTime: stopTime
          });
        }
        return newMap;
      });

      // 更新任务状态（仅在内存中）- 使用函数形式确保获取最新状态
      setGroups(current => current.map(g => 
        g.id === groupId ? { 
          ...g, 
          status: 'idle' as const, 
          progress: 0,
          executionResults: g.executionResults ? {
            ...g.executionResults,
            endTime: stopTime,
            duration: g.executionResults.startTime 
              ? stopTime.getTime() - g.executionResults.startTime.getTime()
              : 0
          } : undefined
        } : g
      ));
      
      // 从执行中的任务集合中移除
      setExecutingTasks(prev => {
        const newSet = new Set(prev);
        newSet.delete(groupId);
        return newSet;
      });
      
      // 计算执行时长并显示
      const currentGroup = groups.find(g => g.id === groupId);
      const stopDuration = currentGroup?.executionResults?.startTime 
        ? stopTime.getTime() - currentGroup.executionResults.startTime.getTime()
        : 0;
      const stopDurationText = stopDuration > 0 ? ` (执行了${Math.round(stopDuration / 1000)}秒)` : '';
      
      messageApi.success(`任务已停止${stopDurationText}`);
    } catch (error) {
      console.error('停止任务失败:', error);
      messageApi.error(`停止任务失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  // 批量执行任务（控制并发数量最多6个）
  const handleBatchExecute = async () => {
    // 获取当前可执行的任务列表
    const idleTasks = groups.filter(g => g.status === 'idle' && g.template && g.template.workflows.some((w: any) => w.steps && w.steps.length > 0));
    
    if (idleTasks.length === 0) {
      messageApi.warning('没有可执行的任务');
      return;
    }

    messageApi.info(`开始批量执行 ${idleTasks.length} 个任务，最多同时执行 ${maxConcurrentTasks} 个`);
    
    let taskIndex = 0;
    const activePromises: Promise<void>[] = [];
    
    // 执行单个任务的包装函数，传入任务列表避免闭包问题
    const executeTaskWrapper = async (taskList: typeof idleTasks): Promise<void> => {
      while (taskIndex < taskList.length) {
        const currentIndex = taskIndex++;
        const task = taskList[currentIndex];
        
        try {
          await executeTask(task.id);
        } catch (error) {
          console.error(`任务 ${task.name} 执行失败:`, error);
        }
        
        // 执行完一个任务后，稍微等待一下再执行下一个
        if (taskIndex < taskList.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
    };
    
    // 启动最多 maxConcurrentTasks 个并发执行器
    const concurrentCount = Math.min(maxConcurrentTasks, idleTasks.length);
    for (let i = 0; i < concurrentCount; i++) {
      activePromises.push(executeTaskWrapper(idleTasks));
    }
    
    // 等待所有任务完成
    try {
      await Promise.all(activePromises);
      messageApi.success('所有批量任务已完成！');
    } catch (error) {
      console.error('批量执行过程中出现错误:', error);
      messageApi.success('批量任务执行完成（部分任务可能失败）！');
    }
  };

  // 停止所有正在执行的任务
  const handleStopAll = async () => {
    if (executingTasks.size === 0) {
      messageApi.warning('没有正在运行的任务');
      return;
    }

    messageApi.info(`停止 ${executingTasks.size} 个正在运行的任务`);
    
    const stopPromises = Array.from(executingTasks).map(taskId => stopTask(taskId));
    
    try {
      await Promise.allSettled(stopPromises);
    } catch (error) {
      console.error('批量停止出现错误:', error);
    }
  };

  // 获取统计信息
  const getStatistics = () => {
    const total = groups.length;
    const running = groups.filter(g => g.status === 'running').length;
    const completed = groups.filter(g => g.status === 'completed').length;
    const failed = groups.filter(g => g.status === 'failed').length;
    
    // 计算总执行时长（所有已完成和失败的任务）
    const totalExecutionTime = groups
      .filter(g => g.executionResults?.duration)
      .reduce((sum, g) => sum + (g.executionResults?.duration || 0), 0);
    
    // 格式化总执行时长
    const formatDuration = (milliseconds: number) => {
      const seconds = Math.floor(milliseconds / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      
      if (hours > 0) {
        return `${hours}时${minutes % 60}分${seconds % 60}秒`;
      } else if (minutes > 0) {
        return `${minutes}分${seconds % 60}秒`;
      } else {
        return `${seconds}秒`;
      }
    };
    
    return { 
      total, 
      running, 
      completed, 
      failed, 
      totalExecutionTime: formatDuration(totalExecutionTime),
      totalExecutionTimeMs: totalExecutionTime
    };
  };

  const statistics = getStatistics();

  return (
    <div style={{ padding: '24px' }}>
      {contextHolder}
      
      <Row justify="space-between" align="middle" style={{ marginBottom: '24px' }}>
        <Col>
          <Title level={2}>任务管理</Title>
        </Col>
        <Col>
          <Space>
            <Button 
              icon={<ReloadOutlined />}
              onClick={loadGroups}
            >
              刷新列表
            </Button>
            <Button 
              icon={<PlayCircleOutlined />}
              onClick={handleBatchExecute}
              type="primary"
              disabled={groups.filter(g => g.status === 'idle' && g.template).length === 0}
            >
              批量执行所有任务
            </Button>
            <Button 
              icon={<StopOutlined />}
              onClick={handleStopAll}
              danger
              disabled={groups.filter(g => g.status === 'running').length === 0}
            >
              停止所有
            </Button>
            <Button 
              icon={<ThunderboltOutlined />} 
              onClick={() => setIsAdvancedBatchCreateModalVisible(true)}
              style={{ backgroundColor: '#52c41a', borderColor: '#52c41a', color: 'white' }}
            >
              智能批量创建任务
            </Button>
          </Space>
        </Col>
      </Row>

      {/* 统计信息 */}
      <Row gutter={16} style={{ marginBottom: '24px' }}>
        <Col span={3}>
          <Card>
            <Statistic title="总任务" value={statistics.total} />
          </Card>
        </Col>
        <Col span={3}>
          <Card>
            <Statistic title="运行中" value={statistics.running} valueStyle={{ color: '#1890ff' }} />
          </Card>
        </Col>
        <Col span={3}>
          <Card>
            <Statistic 
              title="可执行" 
              value={groups.filter(g => g.status === 'idle' && g.template).length} 
              valueStyle={{ color: '#52c41a' }} 
            />
          </Card>
        </Col>
        <Col span={3}>
          <Card>
            <Statistic title="已完成" value={statistics.completed} valueStyle={{ color: '#52c41a' }} />
          </Card>
        </Col>
        <Col span={3}>
          <Card>
            <Statistic title="失败" value={statistics.failed} valueStyle={{ color: '#ff4d4f' }} />
          </Card>
        </Col>
        <Col span={3}>
          <Card>
            <Statistic 
              title="并发限制" 
              value={`${statistics.running}/${maxConcurrentTasks}`} 
              valueStyle={{ color: statistics.running >= maxConcurrentTasks ? '#ff4d4f' : '#1890ff' }} 
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic 
              title="总执行时长" 
              value={statistics.totalExecutionTime}
              valueStyle={{ color: '#722ed1' }}
              suffix={
                statistics.totalExecutionTimeMs > 0 && (
                  <span style={{ fontSize: '12px', color: '#666' }}>
                    ({statistics.completed + statistics.failed} 个任务)
                  </span>
                )
              }
            />
          </Card>
        </Col>
      </Row>

      {/* 任务列表 */}
      <Card>
        <Table
          columns={[
            {
              title: '#',
              key: 'index',
              width: 60,
              render: (_: any, __: any, index: number) => index + 1,
            },
            {
              title: '任务名称',
              dataIndex: 'name',
              key: 'name',
              render: (name: string, record: WorkflowGroup) => (
                <Space direction="vertical" size={0}>
                  <Text strong>{name}</Text>
                  {record.description && <Text type="secondary" style={{ fontSize: '12px' }}>{record.description}</Text>}
                </Space>
              ),
            },
            {
              title: '工作流数量',
              dataIndex: 'workflowCount',
              key: 'workflowCount',
              width: 100,
              render: (count: number) => <Tag color="blue">{count} 个</Tag>,
            },
            {
              title: '状态',
              dataIndex: 'status',
              key: 'status',
              width: 150,
              render: (status: string, record: WorkflowGroup) => {
                const statusConfig = {
                  idle: { color: 'default', text: '空闲' },
                  running: { color: 'processing', text: '运行中' },
                  completed: { color: 'success', text: '已完成' },
                  failed: { color: 'error', text: '失败' }
                };
                const config = statusConfig[status as keyof typeof statusConfig];
                const taskExecution = taskExecutions.get(record.id);
                
                return (
                  <Space direction="vertical" size={2} style={{ width: '100%' }}>
                    <Tag color={config.color}>{config.text}</Tag>
                    {status === 'running' && taskExecution && (
                      <Progress 
                        percent={Math.round(taskExecution.progress)} 
                        size="small" 
                        status="active"
                        showInfo={false}
                      />
                    )}
                    {status === 'running' && taskExecution && (
                      <Text type="secondary" style={{ fontSize: '10px' }}>
                        {taskExecution.currentWorkflowIndex + 1}/{taskExecution.totalWorkflows}
                      </Text>
                    )}
                    {record.executionResults && status !== 'running' && (
                      <div>
                        <Text type="secondary" style={{ fontSize: '10px' }}>
                          成功: {record.executionResults.completedWorkflows} 失败: {record.executionResults.failedWorkflows}
                        </Text>
                        {record.executionResults.duration && (
                          <div>
                            <Text type="secondary" style={{ fontSize: '10px' }}>
                              耗时: {Math.round(record.executionResults.duration / 1000)}秒
                            </Text>
                          </div>
                        )}
                      </div>
                    )}
                  </Space>
                );
              },
            },
            {
              title: '创建时间',
              dataIndex: 'createdAt',
              key: 'createdAt',
              width: 150,
              render: (date: Date) => date.toLocaleString(),
            },
            {
              title: '操作',
              key: 'actions',
              width: 280,
              render: (_: any, record: WorkflowGroup) => (
                <Space size="small">
                  {record.status === 'idle' && record.template ? (
                    <Tooltip title="执行任务">
                      <Button 
                        type="link" 
                        icon={<PlayCircleOutlined />} 
                        onClick={() => executeTask(record.id)}
                        style={{ color: '#52c41a' }}
                      />
                    </Tooltip>
                  ) : record.status === 'running' ? (
                    <Tooltip title="停止任务">
                      <Button 
                        type="link" 
                        icon={<PauseCircleOutlined />} 
                        onClick={() => stopTask(record.id)}
                        style={{ color: '#ff4d4f' }}
                      />
                    </Tooltip>
                  ) : null}
                  <Tooltip title="打开任务">
                    <Button 
                      type="link" 
                      icon={<FolderOpenOutlined />} 
                      onClick={() => {
                        const taskExecution = taskExecutions.get(record.id);
                        const isRunning = executingTasks.has(record.id);
                        
                        setSelectedTask(record);
                        setSelectedExecutionContext({
                          isRunning,
                          taskExecution,
                          executingTasks: new Set(executingTasks)
                        });
                        setIsDetailModalVisible(true);
                      }}
                    />
                  </Tooltip>
                  <Tooltip title="复制">
                    <Button 
                      type="link" 
                      icon={<CopyOutlined />} 
                      onClick={() => handleCopyGroup(record)}
                    />
                  </Tooltip>
                  <Tooltip title="导出为模板">
                    <Button 
                      type="link" 
                      icon={<ExportOutlined />} 
                      onClick={() => handleExportAsTemplate(record)}
                      disabled={!record.template}
                    />
                  </Tooltip>
                  <Popconfirm
                    title="确定要删除这个任务吗？"
                    onConfirm={() => handleDeleteGroup(record.id)}
                    okText="确定"
                    cancelText="取消"
                  >
                    <Tooltip title="删除">
                      <Button 
                        type="link" 
                        danger 
                        icon={<DeleteOutlined />}
                        disabled={record.status === 'running'}
                      />
                    </Tooltip>
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
          dataSource={groups}
          rowKey="id"
          loading={loading}
          pagination={false}
        />
      </Card>

      {/* 智能批量创建模态框（带文件来源） */}
      <Modal
        title="智能批量创建任务"
        open={isAdvancedBatchCreateModalVisible}
        onCancel={() => setIsAdvancedBatchCreateModalVisible(false)}
        footer={null}
        width={800}
      >
        <Form
          form={advancedBatchCreateForm}
          layout="vertical"
          onFinish={handleAdvancedBatchCreate}
        >
          {/* 文件来源管理 */}
          <div className="section" style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h3>文件来源</h3>
              <Button 
                icon={<UploadOutlined />} 
                onClick={handleImportFromWorkflowRoute}
                style={{ backgroundColor: '#722ed1', borderColor: '#722ed1', color: 'white' }}
              >
                从工作流导入
              </Button>
            </div>
            {fileSources.map((source) => (
              <div key={source.id} style={{ marginBottom: '15px', padding: '10px', border: '1px solid #d9d9d9', borderRadius: '4px' }}>
                <Space align="start" style={{ width: '100%' }}>
                  <Input 
                    value={source.path} 
                    onChange={(e) => updateFileSource(source.id, 'path', e.target.value)} 
                    placeholder="源代码根目录" 
                    style={{ width: '300px' }}
                  />
                  <Input 
                    value={source.fileType} 
                    onChange={(e) => updateFileSource(source.id, 'fileType', e.target.value)} 
                    placeholder="文件类型, 如 .js,.ts" 
                    style={{ width: '200px' }}
                  />
                  <Button 
                    type="primary" 
                    onClick={() => handleExtractFiles(source.id)} 
                    loading={source.loading}
                  >
                    提取
                  </Button>
                  <Button 
                    danger 
                    onClick={() => removeFileSource(source.id)}
                  >
                    删除
                  </Button>
                </Space>
              </div>
            ))}
            <Button type="dashed" onClick={addFileSource} style={{ width: '100%' }}>
              添加文件来源
            </Button>
          </div>

          <Form.Item
            name="templateId"
            label="选择模板"
            rules={[{ required: true, message: '请选择模板' }]}
          >
            <Select placeholder="选择模板">
              {templates.map(template => (
                <Option key={template.id} value={template.id}>
                  {template.name} ({template.workflows.length} 个工作流)
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="selectedFiles"
            label={
              <Space>
                <span>选择文件</span>
                <Button 
                  type="link" 
                  size="small"
                  onClick={() => {
                    const allFiles = fileSources.flatMap(source => 
                      source.files.map(file => JSON.stringify({ sourcePath: source.path, file: file }))
                    );
                    advancedBatchCreateForm.setFieldsValue({ selectedFiles: allFiles });
                  }}
                >
                  全选
                </Button>
                <Button 
                  type="link" 
                  size="small"
                  onClick={() => {
                    advancedBatchCreateForm.setFieldsValue({ selectedFiles: [] });
                  }}
                >
                  清空
                </Button>
              </Space>
            }
            rules={[{ required: true, message: '请选择至少一个文件' }]}
          >
            <Select
              mode="multiple"
              allowClear
              placeholder="请先提取文件, 然后选择"
              style={{ width: '100%' }}
              filterOption={(inputValue, option) => {
                const children = option?.children as unknown as string;
                return children?.toLowerCase().includes(inputValue.toLowerCase()) || false;
              }}
              maxTagCount="responsive"
            >
              {fileSources.map(source => (
                <Select.OptGroup key={source.id} label={
                  <Space>
                    <span>{source.path}</span>
                    <Button 
                      type="link" 
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        const sourceFiles = source.files.map(file => 
                          JSON.stringify({ sourcePath: source.path, file: file })
                        );
                        const currentSelected = advancedBatchCreateForm.getFieldValue('selectedFiles') || [];
                        const newSelected = [...new Set([...currentSelected, ...sourceFiles])];
                        advancedBatchCreateForm.setFieldsValue({ selectedFiles: newSelected });
                      }}
                    >
                      全选此来源
                    </Button>
                  </Space>
                }>
                  {source.files.map(file => (
                    <Select.Option key={`${source.id}-${file}`} value={JSON.stringify({ sourcePath: source.path, file: file })}>
                      {file}
                    </Select.Option>
                  ))}
                </Select.OptGroup>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="namePrefix"
            label="名称前缀"
          >
            <Input placeholder="默认为：任务" />
          </Form.Item>

          <Form.Item
            name="namePattern"
            label="名称模式（高级）"
          >
            <Input placeholder="例如：{fileName}-工作流，可使用 {fileName} 占位符" />
          </Form.Item>
          
          <Form.Item
            name="description"
            label="描述模式"
          >
            <TextArea 
              rows={3} 
              placeholder="可使用 {fileName}, {sourcePath} 占位符" 
            />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                智能批量创建
              </Button>
              <Button onClick={() => setIsAdvancedBatchCreateModalVisible(false)}>
                取消
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 导入模板模态框 */}
      <Modal
        title="导入模板"
        open={isTemplateModalVisible}
        onCancel={() => setIsTemplateModalVisible(false)}
        footer={null}
        width={800}
      >
        <Form layout="vertical">
          <Form.Item label="模板数据">
            <TextArea
              rows={15}
              value={importTemplateData}
              onChange={(e) => setImportTemplateData(e.target.value)}
              placeholder="请粘贴模板 JSON 数据..."
            />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" onClick={handleImportTemplate}>
                导入
              </Button>
              <Button onClick={() => setIsTemplateModalVisible(false)}>
                取消
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 工作流模板展示模态框 */}
      <Modal
        title="工作流模板预览"
        open={isWorkflowImportModalVisible}
        onCancel={() => {
          setIsWorkflowImportModalVisible(false);
          setWorkflowTemplateData('');
        }}
        footer={[
          <Button key="cancel" onClick={() => {
            setIsWorkflowImportModalVisible(false);
            setWorkflowTemplateData('');
          }}>
            取消
          </Button>,
          <Button key="use" type="primary" onClick={handleUseWorkflowTemplate}>
            使用此模板
          </Button>
        ]}
        width={900}
      >
        <div style={{ marginBottom: '16px' }}>
          <Typography.Text type="secondary">
            从工作流路由导入的模板数据，您可以查看并选择使用此模板
          </Typography.Text>
        </div>
        
        <CodeMirror
          value={workflowTemplateData}
          height="400px"
          extensions={[json()]}
          theme={oneDark}
          onChange={(value) => setWorkflowTemplateData(value)}
          editable={true}
        />
      </Modal>
      
      {/* 任务详情弹窗 */}
      <Modal
        title={`任务详情 - ${selectedTask?.name || ''}`}
        open={isDetailModalVisible}
        onCancel={() => {
          setIsDetailModalVisible(false);
          setSelectedTask(null);
          setSelectedExecutionContext(null);
        }}
        footer={null}
        width={1200}
        style={{ top: 20 }}
        destroyOnClose
      >
        {selectedTask?.template && (
          <div style={{ padding: '16px' }}>
            {/* 执行状态信息提示 */}
            {selectedExecutionContext?.isRunning && selectedExecutionContext.taskExecution && (
              <Card style={{ marginBottom: '16px', backgroundColor: '#f6ffed', borderColor: '#b7eb8f' }}>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Space>
                      <Typography.Text strong style={{ color: '#52c41a' }}>🜢 任务正在执行中</Typography.Text>
                      <Tag color="processing">进度: {Math.round(selectedExecutionContext.taskExecution.progress)}%</Tag>
                    </Space>
                  </div>
                  
                  <Progress 
                    percent={Math.round(selectedExecutionContext.taskExecution.progress)}
                    status="active"
                    format={() => {
                      const ctx = selectedExecutionContext.taskExecution;
                      return ctx ? `${ctx.currentWorkflowIndex + 1}/${ctx.totalWorkflows}` : '';
                    }}
                  />
                  
                  <Typography.Text type="secondary">
                    开始时间: {selectedExecutionContext.taskExecution.startTime?.toLocaleString()}
                  </Typography.Text>
                </Space>
              </Card>
            )}
            
            {/* 工作流列表 */}
            <Card 
              title={
                <Space>
                  <Typography.Text>工作流列表</Typography.Text>
                  <Tag color="blue">{selectedTask.template.workflows.length} 个工作流</Tag>
                </Space>
              }
            >
              {selectedTask.template.workflows.length === 0 ? (
                <Empty
                  description="暂无工作流"
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                />
              ) : (
                <List
                  itemLayout="vertical"
                  dataSource={selectedTask.template.workflows}
                  renderItem={(workflow: any, index: number) => {
                    const stepStats = {
                      total: workflow.steps?.length || 0,
                      success: workflow.steps?.filter((s: any) => s.status === 'success').length || 0,
                      error: workflow.steps?.filter((s: any) => s.status === 'error').length || 0,
                      running: workflow.steps?.filter((s: any) => s.status === 'running').length || 0
                    };
                    
                    return (
                      <List.Item
                        key={workflow.id || index}
                        style={{
                          border: '1px solid #f0f0f0',
                          borderRadius: '6px',
                          padding: '16px',
                          marginBottom: '16px',
                          backgroundColor: 'white'
                        }}
                      >
                        <List.Item.Meta
                          title={
                            <Space>
                              <Typography.Text type="secondary" style={{ fontSize: '14px', minWidth: '30px' }}>
                                #{index + 1}
                              </Typography.Text>
                              <Typography.Text strong style={{ fontSize: '16px' }}>
                                {workflow.name || `工作流 ${index + 1}`}
                              </Typography.Text>
                              <Tag color="blue">{stepStats.total} 步骤</Tag>
                              {stepStats.success > 0 && <Tag color="green">{stepStats.success} 成功</Tag>}
                              {stepStats.error > 0 && <Tag color="red">{stepStats.error} 失败</Tag>}
                              {stepStats.running > 0 && <Tag color="processing">{stepStats.running} 运行中</Tag>}
                            </Space>
                          }
                          description={
                            <div>
                              {workflow.description && (
                                <Typography.Paragraph 
                                  ellipsis={{ rows: 2, expandable: true }}
                                  style={{ marginBottom: '8px' }}
                                >
                                  {workflow.description}
                                </Typography.Paragraph>
                              )}
                              
                              <Space wrap>
                                <Typography.Text type="secondary">
                                  创建: {workflow.createdAt ? new Date(workflow.createdAt).toLocaleDateString() : '-'}
                                </Typography.Text>
                                <Typography.Text type="secondary">
                                  更新: {workflow.updatedAt ? new Date(workflow.updatedAt).toLocaleDateString() : '-'}
                                </Typography.Text>
                              </Space>
                              
                              {/* 步骤详情 */}
                              {workflow.steps && workflow.steps.length > 0 && (
                                <div style={{ marginTop: '12px' }}>
                                  <Typography.Text strong style={{ fontSize: '14px' }}>步骤列表：</Typography.Text>
                                  <div style={{ marginTop: '8px' }}>
                                    {workflow.steps.map((step: any, stepIndex: number) => (
                                      <div key={step.id || stepIndex} style={{ 
                                        padding: '8px 12px', 
                                        margin: '4px 0', 
                                        backgroundColor: '#fafafa', 
                                        borderRadius: '4px',
                                        border: '1px solid #f0f0f0'
                                      }}>
                                        <Space>
                                          <Typography.Text type="secondary" style={{ fontSize: '12px', minWidth: '20px' }}>
                                            {stepIndex + 1}.
                                          </Typography.Text>
                                          <Tag color={step.status === 'success' ? 'green' : step.status === 'error' ? 'red' : step.status === 'running' ? 'blue' : 'default'}>
                                            {step.status === 'success' ? '成功' : 
                                             step.status === 'error' ? '失败' : 
                                             step.status === 'running' ? '运行中' : '待执行'}
                                          </Tag>
                                          <Typography.Text style={{ fontSize: '13px' }}>
                                            {step.name || `步骤 ${stepIndex + 1}`}
                                          </Typography.Text>
                                        </Space>
                                        {step.description && (
                                          <div style={{ marginTop: '4px', marginLeft: '26px' }}>
                                            <Typography.Text type="secondary" style={{ fontSize: '12px' }}>
                                              {step.description}
                                            </Typography.Text>
                                          </div>
                                        )}
                                        {/* 步骤操作按钮区域 */}
                                        <div style={{ 
                                          marginTop: '6px', 
                                          marginLeft: '26px',
                                          display: 'flex',
                                          justifyContent: 'space-between',
                                          alignItems: 'center'
                                        }}>
                                          {step.result && (
                                            <div style={{ 
                                              flex: 1,
                                              padding: '6px 8px', 
                                              backgroundColor: step.result.success ? '#f6ffed' : '#fff2f0', 
                                              borderRadius: '3px',
                                              border: `1px solid ${step.result.success ? '#b7eb8f' : '#ffccc7'}`
                                            }}>
                                              <Typography.Text style={{ 
                                                fontSize: '12px', 
                                                color: step.result.success ? '#52c41a' : '#ff4d4f' 
                                              }}>
                                                {step.result.message}
                                              </Typography.Text>
                                            </div>
                                          )}
                                          <Space size="small" style={{ marginLeft: step.result ? '8px' : '0' }}>
                                            <Button 
                                              type="text" 
                                              size="small"
                                              icon={<ReloadOutlined />}
                                              onClick={() => reExecuteStep(workflow.id, step.id)}
                                              title="重新执行此步骤"
                                              disabled={selectedExecutionContext?.isRunning}
                                            >
                                              重新执行
                                            </Button>
                                            <Button 
                                              type="text" 
                                              size="small"
                                              icon={<ReloadOutlined />}
                                              onClick={() => reExecuteFromStep(workflow.id, step.id)}
                                              title="从此步骤开始重新向后执行"
                                              disabled={selectedExecutionContext?.isRunning}
                                            >
                                              从此重新执行
                                            </Button>
                                            {step.result && (
                                              <Button 
                                                type="text" 
                                                size="small"
                                                icon={<EyeOutlined />}
                                                onClick={() => viewStepResult(step)}
                                              >
                                                查看结果
                                              </Button>
                                            )}
                                          </Space>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          }
                        />
                      </List.Item>
                    );
                  }}
                />
              )}
            </Card>
          </div>
        )}
      </Modal>
      
      {/* 步骤结果查看模态框 */}
      <Modal
        title="步骤执行结果"
        open={isStepResultModalVisible}
        onCancel={() => {
          setIsStepResultModalVisible(false);
          setCurrentStepResult(null);
        }}
        footer={null}
        width="80%"
        zIndex={2000}
      >
        {currentStepResult && (
          <div style={{ marginTop: '20px' }}>
            <div style={{ 
              padding: '15px', 
              backgroundColor: currentStepResult.success ? '#f6ffed' : '#fff2f0', 
              border: `1px solid ${currentStepResult.success ? '#b7eb8f' : '#ffccc7'}`, 
              borderRadius: '4px',
              marginBottom: '16px'
            }}>
              <div style={{ marginBottom: '10px', fontWeight: 'bold' }}>
                {currentStepResult.success ? '执行成功' : '执行失败'}
              </div>
              <div>{currentStepResult.message}</div>
              
              {currentStepResult.data && (
                <div style={{ marginTop: '12px' }}>
                  <Typography.Text strong>输出信息:</Typography.Text>
                  <div style={{ marginTop: '8px' }}>
                    {currentStepResult.data.path && (
                      <div>
                        <Typography.Text type="secondary">输出文件: </Typography.Text>
                        <Typography.Text code>{currentStepResult.data.path}</Typography.Text>
                      </div>
                    )}
                    {currentStepResult.data.size && (
                      <div style={{ marginTop: '4px' }}>
                        <Typography.Text type="secondary">文件大小: </Typography.Text>
                        <Typography.Text>{currentStepResult.data.size}</Typography.Text>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            
            {currentStepResult.data?.content && (
              <div>
                <Typography.Text strong>文件内容预览:</Typography.Text>
                <div style={{ marginTop: '8px' }}>
                  <CodeMirror
                    value={currentStepResult.data.content}
                    extensions={getCodeMirrorExtensions(currentStepResult.data)}
                    readOnly
                    style={{
                      border: '1px solid #d9d9d9',
                      borderRadius: '4px',
                      maxHeight: '60vh',
                      overflow: 'auto'
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default WorkflowGroupManager;
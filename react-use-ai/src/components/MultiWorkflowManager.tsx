import React, { useState, useEffect } from 'react';
import {
  Card,
  List,
  Button,
  Modal,
  Input,
  message,
  Space,
  Typography,
  Popconfirm,
  Tag,
  Row,
  Col,
  Empty,
  Statistic,
  Progress,
  Tooltip,
  Table
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CopyOutlined,
  ExportOutlined,
  ImportOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  ReloadOutlined,
  FolderOutlined,
  HolderOutlined,
  MenuOutlined,
  UpOutlined,
  DownOutlined
} from '@ant-design/icons';
import axios from 'axios';
import type { Workflow, WorkflowStep } from './WorkflowDesigner';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

interface MultiWorkflowManagerProps {
  onCreateWorkflow: () => void;
  onEditWorkflow: (workflow: Workflow) => void;
  workflowGroup?: {
    id: string;
    name: string;
    executionContext?: {
      isRunning: boolean;
      taskExecution?: any;
      executingTasks: Set<string>;
    };
  };
}

interface WorkflowExecution {
  workflowId: string;
  isRunning: boolean;
  progress: number;
  startTime?: Date;
  endTime?: Date;
}

interface BatchExecution {
  isRunning: boolean;
  currentIndex: number;
  totalCount: number;
  startTime?: Date;
  endTime?: Date;
  results: Array<{
    workflowId: string;
    workflowName: string;
    success: boolean;
    message: string;
    duration: number;
  }>;
}

const MultiWorkflowManager: React.FC<MultiWorkflowManagerProps> = ({
  onCreateWorkflow,
  onEditWorkflow,
  workflowGroup
}) => {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [executions, setExecutions] = useState<Map<string, WorkflowExecution>>(new Map());
  const [batchExecution, setBatchExecution] = useState<BatchExecution | null>(null);
  const [isCreateModalVisible, setIsCreateModalVisible] = useState(false);
  const [isImportModalVisible, setIsImportModalVisible] = useState(false);
  const [isBatchResultModalVisible, setIsBatchResultModalVisible] = useState(false);
  const [isDragMode, setIsDragMode] = useState(false);
  const [newWorkflowName, setNewWorkflowName] = useState('');
  const [newWorkflowDescription, setNewWorkflowDescription] = useState('');
  const [importData, setImportData] = useState('');
  const [messageApi, contextHolder] = message.useMessage();

  // 加载工作流列表
  useEffect(() => {
    loadWorkflows();
    
    // 如果有传递的执行上下文，恢复执行状态
    if (workflowGroup?.executionContext) {
      const { isRunning, taskExecution, executingTasks } = workflowGroup.executionContext;
      
      if (isRunning && taskExecution) {
        // 显示恢复执行状态的提示
        messageApi.info(`检测到正在执行的任务，进度: ${Math.round(taskExecution.progress)}%`);
        
        // 这里可以添加更多恢复逻辑，比如设置执行状态
        // 但由于跨组件的复杂性，这里只显示信息
      }
    }
  }, [workflowGroup]);

  const loadWorkflows = async () => {
    try {
      // 如果是工作流组模式，使用多文件流接口
      const apiEndpoint = workflowGroup ? '/api/multi-stream/load' : '/api/config/load';
      const response = await axios.get(apiEndpoint);
      
      if (response.data.success && response.data.data) {
        const configData = response.data.data;
        
        let workflowsData = [];
        
        if (workflowGroup) {
          // 工作流组模式：从工作流组中获取工作流
          const groups = configData.workflowGroups || [];
          const currentGroup = groups.find((g: any) => g.id === workflowGroup.id);
          
          if (currentGroup && currentGroup.template && currentGroup.template.workflows) {
            workflowsData = currentGroup.template.workflows;
          }
        } else {
          // 普通模式：直接获取工作流列表
          workflowsData = configData.workflows || [];
        }
        
        if (Array.isArray(workflowsData)) {
          const workflows = workflowsData.map((workflow: any) => ({
            ...workflow,
            createdAt: new Date(workflow.createdAt),
            updatedAt: new Date(workflow.updatedAt)
          }));
          
          setWorkflows(workflows);
          messageApi.success(`工作流列表加载成功 (${workflows.length} 个)`);
        } else {
          messageApi.info('未找到保存的工作流');
          setWorkflows([]);
        }
      } else {
        messageApi.info(`未找到保存的${workflowGroup ? '多文件流' : ''}配置`);
        setWorkflows([]);
      }
    } catch (error) {
      console.error('加载工作流列表失败:', error);
      messageApi.error('加载工作流列表失败，请检查网络连接');
      setWorkflows([]);
    }
  };

  // 保存工作流配置
  const saveWorkflowConfig = async (workflowsToSave: Workflow[]) => {
    try {
      if (workflowGroup) {
        // 工作流组模式：使用多文件流接口
        const loadResponse = await axios.get('/api/multi-stream/load');
        let existingConfig = {};
        
        if (loadResponse.data.success && loadResponse.data.data) {
          existingConfig = loadResponse.data.data;
        }

        // 更新指定工作流组的模板
        const updatedConfig = {
          ...existingConfig,
          workflowGroups: (existingConfig as any).workflowGroups?.map((g: any) => {
            if (g.id === workflowGroup.id) {
              return {
                ...g,
                template: {
                  ...(g.template || {}),
                  workflows: workflowsToSave.map(w => ({
                    ...w,
                    steps: w.steps.map(step => ({
                      ...step,
                      status: 'pending' as const,
                      result: undefined
                    }))
                  })),
                  workflowOrder: workflowsToSave.map(w => w.id)
                },
                workflowCount: workflowsToSave.length,
                updatedAt: new Date().toISOString()
              };
            }
            return g;
          }) || [],
          lastUpdated: new Date().toISOString()
        };

        const response = await axios.post('/api/multi-stream/save', updatedConfig);
        
        if (!response.data.success) {
          throw new Error(response.data.message || '保存失败');
        }
        
        return true;
      } else {
        // 普通模式：使用原有接口
        const configData = {
          workflows: workflowsToSave.map(w => ({
            ...w,
            steps: w.steps.map(step => ({
              ...step,
              status: 'pending' as const,
              result: undefined
            }))
          })),
          workflowOrder: workflowsToSave.map(w => w.id)
        };
        
        const response = await axios.post('/api/config/save', configData);
        
        if (!response.data.success) {
          throw new Error(response.data.message || '保存失败');
        }
        
        return true;
      }
    } catch (error) {
      console.error('保存配置失败:', error);
      messageApi.error('保存配置失败，请检查网络连接');
      return false;
    }
  };

  // 创建新工作流
  const handleCreateWorkflow = async () => {
    if (!newWorkflowName.trim()) {
      messageApi.error('请输入工作流名称');
      return;
    }

    const newWorkflow: Workflow = {
      id: `workflow-${Date.now()}`,
      name: newWorkflowName.trim(),
      description: newWorkflowDescription.trim(),
      steps: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const newWorkflows = [newWorkflow, ...workflows];
    
    if (await saveWorkflowConfig(newWorkflows)) {
      setWorkflows(newWorkflows);
      setIsCreateModalVisible(false);
      setNewWorkflowName('');
      setNewWorkflowDescription('');
      
      messageApi.success('工作流创建成功');
      onEditWorkflow(newWorkflow);
    }
  };

  // 删除工作流
  const handleDeleteWorkflow = async (workflowId: string) => {
    const newWorkflows = workflows.filter(w => w.id !== workflowId);
    
    if (await saveWorkflowConfig(newWorkflows)) {
      setWorkflows(newWorkflows);
      
      // 清理执行状态
      const newExecutions = new Map(executions);
      newExecutions.delete(workflowId);
      setExecutions(newExecutions);
      
      messageApi.success('工作流删除成功');
    }
  };

  // 复制工作流
  const handleCopyWorkflow = async (workflow: Workflow) => {
    const copiedWorkflow: Workflow = {
      ...workflow,
      id: `workflow-${Date.now()}`,
      name: `${workflow.name} - 副本`,
      createdAt: new Date(),
      updatedAt: new Date(),
      // 重置所有步骤状态
      steps: workflow.steps.map(step => ({
        ...step,
        id: `step-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        status: 'pending' as const,
        result: undefined
      }))
    };

    try {
      const newWorkflows = [copiedWorkflow, ...workflows];
      
      // 保存整个工作流列表配置
      const configData = {
        workflows: newWorkflows.map(w => ({
          ...w,
          steps: w.steps.map(step => ({
            ...step,
            status: 'pending' as const,
            result: undefined
          }))
        })),
        workflowOrder: newWorkflows.map(w => w.id)
      };
      
      const response = await axios.post('/api/config/save', configData);
      
      if (response.data.success) {
        setWorkflows(newWorkflows);
        messageApi.success('工作流复制成功');
      } else {
        messageApi.error(response.data.message || '复制工作流失败');
      }
    } catch (error) {
      console.error('复制工作流失败:', error);
      messageApi.error('复制工作流失败，请检查网络连接');
    }
  };

  // 导出工作流
  const handleExportWorkflow = (workflow: Workflow) => {
    try {
      // 清理导出数据，移除执行结果
      const exportWorkflow = {
        ...workflow,
        steps: workflow.steps.map(step => ({
          ...step,
          status: 'pending' as const,
          result: undefined
        }))
      };
      
      const exportData = JSON.stringify(exportWorkflow, null, 2);
      const blob = new Blob([exportData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${workflow.name}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      messageApi.success('工作流导出成功');
    } catch (error) {
      messageApi.error('导出工作流失败');
    }
  };

  // 导出为工作流组模板
  const handleExportAsTemplate = async () => {
    try {
      if (workflows.length === 0) {
        messageApi.warning('没有可导出的工作流');
        return;
      }

      // 创建模板数据
      const templateData = {
        name: workflowGroup ? `${workflowGroup.name} - 模板` : '工作流组模板',
        description: `包含 ${workflows.length} 个工作流的模板`,
        workflows: workflows.map(workflow => ({
          ...workflow,
          steps: workflow.steps.map(step => ({
            ...step,
            status: 'pending' as const,
            result: undefined
          }))
        })),
        workflowOrder: workflows.map(w => w.id),
        createdAt: new Date().toISOString()
      };
      
      const dataStr = JSON.stringify(templateData, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `${templateData.name}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      messageApi.success('工作流组模板导出成功');
    } catch (error) {
      console.error('导出模板失败:', error);
      messageApi.error('导出模板失败');
    }
  };

  // 导入工作流
  const handleImportWorkflow = async () => {
    try {
      if (!importData.trim()) {
        messageApi.error('请输入工作流数据');
        return;
      }

      const workflow = JSON.parse(importData);
      
      // 验证工作流数据结构
      if (!workflow.name || !Array.isArray(workflow.steps)) {
        messageApi.error('工作流数据格式不正确');
        return;
      }

      // 生成新的ID和时间戳，重置执行状态
      const importedWorkflow: Workflow = {
        ...workflow,
        id: `workflow-${Date.now()}`,
        name: `${workflow.name} - 导入`,
        createdAt: new Date(),
        updatedAt: new Date(),
        steps: workflow.steps.map((step: any, index: number) => ({
          ...step,
          id: `step-${Date.now()}-${index}`,
          status: 'pending' as const,
          result: undefined
        }))
      };

      const newWorkflows = [importedWorkflow, ...workflows];
      
      // 保存整个工作流列表配置
      const configData = {
        workflows: newWorkflows.map(w => ({
          ...w,
          steps: w.steps.map(step => ({
            ...step,
            status: 'pending' as const,
            result: undefined
          }))
        })),
        workflowOrder: newWorkflows.map(w => w.id)
      };
      
      const response = await axios.post('/api/config/save', configData);
      
      if (response.data.success) {
        setWorkflows(newWorkflows);
        setIsImportModalVisible(false);
        setImportData('');
        messageApi.success('工作流导入成功');
      } else {
        messageApi.error(response.data.message || '导入工作流失败');
      }
    } catch (error) {
      console.error('导入工作流失败:', error);
      messageApi.error('导入工作流失败，请检查数据格式或网络连接');
    }
  };

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

  // 快速执行工作流（结果保留在界面）
  const handleQuickExecute = async (workflow: Workflow) => {
    if (workflow.steps.length === 0) {
      messageApi.error('该工作流没有配置步骤');
      return;
    }

    const execution: WorkflowExecution = {
      workflowId: workflow.id,
      isRunning: true,
      progress: 0,
      startTime: new Date()
    };

    const newExecutions = new Map(executions);
    newExecutions.set(workflow.id, execution);
    setExecutions(newExecutions);

    try {
      messageApi.info(`开始执行工作流: ${workflow.name}`);
      
      // 重置所有步骤状态
      const updatedWorkflows = workflows.map(w => {
        if (w.id === workflow.id) {
          return {
            ...w,
            steps: w.steps.map(step => ({ ...step, status: 'pending' as const, result: undefined }))
          };
        }
        return w;
      });
      setWorkflows(updatedWorkflows);

      // 按依赖关系执行步骤
      const executedSteps = new Set<string>();
      const stepResults = new Map<string, any>();
      const totalSteps = workflow.steps.length;
      let completedSteps = 0;

      const executeStep = async (step: WorkflowStep): Promise<void> => {
        // 检查依赖是否已执行
        for (const depId of step.dependencies) {
          if (!executedSteps.has(depId)) {
            const depStep = workflow.steps.find(s => s.id === depId);
            if (depStep) {
              await executeStep(depStep);
            }
          }
        }

        if (executedSteps.has(step.id)) return;

        // 更新步骤状态为运行中
        setWorkflows(prev => prev.map(w => {
          if (w.id === workflow.id) {
            return {
              ...w,
              steps: w.steps.map(s => 
                s.id === step.id ? { ...s, status: 'running' as const } : s
              )
            };
          }
          return w;
        }));

        try {
          // 调用实际的文件处理接口
          const result = await executeStepWithAPI(step, stepResults);
          
          // 存储结果，用于后续步骤的依赖和界面显示
          stepResults.set(step.id, result);
          
          // 更新UI状态（保留执行结果在界面上）
          setWorkflows(prev => prev.map(w => {
            if (w.id === workflow.id) {
              return {
                ...w,
                steps: w.steps.map(s => 
                  s.id === step.id ? { 
                    ...s, 
                    status: result.success ? 'success' as const : 'error' as const,
                    result 
                  } : s
                )
              };
            }
            return w;
          }));

          executedSteps.add(step.id);
          completedSteps++;
          
          // 更新执行进度
          const progress = (completedSteps / totalSteps) * 100;
          const updatedExecution = {
            ...execution,
            progress,
            isRunning: completedSteps < totalSteps
          };
          
          if (completedSteps === totalSteps) {
            updatedExecution.endTime = new Date();
            updatedExecution.isRunning = false;
          }
          
          newExecutions.set(workflow.id, updatedExecution);
          setExecutions(new Map(newExecutions));
        } catch (error) {
          const errorResult = { 
            success: false, 
            message: `步骤 "${step.name}" 执行失败: ${error}`
          };
          
          // 更新步骤状态为错误
          setWorkflows(prev => prev.map(w => {
            if (w.id === workflow.id) {
              return {
                ...w,
                steps: w.steps.map(s => 
                  s.id === step.id ? { 
                    ...s, 
                    status: 'error' as const,
                    result: errorResult
                  } : s
                )
              };
            }
            return w;
          }));
          
          completedSteps++;
          const progress = (completedSteps / totalSteps) * 100;
          const updatedExecution = {
            ...execution,
            progress,
            isRunning: false,
            endTime: new Date()
          };
          
          newExecutions.set(workflow.id, updatedExecution);
          setExecutions(new Map(newExecutions));
          throw error;
        }
      };

      // 执行所有步骤
      for (const step of workflow.steps.sort((a, b) => a.order - b.order)) {
        if (!executedSteps.has(step.id)) {
          await executeStep(step);
        }
      }

      messageApi.success(`工作流执行完成: ${workflow.name}`);
      
    } catch (error) {
      messageApi.error(`工作流执行失败: ${workflow.name}`);
      const failedExecution = newExecutions.get(workflow.id);
      if (failedExecution) {
        failedExecution.isRunning = false;
        failedExecution.endTime = new Date();
        newExecutions.set(workflow.id, failedExecution);
        setExecutions(new Map(newExecutions));
      }
    }
  };

  // 停止执行
  const handleStopExecution = (workflowId: string) => {
    const newExecutions = new Map(executions);
    const execution = newExecutions.get(workflowId);
    if (execution) {
      execution.isRunning = false;
      execution.endTime = new Date();
      newExecutions.set(workflowId, execution);
      setExecutions(newExecutions);
      messageApi.info('工作流执行已停止');
    }
  };

  // 批量执行所有工作流
  const handleBatchExecute = async () => {
    const executableWorkflows = workflows.filter(w => w.steps.length > 0);
    
    if (executableWorkflows.length === 0) {
      messageApi.error('没有可执行的工作流（需要至少包含一个步骤）');
      return;
    }

    const batch: BatchExecution = {
      isRunning: true,
      currentIndex: 0,
      totalCount: executableWorkflows.length,
      startTime: new Date(),
      results: []
    };

    setBatchExecution(batch);
    messageApi.info(`开始批量执行 ${executableWorkflows.length} 个工作流`);

    try {
      for (let i = 0; i < executableWorkflows.length; i++) {
        const workflow = executableWorkflows[i];
        
        // 更新批量执行状态
        setBatchExecution(prev => prev ? {
          ...prev,
          currentIndex: i
        } : null);

        messageApi.info(`正在执行工作流 ${i + 1}/${executableWorkflows.length}: ${workflow.name}`);

        const workflowStartTime = Date.now();
        let success = false;
        let errorMessage = '';

        try {
          // 调用快速执行函数，与快速执行按钮使用相同的逻辑
          await handleQuickExecute(workflow);
          success = true;
        } catch (error) {
          success = false;
          errorMessage = error instanceof Error ? error.message : '执行失败';
          messageApi.error(`工作流 "${workflow.name}" 执行失败: ${errorMessage}`);
        }

        const duration = Date.now() - workflowStartTime;

        // 记录执行结果
        setBatchExecution(prev => prev ? {
          ...prev,
          results: [...prev.results, {
            workflowId: workflow.id,
            workflowName: workflow.name,
            success,
            message: success ? '执行成功' : errorMessage,
            duration
          }]
        } : null);

        // 如果不是最后一个工作流，等待一段时间再执行下一个
        if (i < executableWorkflows.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      // 批量执行完成
      setBatchExecution(prev => prev ? {
        ...prev,
        isRunning: false,
        endTime: new Date(),
        currentIndex: executableWorkflows.length
      } : null);

      const successCount = batch.results.filter(r => r.success).length;
      const failCount = executableWorkflows.length - successCount;

      messageApi.success(
        `批量执行完成！成功: ${successCount} 个，失败: ${failCount} 个`
      );

      // 显示批量执行结果
      setIsBatchResultModalVisible(true);

    } catch (error) {
      setBatchExecution(prev => prev ? {
        ...prev,
        isRunning: false,
        endTime: new Date()
      } : null);
      messageApi.error('批量执行过程中发生错误');
    }
  };

  // 停止批量执行
  const handleStopBatchExecution = () => {
    setBatchExecution(prev => prev ? {
      ...prev,
      isRunning: false,
      endTime: new Date()
    } : null);
    messageApi.info('批量执行已停止');
  };



  // 上移工作流
  const moveWorkflowUp = (index: number) => {
    if (index === 0) return;
    
    const newWorkflows = [...workflows];
    [newWorkflows[index - 1], newWorkflows[index]] = [newWorkflows[index], newWorkflows[index - 1]];
    
    setWorkflows(newWorkflows);
    saveWorkflowOrder(newWorkflows);
    messageApi.success('工作流已上移');
  };

  // 下移工作流
  const moveWorkflowDown = (index: number) => {
    if (index === workflows.length - 1) return;
    
    const newWorkflows = [...workflows];
    [newWorkflows[index], newWorkflows[index + 1]] = [newWorkflows[index + 1], newWorkflows[index]];
    
    setWorkflows(newWorkflows);
    saveWorkflowOrder(newWorkflows);
    messageApi.success('工作流已下移');
  };

  // 保存工作流顺序
  const saveWorkflowOrder = async (workflowList: Workflow[]) => {
    await saveWorkflowConfig(workflowList);
  };

  // 重置排序
  const resetOrder = async () => {
    try {
      // 按更新时间重新排序
      const sortedWorkflows = [...workflows].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
      
      if (await saveWorkflowConfig(sortedWorkflows)) {
        setWorkflows(sortedWorkflows);
        messageApi.success('已重置为按更新时间排序');
      }
    } catch (error) {
      console.error('重置排序失败:', error);
      messageApi.error('重置排序失败，请检查网络连接');
    }
  };

  // 获取工作流统计信息
  const getWorkflowStats = () => {
    const total = workflows.length;
    const running = Array.from(executions.values()).filter(e => e.isRunning).length;
    const withSteps = workflows.filter(w => w.steps.length > 0).length;
    const batchRunning = batchExecution?.isRunning || false;
    
    return { total, running, withSteps, batchRunning };
  };

  const stats = getWorkflowStats();

  return (
    <div style={{ padding: '24px' }}>
      {contextHolder}
      
      {/* 执行状态信息提示 */}
      {workflowGroup?.executionContext?.isRunning && workflowGroup.executionContext.taskExecution && (
        <Card style={{ marginBottom: '16px', backgroundColor: '#f6ffed', borderColor: '#b7eb8f' }}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Space>
                <Text strong style={{ color: '#52c41a' }}>🟢 任务正在执行中</Text>
                <Tag color="processing">进度: {Math.round(workflowGroup.executionContext.taskExecution.progress)}%</Tag>
              </Space>
            </div>
            
            <Progress 
              percent={Math.round(workflowGroup.executionContext.taskExecution.progress)}
              status="active"
              format={() => {
                const ctx = workflowGroup?.executionContext?.taskExecution;
                return ctx ? `${ctx.currentWorkflowIndex + 1}/${ctx.totalWorkflows}` : '';
              }}
            />
            
            <Text type="secondary" style={{ fontSize: '12px' }}>
              正在执行第 {workflowGroup.executionContext.taskExecution.currentWorkflowIndex + 1} 个工作流，共 {workflowGroup.executionContext.taskExecution.totalWorkflows} 个
            </Text>
          </Space>
        </Card>
      )}

      {/* 头部统计 */}
      <Row gutter={16} style={{ marginBottom: '24px' }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="总工作流数"
              value={stats.total}
              prefix={<FolderOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="运行中"
              value={stats.running}
              prefix={<PlayCircleOutlined />}
              valueStyle={{ color: stats.running > 0 ? '#3f8600' : undefined }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="已配置步骤"
              value={stats.withSteps}
              suffix={`/ ${stats.total}`}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="执行成功率"
              value={stats.total > 0 ? Math.round((stats.withSteps / stats.total) * 100) : 0}
              suffix="%"
            />
          </Card>
        </Col>
      </Row>

      {/* 批量执行进度 */}
      {batchExecution && (
        <Card style={{ marginBottom: '16px' }}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Space>
                <Text strong>批量执行进度</Text>
                <Tag color={batchExecution.isRunning ? 'processing' : 'success'}>
                  {batchExecution.isRunning ? '执行中' : '已完成'}
                </Tag>
              </Space>
              {batchExecution.isRunning && (
                <Button 
                  danger
                  icon={<PauseCircleOutlined />}
                  onClick={handleStopBatchExecution}
                  size="small"
                >
                  停止批量执行
                </Button>
              )}
            </div>
            
            <Progress 
              percent={Math.round((batchExecution.currentIndex / batchExecution.totalCount) * 100)}
              status={batchExecution.isRunning ? 'active' : 'success'}
              format={() => `${batchExecution.currentIndex}/${batchExecution.totalCount}`}
            />
            
            <Text type="secondary" style={{ fontSize: '12px' }}>
              {batchExecution.isRunning 
                ? `正在执行第 ${batchExecution.currentIndex + 1} 个工作流...`
                : `批量执行完成，共执行 ${batchExecution.totalCount} 个工作流`
              }
            </Text>
          </Space>
        </Card>
      )}

      {/* 头部操作 */}
      <Row justify="space-between" align="middle" style={{ marginBottom: '24px' }}>
        <Col>
          <Title level={2}>多工作流管理</Title>
          <Text type="secondary">
            创建和管理多个独立的工作流程，支持批量顺序执行
          </Text>
        </Col>
        <Col>
          <Space>
            <Button 
              icon={<ReloadOutlined />}
              onClick={loadWorkflows}
              disabled={stats.batchRunning}
            >
              刷新列表
            </Button>
            <Button 
              icon={<MenuOutlined />}
              onClick={() => setIsDragMode(!isDragMode)}
              disabled={stats.batchRunning}
              type={isDragMode ? 'primary' : 'default'}
            >
              {isDragMode ? '完成排序' : '调整顺序'}
            </Button>
            {isDragMode && (
              <Button 
                onClick={resetOrder}
                disabled={stats.batchRunning}
                size="small"
              >
                重置排序
              </Button>
            )}
            <Button 
              icon={<ImportOutlined />}
              onClick={() => setIsImportModalVisible(true)}
              disabled={stats.batchRunning || isDragMode}
            >
              导入工作流
            </Button>
            <Button 
              icon={<ExportOutlined />}
              onClick={handleExportAsTemplate}
              disabled={stats.batchRunning || isDragMode || workflows.length === 0}
            >
              导出为模板
            </Button>
            <Button 
              type="default"
              icon={<PlayCircleOutlined />}
              onClick={handleBatchExecute}
              disabled={stats.batchRunning || stats.withSteps === 0 || isDragMode}
              style={{ backgroundColor: '#52c41a', borderColor: '#52c41a', color: 'white' }}
            >
              批量执行所有工作流
            </Button>
            <Button 
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setIsCreateModalVisible(true)}
              disabled={stats.batchRunning || isDragMode}
            >
              创建工作流
            </Button>
          </Space>
        </Col>
      </Row>

      {/* 工作流列表 */}
      <Card 
        title={
          <Space>
            <Text>工作流列表</Text>
            {isDragMode && (
              <Tag color="processing">排序模式 - 使用上下箭头调整顺序</Tag>
            )}
          </Space>
        }
      >
        {workflows.length === 0 ? (
          <Empty
            description="暂无工作流"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          >
            <Button 
              type="primary" 
              icon={<PlusOutlined />}
              onClick={() => setIsCreateModalVisible(true)}
            >
              创建第一个工作流
            </Button>
          </Empty>
        ) : (
          <List
            itemLayout="vertical"
            dataSource={workflows}
            renderItem={(workflow, index) => {
              const execution = executions.get(workflow.id);
              const isRunning = execution?.isRunning || false;
              const progress = execution?.progress || 0;
              
              return (
                <List.Item
                  style={{
                    border: '1px solid #f0f0f0',
                    borderRadius: '6px',
                    padding: '16px',
                    marginBottom: '16px',
                    backgroundColor: 'white'
                  }}
                  actions={[
                    isDragMode && (
                      <Space>
                        <Button 
                          type="text"
                          icon={<UpOutlined />}
                          onClick={() => moveWorkflowUp(index)}
                          disabled={index === 0 || isRunning || stats.batchRunning}
                          title="上移"
                        />
                        <Button 
                          type="text"
                          icon={<DownOutlined />}
                          onClick={() => moveWorkflowDown(index)}
                          disabled={index === workflows.length - 1 || isRunning || stats.batchRunning}
                          title="下移"
                        />
                      </Space>
                    ),
                    !isDragMode && (
                      <Button 
                        type="link" 
                        icon={<EditOutlined />}
                        onClick={() => onEditWorkflow(workflow)}
                        disabled={isRunning}
                      >
                        编辑
                      </Button>
                    ),
                    !isDragMode && workflow.steps.length > 0 && (
                      isRunning ? (
                        <Button 
                          type="link" 
                          icon={<PauseCircleOutlined />}
                          onClick={() => handleStopExecution(workflow.id)}
                          style={{ color: '#ff4d4f' }}
                        >
                          停止
                        </Button>
                      ) : (
                        <Button 
                          type="link" 
                          icon={<PlayCircleOutlined />}
                          onClick={() => handleQuickExecute(workflow)}
                          style={{ color: '#52c41a' }}
                          disabled={stats.batchRunning}
                        >
                          快速执行
                        </Button>
                      )
                    ),
                    !isDragMode && (
                      <Button 
                        type="link" 
                        icon={<CopyOutlined />}
                        onClick={() => handleCopyWorkflow(workflow)}
                        disabled={isRunning}
                      >
                        复制
                      </Button>
                    ),
                    !isDragMode && (
                      <Button 
                        type="link" 
                        icon={<ExportOutlined />}
                        onClick={() => handleExportWorkflow(workflow)}
                      >
                        导出
                      </Button>
                    ),
                    !isDragMode && (
                      <Popconfirm
                        title="确定要删除这个工作流吗？"
                        onConfirm={() => handleDeleteWorkflow(workflow.id)}
                        okText="确定"
                        cancelText="取消"
                        disabled={isRunning}
                      >
                        <Button 
                          type="link" 
                          danger 
                          icon={<DeleteOutlined />}
                          disabled={isRunning}
                        >
                          删除
                        </Button>
                      </Popconfirm>
                    )
                  ].filter(Boolean)}
                >
                  <List.Item.Meta
                    title={
                      <Space>
                        <Text type="secondary" style={{ fontSize: '14px', minWidth: '30px' }}>
                          #{index + 1}
                        </Text>
                        <Text strong style={{ fontSize: '16px' }}>
                          {workflow.name}
                        </Text>
                        <Tag color="blue">{workflow.steps.length} 步骤</Tag>
                        {isRunning && <Tag color="processing">执行中</Tag>}
                        {execution && !isRunning && execution.endTime && (
                          <Tag color="success">已完成</Tag>
                        )}
                        {batchExecution?.isRunning && 
                         batchExecution.currentIndex < index && (
                          <Tag color="default">等待批量执行</Tag>
                        )}
                        {batchExecution?.isRunning && 
                         batchExecution.currentIndex === index && (
                          <Tag color="processing">批量执行中</Tag>
                        )}
                      </Space>
                    }
                    description={
                      <div>
                        {workflow.description && (
                          <Paragraph 
                            ellipsis={{ rows: 2, expandable: true }}
                            style={{ marginBottom: '8px' }}
                          >
                            {workflow.description}
                          </Paragraph>
                        )}
                        
                        {/* 执行进度 */}
                        {isRunning && (
                          <div style={{ marginBottom: '8px' }}>
                            <Progress 
                              percent={Math.round(progress)} 
                              size="small"
                              status="active"
                            />
                            <Text type="secondary" style={{ fontSize: '12px' }}>
                              执行中... {Math.round(progress)}%
                            </Text>
                          </div>
                        )}
                        
                        <Space wrap>
                          <Text type="secondary">
                            创建: {workflow.createdAt.toLocaleDateString()}
                          </Text>
                          <Text type="secondary">
                            更新: {workflow.updatedAt.toLocaleDateString()}
                          </Text>
                          {execution?.startTime && (
                            <Text type="secondary">
                              开始执行: {execution.startTime.toLocaleTimeString()}
                            </Text>
                          )}
                          {execution?.endTime && (
                            <Text type="secondary">
                              完成时间: {execution.endTime.toLocaleTimeString()}
                            </Text>
                          )}
                        </Space>
                      </div>
                    }
                  />
                </List.Item>
              );
            }}
          />
        )}
      </Card>

      {/* 创建工作流模态框 */}
      <Modal
        title="创建新工作流"
        open={isCreateModalVisible}
        onOk={handleCreateWorkflow}
        onCancel={() => {
          setIsCreateModalVisible(false);
          setNewWorkflowName('');
          setNewWorkflowDescription('');
        }}
        okText="创建"
        cancelText="取消"
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <Text strong>工作流名称 *</Text>
            <Input
              value={newWorkflowName}
              onChange={(e) => setNewWorkflowName(e.target.value)}
              placeholder="请输入工作流名称"
              style={{ marginTop: '8px' }}
            />
          </div>
          <div>
            <Text strong>工作流描述</Text>
            <TextArea
              value={newWorkflowDescription}
              onChange={(e) => setNewWorkflowDescription(e.target.value)}
              placeholder="请输入工作流描述（可选）"
              rows={3}
              style={{ marginTop: '8px' }}
            />
          </div>
        </Space>
      </Modal>

      {/* 导入工作流模态框 */}
      <Modal
        title="导入工作流"
        open={isImportModalVisible}
        onOk={handleImportWorkflow}
        onCancel={() => {
          setIsImportModalVisible(false);
          setImportData('');
        }}
        okText="导入"
        cancelText="取消"
        width="60%"
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Text strong>工作流数据 (JSON格式)</Text>
          <TextArea
            value={importData}
            onChange={(e) => setImportData(e.target.value)}
            placeholder="请粘贴工作流的JSON数据"
            rows={10}
            style={{ fontFamily: 'monospace' }}
          />
          <Text type="secondary" style={{ fontSize: '12px' }}>
            注意：导入的工作流将自动重置所有执行状态，执行结果仅在界面显示不会持久化保存
          </Text>
        </Space>
      </Modal>

      {/* 批量执行结果模态框 */}
      <Modal
        title="批量执行结果"
        open={isBatchResultModalVisible}
        onCancel={() => setIsBatchResultModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setIsBatchResultModalVisible(false)}>
            关闭
          </Button>
        ]}
        width="70%"
      >
        {batchExecution && (
          <div>
            <Space direction="vertical" style={{ width: '100%', marginBottom: '16px' }}>
              <div>
                <Text strong>执行概要</Text>
              </div>
              <Row gutter={16}>
                <Col span={6}>
                  <Statistic
                    title="总工作流数"
                    value={batchExecution.totalCount}
                  />
                </Col>
                <Col span={6}>
                  <Statistic
                    title="成功数量"
                    value={batchExecution.results.filter(r => r.success).length}
                    valueStyle={{ color: '#3f8600' }}
                  />
                </Col>
                <Col span={6}>
                  <Statistic
                    title="失败数量"
                    value={batchExecution.results.filter(r => !r.success).length}
                    valueStyle={{ color: '#cf1322' }}
                  />
                </Col>
                <Col span={6}>
                  <Statistic
                    title="总耗时"
                    value={batchExecution.endTime && batchExecution.startTime 
                      ? Math.round((batchExecution.endTime.getTime() - batchExecution.startTime.getTime()) / 1000)
                      : 0
                    }
                    suffix="秒"
                  />
                </Col>
              </Row>
            </Space>

            <div>
              <Text strong>详细结果</Text>
              <List
                style={{ marginTop: '8px' }}
                dataSource={batchExecution.results}
                renderItem={(result, index) => (
                  <List.Item>
                    <List.Item.Meta
                      title={
                        <Space>
                          <Text>第 {index + 1} 个：{result.workflowName}</Text>
                          <Tag color={result.success ? 'success' : 'error'}>
                            {result.success ? '成功' : '失败'}
                          </Tag>
                        </Space>
                      }
                      description={
                        <Space>
                          <Text type="secondary">{result.message}</Text>
                          <Text type="secondary">耗时: {Math.round(result.duration / 1000)}秒</Text>
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default MultiWorkflowManager;
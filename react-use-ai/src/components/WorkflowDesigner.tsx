import React, { useState, useCallback, useMemo } from 'react';
import { 
  Button, 
  Card, 
  Modal, 
  message, 
  Space, 
  Typography, 
  Row,
  Col,
  Progress,
  Tag
} from 'antd';
import { 
  PlusOutlined, 
  PlayCircleOutlined, 
  SaveOutlined, 
  BranchesOutlined,
  EyeOutlined,
  ReloadOutlined
} from '@ant-design/icons';
import axios from 'axios';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { css } from '@codemirror/lang-css';
import DependencyGraph from './DependencyGraph';
import StepForm from './StepForm';
import '../styles/workflow.css';

const { Title, Text } = Typography;

// 文件输入接口
export interface FileInput {
  id: string;
  name: string;
  path: string;
  dependsOn?: string; // 依赖的步骤ID，可以引用前置步骤的输出文件
}

// 提示词输入接口
export interface PromptInput {
  id: string;
  content: string;
  fileReferences: string[]; // 引用的文件ID列表
}

// 步骤接口定义
export interface WorkflowStep {
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

// 工作流接口定义
export interface Workflow {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  createdAt: Date;
  updatedAt: Date;
}

interface WorkflowDesignerProps {
  workflow?: Workflow | null;
  onBack: () => void;
}

const WorkflowDesigner: React.FC<WorkflowDesignerProps> = ({ 
  workflow: initialWorkflow, 
  onBack 
}) => {
  const [messageApi, contextHolder] = message.useMessage();
  
  // 状态管理
  const [workflow, setWorkflow] = useState<Workflow>(() => {
    if (initialWorkflow) {
      return initialWorkflow;
    }
    return {
      id: `workflow-${Date.now()}`,
      name: '新建工作流',
      description: '',
      steps: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };
  });

  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [isStepFormVisible, setIsStepFormVisible] = useState(false);
  const [isDependencyGraphVisible, setIsDependencyGraphVisible] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [executionProgress, setExecutionProgress] = useState(0);
  const [isResultModalVisible, setIsResultModalVisible] = useState(false);
  const [currentStepResult, setCurrentStepResult] = useState<any>(null);

  // 加载工作流
  const loadWorkflow = useCallback(async () => {
    if (initialWorkflow) {
      setWorkflow(initialWorkflow);
    } else {
      // 如果没有传入工作流，尝试从服务器加载
      try {
        const response = await axios.get('/api/config/load');
        
        if (response.data.success && response.data.data) {
          const loadedWorkflow = {
            ...response.data.data,
            createdAt: new Date(response.data.data.createdAt),
            updatedAt: new Date(response.data.data.updatedAt)
          };
          setWorkflow(loadedWorkflow);
          messageApi.success('工作流配置加载成功');
        }
      } catch (error) {
        console.error('加载工作流失败:', error);
        messageApi.warning('加载工作流失败');
      }
    }
  }, [initialWorkflow, messageApi]);

  // 组件挂载时加载工作流
  React.useEffect(() => {
    loadWorkflow();
  }, [loadWorkflow]);

  // 获取选中的步骤
  const selectedStep = useMemo(() => 
    workflow.steps.find(step => step.id === selectedStepId) || null,
    [workflow.steps, selectedStepId]
  );

  // 添加新步骤
  const addStep = useCallback(() => {
    const newStep: WorkflowStep = {
      id: `step-${Date.now()}`,
      name: `步骤 ${workflow.steps.length + 1}`,
      description: '',
      type: 'file_process',
      config: {
        fileInputs: [],
        promptInputs: [],
        apiEndpoint: '/api/process-file', // 默认接口
        customSettings: {}
      },
      dependencies: [],
      status: 'pending',
      order: workflow.steps.length
    };

    setWorkflow(prev => ({
      ...prev,
      steps: [...prev.steps, newStep],
      updatedAt: new Date()
    }));

    setSelectedStepId(newStep.id);
    setIsStepFormVisible(true);
  }, [workflow.steps.length]);

  // 更新步骤
  const updateStep = useCallback((stepId: string, updates: Partial<WorkflowStep>) => {
    setWorkflow(prev => ({
      ...prev,
      steps: prev.steps.map(step => 
        step.id === stepId ? { ...step, ...updates } : step
      ),
      updatedAt: new Date()
    }));
  }, []);

  // 删除步骤
  const deleteStep = useCallback((stepId: string) => {
    setWorkflow(prev => {
      const newSteps = prev.steps.filter(step => step.id !== stepId);
      // 重新排序
      const reorderedSteps = newSteps.map((step, index) => ({
        ...step,
        order: index,
        // 移除对被删除步骤的依赖
        dependencies: step.dependencies.filter(dep => dep !== stepId)
      }));

      return {
        ...prev,
        steps: reorderedSteps,
        updatedAt: new Date()
      };
    });

    if (selectedStepId === stepId) {
      setSelectedStepId(null);
      setIsStepFormVisible(false);
    }
  }, [selectedStepId]);

  // 保存工作流配置（不包含执行结果）
  const saveWorkflow = useCallback(async () => {
    try {
      // 先加载现有配置
      const loadResponse = await axios.get('/api/config/load');
      let existingConfig = {};
      
      if (loadResponse.data.success && loadResponse.data.data) {
        existingConfig = loadResponse.data.data;
      }
      
      const workflowData = {
        ...workflow,
        updatedAt: new Date(),
        // 保存时移除执行结果，只保存配置
        steps: workflow.steps.map(step => ({
          ...step,
          status: 'pending' as const,
          result: undefined
        }))
      };
      
      // 更新配置中的当前工作流
      const configData = {
        ...existingConfig,
        currentWorkflow: workflowData,
        // 如果有工作流列表，也要更新其中对应的工作流
        workflows: existingConfig.workflows ? 
          existingConfig.workflows.map((w: any) => 
            w.id === workflow.id ? workflowData : w
          ) : undefined
      };
      
      // 通过统一的配置API保存
      const response = await axios.post('/api/config/save', configData);
      
      if (response.data.success) {
        // 更新当前工作流的时间戳，但保留执行结果
        setWorkflow(prev => ({
          ...prev,
          updatedAt: new Date()
        }));
        
        messageApi.success('工作流配置保存成功');
      } else {
        messageApi.error(response.data.message || '保存失败');
      }
    } catch (error) {
      console.error('保存工作流失败:', error);
      messageApi.error('保存失败，请检查网络连接');
    }
  }, [workflow, messageApi]);

  // 执行工作流（结果保留在界面，不通过API保存）
  const executeWorkflow = useCallback(async () => {
    if (workflow.steps.length === 0) {
      messageApi.error('请至少添加一个步骤');
      return;
    }

    setIsExecuting(true);
    setExecutionProgress(0);
    
    try {
      // 重置所有步骤状态
      setWorkflow(prev => ({
        ...prev,
        steps: prev.steps.map(step => ({ ...step, status: 'pending' as const, result: undefined }))
      }));

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
        updateStep(step.id, { status: 'running' });

        try {
          // 调用实际的文件处理接口
          const result = await executeStepWithAPI(step, stepResults);
          
          // 存储结果，用于后续步骤的依赖和界面显示
          stepResults.set(step.id, result);
          
          // 更新UI状态（保留执行结果在界面上）
          updateStep(step.id, { 
            status: result.success ? 'success' : 'error',
            result 
          });

          executedSteps.add(step.id);
          completedSteps++;
          setExecutionProgress((completedSteps / totalSteps) * 100);
        } catch (error) {
          const errorResult = { 
            success: false, 
            message: `步骤 "${step.name}" 执行失败: ${error}`
          };
          updateStep(step.id, { 
            status: 'error',
            result: errorResult
          });
          completedSteps++;
          setExecutionProgress((completedSteps / totalSteps) * 100);
          throw error;
        }
      };

      // 执行所有步骤
      for (const step of workflow.steps.sort((a, b) => a.order - b.order)) {
        if (!executedSteps.has(step.id)) {
          await executeStep(step);
        }
      }

      messageApi.success('工作流执行完成');
      
    } catch (error) {
      messageApi.error('工作流执行失败，请检查步骤配置');
    } finally {
      setIsExecuting(false);
      setExecutionProgress(100);
    }
  }, [workflow.steps, messageApi, updateStep]);

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

  // 查看步骤结果
  const viewStepResult = (step: WorkflowStep) => {
    if (step.result) {
      setCurrentStepResult(step.result);
      setIsResultModalVisible(true);
    }
  };

  // 重新执行单个步骤
  const reExecuteStep = useCallback(async (stepId: string) => {
    const step = workflow.steps.find(s => s.id === stepId);
    if (!step) {
      messageApi.error('找不到指定的步骤');
      return;
    }

    // 检查依赖步骤是否已成功执行
    const dependencyResults = new Map<string, any>();
    for (const depId of step.dependencies) {
      const depStep = workflow.steps.find(s => s.id === depId);
      if (!depStep || depStep.status !== 'success' || !depStep.result) {
        messageApi.error(`依赖步骤 "${depStep?.name || '未知'}" 未成功执行，无法重新执行此步骤`);
        return;
      }
      dependencyResults.set(depId, depStep.result);
    }

    // 更新步骤状态为运行中
    updateStep(stepId, { status: 'running', result: undefined });

    try {
      // 执行步骤
      const result = await executeStepWithAPI(step, dependencyResults);
      
      // 更新步骤状态和结果
      updateStep(stepId, { 
        status: result.success ? 'success' : 'error',
        result 
      });

      messageApi.success(`步骤 "${step.name}" 重新执行成功`);
    } catch (error) {
      const errorResult = { 
        success: false, 
        message: `步骤 "${step.name}" 重新执行失败: ${error}`
      };
      updateStep(stepId, { 
        status: 'error',
        result: errorResult
      });
      messageApi.error(`步骤 "${step.name}" 重新执行失败`);
    }
  }, [workflow.steps, messageApi, updateStep]);

  // 从指定步骤开始重新向后执行
  const reExecuteFromStep = useCallback(async (startStepId: string) => {
    const startStep = workflow.steps.find(s => s.id === startStepId);
    if (!startStep) {
      messageApi.error('找不到指定的步骤');
      return;
    }

    // 获取需要重新执行的步骤（包括当前步骤和所有依赖它的后续步骤）
    const getAffectedSteps = (stepId: string, visited = new Set<string>()): string[] => {
      if (visited.has(stepId)) return [];
      visited.add(stepId);
      
      const affectedSteps = [stepId];
      
      // 找到所有依赖当前步骤的步骤
      workflow.steps.forEach(step => {
        if (step.dependencies.includes(stepId)) {
          affectedSteps.push(...getAffectedSteps(step.id, visited));
        }
      });
      
      return affectedSteps;
    };

    const stepsToReExecute = getAffectedSteps(startStepId);
    const sortedSteps = workflow.steps
      .filter(step => stepsToReExecute.includes(step.id))
      .sort((a, b) => a.order - b.order);

    if (sortedSteps.length === 0) {
      messageApi.error('没有找到需要重新执行的步骤');
      return;
    }

    setIsExecuting(true);
    setExecutionProgress(0);

    try {
      // 重置要重新执行的步骤状态
      sortedSteps.forEach(step => {
        updateStep(step.id, { status: 'pending', result: undefined });
      });

      const executedSteps = new Set<string>();
      const stepResults = new Map<string, any>();
      
      // 收集已成功执行的依赖步骤结果
      workflow.steps.forEach(step => {
        if (!stepsToReExecute.includes(step.id) && step.status === 'success' && step.result) {
          stepResults.set(step.id, step.result);
          executedSteps.add(step.id);
        }
      });

      const totalSteps = sortedSteps.length;
      let completedSteps = 0;

      const executeStep = async (step: WorkflowStep): Promise<void> => {
        // 检查依赖是否已执行
        for (const depId of step.dependencies) {
          if (!executedSteps.has(depId)) {
            const depStep = workflow.steps.find(s => s.id === depId);
            if (depStep && stepsToReExecute.includes(depId)) {
              await executeStep(depStep);
            }
          }
        }

        if (executedSteps.has(step.id)) return;

        // 更新步骤状态为运行中
        updateStep(step.id, { status: 'running' });

        try {
          // 调用实际的文件处理接口
          const result = await executeStepWithAPI(step, stepResults);
          
          // 存储结果
          stepResults.set(step.id, result);
          
          // 更新UI状态
          updateStep(step.id, { 
            status: result.success ? 'success' : 'error',
            result 
          });

          executedSteps.add(step.id);
          completedSteps++;
          setExecutionProgress((completedSteps / totalSteps) * 100);
        } catch (error) {
          const errorResult = { 
            success: false, 
            message: `步骤 "${step.name}" 执行失败: ${error}`
          };
          updateStep(step.id, { 
            status: 'error',
            result: errorResult
          });
          completedSteps++;
          setExecutionProgress((completedSteps / totalSteps) * 100);
          throw error;
        }
      };

      // 执行所有需要重新执行的步骤
      for (const step of sortedSteps) {
        if (!executedSteps.has(step.id)) {
          await executeStep(step);
        }
      }

      messageApi.success(`从步骤 "${startStep.name}" 开始的重新执行完成`);
      
    } catch (error) {
      messageApi.error(`从步骤 "${startStep.name}" 开始的重新执行失败`);
    } finally {
      setIsExecuting(false);
      setExecutionProgress(100);
    }
  }, [workflow.steps, messageApi, updateStep]);

  // 获取CodeMirror扩展
  const getCodeMirrorExtensions = useMemo(() => {
    const path = currentStepResult?.data?.path || '';
    if (path.endsWith('.json')) return [json()];
    if (path.endsWith('.js') || path.endsWith('.jsx') || path.endsWith('.ts') || path.endsWith('.tsx')) {
      return [javascript({ jsx: true, typescript: true })];
    }
    if (path.endsWith('.css')) return [css()];
    return [];
  }, [currentStepResult?.data?.path]);

  return (
    <div style={{ padding: '24px', height: '100vh', overflow: 'auto' }}>
      {contextHolder}
      
      {/* 头部工具栏 */}
      <Card style={{ marginBottom: '16px' }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Space>
              <Button onClick={onBack}>
                ← 返回工作流列表
              </Button>
              <div>
                <Title level={3} style={{ margin: 0 }}>
                  {workflow.name}
                </Title>
                <Text type="secondary">
                  {workflow.steps.length} 个步骤 • 最后更新: {workflow.updatedAt.toLocaleString()}
                </Text>
              </div>
            </Space>
          </Col>
          <Col>
            <Space>
              <Button 
                icon={<BranchesOutlined />}
                onClick={() => setIsDependencyGraphVisible(true)}
                disabled={isLoading}
              >
                依赖关系图
              </Button>
              <Button 
                icon={<SaveOutlined />}
                onClick={saveWorkflow}
                disabled={isExecuting}
              >
                保存工作流
              </Button>
              <Button 
                type="primary"
                icon={<PlayCircleOutlined />}
                loading={isExecuting}
                onClick={executeWorkflow}
              >
                执行工作流
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* 执行进度 */}
      {isExecuting && (
        <Card style={{ marginBottom: '16px' }}>
          <div style={{ textAlign: 'center' }}>
            <Progress 
              percent={Math.round(executionProgress)} 
              status={executionProgress === 100 ? 'success' : 'active'}
              strokeColor={{
                '0%': '#108ee9',
                '100%': '#87d068',
              }}
            />
            <Text style={{ marginTop: '8px', display: 'block' }}>
              工作流执行中... {Math.round(executionProgress)}%
            </Text>
          </div>
        </Card>
      )}

      {/* 步骤列表 */}
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Card 
            title="工作流步骤"
            extra={
              <Button 
                type="primary" 
                icon={<PlusOutlined />}
                onClick={addStep}
                disabled={isExecuting || isLoading}
              >
                添加步骤
              </Button>
            }
          >
            {workflow.steps.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px' }}>
                <Text type="secondary">暂无步骤，点击"添加步骤"开始创建工作流</Text>
              </div>
            ) : (
              <Space direction="vertical" style={{ width: '100%' }} size="middle">
                {workflow.steps
                  .sort((a, b) => a.order - b.order)
                  .map((step) => (
                    <Card
                      key={step.id}
                      className={selectedStepId === step.id ? 'selected-step-card' : ''}
                      style={{
                        border: selectedStepId === step.id ? '2px solid #1890ff' : '1px solid #d9d9d9',
                        cursor: 'pointer'
                      }}
                      onClick={() => setSelectedStepId(step.id)}
                      actions={[
                        <Button 
                          type="text" 
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedStepId(step.id);
                            setIsStepFormVisible(true);
                          }}
                          disabled={isExecuting}
                        >
                          编辑
                        </Button>,
                        step.result && (
                          <Button 
                            type="text" 
                            icon={<EyeOutlined />}
                            onClick={(e) => {
                              e.stopPropagation();
                              viewStepResult(step);
                            }}
                          >
                            查看结果
                          </Button>
                        ),
                        <Button 
                          type="text" 
                          icon={<ReloadOutlined />}
                          onClick={(e) => {
                            e.stopPropagation();
                            reExecuteStep(step.id);
                          }}
                          disabled={isExecuting}
                          title="重新执行此步骤"
                        >
                          重新执行
                        </Button>,
                        <Button 
                          type="text" 
                          icon={<ReloadOutlined />}
                          onClick={(e) => {
                            e.stopPropagation();
                            reExecuteFromStep(step.id);
                          }}
                          disabled={isExecuting}
                          title="从此步骤开始重新向后执行"
                        >
                          从此重新执行
                        </Button>,
                        <Button 
                          type="text" 
                          danger 
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteStep(step.id);
                          }}
                          disabled={isExecuting}
                        >
                          删除
                        </Button>
                      ].filter(Boolean)}
                    >
                      <Card.Meta
                        title={
                          <Space>
                            <Text strong>步骤 {step.order + 1}: {step.name}</Text>
                            <Tag color={step.type === 'file_process' ? 'blue' : 'green'}>
                              {step.type === 'file_process' ? '文件处理' : '数据转换'}
                            </Tag>
                            {step.status === 'pending' && <Tag color="default">等待中</Tag>}
                            {step.status === 'running' && <Tag color="processing">运行中</Tag>}
                            {step.status === 'success' && <Tag color="success">成功</Tag>}
                            {step.status === 'error' && <Tag color="error">失败</Tag>}
                          </Space>
                        }
                        description={
                          <div>
                            {step.description && (
                              <div style={{ marginBottom: '8px' }}>
                                <Text>{step.description}</Text>
                              </div>
                            )}
                            <Space direction="vertical" size="small" style={{ width: '100%' }}>
                              <div>
                                <Text type="secondary">文件输入: </Text>
                                <Text>{step.config.fileInputs?.length || 0} 个</Text>
                                <Text type="secondary" style={{ marginLeft: '16px' }}>提示词: </Text>
                                <Text>{step.config.promptInputs?.length || 0} 个</Text>
                              </div>
                              
                              {step.dependencies.length > 0 && (
                                <div>
                                  <Text type="secondary">依赖步骤: </Text>
                                  <Text>
                                    {step.dependencies.map(depId => {
                                      const depStep = workflow.steps.find(s => s.id === depId);
                                      return depStep ? depStep.name : '未知步骤';
                                    }).join(', ')}
                                  </Text>
                                </div>
                              )}
                              
                              {step.config.outputFolder && (
                                <div>
                                  <Text type="secondary">输出: </Text>
                                  <Text code>{step.config.outputFolder}/{step.config.outputFileName}</Text>
                                </div>
                              )}
                              
                              {step.config.apiEndpoint && (
                                <div>
                                  <Text type="secondary">处理接口: </Text>
                                  <Text code>{step.config.apiEndpoint}</Text>
                                  <Text type="secondary" style={{ marginLeft: '8px' }}>
                                    ({step.config.apiEndpoint === '/api/process-file' ? '标准处理' : '直接处理'})
                                  </Text>
                                </div>
                              )}

                              {step.result && (
                                <div>
                                  <Text type="secondary">执行结果: </Text>
                                  <Text type={step.result.success ? 'success' : 'danger'}>
                                    {step.result.message}
                                  </Text>
                                </div>
                              )}
                            </Space>
                          </div>
                        }
                      />
                    </Card>
                  ))}
              </Space>
            )}
          </Card>
        </Col>
      </Row>

      {/* 步骤配置表单模态框 */}
      <Modal
        title={selectedStep ? `编辑步骤: ${selectedStep.name}` : '新建步骤'}
        open={isStepFormVisible}
        onCancel={() => setIsStepFormVisible(false)}
        footer={null}
        width="80%"
        destroyOnClose
      >
        {selectedStep && (
          <StepForm
            step={selectedStep}
            allSteps={workflow.steps}
            onSave={(updatedStep: Partial<WorkflowStep>) => {
              updateStep(selectedStep.id, updatedStep);
              setIsStepFormVisible(false);
              messageApi.success('步骤保存成功');
            }}
            onCancel={() => setIsStepFormVisible(false)}
          />
        )}
      </Modal>

      {/* 依赖关系图模态框 */}
      <Modal
        title="工作流依赖关系图"
        open={isDependencyGraphVisible}
        onCancel={() => setIsDependencyGraphVisible(false)}
        footer={null}
        width="90%"
        style={{ top: 20 }}
      >
        <DependencyGraph 
          steps={workflow.steps}
          onStepClick={(stepId: string) => {
            setSelectedStepId(stepId);
            setIsDependencyGraphVisible(false);
            setIsStepFormVisible(true);
          }}
        />
      </Modal>

      {/* 步骤结果查看模态框 */}
      <Modal
        title="步骤执行结果"
        open={isResultModalVisible}
        onCancel={() => setIsResultModalVisible(false)}
        footer={null}
        width="80%"
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
                  <Text strong>输出信息:</Text>
                  <div style={{ marginTop: '8px' }}>
                    {currentStepResult.data.path && (
                      <div>
                        <Text type="secondary">输出文件: </Text>
                        <Text code>{currentStepResult.data.path}</Text>
                      </div>
                    )}
                    {currentStepResult.data.size && (
                      <div style={{ marginTop: '4px' }}>
                        <Text type="secondary">文件大小: </Text>
                        <Text>{currentStepResult.data.size}</Text>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            
            {currentStepResult.data?.content && (
              <div>
                <Text strong>文件内容预览:</Text>
                <div style={{ marginTop: '8px' }}>
                  <CodeMirror
                    value={currentStepResult.data.content}
                    extensions={getCodeMirrorExtensions}
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

export default WorkflowDesigner;
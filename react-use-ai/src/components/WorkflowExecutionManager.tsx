import React, { useState, useCallback } from 'react';
import { Button, message, Progress, Card, Space, Typography, Tag } from 'antd';
import { PlayCircleOutlined, PauseCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import type { Workflow, WorkflowStep } from './WorkflowDesigner';

const { Text } = Typography;

interface WorkflowExecutionManagerProps {
  workflow: Workflow;
  onStepUpdate: (stepId: string, updates: Partial<WorkflowStep>) => void;
}

const WorkflowExecutionManager: React.FC<WorkflowExecutionManagerProps> = ({
  workflow,
  onStepUpdate
}) => {
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionProgress, setExecutionProgress] = useState(0);
  const [messageApi, contextHolder] = message.useMessage();

  // 重置工作流状态
  const resetWorkflowStatus = useCallback(() => {
    workflow.steps.forEach(step => {
      onStepUpdate(step.id, { 
        status: 'pending',
        result: undefined 
      });
    });
    setExecutionProgress(0);
    messageApi.info('工作流状态已重置');
  }, [workflow.steps, onStepUpdate, messageApi]);

  // 执行工作流（结果保留在界面，不持久化）
  const executeWorkflow = useCallback(async () => {
    if (workflow.steps.length === 0) {
      messageApi.error('请至少添加一个步骤');
      return;
    }

    setIsExecuting(true);
    setExecutionProgress(0);
    
    try {
      // 重置所有步骤状态
      workflow.steps.forEach(step => {
        onStepUpdate(step.id, { 
          status: 'pending',
          result: undefined 
        });
      });

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
        onStepUpdate(step.id, { status: 'running' });

        try {
          // 模拟步骤执行（实际应该调用真实的API）
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          const result = {
            success: Math.random() > 0.2, // 80% 成功率
            message: `步骤 "${step.name}" 执行${Math.random() > 0.2 ? '成功' : '失败'}`,
            data: {
              path: `${step.config.outputFolder}/${step.config.outputFileName}`,
              content: `执行结果内容 - ${new Date().toLocaleString()}`,
              size: `${Math.floor(Math.random() * 1000)}KB`
            }
          };
          
          // 存储结果，用于后续步骤的依赖和界面显示
          stepResults.set(step.id, result);
          
          // 更新UI状态（保留执行结果在界面上）
          onStepUpdate(step.id, { 
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
          onStepUpdate(step.id, { 
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
  }, [workflow.steps, onStepUpdate, messageApi]);

  // 获取执行统计
  const getExecutionStats = () => {
    const total = workflow.steps.length;
    const pending = workflow.steps.filter(s => s.status === 'pending').length;
    const running = workflow.steps.filter(s => s.status === 'running').length;
    const success = workflow.steps.filter(s => s.status === 'success').length;
    const error = workflow.steps.filter(s => s.status === 'error').length;
    
    return { total, pending, running, success, error };
  };

  const stats = getExecutionStats();

  return (
    <div>
      {contextHolder}
      
      {/* 执行控制面板 */}
      <Card size="small" style={{ marginBottom: '16px' }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Space>
              <Text strong>执行控制</Text>
              <Tag color="blue">{stats.total} 步骤</Tag>
              {stats.pending > 0 && <Tag color="default">{stats.pending} 等待</Tag>}
              {stats.running > 0 && <Tag color="processing">{stats.running} 运行中</Tag>}
              {stats.success > 0 && <Tag color="success">{stats.success} 成功</Tag>}
              {stats.error > 0 && <Tag color="error">{stats.error} 失败</Tag>}
            </Space>
            
            <Space>
              <Button 
                icon={<ReloadOutlined />}
                onClick={resetWorkflowStatus}
                disabled={isExecuting}
                size="small"
              >
                重置状态
              </Button>
              <Button 
                type="primary"
                icon={<PlayCircleOutlined />}
                loading={isExecuting}
                onClick={executeWorkflow}
                disabled={workflow.steps.length === 0}
              >
                {isExecuting ? '执行中...' : '开始执行'}
              </Button>
            </Space>
          </div>
          
          {/* 执行进度 */}
          {(isExecuting || executionProgress > 0) && (
            <div>
              <Progress 
                percent={Math.round(executionProgress)} 
                status={isExecuting ? 'active' : (stats.error > 0 ? 'exception' : 'success')}
                strokeColor={{
                  '0%': '#108ee9',
                  '100%': '#87d068',
                }}
              />
              <Text type="secondary" style={{ fontSize: '12px' }}>
                {isExecuting ? '工作流执行中...' : '执行完成'} {Math.round(executionProgress)}%
              </Text>
            </div>
          )}
        </Space>
      </Card>
    </div>
  );
};

export default WorkflowExecutionManager;
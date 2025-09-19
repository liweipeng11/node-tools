import React, { useState } from 'react';
import { Button, Space } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import WorkflowGroupManager from '../components/WorkflowGroupManager';
import MultiWorkflowManager from '../components/MultiWorkflowManager';
import WorkflowDesigner from '../components/WorkflowDesigner';
import type { Workflow } from '../components/WorkflowDesigner';

interface WorkflowGroup {
  id: string;
  name: string;
  description: string;
  template?: any;
  workflowCount: number;
  status: 'idle' | 'running' | 'completed' | 'failed';
  progress: number;
  createdAt: Date;
  updatedAt: Date;
}

type ViewMode = 'groups' | 'workflows' | 'designer';

const MainWorkflowPage: React.FC = () => {
  const [viewMode, setViewMode] = useState<ViewMode>('groups');
  const [currentGroup, setCurrentGroup] = useState<WorkflowGroup | null>(null);
  const [currentWorkflow, setCurrentWorkflow] = useState<Workflow | null>(null);

  // 打开工作流组
  const handleOpenGroup = (group: WorkflowGroup, executionContext?: {
    isRunning: boolean;
    taskExecution?: any;
    executingTasks: Set<string>;
  }) => {
    setCurrentGroup({
      ...group,
      // 如果有执行上下文，保留执行状态
      executionContext
    } as any);
    setViewMode('workflows');
  };

  // 返回工作流组列表
  const handleBackToGroups = () => {
    setCurrentGroup(null);
    setViewMode('groups');
  };

  // 创建新工作流
  const handleCreateWorkflow = () => {
    const newWorkflow: Workflow = {
      id: `workflow-${Date.now()}`,
      name: '新工作流',
      description: '',
      steps: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    setCurrentWorkflow(newWorkflow);
    setViewMode('designer');
  };

  // 编辑工作流
  const handleEditWorkflow = (workflow: Workflow) => {
    setCurrentWorkflow(workflow);
    setViewMode('designer');
  };

  // 返回工作流列表
  const handleBackToWorkflows = () => {
    setCurrentWorkflow(null);
    setViewMode('workflows');
  };

  // 渲染面包屑导航
  const renderBreadcrumb = () => {
    if (viewMode === 'groups') {
      return null;
    }

    return (
      <div style={{ marginBottom: '16px' }}>
        <Space>
          {viewMode === 'workflows' && (
            <>
              <Button 
                type="link" 
                icon={<ArrowLeftOutlined />} 
                onClick={handleBackToGroups}
              >
                返回工作流组
              </Button>
              <span>/</span>
              <span>{currentGroup?.name}</span>
            </>
          )}
          {viewMode === 'designer' && (
            <>
              <Button 
                type="link" 
                icon={<ArrowLeftOutlined />} 
                onClick={handleBackToGroups}
              >
                工作流组
              </Button>
              <span>/</span>
              <Button 
                type="link" 
                onClick={handleBackToWorkflows}
              >
                {currentGroup?.name}
              </Button>
              <span>/</span>
              <span>{currentWorkflow?.name}</span>
            </>
          )}
        </Space>
      </div>
    );
  };

  return (
    <div style={{ height: '100vh', overflow: 'hidden' }}>
      {renderBreadcrumb()}
      
      {viewMode === 'groups' && (
        <WorkflowGroupManager onOpenGroup={handleOpenGroup} />
      )}
      
      {viewMode === 'workflows' && currentGroup && (
        <MultiWorkflowManager 
          onCreateWorkflow={handleCreateWorkflow}
          onEditWorkflow={handleEditWorkflow}
          workflowGroup={{
            id: currentGroup.id,
            name: currentGroup.name,
            executionContext: (currentGroup as any).executionContext
          }}
        />
      )}
      
      {viewMode === 'designer' && currentWorkflow && (
        <WorkflowDesigner 
          workflow={currentWorkflow}
          onBack={handleBackToWorkflows}
        />
      )}
    </div>
  );
};

export default MainWorkflowPage;
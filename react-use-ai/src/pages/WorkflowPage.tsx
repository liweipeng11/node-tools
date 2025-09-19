import React, { useState } from 'react';
import { Layout, Typography } from 'antd';
import MultiWorkflowManager from '../components/MultiWorkflowManager';
import WorkflowDesigner from '../components/WorkflowDesigner';
import type { Workflow } from '../components/WorkflowDesigner';

const { Header, Content } = Layout;
const { Title } = Typography;

const WorkflowPage: React.FC = () => {
  const [currentView, setCurrentView] = useState<'manager' | 'designer'>('manager');
  const [currentWorkflow, setCurrentWorkflow] = useState<Workflow | null>(null);

  const handleCreateWorkflow = () => {
    setCurrentView('designer');
    setCurrentWorkflow(null);
  };

  const handleEditWorkflow = (workflow: Workflow) => {
    setCurrentView('designer');
    setCurrentWorkflow(workflow);
  };

  const handleBackToManager = () => {
    setCurrentView('manager');
    setCurrentWorkflow(null);
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ 
        background: '#fff', 
        padding: '0 24px', 
        borderBottom: '1px solid #f0f0f0',
        display: 'flex',
        alignItems: 'center'
      }}>
        <Title level={2} style={{ margin: 0, color: '#1890ff' }}>
          多工作流管理系统
        </Title>
      </Header>
      <Content style={{ padding: 0, background: '#f5f5f5' }}>
        {currentView === 'manager' ? (
          <MultiWorkflowManager 
            onCreateWorkflow={handleCreateWorkflow}
            onEditWorkflow={handleEditWorkflow}
          />
        ) : (
          <WorkflowDesigner 
            workflow={currentWorkflow}
            onBack={handleBackToManager}
          />
        )}
      </Content>
    </Layout>
  );
};

export default WorkflowPage;
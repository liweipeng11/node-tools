import React, { useState, useEffect } from 'react';
import { Layout, Typography, Button, Space, Breadcrumb } from 'antd';
import { ArrowLeftOutlined, HomeOutlined, FolderOutlined } from '@ant-design/icons';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import MultiWorkflowManager from '../components/MultiWorkflowManager';
import WorkflowDesigner from '../components/WorkflowDesigner';
import type { Workflow } from '../components/WorkflowDesigner';

const { Header, Content } = Layout;
const { Title } = Typography;

type ViewMode = 'workflows' | 'designer';

const WorkflowGroupDetailPage: React.FC = () => {
  const { groupId } = useParams<{ groupId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  
  const [viewMode, setViewMode] = useState<ViewMode>('workflows');
  const [currentWorkflow, setCurrentWorkflow] = useState<Workflow | null>(null);
  
  // 从路由状态获取工作流组信息
  const groupName = location.state?.groupName || '工作流组';
  const groupIdFromState = location.state?.groupId || groupId;
  const executionContext = location.state?.executionContext; // 获取执行上下文

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

  // 返回工作流组列表
  const handleBackToGroups = () => {
    navigate('/workflow-groups');
  };

  // 获取页面标题
  const getPageTitle = () => {
    switch (viewMode) {
      case 'workflows':
        return `工作流组: ${groupName}`;
      case 'designer':
        return `编辑工作流: ${currentWorkflow?.name}`;
      default:
        return `工作流组: ${groupName}`;
    }
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ 
        background: '#fff', 
        padding: '0 24px', 
        borderBottom: '1px solid #f0f0f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <Title level={2} style={{ margin: 0, color: '#1890ff' }}>
            {getPageTitle()}
          </Title>
        </div>
        <div>
          <Space>
            {viewMode === 'designer' && (
              <Button 
                icon={<ArrowLeftOutlined />} 
                onClick={handleBackToWorkflows}
              >
                返回工作流列表
              </Button>
            )}
            <Button 
              icon={<ArrowLeftOutlined />} 
              onClick={handleBackToGroups}
            >
              返回工作流组
            </Button>
          </Space>
        </div>
      </Header>
      
      <Content style={{ padding: '16px 24px 0', background: '#f5f5f5' }}>
        {/* 面包屑导航 */}
        <Breadcrumb style={{ marginBottom: '16px' }}>
          <Breadcrumb.Item>
            <HomeOutlined />
            <span 
              style={{ cursor: 'pointer', marginLeft: '8px' }} 
              onClick={handleBackToGroups}
            >
              工作流组管理
            </span>
          </Breadcrumb.Item>
          <Breadcrumb.Item>
            <FolderOutlined />
            <span style={{ marginLeft: '8px' }}>
              {viewMode === 'workflows' ? groupName : (
                <span 
                  style={{ cursor: 'pointer' }} 
                  onClick={handleBackToWorkflows}
                >
                  {groupName}
                </span>
              )}
            </span>
          </Breadcrumb.Item>
          {viewMode === 'designer' && (
            <Breadcrumb.Item>
              {currentWorkflow?.name}
            </Breadcrumb.Item>
          )}
        </Breadcrumb>

        {/* 主要内容 */}
        {viewMode === 'workflows' && (
          <MultiWorkflowManager 
            onCreateWorkflow={handleCreateWorkflow}
            onEditWorkflow={handleEditWorkflow}
            workflowGroup={{
              id: groupIdFromState,
              name: groupName,
              // 传递执行上下文信息
              executionContext: executionContext
            }}
          />
        )}
        
        {viewMode === 'designer' && currentWorkflow && (
          <WorkflowDesigner 
            workflow={currentWorkflow}
            onBack={handleBackToWorkflows}
          />
        )}
      </Content>
    </Layout>
  );
};

export default WorkflowGroupDetailPage;
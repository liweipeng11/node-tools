import React from 'react';
import { Layout, Typography } from 'antd';
import WorkflowGroupManager from '../components/WorkflowGroupManager';
import { useNavigate } from 'react-router-dom';

const { Header, Content } = Layout;
const { Title } = Typography;

const WorkflowGroupPage: React.FC = () => {
  const navigate = useNavigate();
  
  const handleOpenGroup = (group: any, executionContext?: {
    isRunning: boolean;
    taskExecution?: any;
    executingTasks: Set<string>;
  }) => {
    navigate(`/workflow-group/${group.id}`, { 
      state: { 
        groupName: group.name,
        groupId: group.id,
        // 传递执行上下文
        executionContext
      } 
    });
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
          任务管理系统
        </Title>
      </Header>
      <Content style={{ padding: 0, background: '#f5f5f5' }}>
        <WorkflowGroupManager onOpenGroup={handleOpenGroup} />
      </Content>
    </Layout>
  );
};

export default WorkflowGroupPage;
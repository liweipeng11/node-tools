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
  Empty
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CopyOutlined,
  ExportOutlined,
  ImportOutlined
} from '@ant-design/icons';
import type { Workflow } from './WorkflowDesigner';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

interface WorkflowManagerProps {
  onCreateWorkflow: () => void;
  onEditWorkflow: (workflow: Workflow) => void;
}

const WorkflowManager: React.FC<WorkflowManagerProps> = ({
  onEditWorkflow
}) => {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [isCreateModalVisible, setIsCreateModalVisible] = useState(false);
  const [isImportModalVisible, setIsImportModalVisible] = useState(false);
  const [newWorkflowName, setNewWorkflowName] = useState('');
  const [newWorkflowDescription, setNewWorkflowDescription] = useState('');
  const [importData, setImportData] = useState('');
  const [messageApi, contextHolder] = message.useMessage();

  // 加载工作流列表
  useEffect(() => {
    loadWorkflows();
  }, []);

  const loadWorkflows = () => {
    try {
      const savedWorkflows: Workflow[] = [];
      
      // 从localStorage加载工作流
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('workflow-')) {
          const workflowData = localStorage.getItem(key);
          if (workflowData) {
            try {
              const workflow = JSON.parse(workflowData);
              // 确保日期对象正确解析
              workflow.createdAt = new Date(workflow.createdAt);
              workflow.updatedAt = new Date(workflow.updatedAt);
              savedWorkflows.push(workflow);
            } catch (error) {
              console.error('解析工作流数据失败:', key, error);
            }
          }
        }
      }
      
      // 按更新时间排序
      savedWorkflows.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
      setWorkflows(savedWorkflows);
    } catch (error) {
      messageApi.error('加载工作流列表失败');
    }
  };

  // 创建新工作流
  const handleCreateWorkflow = () => {
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

    // 保存到localStorage
    localStorage.setItem(`workflow-${newWorkflow.id}`, JSON.stringify(newWorkflow));
    
    setWorkflows([newWorkflow, ...workflows]);
    setIsCreateModalVisible(false);
    setNewWorkflowName('');
    setNewWorkflowDescription('');
    
    messageApi.success('工作流创建成功');
    onEditWorkflow(newWorkflow);
  };

  // 删除工作流
  const handleDeleteWorkflow = (workflowId: string) => {
    try {
      localStorage.removeItem(`workflow-${workflowId}`);
      setWorkflows(workflows.filter(w => w.id !== workflowId));
      messageApi.success('工作流删除成功');
    } catch (error) {
      messageApi.error('删除工作流失败');
    }
  };

  // 复制工作流
  const handleCopyWorkflow = (workflow: Workflow) => {
    const copiedWorkflow: Workflow = {
      ...workflow,
      id: `workflow-${Date.now()}`,
      name: `${workflow.name} - 副本`,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    localStorage.setItem(`workflow-${copiedWorkflow.id}`, JSON.stringify(copiedWorkflow));
    setWorkflows([copiedWorkflow, ...workflows]);
    messageApi.success('工作流复制成功');
  };

  // 导出工作流
  const handleExportWorkflow = (workflow: Workflow) => {
    try {
      const exportData = JSON.stringify(workflow, null, 2);
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

  // 导入工作流
  const handleImportWorkflow = () => {
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

      // 生成新的ID和时间戳
      const importedWorkflow: Workflow = {
        ...workflow,
        id: `workflow-${Date.now()}`,
        name: `${workflow.name} - 导入`,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      localStorage.setItem(`workflow-${importedWorkflow.id}`, JSON.stringify(importedWorkflow));
      setWorkflows([importedWorkflow, ...workflows]);
      setIsImportModalVisible(false);
      setImportData('');
      messageApi.success('工作流导入成功');
    } catch (error) {
      messageApi.error('导入工作流失败，请检查数据格式');
    }
  };

  // 获取工作流状态统计
  const getWorkflowStats = (workflow: Workflow) => {
    const total = workflow.steps.length;
    const success = workflow.steps.filter(s => s.status === 'success').length;
    const error = workflow.steps.filter(s => s.status === 'error').length;
    const running = workflow.steps.filter(s => s.status === 'running').length;
    
    return { total, success, error, running };
  };

  return (
    <div style={{ padding: '24px' }}>
      {contextHolder}
      
      {/* 头部 */}
      <Row justify="space-between" align="middle" style={{ marginBottom: '24px' }}>
        <Col>
          <Title level={2}>工作流管理</Title>
          <Text type="secondary">
            管理和执行您的工作流程
          </Text>
        </Col>
        <Col>
          <Space>
            <Button 
              icon={<ImportOutlined />}
              onClick={() => setIsImportModalVisible(true)}
            >
              导入工作流
            </Button>
            <Button 
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setIsCreateModalVisible(true)}
            >
              创建工作流
            </Button>
          </Space>
        </Col>
      </Row>

      {/* 工作流列表 */}
      <Card>
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
            renderItem={(workflow) => {
              const stats = getWorkflowStats(workflow);
              
              return (
                <List.Item
                  actions={[
                    <Button 
                      type="link" 
                      icon={<EditOutlined />}
                      onClick={() => onEditWorkflow(workflow)}
                    >
                      编辑
                    </Button>,
                    <Button 
                      type="link" 
                      icon={<CopyOutlined />}
                      onClick={() => handleCopyWorkflow(workflow)}
                    >
                      复制
                    </Button>,
                    <Button 
                      type="link" 
                      icon={<ExportOutlined />}
                      onClick={() => handleExportWorkflow(workflow)}
                    >
                      导出
                    </Button>,
                    <Popconfirm
                      title="确定要删除这个工作流吗？"
                      onConfirm={() => handleDeleteWorkflow(workflow.id)}
                      okText="确定"
                      cancelText="取消"
                    >
                      <Button 
                        type="link" 
                        danger 
                        icon={<DeleteOutlined />}
                      >
                        删除
                      </Button>
                    </Popconfirm>
                  ]}
                >
                  <List.Item.Meta
                    title={
                      <Space>
                        <Text strong style={{ fontSize: '16px' }}>
                          {workflow.name}
                        </Text>
                        <Tag color="blue">{stats.total} 步骤</Tag>
                        {stats.success > 0 && <Tag color="green">{stats.success} 成功</Tag>}
                        {stats.error > 0 && <Tag color="red">{stats.error} 失败</Tag>}
                        {stats.running > 0 && <Tag color="processing">{stats.running} 运行中</Tag>}
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
                        <Space>
                          <Text type="secondary">
                            创建时间: {workflow.createdAt.toLocaleString()}
                          </Text>
                          <Text type="secondary">
                            更新时间: {workflow.updatedAt.toLocaleString()}
                          </Text>
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
        </Space>
      </Modal>
    </div>
  );
};

export default WorkflowManager;
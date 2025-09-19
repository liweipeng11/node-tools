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
  Progress,
  Typography,
  Row,
  Col,
  Statistic,
  Select,
  InputNumber,
  Tooltip
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  PlayCircleOutlined,
  StopOutlined,
  ExportOutlined,
  ImportOutlined,
  CopyOutlined,
  FolderOpenOutlined,
  ThunderboltOutlined,
  ReloadOutlined,
  InfoCircleOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { Option } = Select;

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

const WorkflowGroupList: React.FC = () => {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<WorkflowGroup[]>([]);
  const [templates, setTemplates] = useState<WorkflowGroupTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();

  // 创建工作流组相关状态
  const [isCreateModalVisible, setIsCreateModalVisible] = useState(false);
  const [createForm] = Form.useForm();

  // 批量创建相关状态
  const [isBatchCreateModalVisible, setIsBatchCreateModalVisible] = useState(false);
  const [batchCreateForm] = Form.useForm();

  // 模板管理相关状态
  const [isTemplateModalVisible, setIsTemplateModalVisible] = useState(false);
  const [importTemplateData, setImportTemplateData] = useState('');

  // 批量执行相关状态
  const [batchExecution, setBatchExecution] = useState<{
    isRunning: boolean;
    currentGroupIndex: number;
    totalGroups: number;
    results: Array<{
      groupId: string;
      groupName: string;
      status: 'pending' | 'running' | 'completed' | 'failed';
      startTime?: Date;
      endTime?: Date;
      error?: string;
    }>;
  }>({
    isRunning: false,
    currentGroupIndex: 0,
    totalGroups: 0,
    results: []
  });

  // 加载工作流组列表
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
          messageApi.success(`成功加载 ${groups.length} 个工作流组`);
        } else {
          setGroups([]);
          messageApi.info('暂无工作流组数据');
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
      console.error('加载工作流组失败:', error);
      messageApi.error('加载工作流组失败，请检查网络连接');
      setGroups([]);
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  // 获取配置文件信息
  const getConfigInfo = async () => {
    try {
      const response = await axios.get('/api/multi-stream/info');
      if (response.data.success) {
        const info = response.data.data;
        messageApi.info(`配置信息: 文件大小 ${info.size || 'N/A'}, 最后更新: ${info.lastModified ? new Date(info.lastModified).toLocaleString() : 'N/A'}`);
        return info;
      }
    } catch (error) {
      console.error('获取配置信息失败:', error);
      messageApi.error('获取配置信息失败');
    }
    return null;
  };

  // 显示配置信息
  const handleShowConfigInfo = async () => {
    const info = await getConfigInfo();
    if (info) {
      Modal.info({
        title: '多文件流配置信息',
        content: (
          <div>
            <p><strong>文件大小:</strong> {info.size || 'N/A'}</p>
            <p><strong>最后更新:</strong> {info.lastModified ? new Date(info.lastModified).toLocaleString() : 'N/A'}</p>
            <p><strong>工作流组数量:</strong> {groups.length}</p>
            <p><strong>模板数量:</strong> {templates.length}</p>
            <p><strong>配置路径:</strong> {info.path || 'N/A'}</p>
          </div>
        ),
        width: 500
      });
    }
  };

  useEffect(() => {
    loadGroups();
  }, []);

  // 保存配置到服务器
  const saveConfig = async (newGroups: WorkflowGroup[], newTemplates?: WorkflowGroupTemplate[]) => {
    try {
      // 先获取现有配置
      const loadResponse = await axios.get('/api/multi-stream/load');
      let existingConfig = {};
      
      if (loadResponse.data.success && loadResponse.data.data) {
        existingConfig = loadResponse.data.data;
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

  // 打开工作流组
  const handleOpenGroup = (group: WorkflowGroup) => {
    navigate(`/workflow-group/${group.id}`, { 
      state: { 
        groupName: group.name,
        groupId: group.id 
      } 
    });
  };

  // 创建工作流组
  const handleCreateGroup = async (values: any) => {
    const newGroup: WorkflowGroup = {
      id: `group-${Date.now()}`,
      name: values.name,
      description: values.description || '',
      template: values.templateId ? templates.find(t => t.id === values.templateId) : undefined,
      workflowCount: values.templateId ? 
        templates.find(t => t.id === values.templateId)?.workflows.length || 0 : 0,
      status: 'idle',
      progress: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const newGroups = [newGroup, ...groups];
    
    if (await saveConfig(newGroups)) {
      setGroups(newGroups);
      setIsCreateModalVisible(false);
      createForm.resetFields();
      messageApi.success('工作流组创建成功');
    }
  };

  // 批量创建工作流组
  const handleBatchCreate = async (values: any) => {
    if (!values.templateId) {
      messageApi.error('请选择模板');
      return;
    }

    const template = templates.find(t => t.id === values.templateId);
    if (!template) {
      messageApi.error('模板不存在');
      return;
    }

    const newGroups: WorkflowGroup[] = [];
    
    for (let i = 1; i <= values.count; i++) {
      const group: WorkflowGroup = {
        id: `group-${Date.now()}-${i}`,
        name: `${values.namePrefix}${i}`,
        description: values.description || '',
        template: template,
        workflowCount: template.workflows.length,
        status: 'idle',
        progress: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      newGroups.push(group);
    }

    const allGroups = [...newGroups, ...groups];
    
    if (await saveConfig(allGroups)) {
      setGroups(allGroups);
      setIsBatchCreateModalVisible(false);
      batchCreateForm.resetFields();
      messageApi.success(`成功创建 ${values.count} 个工作流组`);
    }
  };

  // 删除工作流组
  const handleDeleteGroup = async (groupId: string) => {
    const newGroups = groups.filter(g => g.id !== groupId);
    
    if (await saveConfig(newGroups)) {
      setGroups(newGroups);
      messageApi.success('工作流组删除成功');
    }
  };

  // 复制工作流组
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
      messageApi.success('工作流组复制成功');
    }
  };

  // 导出工作流组为模板
  const handleExportAsTemplate = async (group: WorkflowGroup) => {
    if (!group.template) {
      messageApi.error('该工作流组没有关联的模板数据');
      return;
    }

    const template: WorkflowGroupTemplate = {
      id: `template-${Date.now()}`,
      name: `${group.name} - 模板`,
      description: `从工作流组 "${group.name}" 导出的模板`,
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

  // 批量执行所有工作流组
  const handleBatchExecuteAll = async () => {
    if (groups.length === 0) {
      messageApi.warning('没有可执行的工作流组');
      return;
    }

    setBatchExecution({
      isRunning: true,
      currentGroupIndex: 0,
      totalGroups: groups.length,
      results: groups.map(group => ({
        groupId: group.id,
        groupName: group.name,
        status: 'pending'
      }))
    });

    // 依次执行每个工作流组
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      
      setBatchExecution(prev => ({
        ...prev,
        currentGroupIndex: i,
        results: prev.results.map((result, index) => 
          index === i ? { ...result, status: 'running', startTime: new Date() } : result
        )
      }));

      try {
        // 这里应该调用具体的工作流组执行逻辑
        // 暂时用延时模拟执行过程
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        setBatchExecution(prev => ({
          ...prev,
          results: prev.results.map((result, index) => 
            index === i ? { ...result, status: 'completed', endTime: new Date() } : result
          )
        }));

        messageApi.success(`工作流组 "${group.name}" 执行完成`);
      } catch (error) {
        setBatchExecution(prev => ({
          ...prev,
          results: prev.results.map((result, index) => 
            index === i ? { 
              ...result, 
              status: 'failed', 
              endTime: new Date(),
              error: error instanceof Error ? error.message : '执行失败'
            } : result
          )
        }));

        messageApi.error(`工作流组 "${group.name}" 执行失败`);
      }
    }

    setBatchExecution(prev => ({ ...prev, isRunning: false }));
    messageApi.success('批量执行完成');
  };

  // 停止批量执行
  const handleStopBatchExecution = () => {
    setBatchExecution(prev => ({ ...prev, isRunning: false }));
    messageApi.info('批量执行已停止');
  };

  // 获取统计信息
  const getStatistics = () => {
    const total = groups.length;
    const running = groups.filter(g => g.status === 'running').length;
    const completed = groups.filter(g => g.status === 'completed').length;
    const failed = groups.filter(g => g.status === 'failed').length;
    
    return { total, running, completed, failed };
  };

  const statistics = getStatistics();

  const columns = [
    {
      title: '#',
      key: 'index',
      width: 60,
      render: (_: any, __: any, index: number) => index + 1,
    },
    {
      title: '工作流组名称',
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
      width: 100,
      render: (status: string) => {
        const statusConfig = {
          idle: { color: 'default', text: '空闲' },
          running: { color: 'processing', text: '运行中' },
          completed: { color: 'success', text: '已完成' },
          failed: { color: 'error', text: '失败' }
        };
        const config = statusConfig[status as keyof typeof statusConfig];
        return <Tag color={config.color}>{config.text}</Tag>;
      },
    },
    {
      title: '进度',
      dataIndex: 'progress',
      key: 'progress',
      width: 120,
      render: (progress: number, record: WorkflowGroup) => (
        <Progress 
          percent={progress} 
          size="small" 
          status={record.status === 'failed' ? 'exception' : undefined}
        />
      ),
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
      width: 200,
      render: (_: any, record: WorkflowGroup) => (
        <Space size="small">
          <Tooltip title="打开工作流组">
            <Button 
              type="link" 
              icon={<FolderOpenOutlined />} 
              onClick={() => handleOpenGroup(record)}
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
            title="确定要删除这个工作流组吗？"
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
  ];

  return (
    <div style={{ padding: '24px' }}>
      {contextHolder}
      
      <Row justify="space-between" align="middle" style={{ marginBottom: '24px' }}>
        <Col>
          <Title level={2}>多文件流组管理</Title>
          <Text type="secondary">
            基于多文件流的工作流组管理系统，支持批量创建和模板管理
          </Text>
        </Col>
        <Col>
          <Space>
            <Button 
              icon={<ReloadOutlined />}
              onClick={loadGroups}
              disabled={batchExecution.isRunning}
            >
              刷新列表
            </Button>
            <Button 
              icon={<InfoCircleOutlined />}
              onClick={handleShowConfigInfo}
              disabled={batchExecution.isRunning}
            >
              配置信息
            </Button>
            <Button 
              type="primary" 
              icon={<PlusOutlined />} 
              onClick={() => setIsCreateModalVisible(true)}
            >
              创建工作流组
            </Button>
            <Button 
              icon={<ThunderboltOutlined />} 
              onClick={() => setIsBatchCreateModalVisible(true)}
            >
              批量创建
            </Button>
            <Button 
              icon={<ImportOutlined />} 
              onClick={() => setIsTemplateModalVisible(true)}
            >
              导入模板
            </Button>
            <Button 
              type="primary" 
              icon={<PlayCircleOutlined />} 
              onClick={handleBatchExecuteAll}
              disabled={batchExecution.isRunning || groups.length === 0}
            >
              批量执行所有
            </Button>
            {batchExecution.isRunning && (
              <Button 
                danger 
                icon={<StopOutlined />} 
                onClick={handleStopBatchExecution}
              >
                停止执行
              </Button>
            )}
          </Space>
        </Col>
      </Row>

      {/* 统计信息 */}
      <Row gutter={16} style={{ marginBottom: '24px' }}>
        <Col span={5}>
          <Card>
            <Statistic title="总工作流组" value={statistics.total} />
          </Card>
        </Col>
        <Col span={5}>
          <Card>
            <Statistic title="运行中" value={statistics.running} valueStyle={{ color: '#1890ff' }} />
          </Card>
        </Col>
        <Col span={5}>
          <Card>
            <Statistic title="已完成" value={statistics.completed} valueStyle={{ color: '#52c41a' }} />
          </Card>
        </Col>
        <Col span={5}>
          <Card>
            <Statistic title="失败" value={statistics.failed} valueStyle={{ color: '#ff4d4f' }} />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic 
              title="模板数量" 
              value={templates.length} 
              valueStyle={{ color: '#722ed1' }}
              prefix={<InfoCircleOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* 批量执行进度 */}
      {batchExecution.isRunning && (
        <Card style={{ marginBottom: '24px' }}>
          <Title level={4}>批量执行进度</Title>
          <Progress 
            percent={Math.round((batchExecution.currentGroupIndex / batchExecution.totalGroups) * 100)}
            status="active"
            format={() => `${batchExecution.currentGroupIndex}/${batchExecution.totalGroups}`}
          />
          <div style={{ marginTop: '16px' }}>
            {batchExecution.results.map((result, index) => (
              <div key={result.groupId} style={{ marginBottom: '8px' }}>
                <Space>
                  <Text>{result.groupName}</Text>
                  <Tag color={
                    result.status === 'pending' ? 'default' :
                    result.status === 'running' ? 'processing' :
                    result.status === 'completed' ? 'success' : 'error'
                  }>
                    {result.status === 'pending' ? '等待' :
                     result.status === 'running' ? '运行中' :
                     result.status === 'completed' ? '完成' : '失败'}
                  </Tag>
                  {result.error && <Text type="danger">{result.error}</Text>}
                </Space>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 工作流组列表 */}
      <Card>
        <Table
          columns={columns}
          dataSource={groups}
          rowKey="id"
          loading={loading}
          pagination={{
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 个工作流组`,
          }}
        />
      </Card>

      {/* 创建工作流组模态框 */}
      <Modal
        title="创建工作流组"
        open={isCreateModalVisible}
        onCancel={() => setIsCreateModalVisible(false)}
        footer={null}
      >
        <Form
          form={createForm}
          layout="vertical"
          onFinish={handleCreateGroup}
        >
          <Form.Item
            name="name"
            label="工作流组名称"
            rules={[{ required: true, message: '请输入工作流组名称' }]}
          >
            <Input placeholder="请输入工作流组名称" />
          </Form.Item>
          
          <Form.Item
            name="description"
            label="描述"
          >
            <TextArea rows={3} placeholder="请输入描述（可选）" />
          </Form.Item>

          <Form.Item
            name="templateId"
            label="选择模板"
          >
            <Select placeholder="选择模板（可选）" allowClear>
              {templates.map(template => (
                <Option key={template.id} value={template.id}>
                  {template.name} ({template.workflows.length} 个工作流)
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                创建
              </Button>
              <Button onClick={() => setIsCreateModalVisible(false)}>
                取消
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 批量创建模态框 */}
      <Modal
        title="批量创建工作流组"
        open={isBatchCreateModalVisible}
        onCancel={() => setIsBatchCreateModalVisible(false)}
        footer={null}
        width={600}
      >
        <Form
          form={batchCreateForm}
          layout="vertical"
          onFinish={handleBatchCreate}
        >
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
            name="namePrefix"
            label="名称前缀"
            rules={[{ required: true, message: '请输入名称前缀' }]}
          >
            <Input placeholder="例如：测试组" />
          </Form.Item>

          <Form.Item
            name="count"
            label="创建数量"
            rules={[{ required: true, message: '请输入创建数量' }]}
          >
            <InputNumber min={1} max={100} placeholder="请输入创建数量" style={{ width: '100%' }} />
          </Form.Item>
          
          <Form.Item
            name="description"
            label="描述"
          >
            <TextArea rows={3} placeholder="请输入描述（可选）" />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                批量创建
              </Button>
              <Button onClick={() => setIsBatchCreateModalVisible(false)}>
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
    </div>
  );
};

export default WorkflowGroupList;
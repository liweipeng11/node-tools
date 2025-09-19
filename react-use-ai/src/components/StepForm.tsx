import React, { useState, useEffect } from 'react';
import {
  Form,
  Input,
  Select,
  Button,
  Space,
  Card,
  Typography,
  Row,
  Col,
  message,
  Checkbox
} from 'antd';
import { PlusOutlined, DeleteOutlined, FileOutlined, EditOutlined } from '@ant-design/icons';
import type { WorkflowStep } from './WorkflowDesigner';

const { TextArea } = Input;
const { Text } = Typography;
const { Option } = Select;

interface StepFormProps {
  step: WorkflowStep;
  allSteps: WorkflowStep[];
  onSave: (step: Partial<WorkflowStep>) => void;
  onCancel: () => void;
}

interface FileInput {
  id: string;
  name: string;
  path: string;
  dependsOn?: string; // 依赖的步骤ID，可以引用前置步骤的输出文件
}

interface PromptInput {
  id: string;
  content: string;
  fileReferences: string[]; // 引用的文件ID列表
}

const StepForm: React.FC<StepFormProps> = ({
  step,
  allSteps,
  onSave,
  onCancel
}) => {
  const [form] = Form.useForm();
  const [fileInputs, setFileInputs] = useState<FileInput[]>(
    step.config.fileInputs || []
  );
  const [promptInputs, setPromptInputs] = useState<PromptInput[]>(
    step.config.promptInputs || []
  );
  const [messageApi, contextHolder] = message.useMessage();

  // 可选择的依赖步骤（排除当前步骤和后续步骤）
  const availableDependencies = allSteps.filter(s => 
    s.id !== step.id && s.order < step.order
  );

  useEffect(() => {
    // 初始化表单值
    form.setFieldsValue({
      name: step.name,
      description: step.description,
      type: step.type,
      dependencies: step.dependencies,
      outputFolder: step.config.outputFolder,
      outputFileName: step.config.outputFileName,
      apiEndpoint: step.config.apiEndpoint || '/api/process-file',
      ...step.config.customSettings
    });
  }, [step, form]);

  // 添加文件输入
  const addFileInput = () => {
    const newFileInput: FileInput = {
      id: `file-${Date.now()}`,
      name: `文件${fileInputs.length + 1}`,
      path: ''
    };
    setFileInputs([...fileInputs, newFileInput]);
  };

  // 更新文件输入
  const updateFileInput = (id: string, field: keyof FileInput, value: any) => {
    setFileInputs(fileInputs.map(file => 
      file.id === id ? { ...file, [field]: value } : file
    ));
  };

  // 删除文件输入
  const removeFileInput = (id: string) => {
    setFileInputs(fileInputs.filter(file => file.id !== id));
    // 同时从提示词中移除对此文件的引用
    setPromptInputs(promptInputs.map(prompt => ({
      ...prompt,
      fileReferences: prompt.fileReferences.filter(ref => ref !== id)
    })));
  };

  // 添加提示词输入
  const addPromptInput = () => {
    const newPromptInput: PromptInput = {
      id: `prompt-${Date.now()}`,
      content: '',
      fileReferences: []
    };
    setPromptInputs([...promptInputs, newPromptInput]);
  };

  // 更新提示词输入
  const updatePromptInput = (id: string, field: keyof PromptInput, value: any) => {
    setPromptInputs(promptInputs.map(prompt => 
      prompt.id === id ? { ...prompt, [field]: value } : prompt
    ));
  };

  // 删除提示词输入
  const removePromptInput = (id: string) => {
    setPromptInputs(promptInputs.filter(prompt => prompt.id !== id));
  };

  // 获取步骤类型选项
  const getStepTypeOptions = () => [
    { value: 'file_process', label: '文件处理' },
    { value: 'data_transform', label: '数据转换' },
    { value: 'api_call', label: 'API调用' },
    { value: 'condition', label: '条件判断' }
  ];

  // 保存步骤配置
  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      
      // 验证文件输入配置
      if (fileInputs.length === 0) {
        messageApi.error('请至少添加一个文件输入');
        return;
      }

      // 检查文件输入必填字段
      for (const file of fileInputs) {
        if (!file.name.trim()) {
          messageApi.error('请为所有文件输入设置名称');
          return;
        }
        // 如果选择了依赖步骤，跳过路径验证（允许路径为空）
        if (file.dependsOn) {
          continue;
        }
      }

      // 验证提示词输入
      if (promptInputs.length === 0) {
        messageApi.error('请至少添加一个提示词');
        return;
      }

      for (const prompt of promptInputs) {
        if (!prompt.content.trim()) {
          messageApi.error('请完善所有提示词内容');
          return;
        }
      }

      // 验证输出配置
      if (!values.outputFolder?.trim()) {
        messageApi.error('请设置输出文件夹路径');
        return;
      }

      if (!values.outputFileName?.trim()) {
        messageApi.error('请设置输出文件名');
        return;
      }

      const updatedStep: Partial<WorkflowStep> = {
        name: values.name,
        description: values.description,
        type: values.type,
        dependencies: values.dependencies || [],
        config: {
          fileInputs: fileInputs,
          promptInputs: promptInputs,
          outputFolder: values.outputFolder,
          outputFileName: values.outputFileName,
          apiEndpoint: values.apiEndpoint,
          customSettings: {
            // 保存其他自定义设置
            apiUrl: values.apiUrl,
            timeout: values.timeout,
            retryCount: values.retryCount,
            condition: values.condition
          }
        }
      };

      onSave(updatedStep);
    } catch (error) {
      messageApi.error('请检查表单配置');
    }
  };

  return (
    <div style={{ maxHeight: '70vh', overflow: 'auto' }}>
      {contextHolder}
      
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSave}
      >
        {/* 基本信息 */}
        <Card title="基本信息" style={{ marginBottom: '16px' }}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="name"
                label="步骤名称"
                rules={[{ required: true, message: '请输入步骤名称' }]}
              >
                <Input placeholder="请输入步骤名称" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="type"
                label="步骤类型"
                rules={[{ required: true, message: '请选择步骤类型' }]}
              >
                <Select placeholder="请选择步骤类型">
                  {getStepTypeOptions().map(option => (
                    <Option key={option.value} value={option.value}>
                      {option.label}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          
          <Form.Item
            name="description"
            label="步骤描述"
          >
            <TextArea 
              rows={3} 
              placeholder="请输入步骤描述（可选）" 
            />
          </Form.Item>

          <Form.Item
            name="dependencies"
            label="依赖步骤"
          >
            <Select
              mode="multiple"
              placeholder="选择此步骤依赖的前置步骤"
              allowClear
            >
              {availableDependencies.map(dep => (
                <Option key={dep.id} value={dep.id}>
                  步骤 {dep.order + 1}: {dep.name}
                </Option>
              ))}
            </Select>
          </Form.Item>
        </Card>

        {/* 1. 文件输入配置 */}
        <Card 
          title="1. 文件输入配置"
          extra={
            <Button 
              type="primary"
              size="small" 
              icon={<PlusOutlined />}
              onClick={addFileInput}
            >
              添加文件
            </Button>
          }
          style={{ marginBottom: '16px' }}
        >
          <Text type="secondary" style={{ display: 'block', marginBottom: '16px' }}>
            为每个输入文件设置名称和路径，或者引用前置步骤的输出文件
          </Text>
          
          {fileInputs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px' }}>
              <Text type="secondary">暂无文件输入，请添加文件</Text>
            </div>
          ) : (
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              {fileInputs.map((file, index) => (
                <Card 
                  key={file.id}
                  size="small"
                  title={
                    <Space>
                      <FileOutlined />
                      <Text>文件 {index + 1}</Text>
                    </Space>
                  }
                  extra={
                    <Button 
                      type="text" 
                      danger 
                      icon={<DeleteOutlined />}
                      onClick={() => removeFileInput(file.id)}
                    />
                  }
                >
                  <Row gutter={16}>
                    <Col span={8}>
                      <Text strong>文件名称:</Text>
                      <Input
                        value={file.name}
                        onChange={(e) => updateFileInput(file.id, 'name', e.target.value)}
                        placeholder="为文件设置一个名称"
                        style={{ marginTop: '4px' }}
                      />
                    </Col>
                    <Col span={10}>
                      <Text strong>文件路径:</Text>
                      <Input
                        value={file.dependsOn ? '将自动使用依赖步骤的输出文件' : file.path}
                        onChange={(e) => updateFileInput(file.id, 'path', e.target.value)}
                        placeholder={file.dependsOn ? '将自动使用依赖步骤的输出文件' : '输入文件的完整路径'}
                        disabled={!!file.dependsOn}
                        style={{ 
                          marginTop: '4px',
                          color: file.dependsOn ? '#999' : undefined,
                          fontStyle: file.dependsOn ? 'italic' : undefined
                        }}
                      />
                    </Col>
                    <Col span={6}>
                      <Text strong>或引用步骤输出:</Text>
                      <Select
                        value={file.dependsOn}
                        onChange={(value) => {
                          updateFileInput(file.id, 'dependsOn', value);
                          if (value) {
                            updateFileInput(file.id, 'path', ''); // 清空路径
                          }
                        }}
                        placeholder="选择依赖步骤"
                        allowClear
                        style={{ width: '100%', marginTop: '4px' }}
                      >
                        {availableDependencies.map(dep => (
                          <Option key={dep.id} value={dep.id}>
                            {dep.name}
                          </Option>
                        ))}
                      </Select>
                    </Col>
                  </Row>
                </Card>
              ))}
            </Space>
          )}
        </Card>

        {/* 2. 提示词配置 */}
        <Card 
          title="2. 提示词配置"
          extra={
            <Button 
              type="primary"
              size="small" 
              icon={<PlusOutlined />}
              onClick={addPromptInput}
            >
              添加提示词
            </Button>
          }
          style={{ marginBottom: '16px' }}
        >
          <Text type="secondary" style={{ display: 'block', marginBottom: '16px' }}>
            编写处理指令，可以在提示词中引用上面配置的文件
          </Text>
          
          {promptInputs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px' }}>
              <Text type="secondary">暂无提示词，请添加提示词</Text>
            </div>
          ) : (
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              {promptInputs.map((prompt, index) => (
                <Card 
                  key={prompt.id}
                  size="small"
                  title={
                    <Space>
                      <EditOutlined />
                      <Text>提示词 {index + 1}</Text>
                    </Space>
                  }
                  extra={
                    <Button 
                      type="text" 
                      danger 
                      icon={<DeleteOutlined />}
                      onClick={() => removePromptInput(prompt.id)}
                    />
                  }
                >
                  <Row gutter={16}>
                    <Col span={16}>
                      <Text strong>提示词内容:</Text>
                      <TextArea
                        value={prompt.content}
                        onChange={(e) => updatePromptInput(prompt.id, 'content', e.target.value)}
                        placeholder="输入处理指令，可以使用 {{文件名}} 来引用文件"
                        rows={4}
                        style={{ marginTop: '4px' }}
                      />
                    </Col>
                    <Col span={8}>
                      <Text strong>引用的文件:</Text>
                      <div style={{ marginTop: '4px' }}>
                        <Checkbox.Group
                          value={prompt.fileReferences}
                          onChange={(values) => updatePromptInput(prompt.id, 'fileReferences', values)}
                        >
                          <Space direction="vertical">
                            {fileInputs.map(file => (
                              <Checkbox key={file.id} value={file.id}>
                                {file.name}
                              </Checkbox>
                            ))}
                          </Space>
                        </Checkbox.Group>
                        {prompt.fileReferences.length > 0 && (
                          <div style={{ marginTop: '8px' }}>
                            <Text type="secondary" style={{ fontSize: '12px' }}>
                              在提示词中使用: {prompt.fileReferences.map(ref => {
                                const file = fileInputs.find(f => f.id === ref);
                                return file ? `{{${file.name}}}` : '';
                              }).join(', ')}
                            </Text>
                          </div>
                        )}
                      </div>
                    </Col>
                  </Row>
                </Card>
              ))}
            </Space>
          )}
        </Card>

        {/* 3. 输出配置 */}
        <Card title="3. 输出配置" style={{ marginBottom: '16px' }}>
          <Text type="secondary" style={{ display: 'block', marginBottom: '16px' }}>
            指定处理结果的输出位置和文件格式
          </Text>
          
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                name="outputFolder"
                label="输出文件夹"
                rules={[{ required: true, message: '请输入输出文件夹路径' }]}
              >
                <Input placeholder="如: ./output" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="outputFileName"
                label="输出文件名"
                rules={[{ required: true, message: '请输入输出文件名' }]}
              >
                <Input placeholder="如: result.tsx, output.json" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="apiEndpoint"
                label="处理接口"
                rules={[{ required: true, message: '请选择处理接口' }]}
              >
                <Select placeholder="选择处理接口">
                  <Option value="/api/process-file">标准处理接口</Option>
                  <Option value="/api/process-file-direct?model=qianwen">直接处理接口（千问）</Option>
                  <Option value="/api/process-file-direct?model=deepseek">直接处理接口（deepseek）</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
        </Card>

        {/* 高级配置 */}
        <Card title="高级配置" style={{ marginBottom: '16px' }}>
          <Form.Item noStyle shouldUpdate={(prev, curr) => prev.type !== curr.type}>
            {({ getFieldValue }) => {
              const stepType = getFieldValue('type');
              
              return (
                <div>
                  {stepType === 'api_call' && (
                    <Row gutter={16}>
                      <Col span={12}>
                        <Form.Item
                          name="apiUrl"
                          label="API地址"
                        >
                          <Input placeholder="请输入API地址" />
                        </Form.Item>
                      </Col>
                      <Col span={6}>
                        <Form.Item
                          name="timeout"
                          label="超时时间(秒)"
                        >
                          <Input type="number" placeholder="30" />
                        </Form.Item>
                      </Col>
                      <Col span={6}>
                        <Form.Item
                          name="retryCount"
                          label="重试次数"
                        >
                          <Input type="number" placeholder="3" />
                        </Form.Item>
                      </Col>
                    </Row>
                  )}
                  
                  {stepType === 'condition' && (
                    <Form.Item
                      name="condition"
                      label="条件表达式"
                    >
                      <TextArea 
                        rows={3}
                        placeholder="请输入条件判断表达式，如: result.success === true"
                      />
                    </Form.Item>
                  )}
                </div>
              );
            }}
          </Form.Item>
        </Card>

        {/* 操作按钮 */}
        <div style={{ textAlign: 'right', marginTop: '24px' }}>
          <Space>
            <Button onClick={onCancel}>
              取消
            </Button>
            <Button type="primary" onClick={handleSave}>
              保存配置
            </Button>
          </Space>
        </div>
      </Form>
    </div>
  );
};

export default StepForm;
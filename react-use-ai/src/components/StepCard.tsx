import React from 'react';
import { 
  Card, 
  Tag, 
  Space, 
  Button, 
  Tooltip, 
  Typography, 
  Popconfirm,
  Badge
} from 'antd';
import { 
  EditOutlined, 
  DeleteOutlined, 
  ArrowUpOutlined, 
  ArrowDownOutlined,
  FileTextOutlined,
  ApiOutlined,
  BranchesOutlined,
  SwapOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  ClockCircleOutlined
} from '@ant-design/icons';
import type { WorkflowStep } from './WorkflowDesigner';

const { Text, Paragraph } = Typography;

interface StepCardProps {
  step: WorkflowStep;
  isSelected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  allSteps: WorkflowStep[];
}

const StepCard: React.FC<StepCardProps> = ({
  step,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
  allSteps
}) => {
  // 获取步骤类型图标
  const getStepTypeIcon = (type: WorkflowStep['type']) => {
    switch (type) {
      case 'file_process':
        return <FileTextOutlined />;
      case 'data_transform':
        return <SwapOutlined />;
      case 'api_call':
        return <ApiOutlined />;
      case 'condition':
        return <BranchesOutlined />;
      default:
        return <FileTextOutlined />;
    }
  };

  // 获取步骤类型标签颜色
  const getStepTypeColor = (type: WorkflowStep['type']) => {
    switch (type) {
      case 'file_process':
        return 'blue';
      case 'data_transform':
        return 'green';
      case 'api_call':
        return 'orange';
      case 'condition':
        return 'purple';
      default:
        return 'default';
    }
  };

  // 获取步骤类型显示名称
  const getStepTypeName = (type: WorkflowStep['type']) => {
    switch (type) {
      case 'file_process':
        return '文件处理';
      case 'data_transform':
        return '数据转换';
      case 'api_call':
        return 'API调用';
      case 'condition':
        return '条件判断';
      default:
        return '未知类型';
    }
  };

  // 获取状态图标和颜色
  const getStatusDisplay = (status: WorkflowStep['status']) => {
    switch (status) {
      case 'pending':
        return { icon: <ClockCircleOutlined />, color: 'default', text: '等待中' };
      case 'running':
        return { icon: <LoadingOutlined spin />, color: 'processing', text: '运行中' };
      case 'success':
        return { icon: <CheckCircleOutlined />, color: 'success', text: '成功' };
      case 'error':
        return { icon: <CloseCircleOutlined />, color: 'error', text: '失败' };
      case 'skipped':
        return { icon: <ClockCircleOutlined />, color: 'warning', text: '跳过' };
      default:
        return { icon: <ClockCircleOutlined />, color: 'default', text: '未知' };
    }
  };

  // 获取依赖步骤名称
  const getDependencyNames = () => {
    return step.dependencies
      .map(depId => {
        const depStep = allSteps.find(s => s.id === depId);
        return depStep ? depStep.name : '未知步骤';
      })
      .join(', ');
  };

  const statusDisplay = getStatusDisplay(step.status);

  return (
    <Badge.Ribbon 
      text={`步骤 ${step.order + 1}`} 
      color={isSelected ? 'red' : 'blue'}
    >
      <Card
        hoverable
        className={isSelected ? 'selected-step-card' : ''}
        style={{
          border: isSelected ? '2px solid #1890ff' : '1px solid #d9d9d9',
          cursor: 'pointer'
        }}
        onClick={onSelect}
        actions={[
          <Tooltip title="编辑">
            <Button 
              type="text" 
              icon={<EditOutlined />} 
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
            />
          </Tooltip>,
          onMoveUp && (
            <Tooltip title="上移">
              <Button 
                type="text" 
                icon={<ArrowUpOutlined />} 
                onClick={(e) => {
                  e.stopPropagation();
                  onMoveUp();
                }}
              />
            </Tooltip>
          ),
          onMoveDown && (
            <Tooltip title="下移">
              <Button 
                type="text" 
                icon={<ArrowDownOutlined />} 
                onClick={(e) => {
                  e.stopPropagation();
                  onMoveDown();
                }}
              />
            </Tooltip>
          ),
          <Popconfirm
            title="确定要删除这个步骤吗？"
            onConfirm={(e) => {
              e?.stopPropagation();
              onDelete();
            }}
            okText="确定"
            cancelText="取消"
          >
            <Tooltip title="删除">
              <Button 
                type="text" 
                danger 
                icon={<DeleteOutlined />} 
                onClick={(e) => e.stopPropagation()}
              />
            </Tooltip>
          </Popconfirm>
        ].filter(Boolean)}
      >
        <Card.Meta
          avatar={
            <div style={{ fontSize: '24px', color: getStepTypeColor(step.type) }}>
              {getStepTypeIcon(step.type)}
            </div>
          }
          title={
            <Space>
              <Text strong>{step.name}</Text>
              <Tag color={getStepTypeColor(step.type)}>
                {getStepTypeName(step.type)}
              </Tag>
              <Tag 
                icon={statusDisplay.icon} 
                color={statusDisplay.color}
              >
                {statusDisplay.text}
              </Tag>
            </Space>
          }
          description={
            <div>
              {step.description && (
                <Paragraph 
                  ellipsis={{ rows: 2, expandable: true }}
                  style={{ marginBottom: '8px' }}
                >
                  {step.description}
                </Paragraph>
              )}
              
              <Space direction="vertical" size="small" style={{ width: '100%' }}>
                <div>
                  <Text type="secondary">输入数量: </Text>
                  <Text>{(step.config.fileInputs?.length || 0) + (step.config.promptInputs?.length || 0)}</Text>
                </div>
                
                {step.dependencies.length > 0 && (
                  <div>
                    <Text type="secondary">依赖步骤: </Text>
                    <Text>{getDependencyNames()}</Text>
                  </div>
                )}
                
                {step.config.outputFolder && (
                  <div>
                    <Text type="secondary">输出目录: </Text>
                    <Text code>{step.config.outputFolder}</Text>
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
    </Badge.Ribbon>
  );
};

export default StepCard;
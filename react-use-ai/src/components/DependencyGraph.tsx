import React, { useEffect, useRef, useMemo } from 'react';
import { Card, Typography, Tag, Space } from 'antd';
import type { WorkflowStep } from './WorkflowDesigner';

const { Text } = Typography;

interface DependencyGraphProps {
  steps: WorkflowStep[];
  onStepClick?: (stepId: string) => void;
}

interface GraphNode {
  id: string;
  name: string;
  type: WorkflowStep['type'];
  status: WorkflowStep['status'];
  x: number;
  y: number;
  width: number;
  height: number;
  dependencies: string[];
}

interface GraphEdge {
  from: string;
  to: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

const DependencyGraph: React.FC<DependencyGraphProps> = ({
  steps,
  onStepClick
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 计算图形布局
  const { nodes, edges } = useMemo(() => {
    const nodeWidth = 200;
    const nodeHeight = 80;
    const levelHeight = 120;
    const nodeSpacing = 50;

    // 按依赖关系分层
    const levels: string[][] = [];
    const visited = new Set<string>();
    const inDegree = new Map<string, number>();
    
    // 计算入度
    steps.forEach(step => {
      inDegree.set(step.id, step.dependencies.length);
    });

    // 拓扑排序分层
    while (visited.size < steps.length) {
      const currentLevel: string[] = [];
      
      steps.forEach(step => {
        if (!visited.has(step.id) && (inDegree.get(step.id) || 0) === 0) {
          currentLevel.push(step.id);
        }
      });

      if (currentLevel.length === 0) {
        // 处理循环依赖的情况
        const remaining = steps.filter(step => !visited.has(step.id));
        if (remaining.length > 0) {
          currentLevel.push(remaining[0].id);
        }
      }

      levels.push(currentLevel);
      
      currentLevel.forEach(stepId => {
        visited.add(stepId);
        const step = steps.find(s => s.id === stepId);
        if (step) {
          // 减少依赖此步骤的其他步骤的入度
          steps.forEach(otherStep => {
            if (otherStep.dependencies.includes(stepId)) {
              inDegree.set(otherStep.id, (inDegree.get(otherStep.id) || 0) - 1);
            }
          });
        }
      });
    }

    // 计算节点位置
    const graphNodes: GraphNode[] = [];
    const maxWidth = Math.max(...levels.map(level => level.length)) * (nodeWidth + nodeSpacing);
    
    levels.forEach((level, levelIndex) => {
      const levelWidth = level.length * (nodeWidth + nodeSpacing) - nodeSpacing;
      const startX = (maxWidth - levelWidth) / 2;
      
      level.forEach((stepId, nodeIndex) => {
        const step = steps.find(s => s.id === stepId);
        if (step) {
          graphNodes.push({
            id: stepId,
            name: step.name,
            type: step.type,
            status: step.status,
            x: startX + nodeIndex * (nodeWidth + nodeSpacing),
            y: levelIndex * levelHeight + 50,
            width: nodeWidth,
            height: nodeHeight,
            dependencies: step.dependencies
          });
        }
      });
    });

    // 计算边
    const graphEdges: GraphEdge[] = [];
    graphNodes.forEach(node => {
      node.dependencies.forEach(depId => {
        const depNode = graphNodes.find(n => n.id === depId);
        if (depNode) {
          graphEdges.push({
            from: depId,
            to: node.id,
            fromX: depNode.x + depNode.width / 2,
            fromY: depNode.y + depNode.height,
            toX: node.x + node.width / 2,
            toY: node.y
          });
        }
      });
    });

    return { nodes: graphNodes, edges: graphEdges };
  }, [steps]);

  // 绘制图形
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 设置画布大小
    const maxX = Math.max(...nodes.map(n => n.x + n.width), 800);
    const maxY = Math.max(...nodes.map(n => n.y + n.height), 600);
    
    canvas.width = maxX + 100;
    canvas.height = maxY + 100;
    
    // 清空画布
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 绘制边
    edges.forEach(edge => {
      ctx.beginPath();
      ctx.moveTo(edge.fromX, edge.fromY);
      
      // 绘制贝塞尔曲线
      const controlY = (edge.fromY + edge.toY) / 2;
      ctx.bezierCurveTo(
        edge.fromX, controlY,
        edge.toX, controlY,
        edge.toX, edge.toY
      );
      
      ctx.strokeStyle = '#d9d9d9';
      ctx.lineWidth = 2;
      ctx.stroke();

      // 绘制箭头
      const arrowSize = 8;
      ctx.beginPath();
      ctx.moveTo(edge.toX, edge.toY);
      ctx.lineTo(edge.toX - arrowSize, edge.toY - arrowSize);
      ctx.lineTo(edge.toX + arrowSize, edge.toY - arrowSize);
      ctx.closePath();
      ctx.fillStyle = '#d9d9d9';
      ctx.fill();
    });

    // 绘制节点
    nodes.forEach(node => {
      // 节点背景
      const getStatusColor = (status: WorkflowStep['status']) => {
        switch (status) {
          case 'success': return '#52c41a';
          case 'error': return '#ff4d4f';
          case 'running': return '#1890ff';
          case 'pending': return '#d9d9d9';
          default: return '#d9d9d9';
        }
      };

      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = getStatusColor(node.status);
      ctx.lineWidth = 3;
      
      // 绘制圆角矩形
      const radius = 8;
      ctx.beginPath();
      ctx.moveTo(node.x + radius, node.y);
      ctx.lineTo(node.x + node.width - radius, node.y);
      ctx.quadraticCurveTo(node.x + node.width, node.y, node.x + node.width, node.y + radius);
      ctx.lineTo(node.x + node.width, node.y + node.height - radius);
      ctx.quadraticCurveTo(node.x + node.width, node.y + node.height, node.x + node.width - radius, node.y + node.height);
      ctx.lineTo(node.x + radius, node.y + node.height);
      ctx.quadraticCurveTo(node.x, node.y + node.height, node.x, node.y + node.height - radius);
      ctx.lineTo(node.x, node.y + radius);
      ctx.quadraticCurveTo(node.x, node.y, node.x + radius, node.y);
      ctx.closePath();
      
      ctx.fill();
      ctx.stroke();

      // 节点文本
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // 绘制步骤名称
      const textY = node.y + node.height / 2 - 10;
      ctx.fillText(
        node.name.length > 20 ? node.name.substring(0, 17) + '...' : node.name,
        node.x + node.width / 2,
        textY
      );

      // 绘制类型标签
      ctx.font = '12px Arial';
      const getTypeText = (type: WorkflowStep['type']) => {
        switch (type) {
          case 'file_process': return '文件处理';
          case 'data_transform': return '数据转换';
          case 'api_call': return 'API调用';
          case 'condition': return '条件判断';
          default: return '未知';
        }
      };
      
      ctx.fillStyle = '#666666';
      ctx.fillText(
        getTypeText(node.type),
        node.x + node.width / 2,
        textY + 20
      );
    });

  }, [nodes, edges]);

  // 处理点击事件
  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onStepClick) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // 检查点击的节点
    const clickedNode = nodes.find(node => 
      x >= node.x && x <= node.x + node.width &&
      y >= node.y && y <= node.y + node.height
    );

    if (clickedNode) {
      onStepClick(clickedNode.id);
    }
  };

  return (
    <div ref={containerRef} style={{ width: '100%', height: '70vh', overflow: 'auto' }}>
      <div style={{ marginBottom: '16px' }}>
        <Space>
          <Text strong>图例：</Text>
          <Tag color="default">等待中</Tag>
          <Tag color="processing">运行中</Tag>
          <Tag color="success">成功</Tag>
          <Tag color="error">失败</Tag>
        </Space>
      </div>
      
      <Card style={{ padding: '16px', textAlign: 'center' }}>
        {nodes.length === 0 ? (
          <Text type="secondary">暂无步骤数据</Text>
        ) : (
          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            style={{ 
              cursor: onStepClick ? 'pointer' : 'default',
              border: '1px solid #d9d9d9',
              borderRadius: '4px'
            }}
          />
        )}
      </Card>
    </div>
  );
};

export default DependencyGraph;
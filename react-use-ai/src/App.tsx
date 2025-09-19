import { ConfigProvider, Menu, Layout } from 'antd';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import zhCN from 'antd/lib/locale/zh_CN';
import FileProcessForm from './components/FileProcessForm';
import BatchProcessForm from './components/BatchProcessForm';
import WorkflowPage from './pages/WorkflowPage';
import WorkflowGroupPage from './pages/WorkflowGroupPage';
import WorkflowGroupDetailPage from './pages/WorkflowGroupDetailPage';
import './App.css';

const { Header, Content } = Layout;

function App() {
  const location = useLocation();

  return (
    <ConfigProvider locale={zhCN}>
      <Layout className="layout">
        <Header>
          <div className="logo" />
          <Menu theme="dark" mode="horizontal" selectedKeys={[location.pathname]}>
            <Menu.Item key="/">
              <Link to="/">单次转换</Link>
            </Menu.Item>
            <Menu.Item key="/batch">
              <Link to="/batch">批量转换</Link>
            </Menu.Item>
            <Menu.Item key="/workflow">
              <Link to="/workflow">工作流配置</Link>
            </Menu.Item>
            <Menu.Item key="/workflow-groups">
              <Link to="/workflow-groups">工作流组管理</Link>
            </Menu.Item>
          </Menu>
        </Header>
        <Content style={{ padding: '0' }}>
          <Routes>
            <Route path="/" element={
              <div style={{ background: '#fff', padding: 24, minHeight: 280, margin: '24px 50px' }}>
                <FileProcessForm />
              </div>
            } />
            <Route path="/batch" element={
              <div style={{ background: '#fff', padding: 24, minHeight: 280, margin: '24px 50px' }}>
                <BatchProcessForm />
              </div>
            } />
            <Route path="/workflow" element={<WorkflowPage />} />
            <Route path="/workflow-groups" element={<WorkflowGroupPage />} />
            <Route path="/workflow-group/:groupId" element={<WorkflowGroupDetailPage />} />
          </Routes>
        </Content>
      </Layout>
    </ConfigProvider>
  )
}

export default App

import React from 'react';
import { ConfigProvider, Menu, Layout } from 'antd';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import zhCN from 'antd/lib/locale/zh_CN';
import FileProcessForm from './components/FileProcessForm';
import BatchProcessForm from './components/BatchProcessForm';
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
            {/* <Menu.Item key="/batch">
              <Link to="/batch">批量转换</Link>
            </Menu.Item> */}
          </Menu>
        </Header>
        <Content style={{ padding: '0 50px' }}>
          <div className="site-layout-content" style={{ background: '#fff', padding: 24, minHeight: 280, marginTop: 24 }}>
            <Routes>
              <Route path="/" element={<FileProcessForm />} />
              <Route path="/batch" element={<BatchProcessForm />} />
            </Routes>
          </div>
        </Content>
      </Layout>
    </ConfigProvider>
  )
}

export default App

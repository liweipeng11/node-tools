import React from 'react';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/lib/locale/zh_CN';
import FileProcessForm from './components/FileProcessForm';
import './App.css';

function App() {
  return (
    <ConfigProvider locale={zhCN}>
      <div className="app-container">
        <FileProcessForm />
      </div>
    </ConfigProvider>
  )
}

export default App

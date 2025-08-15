import React, { useState } from 'react';
import { Input, Button, message } from 'antd';
import axios from 'axios';

interface InputItem {
    id: string;
    type: 'file' | 'prompt';
    value: string;
}

interface ProcessData {
    inputs: InputItem[];
    outputFolder: string;
    outputFileName: string;
}

interface ProcessResult {
    success: boolean;
    message: string;
    data?: any;
}

const FileProcessForm: React.FC = () => {
    const [messageApi, contextHolder] = message.useMessage();
    const [inputs, setInputs] = useState<InputItem[]>([]);
    const [outputFolder, setOutputFolder] = useState('');
    const [outputFileName, setOutputFileName] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<ProcessResult | null>(null);

    const addFileInput = () => {
        const newId = `input-${Date.now()}`;
        setInputs([...inputs, { id: newId, type: 'file', value: '' }]);
    };

    const addPromptInput = () => {
        const newId = `input-${Date.now()}`;
        setInputs([...inputs, { id: newId, type: 'prompt', value: '' }]);
    };

    const updateInput = (id: string, value: string) => {
        setInputs(inputs.map(input =>
            input.id === id ? { ...input, value } : input
        ));
    };

    const removeInput = (id: string) => {
        setInputs(inputs.filter(input => input.id !== id));
    };

    const moveInput = (id: string, direction: 'up' | 'down') => {
        const index = inputs.findIndex(input => input.id === id);
        if (
            (direction === 'up' && index === 0) ||
            (direction === 'down' && index === inputs.length - 1)
        ) {
            return; // 已经在最顶部或最底部，无法移动
        }

        const newInputs = [...inputs];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;

        // 交换位置
        [newInputs[index], newInputs[targetIndex]] = [newInputs[targetIndex], newInputs[index]];

        setInputs(newInputs);
    };

    const handleConvert = async () => {
        // 验证是否有文件地址和提示词
        const hasFile = inputs.some(input => input.type === 'file');
        const hasPrompt = inputs.some(input => input.type === 'prompt');

        if (!hasFile) {
            messageApi.error('请至少添加一个文件地址');
            return;
        }

        if (!hasPrompt) {
            messageApi.error('请至少添加一个提示词');
            return;
        }

        // 检查是否有空值
        for (const input of inputs) {
            if (!input.value.trim()) {
                messageApi.error(input.type === 'file' ? '文件地址不能为空' : '提示词不能为空');
                return;
            }
        }

        if (!outputFolder) {
            messageApi.error('请输入输出文件夹路径');
            return;
        }

        if (!outputFileName) {
            messageApi.error('请输入输出文件名');
            return;
        }

        try {
            setLoading(true);
            
            // 直接提交整个输入数组，保持顺序
            const formData: ProcessData = {
                inputs: inputs.map(({ id, ...rest }) => rest), // 移除id，只保留type和value
                outputFolder,
                outputFileName
            };

            // 使用相对路径，将通过Vite代理转发到后端服务器
            const response = await axios.post<ProcessResult>('/process-file', formData);
            messageApi.success('转换成功');
            
            // 设置结果
            setResult(response.data);
        } catch (error) {
            console.error('转换失败:', error);
            messageApi.error('转换失败，请检查服务是否可用');
            setResult({
                success: false,
                message: '转换失败，请检查服务是否可用'
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="form-container" style={{ width: '100%', padding: '20px' }}>
            {contextHolder}

            <div className="button-group" style={{ marginBottom: '20px' }}>
                <Button type="primary" onClick={addFileInput} style={{ marginRight: '10px' }}>
                    添加文件地址
                </Button>
                <Button type="primary" onClick={addPromptInput}>
                    添加提示词
                </Button>
            </div>

            <div className="inputs-container" style={{ width: '100%' }}>
                {inputs.map((input, index) => (
                    <div key={input.id} className="input-row" style={{ marginBottom: '10px', width: '100%' }}>
                        <div style={{ display: 'flex', width: '100%', alignItems: 'center' }}>
                            {input.type === 'file' ? (
                                <Input
                                    value={input.value}
                                    onChange={(e) => updateInput(input.id, e.target.value)}
                                    placeholder="请输入文件的完整路径"
                                    style={{ flex: 1 }}
                                />
                            ) : (
                                <Input.TextArea
                                    value={input.value}
                                    onChange={(e) => updateInput(input.id, e.target.value)}
                                    placeholder="请输入处理文件的提示词"
                                    rows={4}
                                    style={{ flex: 1 }}
                                />
                            )}
                            <div style={{ display: 'flex', marginLeft: '10px' }}>
                                <Button
                                    onClick={() => moveInput(input.id, 'up')}
                                    disabled={index === 0}
                                    style={{ marginRight: '5px' }}
                                >
                                    上移
                                </Button>
                                <Button
                                    onClick={() => moveInput(input.id, 'down')}
                                    disabled={index === inputs.length - 1}
                                    style={{ marginRight: '5px' }}
                                >
                                    下移
                                </Button>
                                <Button
                                    danger
                                    onClick={() => removeInput(input.id)}
                                >
                                    删除
                                </Button>
                            </div>
                        </div>
                    </div>
                ))}

                <div className="section" style={{ marginTop: '20px', width: '100%' }}>
                    <h3>输出设置</h3>
                    <div style={{ display: 'flex', marginBottom: '10px' }}>
                        <Input
                            value={outputFolder}
                            onChange={(e) => setOutputFolder(e.target.value)}
                            placeholder="请输入输出文件夹路径"
                            style={{ flex: 1, marginRight: '10px' }}
                        />
                        <Input
                            value={outputFileName}
                            onChange={(e) => setOutputFileName(e.target.value)}
                            placeholder="请输入输出文件名"
                            style={{ flex: 1 }}
                        />
                    </div>
                </div>

                <div className="convert-section" style={{ marginTop: '20px' }}>
                    <Button type="primary" onClick={handleConvert} loading={loading}>
                        转换
                    </Button>
                </div>

                {result && (
                    <div className="result-section" style={{ marginTop: '30px', width: '100%' }}>
                        <h3>转换结果</h3>
                        <div style={{ 
                            padding: '15px', 
                            backgroundColor: result.success ? '#f6ffed' : '#fff2f0',
                            border: `1px solid ${result.success ? '#b7eb8f' : '#ffccc7'}`,
                            borderRadius: '4px'
                        }}>
                            <div style={{ marginBottom: '10px', fontWeight: 'bold' }}>
                                {result.success ? '转换成功' : '转换失败'}
                            </div>
                            <div>{result.message}</div>
                            {result.data && (
                                <div style={{ marginTop: '10px' }}>
                                    <pre style={{ 
                                        backgroundColor: '#f5f5f5', 
                                        padding: '10px', 
                                        borderRadius: '4px',
                                        maxHeight: '300px',
                                        overflow: 'auto'
                                    }}>
                                        {typeof result.data === 'string' 
                                            ? result.data 
                                            : JSON.stringify(result.data, null, 2)
                                        }
                                    </pre>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default FileProcessForm;
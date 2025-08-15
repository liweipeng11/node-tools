import React, { useState, useMemo } from 'react';
import { Input, Button, message, Modal, Select, List, Tag } from 'antd';
import axios from 'axios';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { css } from '@codemirror/lang-css';

interface InputItem {
    id: string;
    type: 'file' | 'prompt';
    value: string | string[];
}

interface ProcessResult {
    success: boolean;
    message: string;
    data?: any;
}

interface ConversionStatus {
    fileName: string;
    status: 'pending' | 'success' | 'error';
    result?: ProcessResult;
}

const BatchProcessForm: React.FC = () => {
    const [messageApi, contextHolder] = message.useMessage();
    
    const [sourceFolder, setSourceFolder] = useState('');
    const [fileType, setFileType] = useState('');
    const [fileList, setFileList] = useState<string[]>([]);
    const [extractLoading, setExtractLoading] = useState(false);

    const [inputs, setInputs] = useState<InputItem[]>([]);
    const [outputFolder, setOutputFolder] = useState('');
    const [outputFileType, setOutputFileType] = useState('');
    const [loading, setLoading] = useState(false);
    const [conversionStatus, setConversionStatus] = useState<ConversionStatus[]>([]);
    
    const [currentResult, setCurrentResult] = useState<ProcessResult | null>(null);
    const [isResultModalVisible, setIsResultModalVisible] = useState(false);

    const codeMirrorExtensions = useMemo(() => {
        const path = currentResult?.data?.path || '';
        if (path.endsWith('.json')) return [json()];
        if (path.endsWith('.js') || path.endsWith('.jsx') || path.endsWith('.ts') || path.endsWith('.tsx')) return [javascript({ jsx: true, typescript: true })];
        if (path.endsWith('.css')) return [css()];
        return [];
    }, [currentResult?.data?.path]);

    const handleExtractFiles = async () => {
        if (!sourceFolder) {
            messageApi.error('请输入源代码根目录');
            return;
        }
        if (!fileType) {
            messageApi.error('请输入提取文件类型');
            return;
        }
    
        setExtractLoading(true);
        try {
            const response = await axios.post<{ success: boolean; data: string[]; message?: string }>('/api/list-files', {
                folderPath: sourceFolder,
                fileType: fileType,
            });
    
            if (response.data.success) {
                setFileList(response.data.data);
                messageApi.success('文件提取成功');
            } else {
                messageApi.error(response.data.message || '文件提取失败');
                setFileList([]);
            }
        } catch (error) {
            console.error('提取文件失败:', error);
            messageApi.error('提取文件失败，请检查服务是否可用');
            setFileList([]);
        } finally {
            setExtractLoading(false);
        }
    };

    const addFileInput = () => {
        const newId = `input-${Date.now()}`;
        setInputs([...inputs, { id: newId, type: 'file', value: [] }]);
    };

    const addPromptInput = () => {
        const newId = `input-${Date.now()}`;
        setInputs([...inputs, { id: newId, type: 'prompt', value: '' }]);
    };

    const updateInput = (id: string, value: string | string[]) => {
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
            return;
        }

        const newInputs = [...inputs];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        [newInputs[index], newInputs[targetIndex]] = [newInputs[targetIndex], newInputs[index]];
        setInputs(newInputs);
    };

    const handleSelectAllFiles = (inputId: string) => {
        const targetInput = inputs.find(input => input.id === inputId);
        if (!targetInput || targetInput.type !== 'file') return;
    
        const allFiles = fileList;
        const selectedFiles = targetInput.value as string[];
        const allSelected = allFiles.length > 0 && allFiles.length === selectedFiles.length;
    
        updateInput(inputId, allSelected ? [] : allFiles);
    };

    const handleBatchConvert = async () => {
        if (!inputs.some(input => input.type === 'file' && Array.isArray(input.value) && input.value.length > 0)) {
            messageApi.error('请至少选择一个文件');
            return;
        }
        for (const input of inputs) {
            if (input.type === 'prompt' && !(input.value as string).trim()) {
                messageApi.error('提示词不能为空');
                return;
            }
        }
        if (!outputFolder.trim()) {
            messageApi.error('输出文件夹路径不能为空');
            return;
        }
    
        setLoading(true);
    
        const requestGroups: { files: string[], prompts: InputItem[] }[] = [];
        let currentGroup: { files: string[], prompts: InputItem[] } = { files: [], prompts: [] };
    
        for (const input of inputs) {
            if (input.type === 'file') {
                if (currentGroup.files.length > 0) {
                    requestGroups.push(currentGroup);
                }
                currentGroup = { files: input.value as string[], prompts: [] };
            } else { // Prompt
                if (currentGroup.files.length > 0 || requestGroups.length > 0) {
                    currentGroup.prompts.push(input);
                }
            }
        }
        if (currentGroup.files.length > 0) {
            requestGroups.push(currentGroup);
        }
    
        const validRequestGroups = requestGroups.filter(group => group.files.length > 0 && group.prompts.length > 0);
    
        if (validRequestGroups.length === 0) {
            messageApi.error('需要为文件选择提供至少一个提示词');
            setLoading(false);
            return;
        }
    
        const allTasks: (() => Promise<void>)[] = [];
        const allInitialStatus: ConversionStatus[] = [];
    
        validRequestGroups.forEach(group => {
            group.files.forEach(fileName => {
                allInitialStatus.push({
                    fileName: fileName,
                    status: 'pending' as const,
                });
    
                const task = async () => {
                    try {
                        const requestInputs = [
                            { type: 'file', value: fileName },
                            ...group.prompts.map(p => ({ type: p.type, value: p.value }))
                        ];
                        let outputFileName = fileName.split(/[\\/]/).pop() || fileName;
                        if (outputFileType) {
                            const lastDotIndex = outputFileName.lastIndexOf('.');
                            const baseName = lastDotIndex !== -1 ? outputFileName.substring(0, lastDotIndex) : outputFileName;
                            const cleanOutputFileType = outputFileType.startsWith('.') ? outputFileType.substring(1) : outputFileType;
                            outputFileName = `${baseName}.${cleanOutputFileType}`;
                        }

                        const response = await axios.post<ProcessResult>('/api/process-file', {
                            inputs: requestInputs,
                            outputFolder,
                            outputFileName,
                        });
                        setConversionStatus(prev => prev.map(item =>
                            item.fileName === fileName ? { fileName, status: 'success', result: response.data } : item
                        ));
                    } catch (error) {
                        console.error(`转换失败: ${fileName}`, error);
                        const result = { success: false, message: `转换失败: ${fileName}` };
                        setConversionStatus(prev => prev.map(item =>
                            item.fileName === fileName ? { fileName, status: 'error', result } : item
                        ));
                    }
                };
                allTasks.push(task);
            });
        });
    
        if (allTasks.length === 0) {
            messageApi.error('没有有效的任务可以执行');
            setLoading(false);
            return;
        }
    
        setConversionStatus(allInitialStatus);
    
        const runInParallel = async (tasks: (() => Promise<void>)[], concurrency: number) => {
            const queue = [...tasks];
            const workers = new Array(concurrency).fill(null).map(async () => {
                while (queue.length > 0) {
                    const task = queue.shift();
                    if (task) {
                        await task();
                    }
                }
            });
            await Promise.all(workers);
        };
    
        await runInParallel(allTasks, 6);
        setLoading(false);
        messageApi.success('所有文件处理完成');
    };

    const viewResult = (result: ProcessResult) => {
        setCurrentResult(result);
        setIsResultModalVisible(true);
    };

    return (
        <div className="form-container" style={{ width: '100%', padding: '20px' }}>
            {contextHolder}
            <div className="section" style={{ marginBottom: '20px', width: '100%' }}>
                <h3>提取文件</h3>
                <div style={{ display: 'flex', marginBottom: '10px' }}>
                    <Input
                        value={sourceFolder}
                        onChange={(e) => setSourceFolder(e.target.value)}
                        placeholder="请输入源代码根目录"
                        style={{ flex: 1, marginRight: '10px' }}
                    />
                    <Input
                        value={fileType}
                        onChange={(e) => setFileType(e.target.value)}
                        placeholder="请输入文件类型，如 .js,.ts"
                        style={{ flex: 1, marginRight: '10px' }}
                    />
                    <Button type="primary" onClick={handleExtractFiles} loading={extractLoading}>
                        提取
                    </Button>
                </div>
            </div>

            <div className="button-group" style={{ marginBottom: '20px' }}>
                <Button type="primary" onClick={addFileInput} style={{ marginRight: '10px' }}>
                    添加文件
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
                                <>
                                    <Select
                                        mode="multiple"
                                        allowClear
                                        value={input.value as string[]}
                                        onChange={(value) => updateInput(input.id, value)}
                                        placeholder="请选择文件"
                                        style={{ flex: 1, marginRight: '10px' }}
                                        showSearch
                                    >
                                        {fileList.map(file => (
                                            <Select.Option key={file} value={file}>
                                                {file}
                                            </Select.Option>
                                        ))}
                                    </Select>
                                    <Button onClick={() => handleSelectAllFiles(input.id)}>
                                        {Array.isArray(input.value) && fileList.length > 0 && input.value.length === fileList.length ? '取消全选' : '全选'}
                                    </Button>
                                </>
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
                            value={outputFileType}
                            onChange={(e) => setOutputFileType(e.target.value)}
                            placeholder="输出文件类型 (如 tsx)"
                            style={{ flex: 1 }}
                        />
                    </div>
                </div>

                <Button type="primary" onClick={handleBatchConvert} loading={loading}>
                    开始批量转换
                </Button>
            </div>

            {conversionStatus.length > 0 && (
                <div style={{ marginTop: '20px' }}>
                    <h3>转换状态</h3>
                    <List
                        bordered
                        dataSource={conversionStatus}
                        renderItem={item => (
                            <List.Item
                                actions={[
                                    item.status === 'success' && item.result ? (
                                        <Button type="link" onClick={() => viewResult(item.result!)}>查看结果</Button>
                                    ) : null,
                                ]}
                            >
                                <List.Item.Meta title={item.fileName} />
                                {item.status === 'pending' && <Tag color="blue">处理中...</Tag>}
                                {item.status === 'success' && <Tag color="green">成功</Tag>}
                                {item.status === 'error' && <Tag color="red">失败</Tag>}
                            </List.Item>
                        )}
                    />
                </div>
            )}

            {currentResult && (
                <Modal
                    title="转换结果"
                    open={isResultModalVisible}
                    onCancel={() => setIsResultModalVisible(false)}
                    footer={null}
                    width="80%"
                >
                    <div className="result-section" style={{ marginTop: '20px', width: '100%' }}>
                        <div style={{
                            padding: '15px',
                            backgroundColor: currentResult.success ? '#f6ffed' : '#fff2f0',
                            border: `1px solid ${currentResult.success ? '#b7eb8f' : '#ffccc7'}`,
                            borderRadius: '4px'
                        }}>
                            <div style={{ marginBottom: '10px', fontWeight: 'bold' }}>
                                {currentResult.success ? '转换成功' : '转换失败'}
                            </div>
                            <div>{currentResult.message}</div>
                            {currentResult.data?.content && (
                                <div style={{ marginTop: '10px' }}>
                                    <CodeMirror
                                        value={currentResult.data.content}
                                        extensions={codeMirrorExtensions}
                                        readOnly
                                        style={{
                                            border: '1px solid #d9d9d9',
                                            borderRadius: '4px',
                                            maxHeight: '60vh',
                                            overflow: 'auto'
                                        }}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
};

export default BatchProcessForm;
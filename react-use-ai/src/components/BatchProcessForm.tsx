import React, { useState, useMemo, useEffect } from 'react';
import { Input, Button, message, Modal, Select, List, Tag, Space } from 'antd';
import axios from 'axios';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { css } from '@codemirror/lang-css';

// --- Interface Definitions ---
interface InputItem {
    id: string;
    type: 'file' | 'prompt';
    value: string | string[];
}

interface FileSource {
    id: string;
    path: string;
    fileType: string;
    files: string[];
    loading: boolean;
}

interface ProcessResult {
    success: boolean;
    message: string;
    data?: any;
}

interface ConversionTask {
    id: string;
    fileName: string;
    sourcePath: string;
    status: 'pending' | 'processing' | 'success' | 'error';
    result?: ProcessResult;
}

// --- Component ---
const BatchProcessForm: React.FC = () => {
    // --- State ---
    const [messageApi, contextHolder] = message.useMessage();
    const [inputs, setInputs] = useState<InputItem[]>([]);
    const [outputFolder, setOutputFolder] = useState('');
    const [outputFileType, setOutputFileType] = useState('');
    const [fileSources, setFileSources] = useState<FileSource[]>([]);

    const [conversionQueue, setConversionQueue] = useState<ConversionTask[]>([]);
    const [allTasksCompleted, setAllTasksCompleted] = useState(true);

    const [currentResult, setCurrentResult] = useState<ProcessResult | null>(null);
    const [isResultModalVisible, setIsResultModalVisible] = useState(false);

    // --- Memoized Values ---
    const codeMirrorExtensions = useMemo(() => {
        const path = currentResult?.data?.path || '';
        if (path.endsWith('.json')) return [json()];
        if (path.endsWith('.js') || path.endsWith('.jsx') || path.endsWith('.ts') || path.endsWith('.tsx')) return [javascript({ jsx: true, typescript: true })];
        if (path.endsWith('.css')) return [css()];
        return [];
    }, [currentResult?.data?.path]);

    // --- Effects ---
    useEffect(() => {
        const CONCURRENCY_LIMIT = 6;

        const processTask = async (taskToProcess: ConversionTask) => {
            try {
                const fileValueForTask = JSON.stringify({ sourcePath: taskToProcess.sourcePath, file: taskToProcess.fileName });

                const apiInputs = inputs.map(uiInput => {
                    if (uiInput.type === 'prompt') {
                        return { type: 'prompt', value: uiInput.value as string };
                    }

                    if (uiInput.type === 'file' && Array.isArray(uiInput.value) && uiInput.value.includes(fileValueForTask)) {
                        return { type: 'file', value: `${taskToProcess.sourcePath}\\${taskToProcess.fileName}` };
                    } else {
                        return { type: 'file', value: '' }; // Placeholder to maintain order
                    }
                });

                const lastSeparatorIndex = Math.max(taskToProcess.fileName.lastIndexOf('\\'), taskToProcess.fileName.lastIndexOf('/'));
                const directoryPath = lastSeparatorIndex === -1 ? '' : taskToProcess.fileName.substring(0, lastSeparatorIndex);
                const fileNameWithExt = lastSeparatorIndex === -1 ? taskToProcess.fileName : taskToProcess.fileName.substring(lastSeparatorIndex + 1);
                const fileNameWithoutExt = fileNameWithExt.includes('.') ? fileNameWithExt.substring(0, fileNameWithExt.lastIndexOf('.')) : fileNameWithExt;

                const finalOutputFolder = directoryPath ? `${outputFolder}\\${directoryPath}` : outputFolder;
                
                // 确保输出文件名使用大驼峰命名法
                let finalFileNameWithoutExt = fileNameWithoutExt;
                // 如果文件名不是以大写字母开头，则转换为大驼峰命名
                if (finalFileNameWithoutExt && finalFileNameWithoutExt.length > 0 && (finalFileNameWithoutExt[0] < 'A' || finalFileNameWithoutExt[0] > 'Z')) {
                    finalFileNameWithoutExt = finalFileNameWithoutExt[0].toUpperCase() + finalFileNameWithoutExt.slice(1);
                }
                
                const finalOutputFileName = `${finalFileNameWithoutExt}.${outputFileType || 'tsx'}`;

                const response = await axios.post<ProcessResult>('/api/process-file', {
                    inputs: apiInputs,
                    outputFolder: finalOutputFolder,
                    outputFileName: finalOutputFileName,
                });

                if (response.data.success) {
                    try {
                        if (outputFileType === 'json') {
                            JSON.parse(response.data.data.content);
                        }

                        setConversionQueue(prev => prev.map(task =>
                            task.id === taskToProcess.id ? { ...task, status: 'success', result: response.data } : task
                        ));
                    } catch (e) {
                        const errorResult: ProcessResult = {
                            success: false,
                            message: '转换失败：返回的内容不是有效的JSON格式。',
                            data: response.data.data
                        };
                        setConversionQueue(prev => prev.map(task =>
                            task.id === taskToProcess.id ? { ...task, status: 'error', result: errorResult } : task
                        ));
                    }
                } else {
                    setConversionQueue(prev => prev.map(task =>
                        task.id === taskToProcess.id ? { ...task, status: 'error', result: response.data } : task
                    ));
                }
            } catch (error) {
                console.error(`转换失败: ${taskToProcess.fileName}`, error);
                const result = { success: false, message: `转换失败: ${taskToProcess.fileName}` };
                setConversionQueue(prev => prev.map(task =>
                    task.id === taskToProcess.id ? { ...task, status: 'error', result } : task
                ));
            }
        };

        const currentlyProcessingCount = conversionQueue.filter(t => t.status === 'processing').length;
        const pendingTasks = conversionQueue.filter(t => t.status === 'pending');

        if (pendingTasks.length === 0 && currentlyProcessingCount === 0) {
            if (conversionQueue.length > 0 && !allTasksCompleted) {
                messageApi.success('所有任务处理完成');
                setAllTasksCompleted(true);
            }
            return;
        }

        const slotsToFill = CONCURRENCY_LIMIT - currentlyProcessingCount;
        if (slotsToFill <= 0 || pendingTasks.length === 0) {
            return;
        }

        const tasksToStart = pendingTasks.slice(0, slotsToFill);

        setConversionQueue(prevQueue => {
            const taskIdsToStart = tasksToStart.map(t => t.id);
            return prevQueue.map(t =>
                taskIdsToStart.includes(t.id) ? { ...t, status: 'processing' } : t
            );
        });

        tasksToStart.forEach(task => processTask(task));

    }, [conversionQueue, inputs, outputFolder, outputFileType, messageApi, allTasksCompleted]);


    // --- File Source Handlers ---
    const addFileSource = () => {
        const newSource: FileSource = { id: `source-${Date.now()}`, path: '', fileType: '', files: [], loading: false };
        setFileSources([...fileSources, newSource]);
    };

    const updateFileSource = (id: string, field: keyof FileSource, value: any) => {
        setFileSources(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
    };

    const removeFileSource = (id: string) => {
        setFileSources(fileSources.filter(s => s.id !== id));
    };

    const handleExtractFiles = async (sourceId: string) => {
        const source = fileSources.find(s => s.id === sourceId);
        if (!source) return;
        if (!source.path || !source.fileType) {
            messageApi.error('请输入文件来源路径和文件类型');
            return;
        }

        updateFileSource(sourceId, 'loading', true);
        try {
            const response = await axios.post<{ success: boolean; data: string[]; message?: string }>('/api/list-files', {
                folderPath: source.path,
                fileType: source.fileType,
            });
            if (response.data.success) {
                updateFileSource(sourceId, 'files', response.data.data);
                messageApi.success(`来源 "${source.path}" 文件提取成功`);
            } else {
                updateFileSource(sourceId, 'files', []);
                messageApi.error(response.data.message || '文件提取失败');
            }
        } catch (error) {
            updateFileSource(sourceId, 'files', []);
            messageApi.error('提取文件失败');
        } finally {
            updateFileSource(sourceId, 'loading', false);
        }
    };

    // --- Input Handlers ---
    const addFileInput = () => {
        setInputs([...inputs, { id: `input-${Date.now()}`, type: 'file', value: [] }]);
    };

    const addPromptInput = () => {
        setInputs([...inputs, { id: `input-${Date.now()}`, type: 'prompt', value: '' }]);
    };

    const updateInput = (id: string, value: string | string[]) => {
        setInputs(inputs.map(i => i.id === id ? { ...i, value } : i));
    };

    const removeInput = (id: string) => {
        setInputs(inputs.filter(i => i.id !== id));
    };

    const moveInput = (id: string, direction: 'up' | 'down') => {
        const index = inputs.findIndex(i => i.id === id);
        if ((direction === 'up' && index === 0) || (direction === 'down' && index === inputs.length - 1)) return;

        const newInputs = [...inputs];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        [newInputs[index], newInputs[targetIndex]] = [newInputs[targetIndex], newInputs[index]];
        setInputs(newInputs);
    };

    const handleSelectAllFiles = (inputId: string) => {
        const targetInput = inputs.find(input => input.id === inputId);
        if (!targetInput || targetInput.type !== 'file') return;

        const allFilesFromSources = fileSources.flatMap(source =>
            source.files.map(file => JSON.stringify({ sourcePath: source.path, file: file }))
        );

        const currentlySelected = targetInput.value as string[];
        const allSelected = allFilesFromSources.length > 0 && allFilesFromSources.length === currentlySelected.length;

        updateInput(inputId, allSelected ? [] : allFilesFromSources);
    };

    const handleRetry = (taskId: string) => {
        setAllTasksCompleted(false);
        setConversionQueue(prev => prev.map(task =>
            task.id === taskId ? { ...task, status: 'pending', result: undefined } : task
        ));
    };

    // --- Conversion Handlers ---
    const handleBatchConvert = () => {
        const fileInputs = inputs.filter(i => i.type === 'file' && Array.isArray(i.value) && i.value.length > 0);
        if (fileInputs.length === 0) {
            messageApi.error('请至少选择一个文件');
            return;
        }
        if (!inputs.some(i => i.type === 'prompt' && (i.value as string).trim())) {
            messageApi.error('请至少添加一个提示词');
            return;
        }
        if (!outputFolder.trim() || !outputFileType.trim()) {
            messageApi.error('输出文件夹路径和文件类型不能为空');
            return;
        }

        const tasks: ConversionTask[] = [];
        fileInputs.forEach(input => {
            (input.value as string[]).forEach(fileValue => {
                try {
                    const { sourcePath, file } = JSON.parse(fileValue);
                    tasks.push({
                        id: `task-${sourcePath}-${file}-${Date.now()}`,
                        fileName: file,
                        sourcePath: sourcePath,
                        status: 'pending'
                    });
                } catch (e) {
                    console.error("无法解析文件值:", fileValue);
                }
            });
        });

        if (tasks.length === 0) {
            messageApi.error('没有有效的任务可以执行');
            return;
        }

        setAllTasksCompleted(false);
        setConversionQueue(tasks);
    };

    const viewResult = (result: ProcessResult) => {
        setCurrentResult(result);
        setIsResultModalVisible(true);
    };

    const isRunning = conversionQueue.length > 0 && !allTasksCompleted;

    // --- Render ---
    return (
        <div className="form-container" style={{ width: '100%', padding: '20px' }}>
            {contextHolder}

            {/* File Sources Section */}
            <div className="section" style={{ marginBottom: '20px' }}>
                <h3>文件来源</h3>
                {fileSources.map((source) => (
                    <div key={source.id} style={{ marginBottom: '15px', padding: '10px', border: '1px solid #d9d9d9', borderRadius: '4px' }}>
                        <Space align="start" style={{ width: '100%' }}>
                            <Input value={source.path} onChange={(e) => updateFileSource(source.id, 'path', e.target.value)} placeholder="源代码根目录" />
                            <Input value={source.fileType} onChange={(e) => updateFileSource(source.id, 'fileType', e.target.value)} placeholder="文件类型, 如 .js,.ts" style={{ width: '200px' }} />
                            <Button type="primary" onClick={() => handleExtractFiles(source.id)} loading={source.loading}>提取</Button>
                            <Button danger onClick={() => removeFileSource(source.id)}>删除</Button>
                        </Space>
                    </div>
                ))}
                <Button type="dashed" onClick={addFileSource} style={{ width: '100%' }}>添加文件来源</Button>
            </div>

            {/* Input Controls */}
            <div className="button-group" style={{ marginBottom: '20px' }}>
                <Button type="primary" onClick={addFileInput} style={{ marginRight: '10px' }}>添加文件</Button>
                <Button type="primary" onClick={addPromptInput}>添加提示词</Button>
            </div>

            {/* Inputs Container */}
            <div className="inputs-container">
                {inputs.map((input, index) => (
                    <div key={input.id} className="input-row" style={{ marginBottom: '10px', display: 'flex', alignItems: 'center' }}>
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                            {input.type === 'file' ? (
                                <>
                                    <Select
                                        mode="multiple"
                                        allowClear
                                        value={input.value as string[]}
                                        onChange={(value) => updateInput(input.id, value)}
                                        placeholder="请先提取文件, 然后选择"
                                        style={{ flex: 1 }}
                                        filterOption={(inputValue, option) =>
                                            (option?.children ?? '').toLowerCase().includes(inputValue.toLowerCase())
                                        }
                                    >
                                        {fileSources.map(source => (
                                            <Select.OptGroup key={source.id} label={source.path}>
                                                {source.files.map(file => (
                                                    <Select.Option key={`${source.id}-${file}`} value={JSON.stringify({ sourcePath: source.path, file: file })}>
                                                        {file}
                                                    </Select.Option>
                                                ))}
                                            </Select.OptGroup>
                                        ))}
                                    </Select>
                                    <Button onClick={() => handleSelectAllFiles(input.id)} style={{ marginLeft: '10px' }}>
                                        {
                                            (() => {
                                                const allFilesCount = fileSources.reduce((acc, s) => acc + s.files.length, 0);
                                                const selectedCount = Array.isArray(input.value) ? input.value.length : 0;
                                                return allFilesCount > 0 && selectedCount === allFilesCount ? '取消全选' : '全选';
                                            })()
                                        }
                                    </Button>
                                </>
                            ) : (
                                <Input.TextArea
                                    value={input.value as string}
                                    onChange={(e) => updateInput(input.id, e.target.value)}
                                    placeholder="请输入处理文件的提示词"
                                    rows={4}
                                />
                            )}
                        </div>
                        <div style={{ display: 'flex', marginLeft: '10px' }}>
                            <Button onClick={() => moveInput(input.id, 'up')} disabled={index === 0} style={{ marginRight: '5px' }}>上移</Button>
                            <Button onClick={() => moveInput(input.id, 'down')} disabled={index === inputs.length - 1} style={{ marginRight: '5px' }}>下移</Button>
                            <Button danger onClick={() => removeInput(input.id)}>删除</Button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Output Settings */}
            <div className="section" style={{ marginTop: '20px' }}>
                <h3>输出设置</h3>
                <div style={{ display: 'flex', marginBottom: '10px' }}>
                    <Input value={outputFolder} onChange={(e) => setOutputFolder(e.target.value)} placeholder="输出文件夹路径" style={{ flex: 1, marginRight: '10px' }} />
                    <Input value={outputFileType} onChange={(e) => setOutputFileType(e.target.value)} placeholder="输出文件类型 (如 tsx)" style={{ flex: 1 }} />
                </div>
            </div>

            <Button type="primary" onClick={handleBatchConvert} loading={isRunning} disabled={isRunning}>
                {isRunning ? '转换中...' : '开始批量转换'}
            </Button>

            {/* Conversion Status */}
            {conversionQueue.length > 0 && (
                <div style={{ marginTop: '20px' }}>
                    <h3>转换队列</h3>
                    <List
                        bordered
                        dataSource={conversionQueue}
                        renderItem={item => (
                            <List.Item
                                actions={[
                                    item.result && (<Button type="link" onClick={() => viewResult(item.result)}>查看结果</Button>),
                                    (item.status === 'error' || item.status === 'success') && (<Button type="link" onClick={() => handleRetry(item.id)}>重试</Button>)
                                ].filter(Boolean)}
                            >
                                <List.Item.Meta title={item.fileName} description={item.sourcePath} />
                                {item.status === 'pending' && <Tag color="default">排队中</Tag>}
                                {item.status === 'processing' && <Tag color="blue">处理中...</Tag>}
                                {item.status === 'success' && <Tag color="green">成功</Tag>}
                                {item.status === 'error' && <Tag color="red">失败</Tag>}
                            </List.Item>
                        )}
                    />
                </div>
            )}

            {/* Result Modal */}
            {currentResult && (
                <Modal title="转换结果" open={isResultModalVisible} onCancel={() => setIsResultModalVisible(false)} footer={null} width="80%">
                    <div style={{ marginTop: '20px' }}>
                        <div style={{ padding: '15px', backgroundColor: currentResult.success ? '#f6ffed' : '#fff2f0', border: `1px solid ${currentResult.success ? '#b7eb8f' : '#ffccc7'}`, borderRadius: '4px' }}>
                            <div style={{ marginBottom: '10px', fontWeight: 'bold' }}>{currentResult.success ? '成功' : '失败'}</div>
                            <div>{currentResult.message}</div>
                            {currentResult.data?.content && (
                                <div style={{ marginTop: '10px' }}>
                                    <CodeMirror
                                        value={currentResult.data.content}
                                        extensions={codeMirrorExtensions}
                                        readOnly
                                        style={{ border: '1px solid #d9d9d9', borderRadius: '4px', maxHeight: '60vh', overflow: 'auto' }}
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
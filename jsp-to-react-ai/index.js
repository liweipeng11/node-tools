require('dotenv').config({ path: '.env' })
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios'); // 引入 axios
const OpenAI = require('openai'); // 引入 OpenAI
const app = express();
app.use(express.json());

// 初始化 OpenAI 客户端
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_API_BASE,
});
const openaiCoder = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY_CODER,
  baseURL: process.env.OPENAI_API_BASE_CODER,
});

// 配置文件存储路径
const CONFIG_DIR = path.join(__dirname, 'configs');
const CONFIG_FILE = path.join(CONFIG_DIR, 'app-config.json');
const MULTI_FILE_STREAM_CONFIG_FILE = path.join(CONFIG_DIR, 'multi-file-stream-config.json');

// 确保配置目录存在
async function ensureConfigDir() {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
  } catch (error) {
    console.error('创建配置目录失败:', error);
  }
}

// 初始化配置目录
ensureConfigDir();

// 这个辅助函数保持不变
function extractContentFromMarkdown(markdown) {
  // 这个正则表达式用于查找被 ```...``` 包裹的内容，可以选择性地带有语言标签。
  const regex = /```(?:.*?\n)?([\s\S]*?)```/s;
  const match = markdown.match(regex);
  // 如果找到匹配项，则返回捕获的组；否则返回原始字符串。
  return match ? match[1].trim() : markdown;
}

app.post('/api/process-file', async (req, res) => {
  const { inputs, outputFileName, outputFolder } = req.body;

  if (!inputs || !outputFileName || !outputFolder) {
    return res.status(400).json({ error: '缺少必要参数: inputs, outputFileName, 或 outputFolder' });
  }

  try {
    // 首先判断输出文件夹是否存在，不存在就创建一个文件夹
    await fs.mkdir(outputFolder, { recursive: true });

    const outputFilePath = path.join(outputFolder, outputFileName);

    // 获取文件扩展名
    const fileExtension = path.extname(outputFileName).toLowerCase();

    // 循环inputs，将提示词和文件内容拼接起来 (这部分逻辑不变)
    const contentParts = [];
    for (const input of inputs) {
      if (input.type === 'prompt') {
        contentParts.push(input.value);
      } else if (input.type === 'file') {
        // 如果是文件地址，需要先读取文件内容
        const fileContent = await fs.readFile(input.value, 'utf-8');
        contentParts.push(fileContent);
      }
    }
    // 拼接的时候需要使用 \n 进行换行
    const combinedContent = contentParts.join('\n');

    let extractedContent;

    // 根据文件扩展名选择不同的处理逻辑
    if (fileExtension === '.jsx' || fileExtension === '.tsx') {
      // 使用 /api/generate-react 接口处理 React 组件
      console.log('正在调用 React 生成 API 服务...');

      // 为本次文件处理创建一个唯一的会话ID
      const sessionId = `react-generation-${Date.now()}-${Math.random().toString(36).substring(7)}`;

      // 调用 generate-react 接口
      const reactApiResponse = await axios.post(process.env.GENERATE_REACT_API_URL || '/api/generate-react', {
        message: combinedContent
      });

      // 从响应中获取生成的 React 组件代码
      const aiContent = reactApiResponse.data.reactCode;

      if (typeof aiContent !== 'string') {
        throw new Error("React 生成 API 没有返回有效的回复内容。");
      }

      console.log('React 生成 API 服务成功返回结果。');

      // 提取代码内容
      extractedContent = extractContentFromMarkdown(aiContent);
    } else {
      // 默认处理逻辑（适用于 .json 等其他文件类型）
      console.log('正在调用聊天 API 服务...');

      // 为本次文件处理创建一个唯一的会话ID，以隔离不同请求的上下文
      const sessionId = `file-processing-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      console.log(process.env.CHAT_API_URL, process.env.OPENAI_API_KEY)
      // 使用 axios 发送 POST 请求到你的聊天服务
      const chatApiResponse = await axios.post(process.env.CHAT_API_URL, {
        message: combinedContent,
        sessionId: sessionId
      });

      // 从聊天服务的响应中获取最终的回复内容
      const aiContent = chatApiResponse.data.reply;

      if (typeof aiContent !== 'string') {
        throw new Error("聊天 API 没有返回有效的回复内容。");
      }

      console.log('聊天 API 服务成功返回结果。');

      // 提取代码内容
      extractedContent = extractContentFromMarkdown(aiContent);
    }

    // 返回的内容不仅要存放到指定的文件夹中
    await fs.writeFile(outputFilePath, extractedContent, 'utf-8');

    // 同时需要把保存的路径和内容在接口中返回
    res.status(200).json({
      success: true,
      message: '文件已处理并成功保存!',
      data: {
        path: outputFilePath,
        content: extractedContent
      }
    });
  } catch (error) {
    console.error(error);
    // 增加对 axios 网络错误的专门捕获
    if (error.isAxiosError) {
      console.error('Axios 错误详情:', error.response?.data);
      return res.status(500).json({
        error: '与 API 服务通信失败。',
        details: error.response?.data || error.message
      });
    }
    // 处理文件未找到的错误
    if (error.code === 'ENOENT' && error.path) {
      return res.status(400).json({ error: `输入文件未找到: ${error.path}` });
    }
    // 其他通用错误
    res.status(500).json({ error: '处理文件时发生错误。' });
  }
});

// 添加 /api/generate-react 接口
app.post('/api/generate-react', async (req, res) => {
  const { message, sessionId } = req.body;

  if (!message) {
    return res.status(400).json({ error: '缺少必要参数: message' });
  }

  try {
    console.log('正在调用 React 组件生成服务...');

    // 使用环境变量中的 API 地址
    const apiResponse = await axios.post(process.env.CHAT_API_URL, {
      message: message,
      sessionId: sessionId || `react-gen-${Date.now()}`,
      // 可以添加特定的提示词或参数，指示这是 React 组件生成
      systemPrompt: '请将 JSP 代码转换为 React 组件。确保组件符合 React 最佳实践，使用函数组件和 Hooks。'
    });

    // 从响应中获取生成的内容
    const reply = apiResponse.data.reply;

    if (typeof reply !== 'string') {
      throw new Error("API 没有返回有效的回复内容。");
    }

    console.log('React 组件生成服务成功返回结果。');

    // 返回生成的 React 组件代码
    res.status(200).json({
      success: true,
      reply: reply
    });
  } catch (error) {
    console.error(error);
    if (error.isAxiosError) {
      console.error('Axios 错误详情:', error.response?.data);
      return res.status(500).json({
        error: '与 API 服务通信失败。',
        details: error.response?.data || error.message
      });
    }
    res.status(500).json({ error: '生成 React 组件时发生错误。' });
  }
});

// 添加直接使用 OpenAI API 的文件处理接口
app.post('/api/process-file-direct', async (req, res) => {
  const { inputs, outputFileName, outputFolder } = req.body;
  const model = req.query.model || 'qianwen'; // 默认使用千问

  if (!inputs || !outputFileName || !outputFolder) {
    return res.status(400).json({ error: '缺少必要参数: inputs, outputFileName, 或 outputFolder' });
  }

  try {
    // 首先判断输出文件夹是否存在，不存在就创建一个文件夹
    await fs.mkdir(outputFolder, { recursive: true });

    const outputFilePath = path.join(outputFolder, outputFileName);

    // 循环inputs，将提示词和文件内容拼接起来
    const contentParts = [];
    for (const input of inputs) {
      if (input.type === 'prompt') {
        contentParts.push(input.value);
      } else if (input.type === 'file') {
        // 如果是文件地址，需要先读取文件内容
        const fileContent = await fs.readFile(input.value, 'utf-8');
        contentParts.push(fileContent);
      }
    }
    // 拼接的时候需要使用 \n 进行换行
    const combinedContent = contentParts.join('\n');

    // 根据模型选择使用不同的实例
    let aiInstance;
    let modelName;
    let shouldPrintToConsole = true;

    if (model === 'qianwen') {
      aiInstance = openaiCoder;
      modelName = process.env.OPENAI_MODEL_CODER || "qwen-coder-plus";
      shouldPrintToConsole = false; // openaiCoder 不打印流式信息
    } else if (model === 'deepseek') {
      aiInstance = openai;
      modelName = process.env.OPENAI_MODEL || 'deepseek-coder';
      shouldPrintToConsole = true;
    } else {
      return res.status(400).json({ error: 'Invalid model. Supported models: qianwen, deepseek' });
    }

    let messages = [
      { role: 'system', content: '你是一个资深程序员，擅长解析各种语言的代码' },
      { role: 'user', content: combinedContent },
    ];
    let aiContent = '';
    let finishReason;

    console.log(`正在使用 ${model} 模型处理文件...`);

    // 都使用流式处理，但千问不打印到控制台
    do {
      const stream = await aiInstance.chat.completions.create({
        messages,
        model: modelName,
        temperature: 0.5,
        stream: true,
      });

      let currentIterationContent = '';
      if (shouldPrintToConsole) {
        console.log('--- OpenAI Stream Start ---');
      }
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;

        if (!delta) continue;
        // 检查并处理 reasoning_content 字段
        if (delta.reasoning_content && shouldPrintToConsole) {
          const reasoningPart = delta.reasoning_content;
          // 在控制台用特定前缀打印推理过程
          process.stdout.write(`${reasoningPart}`);
        }
        if (delta.content) {
          const contentPart = delta.content;
          currentIterationContent += contentPart;
          // 只有 deepseek 才在控制台直接打印最终内容
          if (shouldPrintToConsole) {
            process.stdout.write(contentPart);
          }
        }
        if (chunk.choices[0]?.finish_reason) {
          finishReason = chunk.choices[0].finish_reason;
        }
      }
      if (shouldPrintToConsole) {
        console.log('\n--- OpenAI Stream End ---');
      }
      aiContent += currentIterationContent;

      if (finishReason === 'length') {
        // 将助手的部分消息添加到历史记录中
        messages.push({ role: 'assistant', content: currentIterationContent });
        // 添加新的用户消息以提示模型继续
        messages.push({ role: 'user', content: '请紧接着上面的内容继续写，确保无缝衔接，确保语法正确，不要重复，也不要说"好的，我会继续"这类的话，直接开始写。' });
      }
    } while (finishReason === 'length');

    console.log(`${model} 模型成功返回结果。`);

    const extractedContent = extractContentFromMarkdown(aiContent);

    // 返回的内容不仅要存放到指定的文件夹中
    await fs.writeFile(outputFilePath, extractedContent, 'utf-8');

    // 同时需要把保存的路径和内容在接口中返回
    res.status(200).json({
      success: true,
      message: '文件已处理并成功保存!',
      data: {
        path: outputFilePath,
        content: extractedContent
      }
    });
  } catch (error) {
    console.error(error);
    // 处理文件未找到的错误
    if (error.code === 'ENOENT' && error.path) {
      return res.status(400).json({ error: `输入文件未找到: ${error.path}` });
    }
    res.status(500).json({ error: '处理文件时发生错误。' });
  }
});

// 递归获取指定类型的文件
async function getFiles(dir, fileType) {
  const dirents = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    dirents.map(dirent => {
      const res = path.resolve(dir, dirent.name);
      if (dirent.isDirectory()) {
        return getFiles(res, fileType);
      } else {
        if (path.extname(res) === `.${fileType}`) {
          return res;
        }
      }
    })
  );
  return Array.prototype.concat(...files).filter(Boolean);
}

app.post('/api/list-files', async (req, res) => {
  const { folderPath, fileType } = req.body;

  if (!folderPath || !fileType) {
    return res.status(400).json({ error: 'Missing required parameters: folderPath or fileType' });
  }

  try {
    const files = await getFiles(folderPath, fileType);
    const relativeFiles = files.map(file => path.relative(folderPath, file));
    res.status(200).json({
      success: true,
      data: relativeFiles,
    });
  } catch (error) {
    console.error(error);
    if (error.code === 'ENOENT') {
      return res.status(400).json({ error: `Directory not found: ${folderPath}` });
    }
    res.status(500).json({ error: 'An error occurred while listing files.' });
  }
});

// 配置保存接口
app.post('/api/config/save', async (req, res) => {
  try {
    const configData = req.body;

    if (!configData || typeof configData !== 'object') {
      return res.status(400).json({
        success: false,
        error: '请提供有效的配置数据（JSON对象）'
      });
    }

    // 添加时间戳
    const configWithTimestamp = {
      ...configData,
      lastUpdated: new Date().toISOString(),
      version: configData.version || '1.0.0'
    };

    // 将配置数据写入文件
    await fs.writeFile(CONFIG_FILE, JSON.stringify(configWithTimestamp, null, 2), 'utf-8');

    console.log('配置已保存到:', CONFIG_FILE);

    res.status(200).json({
      success: true,
      message: '配置保存成功',
      data: {
        path: CONFIG_FILE,
        lastUpdated: configWithTimestamp.lastUpdated
      }
    });
  } catch (error) {
    console.error('保存配置失败:', error);
    res.status(500).json({
      success: false,
      error: '保存配置时发生错误',
      details: error.message
    });
  }
});

// 配置读取接口
app.get('/api/config/load', async (req, res) => {
  try {
    // 检查配置文件是否存在
    try {
      await fs.access(CONFIG_FILE);
    } catch (error) {
      return res.status(404).json({
        success: false,
        error: '配置文件不存在',
        message: '请先保存配置'
      });
    }

    // 读取配置文件
    const configContent = await fs.readFile(CONFIG_FILE, 'utf-8');
    const configData = JSON.parse(configContent);

    console.log('配置已从文件加载:', CONFIG_FILE);

    res.status(200).json({
      success: true,
      message: '配置加载成功',
      data: configData
    });
  } catch (error) {
    console.error('加载配置失败:', error);

    // 处理 JSON 解析错误
    if (error instanceof SyntaxError) {
      return res.status(400).json({
        success: false,
        error: '配置文件格式错误',
        details: '配置文件不是有效的JSON格式'
      });
    }

    res.status(500).json({
      success: false,
      error: '加载配置时发生错误',
      details: error.message
    });
  }
});

// 配置删除接口
app.delete('/api/config/delete', async (req, res) => {
  try {
    // 检查配置文件是否存在
    try {
      await fs.access(CONFIG_FILE);
    } catch (error) {
      return res.status(404).json({
        success: false,
        error: '配置文件不存在'
      });
    }

    // 删除配置文件
    await fs.unlink(CONFIG_FILE);

    console.log('配置文件已删除:', CONFIG_FILE);

    res.status(200).json({
      success: true,
      message: '配置删除成功'
    });
  } catch (error) {
    console.error('删除配置失败:', error);
    res.status(500).json({
      success: false,
      error: '删除配置时发生错误',
      details: error.message
    });
  }
});

// 获取配置文件信息接口
app.get('/api/config/info', async (req, res) => {
  try {
    let fileExists = false;
    let fileStats = null;

    try {
      fileStats = await fs.stat(CONFIG_FILE);
      fileExists = true;
    } catch (error) {
      // 文件不存在
    }

    res.status(200).json({
      success: true,
      data: {
        configPath: CONFIG_FILE,
        exists: fileExists,
        size: fileExists ? fileStats.size : 0,
        lastModified: fileExists ? fileStats.mtime.toISOString() : null
      }
    });
  } catch (error) {
    console.error('获取配置信息失败:', error);
    res.status(500).json({
      success: false,
      error: '获取配置信息时发生错误',
      details: error.message
    });
  }
});

// 多文件流组配置保存接口
app.post('/api/multi-stream/save', async (req, res) => {
  try {
    const configData = req.body;

    if (!configData || typeof configData !== 'object') {
      return res.status(400).json({
        success: false,
        error: '请提供有效的多文件流组配置数据（JSON对象）'
      });
    }

    // 添加时间戳
    const configWithTimestamp = {
      ...configData,
      lastUpdated: new Date().toISOString(),
      version: configData.version || '1.0.0'
    };

    // 将配置数据写入文件
    await fs.writeFile(MULTI_FILE_STREAM_CONFIG_FILE, JSON.stringify(configWithTimestamp, null, 2), 'utf-8');

    console.log('多文件流组配置已保存到:', MULTI_FILE_STREAM_CONFIG_FILE);

    res.status(200).json({
      success: true,
      message: '多文件流组配置保存成功',
      data: {
        path: MULTI_FILE_STREAM_CONFIG_FILE,
        lastUpdated: configWithTimestamp.lastUpdated
      }
    });
  } catch (error) {
    console.error('保存多文件流组配置失败:', error);
    res.status(500).json({
      success: false,
      error: '保存多文件流组配置时发生错误',
      details: error.message
    });
  }
});

// 多文件流组配置读取接口
app.get('/api/multi-stream/load', async (req, res) => {
  try {
    // 检查配置文件是否存在
    try {
      await fs.access(MULTI_FILE_STREAM_CONFIG_FILE);
    } catch (error) {
      return res.status(404).json({
        success: false,
        error: '多文件流组配置文件不存在',
        message: '请先保存多文件流组配置'
      });
    }

    // 读取配置文件
    const configContent = await fs.readFile(MULTI_FILE_STREAM_CONFIG_FILE, 'utf-8');
    const configData = JSON.parse(configContent);

    console.log('多文件流组配置已从文件加载:', MULTI_FILE_STREAM_CONFIG_FILE);

    res.status(200).json({
      success: true,
      message: '多文件流组配置加载成功',
      data: configData
    });
  } catch (error) {
    console.error('加载多文件流组配置失败:', error);

    // 处理 JSON 解析错误
    if (error instanceof SyntaxError) {
      return res.status(400).json({
        success: false,
        error: '多文件流组配置文件格式错误',
        details: '配置文件不是有效的JSON格式'
      });
    }

    res.status(500).json({
      success: false,
      error: '加载多文件流组配置时发生错误',
      details: error.message
    });
  }
});

// 多文件流组批量处理接口
app.post('/api/multi-stream/process', async (req, res) => {
  try {
    const { streamGroupId } = req.body;

    if (!streamGroupId) {
      return res.status(400).json({
        success: false,
        error: '请提供流组ID (streamGroupId)'
      });
    }

    // 读取多文件流组配置
    const configContent = await fs.readFile(MULTI_FILE_STREAM_CONFIG_FILE, 'utf-8');
    const config = JSON.parse(configContent);

    // 查找指定的流组
    const streamGroup = config.streamGroups.find(group => group.id === streamGroupId);
    if (!streamGroup) {
      return res.status(404).json({
        success: false,
        error: `未找到ID为 ${streamGroupId} 的流组`
      });
    }

    if (!streamGroup.enabled) {
      return res.status(400).json({
        success: false,
        error: '该流组已被禁用'
      });
    }

    console.log(`开始处理流组: ${streamGroup.name}`);

    const results = [];
    const globalSettings = config.globalSettings || {};
    const maxConcurrent = globalSettings.maxConcurrentFiles || 5;

    // 按顺序处理文件
    for (let i = 0; i < streamGroup.files.length; i += maxConcurrent) {
      const batch = streamGroup.files.slice(i, i + maxConcurrent);
      const batchPromises = batch.map(async (file) => {
        try {
          console.log(`处理文件: ${file.name}`);

          // 为每个文件执行处理步骤
          let currentOutput = null;
          const fileResults = [];

          for (const step of streamGroup.processingSteps.sort((a, b) => a.order - b.order)) {
            console.log(`执行步骤: ${step.name}`);

            // 准备输入数据
            const inputs = [];

            if (step.order === 1) {
              // 第一步：读取原始文件
              inputs.push({
                type: 'file',
                value: file.path
              });
              inputs.push({
                type: 'prompt',
                value: step.promptTemplate.replace('{{fileContent}}', '')
              });
            } else {
              // 后续步骤：使用前一步的输出
              inputs.push({
                type: 'prompt',
                value: step.promptTemplate.replace('{{previousOutput}}', currentOutput || '')
              });
            }

            // 生成输出文件名和路径
            const outputFileName = streamGroup.outputConfig.fileNamingPattern
              .replace('{originalName}', path.parse(file.name).name)
              .replace('{outputFormat}', step.outputFormat);

            const outputFolder = path.join(
              streamGroup.outputConfig.baseOutputPath,
              streamGroup.outputConfig.createSubfolders ? `step-${step.order}` : ''
            );

            // 调用处理接口
            const processResponse = await axios.post(`http://localhost:${PORT}${step.apiEndpoint}`, {
              inputs,
              outputFileName,
              outputFolder
            });

            if (processResponse.data.success) {
              currentOutput = processResponse.data.data.content;
              fileResults.push({
                stepId: step.id,
                stepName: step.name,
                outputPath: processResponse.data.data.path,
                success: true
              });
            } else {
              throw new Error(`步骤 ${step.name} 处理失败: ${processResponse.data.error}`);
            }
          }

          return {
            fileId: file.id,
            fileName: file.name,
            success: true,
            steps: fileResults
          };
        } catch (error) {
          console.error(`处理文件 ${file.name} 失败:`, error);
          return {
            fileId: file.id,
            fileName: file.name,
            success: false,
            error: error.message
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    console.log(`流组 ${streamGroup.name} 处理完成`);

    res.status(200).json({
      success: true,
      message: '多文件流组处理完成',
      data: {
        streamGroupId,
        streamGroupName: streamGroup.name,
        totalFiles: streamGroup.files.length,
        results
      }
    });

  } catch (error) {
    console.error('多文件流组处理失败:', error);

    if (error.code === 'ENOENT') {
      return res.status(404).json({
        success: false,
        error: '多文件流组配置文件不存在'
      });
    }

    res.status(500).json({
      success: false,
      error: '多文件流组处理时发生错误',
      details: error.message
    });
  }
});

// 获取多文件流组配置信息接口
app.get('/api/multi-stream/info', async (req, res) => {
  try {
    let fileExists = false;
    let fileStats = null;
    let streamGroupsCount = 0;

    try {
      fileStats = await fs.stat(MULTI_FILE_STREAM_CONFIG_FILE);
      fileExists = true;

      // 如果文件存在，读取并统计流组数量
      const configContent = await fs.readFile(MULTI_FILE_STREAM_CONFIG_FILE, 'utf-8');
      const config = JSON.parse(configContent);
      streamGroupsCount = config.streamGroups ? config.streamGroups.length : 0;
    } catch (error) {
      // 文件不存在或解析失败
    }

    res.status(200).json({
      success: true,
      data: {
        configPath: MULTI_FILE_STREAM_CONFIG_FILE,
        exists: fileExists,
        size: fileExists ? fileStats.size : 0,
        lastModified: fileExists ? fileStats.mtime.toISOString() : null,
        streamGroupsCount
      }
    });
  } catch (error) {
    console.error('获取多文件流组配置信息失败:', error);
    res.status(500).json({
      success: false,
      error: '获取多文件流组配置信息时发生错误',
      details: error.message
    });
  }
});

// 启动服务器的逻辑保持不变
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`文件处理服务已启动，监听端口 ${PORT}`);
  console.log(`文件处理接口:`);
  console.log(`  - POST /api/process-file        - 智能文件处理（支持React组件生成）`);
  console.log(`  - POST /api/process-file-direct - 直接使用OpenAI API处理文件（支持模型选择：?model=qianwen|deepseek）`);
  console.log(`  - POST /api/generate-react      - React组件生成`);
  console.log(`  - POST /api/list-files          - 文件列表获取`);
  console.log(`配置管理接口:`);
  console.log(`  - POST /api/config/save         - 保存配置`);
  console.log(`  - GET  /api/config/load         - 读取配置`);
  console.log(`  - DELETE /api/config/delete     - 删除配置`);
  console.log(`  - GET  /api/config/info         - 获取配置信息`);
  console.log(`多文件流组配置接口:`);
  console.log(`  - POST /api/multi-stream/save    - 保存多文件流组配置`);
  console.log(`  - GET  /api/multi-stream/load    - 读取多文件流组配置`);
  console.log(`  - POST /api/multi-stream/process - 执行多文件流组批量处理`);
  console.log(`  - GET  /api/multi-stream/info    - 获取多文件流组配置信息`);
});
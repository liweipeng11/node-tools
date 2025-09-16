require('dotenv').config({ path: '.env' })
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios'); // 引入 axios
const app = express();
app.use(express.json());

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
      console.log(process.env.CHAT_API_URL,process.env.OPENAI_API_KEY)
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

// 启动服务器的逻辑保持不变
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`文件处理服务已启动，监听端口 ${PORT}`);
});
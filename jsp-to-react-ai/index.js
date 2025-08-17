require('dotenv').config();
const express = require('express');
const OpenAI = require('openai');
const fs = require('fs').promises;
const path = require('path');

const app = express();
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_API_BASE,
  // logLevel: 'debug'
});

function extractContentFromMarkdown(markdown) {
  // This regex finds content within ```...```, optionally with a language tag.
  const regex = /```(?:.*?\n)?([\s\S]*?)```/s;
  const match = markdown.match(regex);
  // If a match is found, return the captured group, otherwise return the original string.
  return match ? match[1].trim() : markdown;
}

app.post('/api/process-file', async (req, res) => {
  const { inputs, outputFileName, outputFolder } = req.body;

  if (!inputs || !outputFileName || !outputFolder) {
    return res.status(400).json({ error: 'Missing required parameters: inputs, outputFileName, or outputFolder' });
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

    let messages = [
      { role: 'user', content: combinedContent }
    ];
    let aiContent = '';
    let finishReason;

    do {
      // Log the messages array to log.txt
      const logEntry = `\n\n\n\n\n--- Request at ${new Date().toISOString()} ---\n${JSON.stringify(messages, null, 2)}`;
      await fs.appendFile('log.txt', logEntry, 'utf-8');

      const stream = await openai.chat.completions.create({
        messages,
        model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
        temperature: 0.5,
        stream: true,
        max_tokens: 4000
      });

      let currentIterationContent = '';
      for await (const chunk of stream) {
        const contentPart = chunk.choices[0]?.delta?.content || '';
        currentIterationContent += contentPart;
        if (chunk.choices[0]?.finish_reason) {
          finishReason = chunk.choices[0].finish_reason;
        }
      }

      aiContent += currentIterationContent;

      if (finishReason === 'length') {
        // Append the assistant's partial message from this iteration to the history
        messages.push({ role: 'assistant', content: currentIterationContent });
        // Add a new user message to prompt the model to continue
        messages.push({ role: 'user', content: '请紧接着上面的内容继续写，确保无缝衔接，确保语法正确，不要重复，也不要说“好的，我会继续”这类的话，直接开始写。' });
      }
    } while (finishReason === 'length');
    const extractedContent = extractContentFromMarkdown(aiContent);

    // 返回的内容不仅要存放到指定的文件夹中
    await fs.writeFile(outputFilePath, extractedContent, 'utf-8');

    // 同时需要把保存的路径和内容在接口中返回
    res.status(200).json({
      success: true,
      message: 'File processed and saved successfully!',
      data: {
        path: outputFilePath,
        content: extractedContent
      }
    });
  } catch (error) {
    console.error(error);
    if (error.code === 'ENOENT' && error.path) {
      return res.status(400).json({ error: `Input file not found: ${error.path}` });
    }
    res.status(500).json({ error: 'An error occurred while processing the file.' });
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

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
});

function extractContentFromMarkdown(markdown) {
  // This regex finds content within ```...```, optionally with a language tag.
  const regex = /```(?:[a-zA-Z0-9]+\n)?([\s\S]+?)\n?```/;
  const match = markdown.match(regex);
  // If a match is found, return the captured group, otherwise return the original string.
  return match ? match[1].trim() : markdown;
}

app.post('/process-file', async (req, res) => {
  const { inputs, outputFileName, outputFolder } = req.body;

  if (!inputs || !outputFileName || !outputFolder) {
    return res.status(400).json({ error: 'Missing required parameters: inputs, outputFileName, or outputFolder' });
  }

  try {
    // 首先判断输出文件夹是否存在，不存在就创建一个文件夹
    await fs.mkdir(outputFolder, { recursive: true });

    const outputFilePath = path.join(outputFolder, outputFileName);

    // 判断文件名是否存在，如果存在直接结束，抛出错误
    try {
      await fs.stat(outputFilePath);
      return res.status(400).json({ error: `File already exists: ${outputFilePath}` });
    } catch (error) {
      // 如果错误码不是'ENOENT'(文件不存在)，则抛出其他错误
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

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

    const completion = await openai.chat.completions.create({
      messages: [
        { role: 'user', content: combinedContent }
      ],
      model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
      temperature: 0
    });

    const aiContent = completion.choices[0].message.content;
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
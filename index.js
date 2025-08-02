const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { v4 } = require('uuid');

// 创建images文件夹（如果不存在）
const imagesDir = './images';
if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir);
} else {
    // 清空文件夹
    fs.readdirSync(imagesDir).forEach(file => {
        const filePath = path.join(imagesDir, file);
        if (fs.lstatSync(filePath).isFile()) {
            fs.unlinkSync(filePath);
        }
    });
}

// 下载图片函数
function downloadImage(url, filePath) {
    return axios({
        url,
        method: 'GET',
        responseType: 'stream'
    })
        .then(response => {
            return new Promise((resolve, reject) => {
                const writer = fs.createWriteStream(filePath);
                response.data.pipe(writer);
                writer.on('finish', resolve);
                writer.on('error', reject);
            });
        })
        .catch(error => {
            console.error(`下载图片 ${url} 失败:`, error.message);
            return Promise.reject(error);
        });
}

// 读取/data/mcp-servers.json文件
fs.readFile('./data/mcp-servers.json', 'utf8', (err, data) => {
    if (err) {
        console.error('读取文件时出错:', err);
        return;
    }

    try {
        const jsonData = JSON.parse(data);
        const mcpServers = jsonData.data.mcp_servers;

        // 创建split文件夹（如果不存在），如果存在则清空
        const splitDir = './split';
        if (!fs.existsSync(splitDir)) {
            fs.mkdirSync(splitDir);
        } else {
            // 清空文件夹
            fs.readdirSync(splitDir).forEach(file => {
                const filePath = path.join(splitDir, file);
                if (fs.lstatSync(filePath).isFile()) {
                    fs.unlinkSync(filePath);
                }
            });
        }

        const savedDir = './saved';
        if (!fs.existsSync(savedDir)) {
            fs.mkdirSync(savedDir);
        } else {
            // 清空文件夹
            fs.readdirSync(savedDir).forEach(file => {
                const filePath = path.join(savedDir, file);
                if (fs.lstatSync(filePath).isFile()) {
                    fs.unlinkSync(filePath);
                }
            });
        }

        const langDir = path.join(splitDir, 'zh_hans')
        if (!fs.existsSync(langDir)) {
            fs.mkdirSync(langDir);
        } else {
            // 清空文件夹
            fs.readdirSync(langDir).forEach(file => {
                const filePath = path.join(langDir, file);
                if (fs.lstatSync(filePath).isFile()) {
                    fs.unlinkSync(filePath);
                }
            });
        }
        mcpServers.forEach((server) => {
            const hubId = v4();

            // 下载图片
            if (server.logo_url) {
                const fileExtension = path.extname(server.logo_url);
                const imageFileName = `${hubId}${fileExtension}`;
                const imageFilePath = path.join(imagesDir, imageFileName);

                downloadImage(server.logo_url, imageFilePath)
                    .then(() => {
                        console.log(`成功下载图片: ${imageFileName}`);
                    })
                    .catch(() => {
                        // 图片下载失败不影响其他操作
                        console.log(`图片下载失败，继续处理其他数据`);
                    });
            }

            createToSplit(server, hubId, splitDir);
            createToLang(server, hubId, langDir);
            createToSaved(server, hubId, savedDir);
        })
    } catch (parseError) {
        console.error('解析JSON时出错:', parseError);
    }
});

function createToSplit(server, hubId, baseDir) {
    const sanitizedName = server.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const fileName = `${hubId}_${sanitizedName}.json`;
    const author = server.mcpid.split('/')[1]
    const tempServer = {
        "mcpId": server.mcpid,
        "githubUrl": server.official_url,
        "name": server.name,
        "author": author,
        "description": server.description_en,
        "codiconIcon": "",
        "logoUrl": server.logo_url,
        "category": server.categories_en[0],
        "install_commands": server.install_commands,
        "tags": server.tags,
        "requiresApiKey": false,
        "isRecommended": true,
        "githubStars": 0,
        "downloadCount": 0,
        "createdAt": new Date().toISOString(),
        "updatedAt": new Date().toISOString(),
        "hubId": hubId,
        "isOfficialIntegration": false,
        "isReferenceServer": false,
        "isCommunityServer": true,
        "isAble": true
    }
    const splitPath = path.join(baseDir, fileName)
    fs.writeFile(splitPath, JSON.stringify(tempServer, null, 2), 'utf8', (writeErr) => {
        if (writeErr) {
            console.error(`写入文件 ${fileName} 时出错:`, writeErr);
        } else {
            console.log(`成功创建文件: ${fileName}`);
        }
    });
}
function createToLang(server, hubId, baseDir) {
    const sanitizedName = server.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const fileName = `${hubId}_${sanitizedName}.json`;
    const author = server.mcpid.split('/')[1]
    const tempServer = {
        "mcpId": server.mcpid,
        "githubUrl": server.official_url,
        "name": server.name,
        "author": author,
        "description": server.description_zh,
        "codiconIcon": "",
        "logoUrl": server.logo_url,
        "category": server.categories[0],
        "install_commands": server.install_commands,
        "tags": server.tags,
        "requiresApiKey": false,
        "isRecommended": true,
        "githubStars": 0,
        "downloadCount": 0,
        "createdAt": new Date().toISOString(),
        "updatedAt": new Date().toISOString(),
        "hubId": hubId,
        "isOfficialIntegration": false,
        "isReferenceServer": false,
        "isCommunityServer": true,
        "isAble": true
    }
    const splitPath = path.join(baseDir, fileName)
    fs.writeFile(splitPath, JSON.stringify(tempServer, null, 2), 'utf8', (writeErr) => {
        if (writeErr) {
            console.error(`写入文件 ${fileName} 时出错:`, writeErr);
        } else {
            console.log(`成功创建文件: ${fileName}`);
        }
    });
}
function createToSaved(server, hubId, baseDir) {
    const fileName = `${hubId}_zh-hans.json`
    const savedPath = path.join(baseDir, fileName)
    const author = server.mcpid.split('/')[1]
    const tempServer = {
        "mcpId": server.mcpid,
        "githubUrl": server.official_url,
        "name": server.name,
        "author": author,
        "description": server.description_zh,
        "codiconIcon": "",
        "logoUrl": server.logo_url,
        "category": server.categories[0],
        "tags": server.tags,
        "requiresApiKey": false,
        "isRecommended": true,
        "githubStars": 0,
        "downloadCount": 0,
        "createdAt": new Date().toISOString(),
        "updatedAt": new Date().toISOString(),
        "hubId": hubId,
        "isOfficialIntegration": false,
        "isReferenceServer": false,
        "isCommunityServer": true,
        "githubLatestCommit": "",
        "githubForks": 0,
        "licenseType": "MIT",
        "description_en": server.description_en,
        "description_zh": server.description_zh,
        "Installation_instructions": '',
        "install_commands": server.install_commands,
        "Usage_instructions": "",
        "features": [],
        "prerequisites": [],
        "lastEnrichmentTime": 0,
        "latest_update_time": new Date().toISOString(),
        "latest_commit_id": "",
        "fork_count": 0,
        "owner_name": "neondatabase-labs",
        "license_type": "MIT",
        "isAble": true
    }
    fs.writeFile(savedPath, JSON.stringify(tempServer, null, 2), 'utf8', (writeErr) => {
        if (writeErr) {
            console.error(`写入文件 ${fileName} 时出错:`, writeErr);
        } else {
            console.log(`成功创建文件: ${fileName}`);
        }
    });
}
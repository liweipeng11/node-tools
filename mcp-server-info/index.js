const fs = require('fs');
const path = require('path');
const { v4 } = require('uuid');

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
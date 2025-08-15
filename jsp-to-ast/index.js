const fs = require('fs');
const path = require('path');
const parseJspToAst = require('./parser');
const transformJspAstToReactAst = require('./transform');



function findJspFiles(dir, jspFiles = []) {
    // 读取目录内容
    const files = fs.readdirSync(dir);

    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stats = fs.statSync(filePath);

        if (stats.isDirectory()) {
            // 如果是目录，则递归调用findJspFiles函数
            findJspFiles(filePath, jspFiles);
        } else if (path.extname(file).toLowerCase() === '.jsp') {
            // 如果是.jsp文件，则添加到数组中
            jspFiles.push({
                fullPath: filePath,
                fileName: file
            });
        }
    });

    return jspFiles;
}

// 指定要搜索的文件夹路径
const folderPath = 'E:\\work\\aise\\uob switch\\clr-sg\\plce-sg-web\\src\\main\\webapp'; // 替换为你要搜索的实际文件夹路径


try {
    const jspFileInfo = findJspFiles(folderPath);
    jspFileInfo.forEach(info => {
        const jspCode = fs.readFileSync(info.fullPath, "utf-8");
        const ast = parseJspToAst(jspCode);
        // const reactAst = transformJspAstToReactAst(ast);

        // 将AST保存到JSON文件
        fs.writeFileSync(`./data/${info.fileName.replace('.jsp','.json')}`, JSON.stringify(ast, null, 2));
    });
    // const jspCode = fs.readFileSync('E:\\work\\aise\\uob switch\\clr-sg\\plce-sg-web\\src\\main\\webapp\\header.jsp', "utf-8");
    // const ast = parseJspToAst(jspCode);
    // const reactAst = transformJspAstToReactAst(ast);
    // console.log(JSON.stringify(reactAst, null, 2))

} catch (err) {
    console.error('Error occurred while searching for JSP files:', err);
}




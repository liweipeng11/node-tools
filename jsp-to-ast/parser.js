const htmlparser2 = require("htmlparser2");

/**
 * 解析复杂的、以 Scriptlet 为主的 JSP 文件。
 * @param {string} jspString - 包含 JSP 代码的字符串。
 * @returns {object} - 代表整个文档的根 AST 节点。
 */
function parseJspToAst(jspString) {
  const root = { type: "Root", children: [] };
  const stack = [root];
  const getCurrentParent = () => stack[stack.length - 1];
  const parserOptions = {
    recognizeSelfClosing: true, // 关键选项！
    xmlMode: false, // 保持为 false 或根据需要设为 true
  };
  const parser = new htmlparser2.Parser({
    onopentag(name, attribs) {
      if (name.startsWith("jsp:")) {

        const node = {
          type: "JspAction",
          tagName: name,
          attributes: attribs,
          children: []
        };

        getCurrentParent().children.push(node);

        stack.push(node);
        return;
      }

      const node = {
        type: "Element",
        tagName: name,
        attributes: attribs,
        children: [],
      };
      getCurrentParent().children.push(node);
      stack.push(node);
    },

    ontext(text) {
      if (text.trim().length === 0) return;
      getCurrentParent().children.push({ type: "Text", value: text });
    },

    onclosetag(name) {
      stack.pop();
    },

    /**
     * 这是处理所有 <%...%> 变体的核心。
     * htmlparser2 将它们都视为“处理指令”。
     */
    onprocessinginstruction(name, data) {
      // data 的原始形式是 "... ?>" 或 "... %>"
      // name 可以是 '?' 或 '=' 等，帮助我们识别类型
      const instruction = data.slice(0, -1).trim(); // 去掉末尾的 > 和可能的 ? 或 %

      // 1. 识别 JSP 指令: <%@ ... %>
      if (instruction.startsWith("@")) {
        const directiveContent = instruction.slice(1).trim();
        const [directiveName, ...attrs] = directiveContent.split(/\s+/);
        const attributes = {};
        // 简单解析属性
        attrs.join(' ').replace(/(\w+)="([^"]*)"/g, (_, key, value) => {
          attributes[key] = value;
        });
        getCurrentParent().children.push({
          type: "JspDirective",
          name: directiveName,
          attributes: attributes,
        });
        return;
      }
      
      // 2. 识别 JSP 表达式: <%= ... %>
      // htmlparser2 会将 <%=...%> 的 name 设为 '='
      if (name === '=') {
        getCurrentParent().children.push({
          type: "JspExpression",
          code: instruction.slice(1).trim(), // 去掉开头的 '='
        });
        return;
      }

      // 3. 识别 JSP Scriptlet: <% ... %>
      // 这是默认情况
      getCurrentParent().children.push({
        type: "Scriptlet",
        code: instruction,
        comment: "NEEDS_MANUAL_ANALYSIS_AND_MIGRATION",
      });
    },

    oncomment(data) {
        // 捕获 HTML 注释 // JSP 注释 <%-- --%> 不会被这个回调捕获
        const trimmedData = data.trim();
        if (trimmedData.length > 0) {
            getCurrentParent().children.push({
                type: "Comment",
                value: trimmedData
            });
        }
    }
  },parserOptions);

  parser.write(jspString);
  parser.end();

  return root;
}

module.exports = parseJspToAst;
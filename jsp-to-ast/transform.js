/**
 * 解析一个可能包含内联 JSP 标签的文本字符串。
 * @param {string} text - 文本节点的 value。
 * @returns {Array<object>} - 一个由 JsxText、JspExpression、Scriptlet 等节点组成的数组。
 */
function parseTextAndJsp(text) {
  // 正则表达式，用于匹配所有类型的 JSP 标签，并将其作为分隔符
  const jspRegex = /(<%@[\s\S]*?%>|<%=[\s\S]*?%>|<%[\s\S]*?%>)/g;
  
  // 使用 split 和 capturing group，将文本和 JSP 标签分离到数组中
  const parts = text.split(jspRegex).filter(part => part && part.trim().length > 0);

  return parts.map(part => {
    // 1. 识别 JSP 指令: <%@ ... %>
    if (part.startsWith('<%@')) {
      const content = part.slice(3, -2).trim();
      // 在这里可以添加更复杂的指令解析逻辑
      return {
        type: "JspDirective",
        content: content,
        comment: "NEEDS_MANUAL_MIGRATION_TO_IMPORT_OR_COMPONENT",
      };
    }
    // 2. 识别 JSP 表达式: <%= ... %>
    if (part.startsWith('<%=')) {
      return {
        type: "JsxExpression",
        code: part.slice(3, -2).trim(), // 提取 Java 代码
      };
    }
    // 3. 识别 JSP Scriptlet: <% ... %>
    if (part.startsWith('<%')) {
      return {
        type: "ManualReview",
        comment: "The following Java Scriptlet code needs to be manually migrated to React/JS logic.",
        originalCode: part.slice(2, -2).trim(),
      };
    }
    // 4. 否则，就是普通文本
    return {
      type: "JsxText",
      value: part,
    };
  });
}

/**
 * 递归地将 JSP AST (即使结构不佳) 转换为 React 友好的 AST。
 * @param {object} jspNode - 来自 parseJspToAst 的 JSP AST 节点。
 * @returns {object|Array<object>|null} - 一个或多个代表 React/JSX 的新 AST 节点。
 */
function transformJspAstToReactAst(jspNode) {
  if (!jspNode) return null;

  switch (jspNode.type) {
    case "Root":
    case "Element": {
      const newAttributes = {};
      if (jspNode.attributes) {
        for (const key in jspNode.attributes) {
          let newKey = key;
          // 属性名转换
          if (key === 'class') newKey = 'className';
          if (key === 'for') newKey = 'htmlFor';
          // 其他 HTML-to-JSX 属性转换...

          const value = jspNode.attributes[key];
          const expressionMatch = value.match(/<%=(.*?)%>/);

          if (expressionMatch) {
            // 属性包含一个 JSP 表达式
            newAttributes[newKey] = {
              type: "JsxExpression",
              code: expressionMatch[1].trim(),
            };
          } else {
            newAttributes[newKey] = value;
          }
        }
      }

      // 使用 flatMap，因为一个子节点 (特别是 Text) 可能会被转换成多个新节点
      const children = jspNode.children
        .flatMap(child => transformJspAstToReactAst(child)) // 使用 flatMap
        .filter(Boolean);

      return {
        type: jspNode.type === 'Root' ? 'Root' : 'JsxElement',
        tagName: jspNode.tagName,
        attributes: newAttributes,
        children: children,
      };
    }

    case "JspAction": {
        // 处理 <jsp:forward> 和 <jsp:include> 等
        if (jspNode.tagName === 'jsp:forward' || jspNode.tagName === 'jsp:include') {
            const page = jspNode.attributes.page;
            // 这是一个需要手动干预的重定向或包含逻辑
            return {
                type: "ManualReview",
                comment: `JSP action <${jspNode.tagName}> to page "${page}" needs manual migration. This might become a React Router <Redirect> or a component import <${page.replace('.jsp', '')}/>.`,
                originalTag: jspNode.tagName,
                attributes: jspNode.attributes
            };
        }
        // 其他 JspAction 可以按需处理
        return null;
    }

    case "Text": {
      // 这是核心调整：对文本节点进行二次解析
      // 这个函数会返回一个节点数组
      return parseTextAndJsp(jspNode.value);
    }

    // 以下是理想情况下解析器应该生成的节点类型，保留它们以备将来解析器修复后使用
    case "JspExpression":
      return {
        type: "JsxExpression",
        code: jspNode.code,
      };

    case "Scriptlet":
      return {
        type: "ManualReview",
        comment: "The following Java Scriptlet code needs to be manually migrated to React/JS logic.",
        originalCode: jspNode.code,
      };
      
    case "JspDirective":
      return {
        type: "ManualReview",
        comment: `JSP directive "@${jspNode.name}" needs manual migration.`,
        attributes: jspNode.attributes,
      };

    case "Comment":
      return {
        type: "JsxComment",
        value: jspNode.value
      };

    default:
      return null;
  }
}

module.exports = transformJspAstToReactAst;

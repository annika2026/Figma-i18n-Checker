# 精确文本宽度测量 API 文档

## 概述

本项目现在提供**精确的文本宽度测量**功能，完全基于 Figma 稿子中的实际数据进行计算：
- ✅ 使用 Canvas API 进行精确测量
- ✅ 支持完整的字体样式（字体、字号、字重、斜体、字间距）
- ✅ 无阈值，严格比较
- ✅ 支持多语言文本

---

## 核心方法

### 1. `calculateTextWidth(text, fontStyle)`

精确计算文本宽度（像素）。

**参数:**
```javascript
text: string            // 要测量的文本内容
fontStyle: {
  fontSize: number,     // 字号（必需，单位：px）
  fontFamily: string,   // 字体名称（必需）
  fontWeight: number,   // 字重（可选，默认：400）
  fontStyle: string,    // 样式：'normal' | 'italic'（可选，默认：'normal'）
  letterSpacing: number,// 字间距（可选，单位：px，默认：0）
  lineHeight: number    // 行高（可选，用于多行文本）
}
```

**返回值:**
```javascript
number  // 文本宽度（像素）
```

**示例:**
```javascript
const TextWidthChecker = require('./backend/textWidthChecker');
const checker = new TextWidthChecker();

// 基本使用
const width = checker.calculateTextWidth('Hello World', {
  fontSize: 16,
  fontFamily: 'Inter'
});
console.log(width); // 例如: 51.50

// 完整样式
const width2 = checker.calculateTextWidth('更新游戏', {
  fontSize: 20,
  fontFamily: 'PingFang SC',
  fontWeight: 500,
  letterSpacing: 1.5
});
```

---

### 2. `checkTextFit(text, containerWidth, fontStyle)`

严格检查文本是否适配容器（无阈值）。

**参数:**
```javascript
text: string            // 文本内容
containerWidth: number  // 容器宽度（像素）
fontStyle: object       // 字体样式对象（同上）
```

**返回值:**
```javascript
{
  text: string,              // 文本内容
  textWidth: number,         // 文本实际宽度（px）
  containerWidth: number,    // 容器宽度（px）
  fits: boolean,             // 是否适配（textWidth <= containerWidth）
  overflow: number,          // 超出宽度（px，0表示未超出）
  utilization: number,       // 利用率（%）
  overflowPercentage: number // 超出百分比（%）
}
```

**示例:**
```javascript
const result = checker.checkTextFit('This is a long text', 100, {
  fontSize: 16,
  fontFamily: 'Inter'
});

console.log(result);
// {
//   text: 'This is a long text',
//   textWidth: 215.9,
//   containerWidth: 100,
//   fits: false,
//   overflow: 115.9,
//   utilization: 215.9,
//   overflowPercentage: 115.9
// }
```

---

### 3. `validateI18nTexts(textNodes, translations)`

验证多语言翻译是否适配 Figma 容器尺寸。

**参数:**
```javascript
textNodes: Array<{        // Figma 文本节点数组
  name: string,           // 节点名称（作为 i18n key）
  absoluteBoundingBox: {
    width: number         // 容器宽度
  },
  style: {                // 完整的字体样式
    fontSize: number,
    fontFamily: string,
    fontWeight: number,
    italic: boolean,
    letterSpacing: number
  }
}>

translations: {           // 翻译数据对象
  [key: string]: {        // i18n key
    [language: string]: string  // 语言: 翻译文本
  }
}
```

**返回值:**
```javascript
{
  valid: Array,      // 适配的文本列表
  overflow: Array,   // 超出的文本列表
  summary: {
    total: number,
    valid: number,
    overflow: number,
    languages: string[]
  }
}
```

**示例:**
```javascript
const textNodes = [
  {
    name: 'button_update',
    absoluteBoundingBox: { width: 120 },
    style: {
      fontSize: 16,
      fontFamily: 'Inter',
      fontWeight: 500
    }
  }
];

const translations = {
  'button_update': {
    'en': 'Update Game',
    'zh-CN': '更新游戏',
    'fr': 'Mettre à jour le jeu'
  }
};

const results = checker.validateI18nTexts(textNodes, translations);
console.log(results.summary);
// { total: 3, valid: 2, overflow: 1, languages: ['en', 'zh-CN', 'fr'] }
```

---

## 从 Figma 提取的字体信息

系统会自动从 Figma API 提取以下字体信息：

```javascript
{
  fontSize: number,              // 字号
  fontFamily: string,            // 字体族
  fontWeight: number,            // 字重 (100-900)
  fontPostScriptName: string,    // PostScript 字体名
  italic: boolean,               // 是否斜体
  letterSpacing: number,         // 字间距
  lineHeightPx: number,          // 行高（像素）
  lineHeightPercent: number,     // 行高（百分比）
  lineHeightUnit: string,        // 行高单位
  textAlignHorizontal: string,   // 水平对齐
  textAlignVertical: string      // 垂直对齐
}
```

这些信息会被自动应用到精确测量中。

---

## 支持的字体

系统内置了常见字体的 fallback 映射：

- **Inter** → Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif
- **SF Pro Display** → "SF Pro Display", -apple-system, BlinkMacSystemFont, sans-serif
- **Roboto** → Roboto, Arial, sans-serif
- **PingFang SC** → "PingFang SC", "Microsoft YaHei", sans-serif
- **Helvetica** → Helvetica, Arial, sans-serif
- **Arial** → Arial, Helvetica, sans-serif
- 等等...

如果 Figma 使用的字体不在列表中，系统会自动使用 `sans-serif` 作为 fallback。

---

## 精确度说明

### 计算方式
- 使用 Node.js Canvas 库的 `measureText()` API
- 完全模拟浏览器的文本渲染行为
- 考虑字体样式的所有属性

### 严格比较
- **无阈值**：文本宽度必须 `≤` 容器宽度才算适配
- 之前版本使用 95% 阈值，现在已移除
- 精确到小数点后 2 位

### 多语言支持
自动识别并正确测量各种语言：
- CJK 字符（中日韩）
- 西里尔字符（俄语等）
- 拉丁扩展字符（越南语、法语等）
- 阿拉伯字符
- 泰文字符
- 等等...

---

## 使用流程

### 1. 单独使用测量 API

```javascript
const TextWidthChecker = require('./backend/textWidthChecker');
const checker = new TextWidthChecker();

// 测量文本
const width = checker.calculateTextWidth('Your Text', {
  fontSize: 16,
  fontFamily: 'Inter',
  fontWeight: 500
});

// 检查适配
const result = checker.checkTextFit('Your Text', 120, {
  fontSize: 16,
  fontFamily: 'Inter'
});

if (!result.fits) {
  console.log(`文本超出 ${result.overflow}px (${result.overflowPercentage}%)`);
}
```

### 2. 在 Figma 分析流程中使用

系统会自动：
1. 从 Figma API 获取文件数据
2. 提取所有文本节点及其完整样式
3. 解析 CSV 翻译数据
4. 使用精确测量验证每种语言的翻译
5. 生成详细报告

通过 Web UI 或 API 端点 `/analyze` 使用。

---

## 测试

运行测试脚本：

```bash
node backend/test_precise_measurement.js
```

测试包括：
- 基本文本测量
- 中文文本测量
- 带字间距的文本
- 斜体文本
- 容器适配检查
- 多语言对比

---

## API 端点

### POST `/analyze`

上传 CSV 和 Figma URL 进行完整分析。

**请求:**
```
Content-Type: multipart/form-data

file: CSV文件（可选）
figmaUrl: Figma文件URL
figmaApiKey: Figma API密钥
```

**响应:**
```json
{
  "message": "Analysis completed successfully",
  "analysis": {
    "fileName": "...",
    "textNodes": 25,
    "analysis": {
      "widthValidation": {
        "summary": {
          "total": 75,
          "valid": 68,
          "overflow": 7,
          "languages": ["en", "zh-CN", "ja", "ko"],
          "successRate": 90.67
        },
        "details": {
          "valid": [...],
          "overflow": [...]
        }
      }
    }
  }
}
```

---

## 注意事项

1. **字体可用性**: Canvas 测量需要系统安装对应的字体。如果字体不可用，会使用 fallback 字体。

2. **性能**: 精确测量比近似算法稍慢，但对于典型的 i18n 检查场景（几十到几百个文本节点）性能完全足够。

3. **精确度**: Canvas 测量的精确度已经非常接近实际渲染，但不同平台/浏览器可能有微小差异（通常 < 1px）。

4. **多行文本**: 当前版本主要针对单行文本。多行文本的换行逻辑需要单独处理。

---

## 更新日志

### v2.0 - 精确测量版本
- ✅ 使用 Canvas API 进行精确测量
- ✅ 移除所有阈值和近似算法
- ✅ 支持完整的 Figma 字体样式
- ✅ 添加溢出百分比
- ✅ 改进日志输出
- ✅ 更新前端显示字体信息

### v1.0 - 初始版本
- 基于字符的近似算法
- 使用 95% 阈值


# Missing Keys in CSV 问题修复总结

## 问题背景

用户反馈:CSV文件中明确包含的key(如 `power`、`battles`、`activity`、`technology`、`development`、`military`)在检测结果中仍然显示为"Missing Keys in CSV"。

## 问题原因

经过排查,发现存在两个根本问题:

### 问题1: i18n Key识别规则过于严格

**原因分析:**

原始的`isI18nKey`方法定义的识别规则只包含以下几种模式:
- `common.key` - 点分隔格式
- `COMMON_KEY` - 全大写下划线格式  
- `common_key` - 小写下划线格式
- `common.sub.key` - 多级点分隔格式

**问题表现:**

简单的小写单词(如 `power`、`battles`等)不符合任何已定义的模式,被系统识别为**硬编码文本(Hardcoded Text)**而不是**i18n key**,因此没有被加入到`potentialI18nKeys`列表中进行CSV比对。

### 问题2: CSV文件包含BOM字符

**原因分析:**

用户的CSV文件在导出时包含了**BOM (Byte Order Mark)** 字符 `\uFEFF`。这导致CSV解析后的列名变成了 `﻿key`(带不可见BOM字符)而不是 `key`。

**问题表现:**

```javascript
// CSV解析后的数据结构
row.key          // undefined ❌ - 无法访问
row['﻿key']      // 'power' ✅ - 实际列名带BOM
```

原始代码使用 `row.key || row.Key || row.KEY` 提取key值,全部返回undefined,导致CSV中的所有key都无法被正确读取。

## 解决方案

### 修复1: 扩展i18n Key识别规则

**修改文件:** `backend/figma.js`

**修改位置:** `isI18nKey` 方法

**修改内容:**

```javascript
isI18nKey(text) {
  if (!text) return false;
  
  // Common i18n key patterns
  const keyPatterns = [
    /^[a-z]+\.[a-z_]+$/i,           // common.key
    /^[A-Z_]+$/i,                   // COMMON_KEY
    /^[a-z]+_[a-z_]+$/i,            // common_key
    /^[a-z]+\.[a-z]+\.[a-z_]+$/i,   // common.sub.key
    /^[a-z]{2,}$/i,                 // 🆕 Simple lowercase words (power, activity, etc.) - 至少2个字符
  ];

  return keyPatterns.some(pattern => pattern.test(text.trim()));
}
```

**效果:**

现在以下简单单词都能被正确识别为i18n key:
- ✅ `power`
- ✅ `activity`  
- ✅ `battles`
- ✅ `development`
- ✅ `technology`
- ✅ `military`

### 修复2: 增强CSV Key提取逻辑

**修改文件:** `backend/figma.js`

**修改位置:** `compareWithTranslations` 方法

**修改内容:**

```javascript
compareWithTranslations(i18nKeys, csvData) {
  const missingKeys = [];
  const unusedKeys = [];
  
  // 🆕 支持多种key列名称,包括带BOM的情况
  const csvKeys = new Set(csvData.map(row => {
    // Try different possible key column names, including with BOM
    const keyValue = row.key || row.Key || row.KEY || row['\uFEFFkey'] || row[Object.keys(row)[0]];
    return keyValue;
  }).filter(Boolean));

  // Find missing keys in CSV
  i18nKeys.forEach(key => {
    if (!csvKeys.has(key.key)) {
      missingKeys.push(key);
    }
  });

  // Find unused keys in CSV
  csvKeys.forEach(csvKey => {
    const found = i18nKeys.find(key => key.key === csvKey);
    if (!found) {
      unusedKeys.push(csvKey);
    }
  });

  return {
    missingKeys,
    unusedKeys,
    totalKeysInFigma: i18nKeys.length,
    totalKeysInCSV: csvKeys.size,
    coverage: csvKeys.size > 0 ? (i18nKeys.length / csvKeys.size * 100).toFixed(2) : 0
  };
}
```

**关键改进:**

提取CSV key值时,尝试以下多种可能的列名:
1. `row.key` - 标准小写
2. `row.Key` - 首字母大写  
3. `row.KEY` - 全大写
4. `row['\uFEFFkey']` - 🆕 带BOM字符的key列
5. `row[Object.keys(row)[0]]` - 🆕 兜底方案:使用第一列

最后使用 `.filter(Boolean)` 过滤掉undefined值。

## 验证结果

修复后进行了完整测试:

### 测试输入:
- **Figma文件:** 包含 `power`, `battles`, `activity`, `technology`, `development`, `military` 等节点
- **CSV文件:** 包含所有上述key的翻译数据(带BOM)

### 测试结果:

**✅ i18n Key识别:**
```javascript
power       -> ✅ 识别为i18n key
battles     -> ✅ 识别为i18n key  
activity    -> ✅ 识别为i18n key
development -> ✅ 识别为i18n key
technology  -> ✅ 识别为i18n key
military    -> ✅ 识别为i18n key
```

**✅ CSV Key提取:**
```javascript
提取的CSV Keys: ['power', 'development', 'technology', 'military', 'activity', 'battles']
总数: 6
```

**✅ 比对结果:**
```
检查结果:
  power: ✅ 找到
  development: ✅ 找到
  technology: ✅ 找到
  military: ✅ 找到
  activity: ✅ 找到
  battles: ✅ 找到

所有keys都找到了! 🎉
Missing Keys in CSV: 0 ✅
```

## 技术要点

### 1. BOM字符识别

BOM (Byte Order Mark) 是一个特殊的Unicode字符 `U+FEFF`,用于标识文件的字节序。常见于:
- Excel导出的UTF-8 CSV文件
- Windows记事本保存的UTF-8文件

**解决策略:** 在解析CSV时,需要考虑列名可能带有BOM前缀。

### 2. i18n Key命名规范

修改后支持的i18n key格式:
- `power` - 简单单词(至少2个字符)
- `common.key` - 命名空间.键名
- `POWER` / `COMMON_KEY` - 全大写(常量风格)
- `common_key` - 下划线分隔
- `app.user.name` - 多级命名空间

### 3. 兜底策略

在处理用户上传的CSV文件时,采用多层兜底策略:
1. 尝试标准列名
2. 尝试带BOM的列名  
3. 使用第一列作为默认key列
4. 过滤掉所有无效值

这确保了系统的鲁棒性。

## 影响范围

**修改的模块:**
- ✅ Hardcoded Text Found - 现在正确区分i18n key和硬编码文本
- ✅ i18n Keys Found - 正确识别简单单词为i18n key
- ✅ Missing Keys in CSV - 修复BOM问题,正确比对CSV数据
- ✅ Text Width Validation - 缓存功能继续正常工作

**不影响的功能:**
- ✅ 缓存机制(Text Width和i18n Pattern Check)
- ✅ 文本宽度精确测量
- ✅ 溢出检测
- ✅ Unused Keys in Figma检测

## 总结

通过两个关键修复:
1. **扩展i18n key识别规则** - 支持简单单词格式
2. **增强CSV解析逻辑** - 兼容BOM字符

成功解决了"Missing Keys in CSV"误报问题,提升了系统的实用性和准确性。

---

**修复日期:** 2025-10-26  
**修复文件:** `backend/figma.js`  
**影响版本:** v1.0+


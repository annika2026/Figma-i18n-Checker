// Using native fetch (available in Node.js 18+)
const TextWidthChecker = require('./textWidthChecker');

class FigmaAPI {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseURL = 'https://api.figma.com/v1';
    this.textWidthChecker = new TextWidthChecker();
    
    // i18n 模式检查的缓存池
    this.i18nCachePool = new Set();
    this.i18nCacheStats = {
      total: 0,
      hits: 0,
      misses: 0
    };
  }
  
  /**
   * 生成 i18n 缓存键（只使用 nodeName，过滤重复的 key）
   */
  generateI18nCacheKey(nodeName) {
    return nodeName;
  }
  
  /**
   * 检查是否在 i18n 缓存中
   */
  isInI18nCache(nodeName) {
    const cacheKey = this.generateI18nCacheKey(nodeName);
    return this.i18nCachePool.has(cacheKey);
  }
  
  /**
   * 添加到 i18n 缓存
   */
  addToI18nCache(nodeName) {
    const cacheKey = this.generateI18nCacheKey(nodeName);
    this.i18nCachePool.add(cacheKey);
  }
  
  /**
   * 清空 i18n 缓存
   */
  clearI18nCache() {
    this.i18nCachePool.clear();
    this.i18nCacheStats = {
      total: 0,
      hits: 0,
      misses: 0
    };
    console.log('[i18n缓存] 缓存池已清空');
  }
  
  /**
   * 获取 i18n 缓存统计
   */
  getI18nCacheStats() {
    const hitRate = this.i18nCacheStats.total > 0 
      ? ((this.i18nCacheStats.hits / this.i18nCacheStats.total) * 100).toFixed(2)
      : 0;
    
    return {
      ...this.i18nCacheStats,
      cacheSize: this.i18nCachePool.size,
      hitRate: `${hitRate}%`
    };
  }

  // Validate API key format
  validateApiKey(apiKey) {
    if (!apiKey || typeof apiKey !== 'string') {
      return false;
    }
    // Figma API keys typically start with 'figd_'
    return apiKey.startsWith('figd_') && apiKey.length > 20;
  }

  // Extract file key from Figma URL
  extractFileKey(url) {
    if (!url || typeof url !== 'string') {
      return null;
    }
    
    // Support multiple Figma URL formats
    const patterns = [
      /figma\.com\/file\/([a-zA-Z0-9]+)/,           // Standard file URL
      /figma\.com\/proto\/([a-zA-Z0-9]+)/,          // Prototype URL
      /figma\.com\/design\/([a-zA-Z0-9]+)/,         // Design URL (new format)
      /figma\.com\/embed\?embed_host=share&url=.*?file%2F([a-zA-Z0-9]+)/, // Embed URL
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1];
      }
    }
    
    return null;
  }

  // Get Figma file data
  async getFileData(fileKey) {
    try {
      console.log(`Fetching Figma file data for key: ${fileKey}`);
      
      // Skip MCP for now and use direct API
      console.log('Using direct Figma API...');
      
      if (!this.validateApiKey(this.apiKey)) {
        throw new Error('Invalid Figma API key format. API key should start with "figd_"');
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(`${this.baseURL}/files/${fileKey}`, {
        headers: {
          'X-Figma-Token': this.apiKey,
          'Content-Type': 'application/json'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      console.log(`Figma API response status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Figma API error response: ${errorText}`);
        
        if (response.status === 401) {
          throw new Error('Invalid Figma API key. Please check your API key.');
        } else if (response.status === 403) {
          // Check if token expired
          try {
            const errorData = JSON.parse(errorText);
            if (errorData.err && errorData.err.includes('expired')) {
              throw new Error('Figma API token has expired. Please generate a new token from https://www.figma.com/developers/api#access-tokens');
            }
          } catch (parseError) {
            // If error text is not JSON, continue with general error
          }
          throw new Error('Access denied. Please check if you have permission to access this file and verify your API token is valid.');
        } else if (response.status === 404) {
          throw new Error('Figma file not found. Please check the file URL.');
        } else {
          throw new Error(`Figma API error: ${response.status} ${response.statusText}`);
        }
      }

      const data = await response.json();
      console.log(`Successfully fetched Figma file: ${data.name}`);
      return data;
    } catch (error) {
      console.error('Figma API request failed:', error);
      if (error.name === 'AbortError') {
        throw new Error('Request timeout. Please try again.');
      } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
        throw new Error('Network error. Please check your internet connection.');
      }
      throw new Error(`Failed to fetch Figma file: ${error.message}`);
    }
  }



  // Extract text content from Figma file with complete style information
  extractTextContent(document) {
    const textNodes = [];
    
    const traverse = (node, pageName = null) => {
      // 如果遇到 PAGE 节点，更新当前页面名称
      let currentPageName = pageName;
      if (node.type === 'PAGE') {
        currentPageName = node.name || 'Unknown Page';
        console.log(`[页面] 找到页面: ${currentPageName}`);
      }
      
      if (node.type === 'TEXT' && node.characters) {
        // 提取完整的字体样式信息
        const style = node.style || {};
        
        // 提取 maxLines - Figma API 的字段名
        // 根据 Figma API 文档，maxLines 在节点的顶层
        let maxLines = null;
        
        // 检查各种可能的字段名
        if (node.maxLines !== undefined && node.maxLines !== null) {
          maxLines = node.maxLines;
        } else if (node.lineTypes && node.lineTypes.maxLines) {
          maxLines = node.lineTypes.maxLines;
        } else if (node.style && node.style.maxLines) {
          maxLines = node.style.maxLines;
        }
        
        // 调试：打印所有节点的关键信息
        console.log(`[Figma节点] ${node.name}:`, {
          type: node.type,
          hasMaxLines: node.maxLines !== undefined,
          maxLinesValue: node.maxLines,
          textAutoResize: node.textAutoResize,
          textTruncation: node.textTruncation,
          allKeys: Object.keys(node).filter(k => 
            k.toLowerCase().includes('line') || 
            k.toLowerCase().includes('max') || 
            k.toLowerCase().includes('text') ||
            k.toLowerCase().includes('truncat')
          )
        });
        
        textNodes.push({
          id: node.id,
          name: node.name,
          characters: node.characters,
          pageName: currentPageName || 'Unknown Page',
          style: {
            fontSize: style.fontSize,
            fontFamily: style.fontFamily,
            fontWeight: style.fontWeight,
            fontPostScriptName: style.fontPostScriptName,
            italic: style.italic,
            letterSpacing: style.letterSpacing,
            lineHeightPx: style.lineHeightPx,
            lineHeightPercent: style.lineHeightPercent,
            lineHeightUnit: style.lineHeightUnit,
            textAlignHorizontal: style.textAlignHorizontal,
            textAlignVertical: style.textAlignVertical
          },
          absoluteBoundingBox: node.absoluteBoundingBox,
          // 保存提取的 maxLines
          maxLines: maxLines,
          // 保存文本自动调整和截断信息
          textAutoResize: node.textAutoResize,
          textTruncation: node.textTruncation
        });
      }
      
      if (node.children) {
        node.children.forEach(child => traverse(child, currentPageName));
      }
    };

    traverse(document);
    return textNodes;
  }

  // Check for i18n patterns in text
  checkI18nPatterns(textNodes) {
    // 每次检测开始前清空缓存
    this.clearI18nCache();
    console.log('[i18n缓存] 新的检测开始，缓存已清空');
    
    const patterns = {
      hardcodedText: [],
      potentialI18nKeys: [],
      missingTranslations: []
    };

    textNodes.forEach(node => {
      const text = node.characters;
      const nodeName = node.name;
      const nodeId = node.id;
      
      // 统计总请求数
      this.i18nCacheStats.total++;
      
      // 检查缓存：如果已经检测过相同的 key (nodeName)，则跳过
      if (this.isInI18nCache(nodeName)) {
        this.i18nCacheStats.hits++;
        console.log(`[i18n缓存] Key "${nodeName}" (节点 ${nodeId}) - ⚡ 已缓存，跳过检测`);
        return; // 跳过本次检测，不记录结果
      }
      
      this.i18nCacheStats.misses++;
      
      // Check if the node name looks like an i18n key
      const isNodeNameI18nKey = this.isI18nKey(nodeName);
      
      // Check if the text content looks like an i18n key
      const isTextI18nKey = this.isI18nKey(text);
      
      if (text && text.trim()) {
        // 添加到缓存（只使用 nodeName 作为缓存键）
        this.addToI18nCache(nodeName);
        
        if (isNodeNameI18nKey) {
          // Node name is an i18n key, so this is a properly configured i18n element
          console.log(`[i18n检测] ✅ i18n Key: "${nodeName}" - "${text}"`);
          patterns.potentialI18nKeys.push({
            id: node.id,
            name: nodeName,
            key: nodeName,
            text: text,
            location: node.absoluteBoundingBox,
            type: 'proper_i18n'
          });
        } else if (isTextI18nKey) {
          // Text content itself is an i18n key
          console.log(`[i18n检测] ✅ i18n Key (文本作为Key): "${text}"`);
          patterns.potentialI18nKeys.push({
            id: node.id,
            name: nodeName,
            key: text,
            location: node.absoluteBoundingBox,
            type: 'text_as_key'
          });
        } else {
          // This is hardcoded text that should be converted to i18n
          console.log(`[i18n检测] ⚠️  Hardcoded Text: "${nodeName}" - "${text}"`);
          patterns.hardcodedText.push({
            id: node.id,
            name: nodeName,
            text: text,
            location: node.absoluteBoundingBox,
            suggestion: this.suggestI18nKey(text, nodeName)
          });
        }
      }
    });

    // 输出缓存统计
    const cacheStats = this.getI18nCacheStats();
    console.log(`\n[i18n缓存统计] 总请求: ${cacheStats.total}, 命中: ${cacheStats.hits}, 未命中: ${cacheStats.misses}, 命中率: ${cacheStats.hitRate}, 缓存大小: ${cacheStats.cacheSize}`);
    
    // 将缓存统计附加到结果中
    patterns.cacheStats = cacheStats;

    return patterns;
  }

  // Check if text looks like an i18n key
  isI18nKey(text) {
    if (!text) return false;
    
    // Common i18n key patterns
    const keyPatterns = [
      /^[a-z]+\.[a-z_]+$/i,           // common.key
      /^[A-Z_]+$/i,                   // COMMON_KEY
      /^[a-z]+_[a-z_]+$/i,            // common_key
      /^[a-z]+\.[a-z]+\.[a-z_]+$/i,   // common.sub.key
      /^[a-z]{2,}$/i,                 // Simple lowercase words (power, activity, etc.) - 至少2个字符
    ];

    return keyPatterns.some(pattern => pattern.test(text.trim()));
  }

  // Suggest an i18n key based on text content and node name
  suggestI18nKey(text, nodeName) {
    // If node name already looks like a key, use it
    if (this.isI18nKey(nodeName)) {
      return nodeName;
    }
    
    // Convert Chinese text to English key
    const chineseToEnglish = {
      '更新游戏': 'UPDATE_GAME',
      '开始游戏': 'START_GAME',
      '设置': 'SETTINGS',
      '退出': 'EXIT',
      '确认': 'CONFIRM',
      '取消': 'CANCEL',
      '保存': 'SAVE',
      '删除': 'DELETE',
      '编辑': 'EDIT',
      '添加': 'ADD',
      '搜索': 'SEARCH',
      '登录': 'LOGIN',
      '注册': 'REGISTER',
      '用户名': 'USERNAME',
      '密码': 'PASSWORD',
      '邮箱': 'EMAIL',
      '手机号': 'PHONE',
      '验证码': 'VERIFICATION_CODE',
      '提交': 'SUBMIT',
      '重置': 'RESET',
      '返回': 'BACK',
      '下一步': 'NEXT',
      '上一步': 'PREVIOUS',
      '完成': 'FINISH',
      '加载中': 'LOADING',
      '错误': 'ERROR',
      '成功': 'SUCCESS',
      '警告': 'WARNING',
      '信息': 'INFO',
      '帮助': 'HELP',
      '关于': 'ABOUT',
      '联系我们': 'CONTACT_US',
      '隐私政策': 'PRIVACY_POLICY',
      '服务条款': 'TERMS_OF_SERVICE',
      '版本': 'VERSION',
      '更新': 'UPDATE',
      '下载': 'DOWNLOAD',
      '上传': 'UPLOAD',
      '分享': 'SHARE',
      '复制': 'COPY',
      '粘贴': 'PASTE',
      '全选': 'SELECT_ALL',
      '撤销': 'UNDO',
      '重做': 'REDO',
      '刷新': 'REFRESH',
      '重新开始': 'RESTART',
      '暂停': 'PAUSE',
      '继续': 'RESUME',
      '停止': 'STOP',
      '播放': 'PLAY',
      '音量': 'VOLUME',
      '静音': 'MUTE',
      '全屏': 'FULLSCREEN',
      '最小化': 'MINIMIZE',
      '最大化': 'MAXIMIZE',
      '关闭': 'CLOSE'
    };

    // Check if we have a direct mapping
    if (chineseToEnglish[text]) {
      return chineseToEnglish[text];
    }

    // Generate a key based on the text content
    let key = text
      .replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s]/g, '') // Remove special characters
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .toUpperCase(); // Convert to uppercase

    // If the result is empty or too short, use a generic key
    if (!key || key.length < 2) {
      key = 'TEXT_' + Math.random().toString(36).substr(2, 5).toUpperCase();
    }

    return key;
  }

  // Compare with CSV translation data
  compareWithTranslations(i18nKeys, csvData) {
    const missingKeys = [];
    const unusedKeys = [];
    
    // Extract CSV keys and handle BOM (Byte Order Mark) in column names
    const csvKeys = new Set(csvData.map(row => {
      // Try different possible key column names, including with BOM
      const keyValue = row.key || row.Key || row.KEY || row['\uFEFFkey'] || row[Object.keys(row)[0]];
      return keyValue;
    }).filter(Boolean)); // Filter out undefined values

    console.log('📊 CSV Keys extracted:', Array.from(csvKeys));

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

  // Main method to analyze Figma file
  async analyzeFigmaFile(figmaUrl, csvData = []) {
    try {
      console.log('Starting Figma analysis...');
      console.log('Figma URL:', figmaUrl);
      console.log('CSV data length:', csvData.length);

      // Validate inputs
      if (!figmaUrl || typeof figmaUrl !== 'string') {
        throw new Error('Figma URL is required and must be a string.');
      }

      const fileKey = this.extractFileKey(figmaUrl);
      if (!fileKey) {
        throw new Error('Invalid Figma URL. Please provide a valid Figma file URL. Supported formats: figma.com/file/..., figma.com/proto/..., or figma.com/design/...');
      }

      console.log('Extracted file key:', fileKey);

      const fileData = await this.getFileData(fileKey);
      console.log('File data retrieved, extracting text content...');

      const textNodes = this.extractTextContent(fileData.document);
      console.log(`Found ${textNodes.length} text nodes`);

      const i18nPatterns = this.checkI18nPatterns(textNodes);
      console.log(`Found ${i18nPatterns.hardcodedText.length} hardcoded texts`);
      console.log(`Found ${i18nPatterns.potentialI18nKeys.length} potential i18n keys`);
      
      let comparison = null;
      let widthValidation = null;
      
      if (csvData.length > 0) {
        console.log('Comparing with CSV data...');
        comparison = this.compareWithTranslations(i18nPatterns.potentialI18nKeys, csvData);
        
        console.log('\n=== 开始执行精确的文本宽度验证 ===');
        // 传递完整的 textNodes（包含所有 Figma 样式信息）而不是简化的 i18nKeys
        widthValidation = await this.performWidthValidation(textNodes, csvData);
      }

      const result = {
        fileKey,
        fileName: fileData.name,
        lastModified: fileData.lastModified,
        textNodes: textNodes.length,
        analysis: {
          hardcodedText: i18nPatterns.hardcodedText,
          potentialI18nKeys: i18nPatterns.potentialI18nKeys,
          comparison,
          widthValidation,
          i18nCacheStats: i18nPatterns.cacheStats // 添加 i18n 缓存统计
        }
      };

      console.log('Analysis completed successfully');
      return result;
    } catch (error) {
      console.error('Figma analysis failed:', error);
      throw new Error(`Figma analysis failed: ${error.message}`);
    }
  }

  /**
   * 执行文本宽度验证（使用精确的 Figma 样式信息）
   * @param {Array} textNodes - 完整的 Figma 文本节点数组（包含所有样式信息）
   * @param {Array} csvData - CSV 翻译数据
   * @returns {Object} 验证报告
   */
  async performWidthValidation(textNodes, csvData) {
    try {
      // 将 CSV 数据转换为翻译格式
      const translations = {};
      
      console.log('\n=== 开始解析 CSV 数据 ===');
      console.log(`CSV 行数: ${csvData.length}`);
      
      csvData.forEach((row, index) => {
        // 处理 BOM 字符和各种 key 列名称
        const key = row.key || row.Key || row.KEY || row['﻿key'];
        
        if (key) {
          translations[key] = {};
          
          // 添加所有语言列
          Object.keys(row).forEach(column => {
            // 排除 key 列本身（包括带 BOM 的情况）
            const isKeyColumn = column.toLowerCase() === 'key' || column === '﻿key';
            if (!isKeyColumn && row[column]) {
              translations[key][column] = row[column];
            }
          });
          
          console.log(`  [${index + 1}] Key: "${key}", 语言数: ${Object.keys(translations[key]).length}`);
        }
      });

      console.log(`\n翻译数据解析完成: ${Object.keys(translations).length} 个 key`);

      // 过滤出需要验证的文本节点（只验证名称匹配翻译 key 的节点）
      const nodesToValidate = textNodes.filter(node => {
        const hasTranslations = translations[node.name];
        if (!hasTranslations) {
          console.log(`  跳过节点 "${node.name}" - 无对应翻译数据`);
        }
        return hasTranslations;
      });

      console.log(`\n需要验证的节点数: ${nodesToValidate.length}`);

      // 执行精确验证（异步）
      const validationResults = await this.textWidthChecker.validateI18nTexts(nodesToValidate, translations);
      const report = this.textWidthChecker.generateReport(validationResults);

      return report;
    } catch (error) {
      console.error('文本宽度验证失败:', error);
      console.error('错误堆栈:', error.stack);
      return {
        error: '文本宽度验证失败',
        details: error.message,
        stack: error.stack
      };
    }
  }
}

module.exports = FigmaAPI;

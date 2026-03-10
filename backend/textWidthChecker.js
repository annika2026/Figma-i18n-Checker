// Text width calculation and container validation using precise canvas measurement
const { createCanvas, registerFont } = require('canvas');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

class TextWidthChecker {
  constructor() {
    // Create a canvas for text measurement
    this.canvas = createCanvas(1, 1);
    this.ctx = this.canvas.getContext('2d');
    
    // Font fallback map for common Figma fonts
    this.fontFallbacks = {
      'Inter': 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
      'SF Pro Display': '"SF Pro Display", -apple-system, BlinkMacSystemFont, sans-serif',
      'SF Pro Text': '"SF Pro Text", -apple-system, BlinkMacSystemFont, sans-serif',
      'Roboto': 'Roboto, Arial, sans-serif',
      'Helvetica': 'Helvetica, Arial, sans-serif',
      'Arial': 'Arial, Helvetica, sans-serif',
      'PingFang SC': '"PingFang SC", "Microsoft YaHei", sans-serif',
      'Noto Sans': '"Noto Sans", Arial, sans-serif',
      'Open Sans': '"Open Sans", Arial, sans-serif'
    };
    
    // 已注册的字体缓存（避免重复注册）
    this.registeredFonts = new Set();
    
    // Google Fonts 字体文件缓存目录
    this.fontCacheDir = path.join(__dirname, '..', '.font-cache');
    this.ensureFontCacheDir();
    
    // 字体加载状态缓存（fontFamily -> { loaded: boolean, source: 'system'|'google'|'fallback' }）
    this.fontLoadStatus = new Map();
    
    // 缓存池：用于存储已检测过的文本key
    this.cachePool = new Set();
    
    // 缓存统计
    this.cacheStats = {
      total: 0,        // 总检测次数
      hits: 0,         // 缓存命中次数
      misses: 0        // 缓存未命中次数
    };
  }
  
  /**
   * 确保字体缓存目录存在
   */
  ensureFontCacheDir() {
    if (!fs.existsSync(this.fontCacheDir)) {
      fs.mkdirSync(this.fontCacheDir, { recursive: true });
      console.log(`[字体缓存] 创建缓存目录: ${this.fontCacheDir}`);
    }
  }
  
  /**
   * 检查字体是否已在系统中注册
   * @param {string} fontFamily - 字体族名称
   * @returns {boolean} 是否已注册
   */
  isFontRegistered(fontFamily) {
    return this.registeredFonts.has(fontFamily);
  }
  
  /**
   * 从 Google Fonts 下载字体文件
   * @param {string} fontFamily - 字体族名称
   * @param {number} fontWeight - 字重（400, 500, 700等）
   * @returns {Promise<string|null>} 字体文件路径，失败返回 null
   */
  async downloadGoogleFont(fontFamily, fontWeight = 400) {
    try {
      // Google Fonts API URL
      // 格式: https://fonts.googleapis.com/css2?family=FontName:wght@400
      // 处理字体名称：移除引号，替换空格为+
      const cleanFontName = fontFamily.replace(/['"]/g, '').trim();
      const fontNameEncoded = encodeURIComponent(cleanFontName);
      const apiUrl = `https://fonts.googleapis.com/css2?family=${fontNameEncoded}:wght@${fontWeight}&display=swap`;
      
      console.log(`[Google Fonts] 尝试下载字体: ${cleanFontName} (${fontWeight})`);
      
      // 获取 CSS 文件
      const cssResponse = await this.fetchUrl(apiUrl);
      if (!cssResponse) {
        console.log(`[Google Fonts] 无法获取字体 CSS: ${cleanFontName}`);
        return null;
      }
      
      // 从 CSS 中提取字体文件 URL（优先选择 woff2 格式）
      // 通常格式: url(https://fonts.gstatic.com/s/fontname/v1/fontfile.woff2)
      const fontUrlMatches = cssResponse.match(/url\(([^)]+\.woff2?)\)/g);
      if (!fontUrlMatches || fontUrlMatches.length === 0) {
        console.log(`[Google Fonts] CSS 中未找到字体文件 URL: ${cleanFontName}`);
        return null;
      }
      
      // 优先使用 woff2，如果没有则使用 woff
      let fontUrl = null;
      for (const match of fontUrlMatches) {
        const url = match.replace(/url\(|\)/g, '');
        if (url.endsWith('.woff2')) {
          fontUrl = url;
          break;
        } else if (url.endsWith('.woff') && !fontUrl) {
          fontUrl = url;
        }
      }
      
      if (!fontUrl) {
        fontUrl = fontUrlMatches[0].replace(/url\(|\)/g, '');
      }
      
      console.log(`[Google Fonts] 找到字体文件 URL: ${fontUrl}`);
      
      // 检查缓存
      const safeFontName = cleanFontName.replace(/[^a-zA-Z0-9]/g, '_');
      const cacheFileName = `${safeFontName}_${fontWeight}.woff2`;
      const cacheFilePath = path.join(this.fontCacheDir, cacheFileName);
      
      if (fs.existsSync(cacheFilePath)) {
        console.log(`[Google Fonts] 使用缓存字体: ${cacheFilePath}`);
        return cacheFilePath;
      }
      
      // 下载字体文件
      console.log(`[Google Fonts] 下载字体文件: ${fontUrl}`);
      const fontData = await this.fetchUrl(fontUrl, true); // true 表示二进制数据
      if (!fontData) {
        console.log(`[Google Fonts] 下载字体文件失败: ${cleanFontName}`);
        return null;
      }
      
      // 保存到缓存
      fs.writeFileSync(cacheFilePath, fontData);
      console.log(`[Google Fonts] ✅ 字体已保存到缓存: ${cacheFilePath}`);
      
      return cacheFilePath;
    } catch (error) {
      console.error(`[Google Fonts] 下载字体时出错: ${fontFamily}`, error.message);
      return null;
    }
  }
  
  /**
   * 获取 URL 内容
   * @param {string} url - URL 地址
   * @param {boolean} binary - 是否返回二进制数据
   * @returns {Promise<string|Buffer|null>} 响应内容
   */
  fetchUrl(url, binary = false) {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http;
      
      client.get(url, (res) => {
        if (res.statusCode !== 200) {
          resolve(null);
          return;
        }
        
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          if (binary) {
            resolve(Buffer.concat(chunks));
          } else {
            resolve(Buffer.concat(chunks).toString('utf-8'));
          }
        });
      }).on('error', (error) => {
        console.error(`[网络请求] 错误: ${url}`, error.message);
        resolve(null);
      });
    });
  }
  
  /**
   * 尝试加载字体（系统 -> Google Fonts -> 回退）
   * @param {string} fontFamily - 字体族名称
   * @param {number} fontWeight - 字重
   * @returns {Promise<{success: boolean, source: string, fontFamily: string}>}
   */
  async loadFont(fontFamily, fontWeight = 400) {
    // 检查是否已加载
    const cacheKey = `${fontFamily}_${fontWeight}`;
    if (this.fontLoadStatus.has(cacheKey)) {
      const status = this.fontLoadStatus.get(cacheKey);
      return {
        success: status.loaded,
        source: status.source,
        fontFamily: status.fontFamily || fontFamily
      };
    }
    
    // 步骤1: 检查系统字体是否可用
    const systemAvailable = this.checkFontAvailable(`${fontWeight} ${16}px "${fontFamily}"`);
    if (systemAvailable) {
      console.log(`[字体加载] 使用系统字体: ${fontFamily}`);
      this.fontLoadStatus.set(cacheKey, {
        loaded: true,
        source: 'system',
        fontFamily: fontFamily
      });
      return {
        success: true,
        source: 'system',
        fontFamily: fontFamily
      };
    }
    
    // 步骤2: 尝试从 Google Fonts 加载
    console.log(`[字体加载] 系统字体不可用，尝试从 Google Fonts 加载: ${fontFamily}`);
    const fontPath = await this.downloadGoogleFont(fontFamily, fontWeight);
    
    if (fontPath) {
      try {
        // 注册字体到 Canvas
        registerFont(fontPath, {
          family: fontFamily,
          weight: fontWeight.toString()
        });
        
        this.registeredFonts.add(fontFamily);
        console.log(`[字体加载] ✅ 成功从 Google Fonts 加载: ${fontFamily}`);
        
        this.fontLoadStatus.set(cacheKey, {
          loaded: true,
          source: 'google',
          fontFamily: fontFamily
        });
        
        return {
          success: true,
          source: 'google',
          fontFamily: fontFamily
        };
      } catch (error) {
        console.error(`[字体加载] 注册字体失败: ${fontFamily}`, error.message);
      }
    }
    
    // 步骤3: 回退到系统默认字体
    console.log(`[字体加载] ⚠️ 无法加载字体，回退到系统默认字体: ${fontFamily}`);
    this.fontLoadStatus.set(cacheKey, {
      loaded: false,
      source: 'fallback',
      fontFamily: fontFamily
    });
    
    return {
      success: false,
      source: 'fallback',
      fontFamily: fontFamily
    };
  }
  
  /**
   * 检测字体是否可用（通过尝试设置字体并检查是否生效）
   * @param {string} fontString - 字体字符串
   * @returns {boolean} 字体是否可用
   */
  checkFontAvailable(fontString) {
    const testText = 'Ag';
    const testSize = 72; // 使用较大字号以提高检测精度
    
    // 先设置一个已知字体测量基准
    this.ctx.font = `${testSize}px monospace`;
    const baselineWidth = this.ctx.measureText(testText).width;
    
    // 尝试设置目标字体
    this.ctx.font = fontString.replace(/\d+px/, `${testSize}px`);
    const targetWidth = this.ctx.measureText(testText).width;
    
    // 如果宽度相同，说明字体可能回退到了默认字体
    // 注意：这个方法不是100%准确，但可以检测大部分情况
    return Math.abs(targetWidth - baselineWidth) > 0.1;
  }
  
  /**
   * 生成缓存键（基于 key、language、text、fontFamily、fontSize 的组合）
   * @param {string} key - 节点名称/key
   * @param {string} language - 语言
   * @param {string} text - 文本内容
   * @param {string} fontFamily - 字体族
   * @param {number} fontSize - 字号
   * @returns {string} 缓存键
   */
  generateCacheKey(key, language, text, fontFamily, fontSize) {
    // 使用 JSON.stringify 确保特殊字符被正确处理
    return `${key}|${language}|${text}|${fontFamily}|${fontSize}`;
  }
  
  /**
   * 检查缓存中是否存在
   * @param {string} key - 节点名称/key
   * @param {string} language - 语言
   * @param {string} text - 文本内容
   * @param {string} fontFamily - 字体族
   * @param {number} fontSize - 字号
   * @returns {boolean} 是否已缓存
   */
  isInCache(key, language, text, fontFamily, fontSize) {
    const cacheKey = this.generateCacheKey(key, language, text, fontFamily, fontSize);
    return this.cachePool.has(cacheKey);
  }
  
  /**
   * 添加到缓存
   * @param {string} key - 节点名称/key
   * @param {string} language - 语言
   * @param {string} text - 文本内容
   * @param {string} fontFamily - 字体族
   * @param {number} fontSize - 字号
   */
  addToCache(key, language, text, fontFamily, fontSize) {
    const cacheKey = this.generateCacheKey(key, language, text, fontFamily, fontSize);
    this.cachePool.add(cacheKey);
  }
  
  /**
   * 清空缓存池
   */
  clearCache() {
    this.cachePool.clear();
    this.cacheStats = {
      total: 0,
      hits: 0,
      misses: 0
    };
    console.log('[缓存] 缓存池已清空');
  }
  
  /**
   * 获取缓存统计信息
   * @returns {object} 缓存统计
   */
  getCacheStats() {
    const hitRate = this.cacheStats.total > 0 
      ? ((this.cacheStats.hits / this.cacheStats.total) * 100).toFixed(2)
      : 0;
    
    return {
      ...this.cacheStats,
      cacheSize: this.cachePool.size,
      hitRate: `${hitRate}%`
    };
  }

  /**
   * 精确计算文本宽度（使用 Canvas measureText API）
   * 支持字体自动加载：系统字体 -> Google Fonts -> 系统回退
   * @param {string} text - 要测量的文本内容
   * @param {object} fontStyle - 字体样式对象，必须包含 fontSize, fontFamily, fontWeight
   * @returns {Promise<number>} 文本宽度（像素）
   */
  async calculateTextWidth(text, fontStyle) {
    if (!text) return 0;
    
    // 强制要求必传参数
    if (!fontStyle || typeof fontStyle !== 'object') {
      throw new Error('fontStyle 参数必须提供，且必须是对象');
    }
    
    if (!fontStyle.fontSize || typeof fontStyle.fontSize !== 'number') {
      throw new Error('fontStyle.fontSize 必须提供，且必须是数字（单位：px）');
    }
    
    if (!fontStyle.fontFamily || typeof fontStyle.fontFamily !== 'string') {
      throw new Error('fontStyle.fontFamily 必须提供，且必须是字符串');
    }
    
    if (fontStyle.fontWeight === undefined || fontStyle.fontWeight === null || typeof fontStyle.fontWeight !== 'number') {
      throw new Error('fontStyle.fontWeight 必须提供，且必须是数字（如：400, 500, 700）');
    }
    
    const {
      fontSize,
      fontFamily,
      fontWeight,
      fontStyle: style = 'normal',
      letterSpacing = 0,
      lineHeight,
      fontPostScriptName
    } = fontStyle;

    // 步骤1: 尝试加载字体（系统 -> Google Fonts -> 回退）
    const fontLoadResult = await this.loadFont(fontFamily, fontWeight);
    const actualFontFamily = fontLoadResult.fontFamily;
    const fontSource = fontLoadResult.source;
    
    // 构建字体字符串
    let fontString = '';
    if (style && style !== 'normal') {
      fontString += `${style} `;
    }
    if (fontWeight && fontWeight !== 400) {
      fontString += `${fontWeight} `;
    }
    
    // 根据字体来源构建字体字符串
    if (fontSource === 'system' || fontSource === 'google') {
      // 使用实际加载的字体
      fontString += `${fontSize}px "${actualFontFamily}"`;
    } else {
      // 回退到系统默认字体
      const fontFamilyWithFallback = this.fontFallbacks[fontFamily] || `${fontFamily}, sans-serif`;
    fontString += `${fontSize}px ${fontFamilyWithFallback}`;
    }
    
    // 设置字体
    this.ctx.font = fontString;
    
    // 测量文本宽度
    const metrics = this.ctx.measureText(text);
    let width = metrics.width;
    
    // 应用字间距（letterSpacing）
    // Figma 的 letterSpacing 单位可能是 em 或 px
    if (letterSpacing && letterSpacing !== 0) {
      // 如果 letterSpacing 是百分比或 em 单位，转换为像素
      let letterSpacingPx = letterSpacing;
      if (typeof letterSpacing === 'object' && letterSpacing.unit === 'PERCENT') {
        letterSpacingPx = (letterSpacing.value / 100) * fontSize;
      }
      // 字间距应用到每个字符之间（除了最后一个字符）
      if (text.length > 1) {
        width += letterSpacingPx * (text.length - 1);
      }
    }
    
    // 输出详细的测量信息（包含字体来源）
    const sourceEmoji = fontSource === 'system' ? '💻' : fontSource === 'google' ? '🌐' : '⚠️';
    console.log(`[精确测量] 文本: "${text}", 字体: ${fontString}, 来源: ${sourceEmoji} ${fontSource}, 字间距: ${letterSpacing}, 宽度: ${width.toFixed(2)}px`);
    
    return width;
  }

  /**
   * 兼容旧版本的简化方法（仅提供基本参数）
   * @deprecated 建议直接使用 calculateTextWidth 并提供完整的 fontStyle 对象
   */
  calculateTextWidthSimple(text, fontSize, fontFamily, fontWeight) {
    if (!fontSize || !fontFamily || !fontWeight) {
      throw new Error('fontSize 和 fontFamily 和 fontWeight 是必需参数');
    }
    return this.calculateTextWidth(text, { fontSize, fontFamily, fontWeight });
  }

  /**
   * 严格检查文本是否适配容器（无阈值，精确比较）
   * @param {string} text - 文本内容
   * @param {number} containerWidth - 容器宽度（像素）
   * @param {object} fontStyle - 字体样式对象（必须包含 fontSize, fontFamily, fontWeight）
   * @param {number} maxLines - 最大行数（必需参数）
   * @returns {Promise<object>} 检查结果
   */
  async checkTextFit(text, containerWidth, fontStyle, maxLines) {
    // 强制要求 maxLines 参数
    if (maxLines === undefined || maxLines === null || typeof maxLines !== 'number') {
      throw new Error('maxLines 必须提供，且必须是数字（如：1, 2, 3）');
    }
    
    if (maxLines < 1) {
      throw new Error('maxLines 必须大于等于 1');
    }
    
    const textWidth = await this.calculateTextWidth(text, fontStyle);
    
    // 如果是单行文本（maxLines = 1），直接比较宽度
    if (maxLines === 1) {
      const fits = textWidth <= containerWidth;
      
      return {
        text,
        textWidth: parseFloat(textWidth.toFixed(2)),
        containerWidth,
        maxLines,
        requiredLines: textWidth <= containerWidth ? 1 : Math.ceil(textWidth / containerWidth),
        fits,
        overflow: Math.max(0, parseFloat((textWidth - containerWidth).toFixed(2))),
        utilization: parseFloat((textWidth / containerWidth * 100).toFixed(2)),
        overflowPercentage: containerWidth > 0 ? parseFloat(((textWidth - containerWidth) / containerWidth * 100).toFixed(2)) : 0,
        fontStyle: {
          fontSize: fontStyle.fontSize,
          fontFamily: fontStyle.fontFamily,
          fontWeight: fontStyle.fontWeight,
          letterSpacing: fontStyle.letterSpacing || 0
        },
        precisionNote: '注意：Canvas测量与Figma渲染引擎可能存在1-2px的差异（约1-2%），这是正常现象'
      };
    }
    
    // 多行文本：计算实际需要的行数
    const requiredLines = await this.calculateRequiredLines(text, containerWidth, fontStyle);
    const fits = requiredLines <= maxLines;
    
    // 如果 requiredLines 是 Infinity（说明有单词无法换行适配），特殊处理
    const isUnfittable = requiredLines === Infinity;
    
    return {
      text,
      textWidth: parseFloat(textWidth.toFixed(2)),
      containerWidth,
      maxLines,
      requiredLines: isUnfittable ? '单词过长且不符合换行规则 无法换行' : requiredLines,
      fits,
      overflow: fits ? 0 : parseFloat((textWidth - containerWidth * maxLines).toFixed(2)),
      utilization: null, // 多行文本不计算 utilization
      overflowPercentage: isUnfittable ? Infinity : (fits ? 0 : parseFloat(((requiredLines - maxLines) / maxLines * 100).toFixed(2))),
      fontStyle: {
        fontSize: fontStyle.fontSize,
        fontFamily: fontStyle.fontFamily,
        fontWeight: fontStyle.fontWeight,
        letterSpacing: fontStyle.letterSpacing || 0
      },
      precisionNote: '注意：Canvas测量与Figma渲染引擎可能存在1-2px的差异（约1-2%），这是正常现象'
    };
  }

  /**
   * 计算文本实际需要的行数
   * @param {string} text - 文本内容
   * @param {number} containerWidth - 容器宽度（像素）
   * @param {object} fontStyle - 字体样式对象
   * @returns {Promise<number>} 实际需要的行数，如果有单词无法放入则返回 Infinity
   */
  async calculateRequiredLines(text, containerWidth, fontStyle) {
    if (!text || containerWidth <= 0) return 1;
    
    // 将文本拆分成单词（支持中英文）
    // 对于中文，每个字符都是一个"单词"
    // 对于英文，按空格和标点符号拆分
    const words = this.splitTextIntoWords(text);
    
    let currentLineWidth = 0;
    let lines = 1;
    const spaceWidth = await this.calculateTextWidth(' ', fontStyle);
    
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const wordWidth = await this.calculateTextWidth(word, fontStyle);
      
      // 关键规则：只有在空格处才能换行
      // 如果单个单词（连续无空格的字符串）的宽度超过容器宽度，
      // 说明无法通过换行来适配，即使 maxLines 很大也无法容纳
      if (wordWidth > containerWidth) {
        console.log(`[换行检测] 发现无法换行的单词: "${word}", 宽度: ${wordWidth.toFixed(2)}px, 容器: ${containerWidth}px`);
        return Infinity; // 返回无穷大，表示无法通过换行适配
      }
      
      // 如果当前行为空，直接添加单词
      if (currentLineWidth === 0) {
        currentLineWidth = wordWidth;
        continue;
      }
      
      // 检查添加空格和单词后是否超出容器宽度
      const totalWidth = currentLineWidth + spaceWidth + wordWidth;
      
      if (totalWidth <= containerWidth) {
        // 可以放在当前行
        currentLineWidth = totalWidth;
      } else {
        // 需要换行（只有在空格处才能换行）
        lines++;
        currentLineWidth = wordWidth;
      }
    }
    
    return lines;
  }

  /**
   * 将文本拆分成单词（支持中英文混合）
   * @param {string} text - 文本内容
   * @returns {Array} 单词数组
   */
  splitTextIntoWords(text) {
    const words = [];
    let currentWord = '';
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const charCode = char.charCodeAt(0);
      
      // 判断是否是中文字符（CJK字符）
      const isCJK = (charCode >= 0x4E00 && charCode <= 0x9FFF) || // 基本汉字
                    (charCode >= 0x3400 && charCode <= 0x4DBF) || // 扩展A
                    (charCode >= 0x20000 && charCode <= 0x2A6DF) || // 扩展B
                    (charCode >= 0xF900 && charCode <= 0xFAFF) || // 兼容汉字
                    (charCode >= 0x2F800 && charCode <= 0x2FA1F); // 兼容补充
      
      if (isCJK) {
        // 中文字符：如果有累积的英文单词，先加入数组
        if (currentWord) {
          words.push(currentWord);
          currentWord = '';
        }
        // 中文字符单独作为一个单词
        words.push(char);
      } else if (char === ' ' || char === '\n' || char === '\t') {
        // 空格或换行：结束当前单词
        if (currentWord) {
          words.push(currentWord);
          currentWord = '';
        }
      } else {
        // 英文字符：累积到当前单词
        currentWord += char;
      }
    }
    
    // 添加最后一个单词
    if (currentWord) {
      words.push(currentWord);
    }
    
    return words;
  }

  /**
   * 兼容旧版本的简化方法
   * @deprecated 建议直接使用 checkTextFit 并提供完整的 fontStyle 对象
   */
  checkTextFitSimple(text, containerWidth, fontSize, fontFamily, fontWeight, maxLines) {
    if (!fontSize || !fontFamily || !fontWeight || !maxLines) {
      throw new Error('fontSize、fontFamily、fontWeight 和 maxLines 都是必需参数');
    }
    return this.checkTextFit(text, containerWidth, { fontSize, fontFamily, fontWeight }, maxLines);
  }

  /**
   * 验证 i18n 文本是否适配容器尺寸（使用精确测量）
   * @param {Array} textNodes - Figma 文本节点数组
   * @param {Object} translations - 翻译数据对象
   * @returns {Promise<Object>} 验证结果
   */
  async validateI18nTexts(textNodes, translations) {
    // 每次检测开始前清空缓存，确保缓存仅在本次检测内生效
    this.clearCache();
    console.log('[缓存] 新的检测开始，缓存已清空');
    
    const results = {
      valid: [],
      overflow: [],
      summary: {
        total: 0,
        valid: 0,
        overflow: 0,
        languages: new Set()
      }
    };

    for (const node of textNodes) {
      const nodeName = node.name;
      const containerWidth = node.absoluteBoundingBox?.width || 0;
      
      // 检查是否有完整的字体信息
      if (!node.style?.fontSize || !node.style?.fontFamily || node.style?.fontWeight === undefined) {
        console.log(`\n[跳过节点] ${nodeName} - 缺少必需的字体信息`);
        console.log(`  fontSize: ${node.style?.fontSize}, fontFamily: ${node.style?.fontFamily}, fontWeight: ${node.style?.fontWeight}`);
        
        // 尝试提取部分可用的字体信息
        const partialFontStyle = {
          fontSize: node.style?.fontSize || null,
          fontFamily: node.style?.fontFamily || null,
          fontWeight: node.style?.fontWeight !== undefined ? node.style.fontWeight : null,
          fontStyle: node.style?.italic ? 'italic' : 'normal',
          letterSpacing: node.style?.letterSpacing || 0
        };
        
        results.overflow.push({
          key: nodeName,
          element: node,
          pageName: node.pageName || 'Unknown Page',
          issue: 'missing_font_info',
          message: `节点缺少完整的字体信息（fontSize、fontFamily、fontWeight）`,
          containerWidth,
          fontStyle: partialFontStyle
        });
        continue;
      }
      
      // 从 Figma style 对象提取完整的字体信息（包含 PostScript 名称）
      const fontStyle = {
        fontSize: node.style.fontSize,
        fontFamily: node.style.fontFamily,
        fontWeight: node.style.fontWeight,
        fontPostScriptName: node.style?.fontPostScriptName || null, // 优先使用 PostScript 名称
        fontStyle: node.style?.italic ? 'italic' : 'normal',
        letterSpacing: node.style?.letterSpacing || 0,
        lineHeight: node.style?.lineHeightPx
      };
      
      // 提取 maxLines，如果未设置则默认为 1
      const maxLines = node.maxLines || 1;
      
      console.log(`\n[处理节点] ${nodeName}`);
      console.log(`  容器宽度: ${containerWidth}px`);
      console.log(`  最大行数: ${maxLines}`);
      console.log(`  字体信息:`, fontStyle);
      
      if (!containerWidth) {
        console.log(`  ⚠️ 跳过 - 无容器宽度信息`);
        continue;
      }

      // 检查是否有翻译数据
      const nodeTranslations = translations[nodeName] || {};
      
      if (Object.keys(nodeTranslations).length === 0) {
        console.log(`  ⚠️ 未找到翻译数据`);
        // 没有找到翻译数据
        results.overflow.push({
          key: nodeName,
          element: node,
          pageName: node.pageName || 'Unknown Page',
          issue: 'no_translations',
          message: `未找到翻译数据: ${nodeName}`,
          containerWidth,
          maxLines,
          fontStyle
        });
        continue;
      }

      // 检查每种语言的翻译
      for (const [language, text] of Object.entries(nodeTranslations)) {
        results.summary.languages.add(language);
        this.cacheStats.total++;
        
        // 检查缓存：如果已经检测过相同的 key + language + text + fontFamily + fontSize 组合，则跳过
        if (this.isInCache(nodeName, language, text, fontStyle.fontFamily, fontStyle.fontSize)) {
          this.cacheStats.hits++;
          console.log(`  [${language}] "${text}" - ⚡ 已缓存，跳过检测`);
          continue; // 跳过本次检测，不记录结果
        }
        
        this.cacheStats.misses++;
        results.summary.total++;
        
        console.log(`  [${language}] "${text}"`);
        
        // 精确检查文本适配性（传入 maxLines 参数）
        const check = await this.checkTextFit(text, containerWidth, fontStyle, maxLines);
        
        // 添加到缓存（包含字体信息）
        this.addToCache(nodeName, language, text, fontStyle.fontFamily, fontStyle.fontSize);
        
        if (maxLines === 1) {
          console.log(`    文本宽度: ${check.textWidth}px | 容器宽度: ${containerWidth}px | 适配: ${check.fits ? '✓' : '✗'}`);
        } else {
          console.log(`    文本宽度: ${check.textWidth}px | 容器宽度: ${containerWidth}px | 最大行数: ${maxLines} | 需要行数: ${check.requiredLines} | 适配: ${check.fits ? '✓' : '✗'}`);
        }
        
        const result = {
          key: nodeName,
          language,
          text,
          element: node,
          pageName: node.pageName || 'Unknown Page',
          check,
          containerWidth,
          maxLines,
          fontStyle
        };

        if (check.fits) {
          results.valid.push(result);
          results.summary.valid++;
        } else {
          results.overflow.push(result);
          results.summary.overflow++;
          if (maxLines === 1) {
            console.log(`    ❌ 超出: ${check.overflow}px (${check.overflowPercentage}%)`);
          } else {
            console.log(`    ❌ 需要 ${check.requiredLines} 行，超出 ${check.requiredLines - maxLines} 行`);
          }
        }
      }
    }

    results.summary.languages = Array.from(results.summary.languages);
    
    // 输出缓存统计
    const cacheStats = this.getCacheStats();
    console.log(`\n[验证完成] 总计: ${results.summary.total}, 适配: ${results.summary.valid}, 溢出: ${results.summary.overflow}`);
    console.log(`[缓存统计] 总请求: ${cacheStats.total}, 命中: ${cacheStats.hits}, 未命中: ${cacheStats.misses}, 命中率: ${cacheStats.hitRate}, 缓存大小: ${cacheStats.cacheSize}`);
    
    // 将缓存统计信息附加到结果中
    results.cacheStats = cacheStats;
    
    return results;
  }

  /**
   * 生成详细的验证报告
   * @param {Object} validationResults - 验证结果对象
   * @returns {Object} 格式化的报告
   */
  generateReport(validationResults) {
    const { valid, overflow, summary, cacheStats } = validationResults;
    
    return {
      precisionNote: '⚠️ 精度说明：Canvas API测量与Figma渲染引擎可能存在1-2px的差异（约1-2%），这是由于不同渲染引擎、字体版本、亚像素渲染等因素导致的正常现象。',
      summary: {
        total: summary.total,
        valid: summary.valid,
        overflow: summary.overflow,
        languages: summary.languages,
        successRate: summary.total > 0 ? parseFloat((summary.valid / summary.total * 100).toFixed(2)) : 0
      },
      cacheStats: cacheStats || null,
      details: {
        valid: valid.map(item => ({
          key: item.key,
          language: item.language,
          text: item.text,
          pageName: item.pageName || 'Unknown Page',
          width: item.check?.textWidth || 0,
          container: item.containerWidth,
          maxLines: item.maxLines || 1,
          requiredLines: item.check?.requiredLines || 1,
          utilization: item.check?.utilization ?? null,
          fontStyle: item.fontStyle
        })),
        overflow: overflow.map(item => {
          if (item.check) {
            // 正常文本溢出情况
            return {
              key: item.key,
              language: item.language,
              text: item.text,
              pageName: item.pageName || 'Unknown Page',
              width: item.check.textWidth,
              container: item.containerWidth,
              maxLines: item.maxLines || 1,
              requiredLines: item.check.requiredLines || 1,
              overflow: item.check.overflow,
              overflowPercentage: item.check.overflowPercentage,
              utilization: item.check.utilization,
              issue: item.issue || 'text_overflow',
              fontStyle: item.fontStyle
            };
          } else {
            // 特殊情况（没有翻译等）
            return {
              key: item.key,
              language: item.language || 'N/A',
              text: item.text || 'N/A',
              pageName: item.pageName || 'Unknown Page',
              width: 0,
              container: item.containerWidth || 0,
              maxLines: item.maxLines || 1,
              requiredLines: 0,
              overflow: 0,
              overflowPercentage: 0,
              utilization: 0,
              issue: item.issue || 'unknown',
              message: item.message,
              fontStyle: item.fontStyle
            };
          }
        })
      }
    };
  }
}

module.exports = TextWidthChecker;

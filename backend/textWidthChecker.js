// Text width calculation using @napi-rs/canvas (Rust-based, works on Vercel / serverless)
// 使用 Skia 引擎做完整的 text shaping，对泰语、阿拉伯语等复杂文字精度与 Figma 一致
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

class TextWidthChecker {
  constructor() {
    this.canvas = createCanvas(1, 1);
    this.ctx = this.canvas.getContext('2d');

    // Font fallback map: 找不到字体时用 fallback 字体族名去 Google Fonts 下载
    this.fontFallbacks = {
      'Inter': 'Inter',
      'SF Pro Display': 'Inter',
      'SF Pro Text': 'Inter',
      'Roboto': 'Roboto',
      'Helvetica': 'Inter',
      'Arial': 'Inter',
      'PingFang SC': 'Noto Sans SC',
      'Noto Sans': 'Noto Sans',
      'Open Sans': 'Open Sans',
      'Microsoft YaHei': 'Noto Sans SC',
      'Noto Sans Thai': 'Noto Sans Thai'
    };

    // 已注册的字体缓存（避免重复注册）
    this.registeredFonts = new Set();

    // 字体加载状态缓存
    this.fontLoadStatus = new Map();

    // Google Fonts 字体文件缓存目录（Vercel 仅 /tmp 可写）
    this.fontCacheDir = process.env.VERCEL
      ? path.join('/tmp', '.font-cache')
      : path.join(__dirname, '..', '.font-cache');
    this.ensureFontCacheDir();

    // 缓存池：用于存储已检测过的文本 key
    this.cachePool = new Set();
    this.cacheStats = { total: 0, hits: 0, misses: 0 };
  }

  ensureFontCacheDir() {
    if (!fs.existsSync(this.fontCacheDir)) {
      fs.mkdirSync(this.fontCacheDir, { recursive: true });
      console.log(`[字体缓存] 创建缓存目录: ${this.fontCacheDir}`);
    }
  }

  // ──────────────────────────── Network Helpers ────────────────────────────

  fetchUrl(url, binary = false, customHeaders = {}) {
    return new Promise((resolve) => {
      const parsedUrl = new URL(url);
      const client = parsedUrl.protocol === 'https:' ? https : http;

      const options = {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        headers: { ...customHeaders }
      };

      client.get(options, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          resolve(this.fetchUrl(res.headers.location, binary, customHeaders));
          return;
        }
        if (res.statusCode !== 200) { resolve(null); return; }
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve(binary ? Buffer.concat(chunks) : Buffer.concat(chunks).toString('utf-8'));
        });
      }).on('error', (error) => {
        console.error(`[网络请求] 错误: ${url}`, error.message);
        resolve(null);
      });
    });
  }

  // ──────────────────────────── Font Download ────────────────────────────

  async downloadGoogleFont(fontFamily, fontWeight = 400) {
    try {
      const cleanFontName = fontFamily.replace(/['"]/g, '').trim();
      const fontNameEncoded = encodeURIComponent(cleanFontName);
      const apiUrl = `https://fonts.googleapis.com/css2?family=${fontNameEncoded}:wght@${fontWeight}&display=swap`;

      console.log(`[Google Fonts] 尝试下载字体: ${cleanFontName} (${fontWeight})`);

      // 用不支持 woff2 的 User-Agent，让 Google Fonts 返回 TTF
      const cssResponse = await this.fetchUrl(apiUrl, false, {
        'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; Trident/7.0; rv:11.0) like Gecko'
      });
      if (!cssResponse) {
        console.log(`[Google Fonts] 无法获取字体 CSS: ${cleanFontName}`);
        return null;
      }

      // 从 CSS 中提取字体 URL（优先 ttf -> woff -> woff2）
      const ttfMatches = cssResponse.match(/url\(([^)]+\.ttf)\)/g);
      const woffMatches = cssResponse.match(/url\(([^)]+\.woff)\b[^2]/g);
      const woff2Matches = cssResponse.match(/url\(([^)]+\.woff2)\)/g);

      let fontUrl = null;
      let ext = 'ttf';
      for (const matches of [ttfMatches, woffMatches, woff2Matches]) {
        if (matches && matches.length > 0) {
          fontUrl = matches[0].replace(/url\(|\)/g, '').trim();
          ext = fontUrl.split('.').pop();
          break;
        }
      }

      if (!fontUrl) {
        const anyUrl = cssResponse.match(/url\(([^)]+)\)/);
        if (anyUrl) fontUrl = anyUrl[1];
      }

      if (!fontUrl) {
        console.log(`[Google Fonts] CSS 中未找到字体文件 URL: ${cleanFontName}`);
        return null;
      }

      console.log(`[Google Fonts] 找到字体文件 URL: ${fontUrl}`);

      const safeFontName = cleanFontName.replace(/[^a-zA-Z0-9]/g, '_');
      const cacheFileName = `${safeFontName}_${fontWeight}.${ext}`;
      const cacheFilePath = path.join(this.fontCacheDir, cacheFileName);

      if (fs.existsSync(cacheFilePath)) {
        console.log(`[Google Fonts] 使用缓存字体: ${cacheFilePath}`);
        return cacheFilePath;
      }

      const fontData = await this.fetchUrl(fontUrl, true);
      if (!fontData) {
        console.log(`[Google Fonts] 下载字体文件失败: ${cleanFontName}`);
        return null;
      }

      fs.writeFileSync(cacheFilePath, fontData);
      console.log(`[Google Fonts] ✅ 字体已保存到缓存: ${cacheFilePath}`);
      return cacheFilePath;
    } catch (error) {
      console.error(`[Google Fonts] 下载字体时出错: ${fontFamily}`, error.message);
      return null;
    }
  }

  // ──────────────────────────── Font Loading ────────────────────────────

  /**
   * 尝试加载字体（Google Fonts -> fallback 字体族 -> 默认 Inter）
   * 使用 GlobalFonts.registerFromPath 注册到 @napi-rs/canvas
   */
  async loadFont(fontFamily, fontWeight = 400) {
    const cacheKey = `${fontFamily}_${fontWeight}`;
    if (this.fontLoadStatus.has(cacheKey)) {
      const status = this.fontLoadStatus.get(cacheKey);
      return { success: status.loaded, source: status.source, fontFamily: status.fontFamily || fontFamily };
    }

    // 步骤 1: 用原始字体族名尝试 Google Fonts
    const fontPath = await this.downloadGoogleFont(fontFamily, fontWeight);
    if (fontPath) {
      try {
        GlobalFonts.registerFromPath(fontPath, fontFamily);
        this.registeredFonts.add(cacheKey);
        this.fontLoadStatus.set(cacheKey, { loaded: true, source: 'google', fontFamily });
        console.log(`[字体加载] ✅ 从 Google Fonts 加载: ${fontFamily} (${fontWeight})`);
        return { success: true, source: 'google', fontFamily };
      } catch (e) {
        console.error(`[字体加载] 注册字体失败: ${fontFamily}`, e.message);
      }
    }

    // 步骤 2: 用 fallback 字体族名尝试
    const fallbackName = this.fontFallbacks[fontFamily];
    if (fallbackName && fallbackName !== fontFamily) {
      console.log(`[字体加载] 尝试 fallback 字体: ${fontFamily} -> ${fallbackName}`);
      const fbPath = await this.downloadGoogleFont(fallbackName, fontWeight);
      if (fbPath) {
        try {
          GlobalFonts.registerFromPath(fbPath, fallbackName);
          this.registeredFonts.add(cacheKey);
          this.fontLoadStatus.set(cacheKey, { loaded: true, source: 'fallback', fontFamily: fallbackName });
          console.log(`[字体加载] ✅ 使用 fallback 字体: ${fallbackName}`);
          return { success: true, source: 'fallback', fontFamily: fallbackName };
        } catch (e) {
          console.error(`[字体加载] 注册 fallback 字体失败: ${fallbackName}`, e.message);
        }
      }
    }

    // 步骤 3: 加载默认 Inter 作为最终回退
    const interPath = await this.downloadGoogleFont('Inter', 400);
    if (interPath) {
      try {
        GlobalFonts.registerFromPath(interPath, 'Inter');
        this.registeredFonts.add(cacheKey);
        this.fontLoadStatus.set(cacheKey, { loaded: true, source: 'default-fallback', fontFamily: 'Inter' });
        console.log(`[字体加载] ⚠️ 使用默认回退字体 Inter 代替: ${fontFamily}`);
        return { success: true, source: 'default-fallback', fontFamily: 'Inter' };
      } catch (e) {
        console.error('[字体加载] 加载默认回退字体失败:', e.message);
      }
    }

    this.fontLoadStatus.set(cacheKey, { loaded: false, source: 'estimation', fontFamily });
    console.log(`[字体加载] ⚠️ 无可用字体，将使用估算: ${fontFamily}`);
    return { success: false, source: 'estimation', fontFamily };
  }

  // ──────────────────────────── Cache Methods ────────────────────────────

  generateCacheKey(key, language, text, fontFamily, fontSize) {
    return `${key}|${language}|${text}|${fontFamily}|${fontSize}`;
  }

  isInCache(key, language, text, fontFamily, fontSize) {
    return this.cachePool.has(this.generateCacheKey(key, language, text, fontFamily, fontSize));
  }

  addToCache(key, language, text, fontFamily, fontSize) {
    this.cachePool.add(this.generateCacheKey(key, language, text, fontFamily, fontSize));
  }

  clearCache() {
    this.cachePool.clear();
    this.cacheStats = { total: 0, hits: 0, misses: 0 };
    console.log('[缓存] 缓存池已清空');
  }

  getCacheStats() {
    const hitRate = this.cacheStats.total > 0
      ? ((this.cacheStats.hits / this.cacheStats.total) * 100).toFixed(2)
      : 0;
    return { ...this.cacheStats, cacheSize: this.cachePool.size, hitRate: `${hitRate}%` };
  }

  // ──────────────────────────── Text Measurement ────────────────────────────

  /**
   * 精确计算文本宽度（使用 @napi-rs/canvas 的 Skia 引擎，含完整 text shaping）
   */
  async calculateTextWidth(text, fontStyle) {
    if (!text) return 0;

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
      fontSize, fontFamily, fontWeight,
      fontStyle: style = 'normal',
      letterSpacing = 0
    } = fontStyle;

    // 加载字体
    const fontLoadResult = await this.loadFont(fontFamily, fontWeight);
    const actualFontFamily = fontLoadResult.fontFamily;

    // 构建 CSS font 字符串
    let fontString = '';
    if (style && style !== 'normal') fontString += `${style} `;
    if (fontWeight && fontWeight !== 400) fontString += `${fontWeight} `;
    fontString += `${fontSize}px "${actualFontFamily}"`;

    this.ctx.font = fontString;
    const metrics = this.ctx.measureText(text);
    let width = metrics.width;

    // 应用字间距（letterSpacing）
    if (letterSpacing && letterSpacing !== 0 && text.length > 1) {
      let letterSpacingPx = letterSpacing;
      if (typeof letterSpacing === 'object' && letterSpacing.unit === 'PERCENT') {
        letterSpacingPx = (letterSpacing.value / 100) * fontSize;
      }
      width += letterSpacingPx * (text.length - 1);
    }

    const sourceEmoji = fontLoadResult.source === 'google' ? '🌐'
      : fontLoadResult.source === 'fallback' ? '🔄'
      : fontLoadResult.source === 'default-fallback' ? '⚠️'
      : '📏';
    console.log(`[精确测量] 文本: "${text.substring(0, 30)}${text.length > 30 ? '...' : ''}", 字体: ${fontString}, 来源: ${sourceEmoji} ${fontLoadResult.source}, 宽度: ${width.toFixed(2)}px`);

    return width;
  }

  /**
   * @deprecated 建议直接使用 calculateTextWidth 并提供完整的 fontStyle 对象
   */
  calculateTextWidthSimple(text, fontSize, fontFamily, fontWeight) {
    if (!fontSize || !fontFamily || !fontWeight) {
      throw new Error('fontSize 和 fontFamily 和 fontWeight 是必需参数');
    }
    return this.calculateTextWidth(text, { fontSize, fontFamily, fontWeight });
  }

  // ──────────────────────────── Text Fit Check ────────────────────────────

  async checkTextFit(text, containerWidth, fontStyle, maxLines) {
    if (maxLines === undefined || maxLines === null || typeof maxLines !== 'number') {
      throw new Error('maxLines 必须提供，且必须是数字（如：1, 2, 3）');
    }
    if (maxLines < 1) {
      throw new Error('maxLines 必须大于等于 1');
    }

    const textWidth = await this.calculateTextWidth(text, fontStyle);

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
        precisionNote: '使用 Skia 引擎精确测量（含完整 text shaping），与 Figma 差异通常 < 1-2px'
      };
    }

    const requiredLines = await this.calculateRequiredLines(text, containerWidth, fontStyle);
    const fits = requiredLines <= maxLines;
    const isUnfittable = requiredLines === Infinity;

    return {
      text,
      textWidth: parseFloat(textWidth.toFixed(2)),
      containerWidth,
      maxLines,
      requiredLines: isUnfittable ? '单词过长且不符合换行规则 无法换行' : requiredLines,
      fits,
      overflow: fits ? 0 : parseFloat((textWidth - containerWidth * maxLines).toFixed(2)),
      utilization: null,
      overflowPercentage: isUnfittable ? Infinity : (fits ? 0 : parseFloat(((requiredLines - maxLines) / maxLines * 100).toFixed(2))),
      fontStyle: {
        fontSize: fontStyle.fontSize,
        fontFamily: fontStyle.fontFamily,
        fontWeight: fontStyle.fontWeight,
        letterSpacing: fontStyle.letterSpacing || 0
      },
      precisionNote: '使用 Skia 引擎精确测量（含完整 text shaping），与 Figma 差异通常 < 1-2px'
    };
  }

  checkTextFitSimple(text, containerWidth, fontSize, fontFamily, fontWeight, maxLines) {
    if (!fontSize || !fontFamily || !fontWeight || !maxLines) {
      throw new Error('fontSize、fontFamily、fontWeight 和 maxLines 都是必需参数');
    }
    return this.checkTextFit(text, containerWidth, { fontSize, fontFamily, fontWeight }, maxLines);
  }

  // ──────────────────────────── Multi-line Helpers ────────────────────────────

  async calculateRequiredLines(text, containerWidth, fontStyle) {
    if (!text || containerWidth <= 0) return 1;

    const words = this.splitTextIntoWords(text);
    let currentLineWidth = 0;
    let lines = 1;
    const spaceWidth = await this.calculateTextWidth(' ', fontStyle);

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const wordWidth = await this.calculateTextWidth(word, fontStyle);

      if (wordWidth > containerWidth) {
        console.log(`[换行检测] 发现无法换行的单词: "${word}", 宽度: ${wordWidth.toFixed(2)}px, 容器: ${containerWidth}px`);
        return Infinity;
      }

      if (currentLineWidth === 0) {
        currentLineWidth = wordWidth;
        continue;
      }

      const totalWidth = currentLineWidth + spaceWidth + wordWidth;
      if (totalWidth <= containerWidth) {
        currentLineWidth = totalWidth;
      } else {
        lines++;
        currentLineWidth = wordWidth;
      }
    }

    return lines;
  }

  splitTextIntoWords(text) {
    const words = [];
    let currentWord = '';

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const charCode = char.charCodeAt(0);

      const isCJK = (charCode >= 0x4E00 && charCode <= 0x9FFF) ||
                    (charCode >= 0x3400 && charCode <= 0x4DBF) ||
                    (charCode >= 0x20000 && charCode <= 0x2A6DF) ||
                    (charCode >= 0xF900 && charCode <= 0xFAFF) ||
                    (charCode >= 0x2F800 && charCode <= 0x2FA1F);

      if (isCJK) {
        if (currentWord) { words.push(currentWord); currentWord = ''; }
        words.push(char);
      } else if (char === ' ' || char === '\n' || char === '\t') {
        if (currentWord) { words.push(currentWord); currentWord = ''; }
      } else {
        currentWord += char;
      }
    }
    if (currentWord) words.push(currentWord);
    return words;
  }

  // ──────────────────────────── Validation ────────────────────────────

  async validateI18nTexts(textNodes, translations) {
    this.clearCache();
    console.log('[缓存] 新的检测开始，缓存已清空');

    const results = {
      valid: [],
      overflow: [],
      summary: { total: 0, valid: 0, overflow: 0, languages: new Set() }
    };

    for (const node of textNodes) {
      const nodeName = node.name;
      const containerWidth = node.absoluteBoundingBox?.width || 0;

      if (!node.style?.fontSize || !node.style?.fontFamily || node.style?.fontWeight === undefined) {
        console.log(`\n[跳过节点] ${nodeName} - 缺少必需的字体信息`);
        const partialFontStyle = {
          fontSize: node.style?.fontSize || null,
          fontFamily: node.style?.fontFamily || null,
          fontWeight: node.style?.fontWeight !== undefined ? node.style.fontWeight : null,
          fontStyle: node.style?.italic ? 'italic' : 'normal',
          letterSpacing: node.style?.letterSpacing || 0
        };
        results.overflow.push({
          key: nodeName, element: node, pageName: node.pageName || 'Unknown Page',
          issue: 'missing_font_info',
          message: '节点缺少完整的字体信息（fontSize、fontFamily、fontWeight）',
          containerWidth, fontStyle: partialFontStyle
        });
        continue;
      }

      const fontStyle = {
        fontSize: node.style.fontSize,
        fontFamily: node.style.fontFamily,
        fontWeight: node.style.fontWeight,
        fontPostScriptName: node.style?.fontPostScriptName || null,
        fontStyle: node.style?.italic ? 'italic' : 'normal',
        letterSpacing: node.style?.letterSpacing || 0,
        lineHeight: node.style?.lineHeightPx
      };

      const maxLines = node.maxLines || 1;

      console.log(`\n[处理节点] ${nodeName}`);
      console.log(`  容器宽度: ${containerWidth}px, 最大行数: ${maxLines}`);

      if (!containerWidth) { console.log('  ⚠️ 跳过 - 无容器宽度信息'); continue; }

      const nodeTranslations = translations[nodeName] || {};

      if (Object.keys(nodeTranslations).length === 0) {
        console.log('  ⚠️ 未找到翻译数据');
        results.overflow.push({
          key: nodeName, element: node, pageName: node.pageName || 'Unknown Page',
          issue: 'no_translations', message: `未找到翻译数据: ${nodeName}`,
          containerWidth, maxLines, fontStyle
        });
        continue;
      }

      for (const [language, text] of Object.entries(nodeTranslations)) {
        results.summary.languages.add(language);
        this.cacheStats.total++;

        if (this.isInCache(nodeName, language, text, fontStyle.fontFamily, fontStyle.fontSize)) {
          this.cacheStats.hits++;
          console.log(`  [${language}] "${text}" - ⚡ 已缓存，跳过`);
          continue;
        }

        this.cacheStats.misses++;
        results.summary.total++;
        console.log(`  [${language}] "${text}"`);

        const check = await this.checkTextFit(text, containerWidth, fontStyle, maxLines);
        this.addToCache(nodeName, language, text, fontStyle.fontFamily, fontStyle.fontSize);

        if (maxLines === 1) {
          console.log(`    文本宽度: ${check.textWidth}px | 容器宽度: ${containerWidth}px | 适配: ${check.fits ? '✓' : '✗'}`);
        } else {
          console.log(`    文本宽度: ${check.textWidth}px | 容器: ${containerWidth}px | 最大行数: ${maxLines} | 需要行数: ${check.requiredLines} | 适配: ${check.fits ? '✓' : '✗'}`);
        }

        const result = {
          key: nodeName, language, text, element: node,
          pageName: node.pageName || 'Unknown Page',
          check, containerWidth, maxLines, fontStyle
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
    const cacheStats = this.getCacheStats();
    console.log(`\n[验证完成] 总计: ${results.summary.total}, 适配: ${results.summary.valid}, 溢出: ${results.summary.overflow}`);
    console.log(`[缓存统计] 总请求: ${cacheStats.total}, 命中: ${cacheStats.hits}, 未命中: ${cacheStats.misses}, 命中率: ${cacheStats.hitRate}`);
    results.cacheStats = cacheStats;
    return results;
  }

  // ──────────────────────────── Report ────────────────────────────

  generateReport(validationResults) {
    const { valid, overflow, summary, cacheStats } = validationResults;

    return {
      precisionNote: '⚠️ 精度说明：使用 Skia 引擎（含完整 text shaping）精确测量，与 Figma 渲染引擎差异通常 < 1-2px。',
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
          key: item.key, language: item.language, text: item.text,
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
            return {
              key: item.key, language: item.language, text: item.text,
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
          }
          return {
            key: item.key, language: item.language || 'N/A', text: item.text || 'N/A',
            pageName: item.pageName || 'Unknown Page',
            width: 0, container: item.containerWidth || 0,
            maxLines: item.maxLines || 1, requiredLines: 0,
            overflow: 0, overflowPercentage: 0, utilization: 0,
            issue: item.issue || 'unknown',
            message: item.message, fontStyle: item.fontStyle
          };
        })
      }
    };
  }
}

module.exports = TextWidthChecker;

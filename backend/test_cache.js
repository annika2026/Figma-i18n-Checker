// 测试缓存功能
const TextWidthChecker = require('./textWidthChecker');

console.log('=== 缓存功能测试 ===\n');

const checker = new TextWidthChecker();

// 模拟文本节点
const mockTextNodes = [
  {
    id: '1',
    name: 'button.submit',
    characters: '提交',
    style: {
      fontSize: 16,
      fontFamily: 'Inter',
      fontWeight: 400
    },
    absoluteBoundingBox: { width: 100 },
    maxLines: 1
  },
  {
    id: '2',
    name: 'button.cancel',
    characters: '取消',
    style: {
      fontSize: 16,
      fontFamily: 'Inter',
      fontWeight: 400
    },
    absoluteBoundingBox: { width: 100 },
    maxLines: 1
  },
  // 重复的节点（相同的 key）
  {
    id: '3',
    name: 'button.submit',
    characters: '提交',
    style: {
      fontSize: 16,
      fontFamily: 'Inter',
      fontWeight: 400
    },
    absoluteBoundingBox: { width: 100 },
    maxLines: 1
  }
];

// 模拟翻译数据
const mockTranslations = {
  'button.submit': {
    'zh-CN': '提交',
    'en-US': 'Submit',
    'ja-JP': '送信する'
  },
  'button.cancel': {
    'zh-CN': '取消',
    'en-US': 'Cancel',
    'ja-JP': 'キャンセル'
  }
};

console.log('第一次检测：应该检测所有文本\n');
const results1 = checker.validateI18nTexts(mockTextNodes, mockTranslations);
console.log('\n第一次检测结果：');
console.log(`- 总计检测: ${results1.summary.total}`);
console.log(`- 适配: ${results1.summary.valid}`);
console.log(`- 溢出: ${results1.summary.overflow}`);
console.log(`- 缓存命中率: ${results1.cacheStats.hitRate}`);
console.log(`- 缓存大小: ${results1.cacheStats.cacheSize}`);

console.log('\n\n=== 第二次检测（模拟新的检测） ===\n');
const results2 = checker.validateI18nTexts(mockTextNodes, mockTranslations);
console.log('\n第二次检测结果：');
console.log(`- 总计检测: ${results2.summary.total}`);
console.log(`- 适配: ${results2.summary.valid}`);
console.log(`- 溢出: ${results2.summary.overflow}`);
console.log(`- 缓存命中率: ${results2.cacheStats.hitRate}`);
console.log(`- 缓存大小: ${results2.cacheStats.cacheSize}`);

console.log('\n\n=== 测试说明 ===');
console.log('1. 每次检测开始时，缓存会被清空');
console.log('2. 在单次检测内，重复的 key+language+text 组合会被缓存');
console.log('3. 第一次检测中，button.submit 出现了两次（id=1和id=3），第二次会命中缓存');
console.log('4. 第二次检测开始时缓存被清空，所以会重新检测所有文本');
console.log('5. 这样确保了每次新的检测都是完整的，不会遗漏任何文本');


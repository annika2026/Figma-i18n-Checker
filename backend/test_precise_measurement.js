/**
 * 精确文本宽度测量测试
 * 展示如何使用新的精确测量API
 */

const TextWidthChecker = require('./textWidthChecker');

// 创建实例
const checker = new TextWidthChecker();

console.log('=== 精确文本宽度测量测试 ===\n');

// 测试1: 基本文本测量
console.log('【测试1】基本文本测量');
const text1 = 'Hello World';
const fontStyle1 = {
  fontSize: 16,
  fontFamily: 'Inter',
  fontWeight: 400
};
const width1 = checker.calculateTextWidth(text1, fontStyle1);
console.log(`文本: "${text1}"`);
console.log(`字体: ${fontStyle1.fontFamily} ${fontStyle1.fontSize}px`);
console.log(`计算宽度: ${width1.toFixed(2)}px\n`);

// 测试2: 中文文本测量
console.log('【测试2】中文文本测量');
const text2 = '更新游戏';
const fontStyle2 = {
  fontSize: 20,
  fontFamily: 'PingFang SC',
  fontWeight: 500
};
const width2 = checker.calculateTextWidth(text2, fontStyle2);
console.log(`文本: "${text2}"`);
console.log(`字体: ${fontStyle2.fontFamily} ${fontStyle2.fontSize}px ${fontStyle2.fontWeight}`);
console.log(`计算宽度: ${width2.toFixed(2)}px\n`);

// 测试3: 带字间距的文本
console.log('【测试3】带字间距的文本');
const text3 = 'BUTTON';
const fontStyle3 = {
  fontSize: 14,
  fontFamily: 'Inter',
  fontWeight: 600,
  letterSpacing: 1.5
};
const width3 = checker.calculateTextWidth(text3, fontStyle3);
console.log(`文本: "${text3}"`);
console.log(`字体: ${fontStyle3.fontFamily} ${fontStyle3.fontSize}px ${fontStyle3.fontWeight}`);
console.log(`字间距: ${fontStyle3.letterSpacing}px`);
console.log(`计算宽度: ${width3.toFixed(2)}px\n`);

// 测试4: 斜体文本
console.log('【测试4】斜体文本');
const text4 = 'Italic Text';
const fontStyle4 = {
  fontSize: 16,
  fontFamily: 'Inter',
  fontWeight: 400,
  fontStyle: 'italic'
};
const width4 = checker.calculateTextWidth(text4, fontStyle4);
console.log(`文本: "${text4}"`);
console.log(`字体: ${fontStyle4.fontFamily} ${fontStyle4.fontSize}px ${fontStyle4.fontStyle}`);
console.log(`计算宽度: ${width4.toFixed(2)}px\n`);

// 测试5: 容器适配检查
console.log('【测试5】容器适配检查');
const testCases = [
  { text: 'Short', container: 100, fontStyle: { fontSize: 16, fontFamily: 'Inter' } },
  { text: 'This is a very long text', container: 100, fontStyle: { fontSize: 16, fontFamily: 'Inter' } },
  { text: '这是一段很长的中文文本', container: 150, fontStyle: { fontSize: 14, fontFamily: 'PingFang SC' } }
];

testCases.forEach((testCase, index) => {
  const result = checker.checkTextFit(testCase.text, testCase.container, testCase.fontStyle);
  console.log(`\n测试案例 ${index + 1}:`);
  console.log(`  文本: "${testCase.text}"`);
  console.log(`  容器宽度: ${testCase.container}px`);
  console.log(`  计算文本宽度: ${result.textWidth}px`);
  console.log(`  是否适配: ${result.fits ? '✓ 是' : '✗ 否'}`);
  if (!result.fits) {
    console.log(`  超出: ${result.overflow}px (${result.overflowPercentage}%)`);
  }
  console.log(`  利用率: ${result.utilization}%`);
});

console.log('\n=== 测试完成 ===');

// 测试6: 多语言对比
console.log('\n【测试6】多语言文本宽度对比');
const multiLangText = {
  'en': 'Update Game',
  'zh-CN': '更新游戏',
  'ja': 'ゲームを更新',
  'ko': '게임 업데이트',
  'ru': 'Обновить игру',
  'de': 'Spiel aktualisieren',
  'fr': 'Mettre à jour le jeu'
};

const containerWidth = 120;
const commonFontStyle = {
  fontSize: 16,
  fontFamily: 'Inter',
  fontWeight: 500
};

console.log(`容器宽度: ${containerWidth}px`);
console.log(`字体: ${commonFontStyle.fontFamily} ${commonFontStyle.fontSize}px ${commonFontStyle.fontWeight}\n`);

Object.entries(multiLangText).forEach(([lang, text]) => {
  const result = checker.checkTextFit(text, containerWidth, commonFontStyle);
  const statusIcon = result.fits ? '✓' : '✗';
  const status = result.fits ? '适配' : `超出${result.overflow.toFixed(2)}px`;
  console.log(`${statusIcon} [${lang}] "${text}"`);
  console.log(`   宽度: ${result.textWidth.toFixed(2)}px | ${status} | 利用率: ${result.utilization}%`);
});

console.log('\n=== 所有测试完成 ===');


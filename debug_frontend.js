// 调试前端数据处理
const testData = {
  "message": "Analysis completed successfully",
  "csvData": {
    "filename": "comprehensive_test.csv",
    "records": 1
  },
  "analysis": {
    "fileName": "i18n Test",
    "textNodes": 1,
    "analysis": {
      "hardcodedText": [],
      "potentialI18nKeys": [
        {
          "id": "1:2",
          "name": "UPDATE_GAME",
          "key": "UPDATE_GAME",
          "text": "更新游戏",
          "location": {
            "x": 100,
            "y": 100,
            "width": 152,
            "height": 24
          },
          "type": "proper_i18n"
        }
      ],
      "widthValidation": {
        "summary": {
          "total": 10,
          "valid": 8,
          "overflow": 2,
          "languages": ["zh", "en", "ja", "ko", "fr", "de", "es", "it", "pt", "ru"],
          "successRate": "80.0"
        },
        "details": {
          "valid": [
            {
              "key": "UPDATE_GAME",
              "language": "zh",
              "text": "更新游戏",
              "width": 41,
              "container": 152,
              "utilization": "27.0%"
            },
            {
              "key": "UPDATE_GAME",
              "language": "en",
              "text": "Update Game",
              "width": 94,
              "container": 152,
              "utilization": "61.8%"
            }
          ],
          "overflow": [
            {
              "key": "UPDATE_GAME",
              "language": "fr",
              "text": "Mettre à jour le jeu",
              "width": 172,
              "container": 152,
              "overflow": 20,
              "utilization": "113.2%",
              "issue": "text_overflow"
            },
            {
              "key": "UPDATE_GAME",
              "language": "de",
              "text": "Spiel aktualisieren",
              "width": 162,
              "container": 152,
              "overflow": 10,
              "utilization": "106.6%",
              "issue": "text_overflow"
            }
          ]
        }
      }
    }
  }
};

// 测试前端逻辑
function testFrontendLogic(data) {
  console.log('=== 测试前端数据处理 ===');
  
  // 检查数据结构
  const widthValidation = data.analysis?.analysis?.widthValidation;
  console.log('widthValidation 存在:', !!widthValidation);
  
  if (widthValidation) {
    console.log('汇总统计:', widthValidation.summary);
    console.log('溢出问题数量:', widthValidation.details?.overflow?.length || 0);
    console.log('正常文本数量:', widthValidation.details?.valid?.length || 0);
    
    // 测试溢出问题显示逻辑
    if (widthValidation.details?.overflow && widthValidation.details.overflow.length > 0) {
      console.log('\n=== 溢出问题详情 ===');
      widthValidation.details.overflow.forEach((item, idx) => {
        console.log(`${idx + 1}. ${item.key} (${item.language})`);
        console.log(`   文本: "${item.text}"`);
        console.log(`   溢出: ${item.overflow}px (${item.utilization})`);
      });
    }
    
    // 测试正常文本显示逻辑
    if (widthValidation.details?.valid && widthValidation.details.valid.length > 0) {
      console.log('\n=== 正常文本详情 ===');
      widthValidation.details.valid.forEach((item, idx) => {
        console.log(`${idx + 1}. ${item.key} (${item.language})`);
        console.log(`   文本: "${item.text}"`);
        console.log(`   利用率: ${item.utilization} (${item.width}px / ${item.container}px)`);
      });
    }
  }
}

// 运行测试
testFrontendLogic(testData);

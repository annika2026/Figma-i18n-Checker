import React, { useState } from "react";

export default function App() {
  const [figmaUrl, setFigmaUrl] = useState("");
  const [figmaApiKey, setFigmaApiKey] = useState("");
  const [file, setFile] = useState(null);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);

  const handleSubmit = async () => {
    if (!figmaUrl || !figmaApiKey) {
      setError("请输入 Figma 文件链接和 API Key");
      return;
    }

    setAnalyzing(true);
    setError(null);

    try {
      const formData = new FormData();
      if (file) formData.append("file", file);
      formData.append("figmaUrl", figmaUrl);
      formData.append("figmaApiKey", figmaApiKey);

      const res = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      });

      const text = await res.text();
      let data = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        setError(res.ok ? '响应格式错误' : (text || res.statusText || '服务异常'));
        return;
      }

      if (res.ok) {
        setResults(data);
      } else {
        setError((data.error || '请求失败') + (data.details ? ': ' + data.details : ''));
      }
    } catch (err) {
      setError('网络错误: ' + err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 text-center">Figma 多语言设计稿校验工具</h1>
      
      <div className="bg-gray-50 p-6 rounded-lg mb-6">
        <h2 className="text-xl font-semibold mb-4">步骤 1: 输入 Figma 文件信息</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Figma 文件链接:</label>
            <input
              type="text"
              placeholder="https://www.figma.com/design/..."
              value={figmaUrl}
              onChange={(e) => setFigmaUrl(e.target.value)}
              className="border p-3 w-full rounded"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Figma API Key:</label>
            <input
              type="password"
              placeholder="figd_..."
              value={figmaApiKey}
              onChange={(e) => setFigmaApiKey(e.target.value)}
              className="border p-3 w-full rounded"
            />
          </div>
        </div>
      </div>

      <div className="bg-gray-50 p-6 rounded-lg mb-6">
        <h2 className="text-xl font-semibold mb-4">步骤 2: 上传多语言 CSV 文件 (可选)</h2>
        <input
          type="file"
          accept=".csv"
          onChange={(e) => setFile(e.target.files[0])}
          className="mb-4"
        />
        <p className="text-sm text-gray-600">
          CSV 格式: key,zh,en,ja,ko,fr,de,es,it,pt,ru...
        </p>
      </div>

      <div className="text-center mb-6">
        <button
          className="bg-blue-500 hover:bg-blue-600 text-white px-8 py-3 rounded-lg text-lg font-medium disabled:bg-gray-400"
          onClick={handleSubmit}
          disabled={analyzing || !figmaUrl || !figmaApiKey}
        >
          {analyzing ? '分析中...' : '开始校验'}
        </button>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
          <strong>错误:</strong> {error}
        </div>
      )}

      {results && (
        <div className="space-y-6">
          {/* 基本信息 */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-2xl font-bold mb-4">📊 分析结果</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="bg-blue-50 p-4 rounded">
                <h3 className="font-semibold text-blue-800">Figma 文件</h3>
                <p className="text-sm text-blue-600">{results.analysis?.fileName || 'N/A'}</p>
              </div>
              <div className="bg-green-50 p-4 rounded">
                <h3 className="font-semibold text-green-800">文本节点</h3>
                <p className="text-sm text-green-600">{results.analysis?.textNodes || 0} 个</p>
              </div>
              <div className="bg-purple-50 p-4 rounded">
                <h3 className="font-semibold text-purple-800">CSV 记录</h3>
                <p className="text-sm text-purple-600">{results.csvData?.records || 0} 条</p>
              </div>
            </div>
          </div>

          {/* i18n 分析 */}
          {results.analysis?.analysis && (
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-xl font-bold mb-4">🔍 i18n 分析</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-yellow-50 p-4 rounded">
                  <h4 className="font-semibold text-yellow-800">硬编码文本</h4>
                  <p className="text-sm text-yellow-600">{results.analysis.analysis.hardcodedText?.length || 0} 个</p>
                </div>
                <div className="bg-blue-50 p-4 rounded">
                  <h4 className="font-semibold text-blue-800">i18n 键</h4>
                  <p className="text-sm text-blue-600">{results.analysis.analysis.potentialI18nKeys?.length || 0} 个</p>
                </div>
              </div>
            </div>
          )}

          {/* 文本宽度校验结果 */}
          {results.analysis?.analysis?.widthValidation && !results.analysis.analysis.widthValidation.error && (
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-xl font-bold mb-4">📏 文本宽度校验</h3>
              
              {/* 汇总统计 */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-gray-50 p-4 rounded text-center">
                  <div className="text-2xl font-bold text-gray-800">{results.analysis.analysis.widthValidation.summary?.total || 0}</div>
                  <div className="text-sm text-gray-600">总检查数</div>
                </div>
                <div className="bg-green-50 p-4 rounded text-center">
                  <div className="text-2xl font-bold text-green-600">{results.analysis.analysis.widthValidation.summary?.valid || 0}</div>
                  <div className="text-sm text-green-600">正常</div>
                </div>
                <div className="bg-red-50 p-4 rounded text-center">
                  <div className="text-2xl font-bold text-red-600">{results.analysis.analysis.widthValidation.summary?.overflow || 0}</div>
                  <div className="text-sm text-red-600">溢出</div>
                </div>
                <div className="bg-blue-50 p-4 rounded text-center">
                  <div className="text-2xl font-bold text-blue-600">{results.analysis.analysis.widthValidation.summary?.successRate || 0}%</div>
                  <div className="text-sm text-blue-600">成功率</div>
                </div>
              </div>

              {/* 语言列表 */}
              {results.analysis.analysis.widthValidation.summary?.languages && (
                <div className="mb-6">
                  <h4 className="font-semibold mb-2">校验语言:</h4>
                  <div className="flex flex-wrap gap-2">
                    {results.analysis.analysis.widthValidation.summary.languages.map((lang, idx) => (
                      <span key={idx} className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm">
                        {lang}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 溢出问题详情 */}
              {results.analysis.analysis.widthValidation.details?.overflow && results.analysis.analysis.widthValidation.details.overflow.length > 0 && (
                <div className="mb-6">
                  <h4 className="font-semibold text-red-600 mb-3">❌ 溢出问题 ({results.analysis.analysis.widthValidation.details.overflow.length} 个)</h4>
                  <div className="space-y-2">
                    {results.analysis.analysis.widthValidation.details.overflow.map((item, idx) => (
                      <div key={idx} className="bg-red-50 border border-red-200 p-3 rounded">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="font-medium">{item.key}</span>
                            <span className="text-gray-500 ml-2">({item.language})</span>
                          </div>
                          <div className="text-right text-sm">
                            <div className="text-red-600 font-medium">溢出 {item.overflow}px</div>
                            <div className="text-gray-500">{item.utilization}</div>
                          </div>
                        </div>
                        <div className="text-sm text-gray-700 mt-1">"{item.text}"</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 正常文本详情 */}
              {results.analysis.analysis.widthValidation.details?.valid && results.analysis.analysis.widthValidation.details.valid.length > 0 && (
                <div>
                  <h4 className="font-semibold text-green-600 mb-3">✅ 正常文本 ({results.analysis.analysis.widthValidation.details.valid.length} 个)</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {results.analysis.analysis.widthValidation.details.valid.map((item, idx) => (
                      <div key={idx} className="bg-green-50 border border-green-200 p-3 rounded">
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="font-medium">{item.key}</span>
                            <span className="text-gray-500 ml-2">({item.language})</span>
                          </div>
                          <div className="text-right text-sm">
                            <div className="text-green-600">{item.utilization}</div>
                            <div className="text-gray-500">{item.width}px / {item.container}px</div>
                          </div>
                        </div>
                        <div className="text-sm text-gray-700 mt-1">"{item.text}"</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

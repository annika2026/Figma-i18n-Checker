import React, { useState, useRef } from 'react';
import './App.css';

function App() {
  const [file, setFile] = useState(null);
  const [figmaUrl, setFigmaUrl] = useState('');
  const [figmaApiKey, setFigmaApiKey] = useState('');
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [testingApi, setTestingApi] = useState(false);
  const [apiTestResult, setApiTestResult] = useState(null);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.type === 'text/csv' || droppedFile.name.endsWith('.csv')) {
        setFile(droppedFile);
        setError(null);
      } else {
        setError('Please upload a CSV file');
      }
    }
  };

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      if (selectedFile.type === 'text/csv' || selectedFile.name.endsWith('.csv')) {
        setFile(selectedFile);
        setError(null);
      } else {
        setError('Please upload a CSV file');
      }
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a file first');
      return;
    }

    setUploading(true);
    setError(null);
    setResults(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        setResults(data);
      } else {
        setError(data.error || 'Upload failed');
      }
    } catch (err) {
      setError('Network error: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleUploadAreaClick = () => {
    fileInputRef.current.click();
  };

  const handleTestApi = async () => {
    if (!figmaApiKey) {
      setError('Please enter your Figma API key first');
      return;
    }

    setTestingApi(true);
    setError(null);
    setApiTestResult(null);

    try {
      const response = await fetch('/api/test-figma', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ figmaApiKey }),
      });

      const data = await response.json();

      if (response.ok) {
        setApiTestResult(data);
        setError(null);
      } else {
        setError(data.error || 'API test failed');
        setApiTestResult(null);
      }
    } catch (err) {
      setError('Network error: ' + err.message);
      setApiTestResult(null);
    } finally {
      setTestingApi(false);
    }
  };

  const handleAnalyze = async () => {
    if (!figmaUrl) {
      setError('Please enter a Figma file URL');
      return;
    }

    if (!figmaApiKey) {
      setError('Please enter your Figma API key');
      return;
    }

    setAnalyzing(true);
    setError(null);
    setResults(null);

    const formData = new FormData();
    if (file) {
      formData.append('file', file);
    }
    formData.append('figmaUrl', figmaUrl);
    formData.append('figmaApiKey', figmaApiKey);

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        setResults(data);
      } else {
        setError(data.error || 'Analysis failed');
        if (data.details) {
          setError(prev => prev + ': ' + data.details);
        }
      }
    } catch (err) {
      setError('Network error: ' + err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="App">
      <div className="container">
        <header>
          <h1>Figma i18n Checker</h1>
          <p>Upload your CSV file and paste Figma file link to validate internationalization content</p>
        </header>

        <div className="upload-section">
          <h2>Step 1: Upload CSV Translation File</h2>
          <div
            className={`upload-area ${dragActive ? 'dragover' : ''}`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={handleUploadAreaClick}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
            {file ? (
              <div>
                <p>Selected file: <strong>{file.name}</strong></p>
                <p>Size: {(file.size / 1024).toFixed(2)} KB</p>
              </div>
            ) : (
              <div>
                <p>📁 Drag and drop your CSV file here</p>
                <p>or click to browse</p>
                <p style={{ fontSize: '14px', color: '#999' }}>Upload translation CSV to compare with Figma content</p>
              </div>
            )}
          </div>
        </div>

        <div className="figma-section">
          <h2>Step 2: Enter Figma File Information</h2>
          <div className="input-group">
            <label htmlFor="figmaUrl">Figma File URL:</label>
            <input
              type="url"
              id="figmaUrl"
              value={figmaUrl}
              onChange={(e) => setFigmaUrl(e.target.value)}
              placeholder="https://www.figma.com/file/..."
              className="input-field"
            />
            <small>Paste the Figma file URL you want to analyze</small>
          </div>

          <div className="input-group">
            <label htmlFor="figmaApiKey">Figma API Key:</label>
            <input
              type="password"
              id="figmaApiKey"
              value={figmaApiKey}
              onChange={(e) => setFigmaApiKey(e.target.value)}
              placeholder="Enter your Figma API key (starts with figd_)"
              className="input-field"
            />
            <small>
              Get your API key from{' '}
              <a href="https://www.figma.com/developers/api#access-tokens" target="_blank" rel="noopener noreferrer">
                Figma Developer Settings
              </a>
            </small>
          </div>

          <div style={{ textAlign: 'center', marginTop: '20px' }}>
            <button
              className="btn btn-secondary"
              onClick={handleTestApi}
              disabled={testingApi || !figmaApiKey}
              style={{ marginRight: '10px' }}
            >
              {testingApi ? 'Testing...' : 'Test API Connection'}
            </button>
            <button
              className="btn btn-primary"
              onClick={handleAnalyze}
              disabled={analyzing || !figmaUrl || !figmaApiKey}
            >
              {analyzing ? 'Analyzing...' : 'Analyze Figma File'}
            </button>
          </div>

          {apiTestResult && (
            <div className="api-test-result">
              <div className="success">
                <strong>✅ API Test Successful!</strong>
                <p>Connected as: {apiTestResult.user.name} ({apiTestResult.user.email})</p>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="error">
            <strong>Error:</strong> {error}
          </div>
        )}

        {results && (
          <div className="results">
            <h2>Analysis Results</h2>
            <div className="success">
              <strong>Success!</strong> {results.message}
            </div>

            {/* Figma File Info */}
            {results.analysis && (
              <div className="figma-info">
                <h3>Figma File Information</h3>
                <p><strong>File Name:</strong> {results.analysis.fileName}</p>
                <p><strong>File Key:</strong> {results.analysis.fileKey}</p>
                <p><strong>Text Nodes Found:</strong> {results.analysis.textNodes}</p>
                <p><strong>Last Modified:</strong> {new Date(results.analysis.lastModified).toLocaleString()}</p>
              </div>
            )}

            {/* CSV File Info */}
            {results.csvData && (
              <div className="csv-info">
                <h3>CSV File Information</h3>
                <p><strong>Filename:</strong> {results.csvData.filename}</p>
                <p><strong>Records processed:</strong> {results.csvData.records}</p>
              </div>
            )}

            {/* Analysis Results */}
            {results.analysis && (
              <div className="analysis-results">
                <h3>i18n Analysis</h3>
                
                {/* i18n Cache Stats */}
                {results.analysis.analysis.i18nCacheStats && (
                  <div style={{
                    padding: '12px 16px',
                    backgroundColor: '#e7f3ff',
                    border: '1px solid #2196F3',
                    borderRadius: '6px',
                    marginBottom: '20px',
                    fontSize: '14px',
                    color: '#0d47a1'
                  }}>
                    <strong>⚡ i18n 模块缓存统计:</strong> 总请求: {results.analysis.analysis.i18nCacheStats.total}, 
                    命中: {results.analysis.analysis.i18nCacheStats.hits}, 
                    未命中: {results.analysis.analysis.i18nCacheStats.misses}, 
                    命中率: {results.analysis.analysis.i18nCacheStats.hitRate}, 
                    缓存大小: {results.analysis.analysis.i18nCacheStats.cacheSize}
                  </div>
                )}
                
                {/* Hardcoded Text */}
                {results.analysis.analysis.hardcodedText.length > 0 && (
                  <div className="analysis-section">
                    <h4>⚠️ Hardcoded Text Found ({results.analysis.analysis.hardcodedText.length})</h4>
                    <p>These text elements should be converted to i18n keys:</p>
                    <div className="text-list">
                      {results.analysis.analysis.hardcodedText.map((item, index) => (
                        <div key={index} className="text-item">
                          <div><strong>Element:</strong> {item.name}</div>
                          <div><strong>Text:</strong> "{item.text}"</div>
                          {item.suggestion && (
                            <div><strong>Suggested Key:</strong> <code>{item.suggestion}</code></div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Proper i18n Keys */}
                {results.analysis.analysis.potentialI18nKeys.length > 0 && (
                  <div className="analysis-section">
                    <h4>✅ i18n Keys Found ({results.analysis.analysis.potentialI18nKeys.length})</h4>
                    <div className="text-list">
                      {results.analysis.analysis.potentialI18nKeys.map((item, index) => (
                        <div key={index} className="text-item">
                          <div><strong>Key:</strong> {item.key}</div>
                          {item.text && <div><strong>Current Text:</strong> "{item.text}"</div>}
                          <div><strong>Element:</strong> {item.name}</div>
                          {item.type && <div><strong>Type:</strong> {item.type === 'proper_i18n' ? 'Properly Configured' : 'Text as Key'}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Text Width Validation Results */}
                {results.analysis.analysis.widthValidation && !results.analysis.analysis.widthValidation.error && (
                  <div className="analysis-section">
                    <h4>📏 Text Width Validation</h4>
                    
                    {/* Width Validation Cache Stats */}
                    {results.analysis.analysis.widthValidation.cacheStats && (
                      <div style={{
                        padding: '12px 16px',
                        backgroundColor: '#e8f5e9',
                        border: '1px solid #4CAF50',
                        borderRadius: '6px',
                        marginBottom: '20px',
                        fontSize: '14px',
                        color: '#1b5e20'
                      }}>
                        <strong>⚡ 文本宽度验证缓存统计:</strong> 总请求: {results.analysis.analysis.widthValidation.cacheStats.total}, 
                        命中: {results.analysis.analysis.widthValidation.cacheStats.hits}, 
                        未命中: {results.analysis.analysis.widthValidation.cacheStats.misses}, 
                        命中率: {results.analysis.analysis.widthValidation.cacheStats.hitRate}, 
                        缓存大小: {results.analysis.analysis.widthValidation.cacheStats.cacheSize}
                      </div>
                    )}
                    
                    {/* Precision Note */}
                    {results.analysis.analysis.widthValidation.precisionNote && (
                      <div style={{
                        padding: '12px 16px',
                        backgroundColor: '#fff3cd',
                        border: '1px solid #ffc107',
                        borderRadius: '6px',
                        marginBottom: '20px',
                        fontSize: '14px',
                        color: '#856404'
                      }}>
                        {results.analysis.analysis.widthValidation.precisionNote}
                      </div>
                    )}
                    
                    {/* Summary Stats */}
                    <div className="coverage-stats">
                      <div className="stat">
                        <span className="stat-number">{results.analysis.analysis.widthValidation.summary.total}</span>
                        <span className="stat-label">Total Checks</span>
                      </div>
                      <div className="stat">
                        <span className="stat-number">{results.analysis.analysis.widthValidation.summary.valid}</span>
                        <span className="stat-label">Valid</span>
                      </div>
                      <div className="stat">
                        <span className="stat-number">{results.analysis.analysis.widthValidation.summary.overflow}</span>
                        <span className="stat-label">Overflow</span>
                      </div>
                      <div className="stat">
                        <span className="stat-number">{results.analysis.analysis.widthValidation.summary.successRate}%</span>
                        <span className="stat-label">Success Rate</span>
                      </div>
                    </div>

                    {/* Languages */}
                    <div className="languages-info">
                      <h5>Languages Checked:</h5>
                      <div className="language-tags">
                        {results.analysis.analysis.widthValidation.summary.languages.map((lang, index) => (
                          <span key={index} className="language-tag">{lang}</span>
                        ))}
                      </div>
                    </div>

                    {/* Overflow Issues */}
                    {results.analysis.analysis.widthValidation.details.overflow.length > 0 && (
                      <div className="overflow-issues">
                        <h5>🚨 Text Overflow Issues ({results.analysis.analysis.widthValidation.details.overflow.length})</h5>
                        <div className="overflow-table-container">
                          <table className="overflow-table">
                            <thead>
                              <tr>
                                <th>Key</th>
                                <th>Language</th>
                                <th>Text</th>
                                <th>Text Width</th>
                                <th>Container Width</th>
                                <th>Max Lines</th>
                                <th>Cause</th>
                                <th>字体</th>
                                <th>字号</th>
                                <th>字重</th>
                              </tr>
                            </thead>
                            <tbody>
                              {results.analysis.analysis.widthValidation.details.overflow.map((item, index) => {
                                // 格式化Container Width：两位小数，如果小数部分为0则不显示
                                const formatContainerWidth = (value) => {
                                  if (value === undefined || value === null) return 'N/A';
                                  const formatted = parseFloat(value).toFixed(2);
                                  // 如果小数部分为0，去掉小数部分
                                  return formatted.endsWith('.00') ? `${parseInt(formatted)}px` : `${formatted}px`;
                                };
                                
                                // 判断溢出原因
                                const getOverflowCause = () => {
                                  const maxLines = item.maxLines || 1;
                                  const requiredLines = item.requiredLines || 1;
                                  
                                  // 如果需要的行数超过最大行数，显示Required x Lines
                                  if (requiredLines > maxLines) {
                                    return `Required ${requiredLines} Lines`;
                                  }
                                  
                                  // 如果需要的行数在最大行数内，说明是单词过长且无法换行导致溢出
                                  return '单词过长且不符合换行规则，无法换行';
                                };
                                
                                return (
                                  <tr key={index}>
                                    <td>{item.key || 'N/A'}</td>
                                    <td>{item.language || 'N/A'}</td>
                                    <td>"{item.text || 'N/A'}"</td>
                                    <td>{item.width !== undefined ? `${item.width}px` : 'N/A'}</td>
                                    <td>{formatContainerWidth(item.container)}</td>
                                    <td>{item.maxLines !== undefined ? item.maxLines : 'N/A'}</td>
                                    <td>{getOverflowCause()}</td>
                                    <td>{item.fontStyle?.fontFamily || 'N/A'}</td>
                                    <td>{item.fontStyle?.fontSize ? `${item.fontStyle.fontSize}px` : 'N/A'}</td>
                                    <td>{item.fontStyle?.fontWeight !== null && item.fontStyle?.fontWeight !== undefined ? item.fontStyle.fontWeight : 'N/A'}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Valid Items */}
                    {results.analysis.analysis.widthValidation.details.valid.length > 0 && (
                      <div className="valid-items">
                        <h5>✅ Valid Text Fits ({results.analysis.analysis.widthValidation.details.valid.length})</h5>
                        <div className="text-list">
                          {results.analysis.analysis.widthValidation.details.valid.map((item, index) => (
                            <div key={index} className="text-item valid-item">
                              <div><strong>Key:</strong> {item.key}</div>
                              <div><strong>Language:</strong> {item.language}</div>
                              <div><strong>Text:</strong> "{item.text}"</div>
                              <div><strong>Width:</strong> {item.width}px / {item.container}px ({item.utilization}%)</div>
                              <div><strong>Max Lines:</strong> {item.maxLines || 1}</div>
                              <div><strong>Required Lines:</strong> {item.requiredLines || 1}</div>
                              {item.fontStyle && (
                                <div style={{ 
                                  fontSize: '12px', 
                                  color: '#333', 
                                  marginTop: '10px',
                                  padding: '8px',
                                  backgroundColor: '#f5f5f5',
                                  borderRadius: '4px',
                                  borderLeft: '3px solid #28a745'
                                }}>
                                  <div><strong>字体 (Font Family):</strong> {item.fontStyle.fontFamily}</div>
                                  <div><strong>字号 (Font Size):</strong> {item.fontStyle.fontSize}px</div>
                                  <div><strong>字重 (Font Weight):</strong> {item.fontStyle.fontWeight}</div>
                                  {item.fontStyle.letterSpacing !== 0 && (
                                    <div><strong>字间距 (Letter Spacing):</strong> {item.fontStyle.letterSpacing}px</div>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Comparison Results */}
                {results.analysis.analysis.comparison && (
                  <div className="analysis-section">
                    <h4>📊 Translation Coverage Analysis</h4>
                    <div className="coverage-stats">
                      <div className="stat">
                        <span className="stat-number">{results.analysis.analysis.comparison.totalKeysInFigma}</span>
                        <span className="stat-label">Keys in Figma</span>
                      </div>
                      <div className="stat">
                        <span className="stat-number">{results.analysis.analysis.comparison.totalKeysInCSV}</span>
                        <span className="stat-label">Keys in CSV</span>
                      </div>
                      <div className="stat">
                        <span className="stat-number">{results.analysis.analysis.comparison.coverage}%</span>
                        <span className="stat-label">Coverage</span>
                      </div>
                    </div>

                    {/* Missing Keys */}
                    {results.analysis.analysis.comparison.missingKeys.length > 0 && (
                      <div className="missing-keys">
                        <h5>❌ Missing Keys in CSV ({results.analysis.analysis.comparison.missingKeys.length})</h5>
                        <div className="text-list">
                          {results.analysis.analysis.comparison.missingKeys.map((item, index) => (
                            <div key={index} className="text-item">
                              {item.key}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Unused Keys - 已注释 */}
                    {/* {results.analysis.analysis.comparison.unusedKeys.length > 0 && (
                      <div className="unused-keys">
                        <h5>⚠️ Unused Keys in CSV ({results.analysis.analysis.comparison.unusedKeys.length})</h5>
                        <div className="text-list">
                          {results.analysis.analysis.comparison.unusedKeys.map((key, index) => (
                            <div key={index} className="text-item">
                              {key}
                            </div>
                          ))}
                        </div>
                      </div>
                    )} */}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;

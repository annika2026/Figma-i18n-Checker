# Google Fonts 字体回退功能说明

## 功能概述

实现了智能字体加载机制，当系统未安装指定字体时，自动从 Google Fonts 下载同名字体，确保跨平台测量一致性。

## 字体加载优先级

1. **系统字体** 💻
   - 首先检查系统是否已安装指定字体
   - 如果可用，直接使用系统字体

2. **Google Fonts** 🌐
   - 如果系统字体不可用，尝试从 Google Fonts 下载同名字体
   - 自动下载并缓存字体文件
   - 注册到 Canvas 供后续使用

3. **系统回退字体** ⚠️
   - 如果 Google Fonts 也没有找到，回退到系统默认字体
   - 使用原有的字体回退机制

## 实现细节

### 字体加载流程

```javascript
async loadFont(fontFamily, fontWeight) {
  // 1. 检查系统字体
  if (系统字体可用) {
    return { source: 'system' };
  }
  
  // 2. 从 Google Fonts 下载
  const fontPath = await downloadGoogleFont(fontFamily, fontWeight);
  if (fontPath) {
    registerFont(fontPath, { family: fontFamily, weight: fontWeight });
    return { source: 'google' };
  }
  
  // 3. 回退到系统默认字体
  return { source: 'fallback' };
}
```

### 字体缓存机制

- **缓存目录**：`.font-cache/`（项目根目录）
- **缓存文件命名**：`字体名_字重.woff2`（如 `Inter_500.woff2`）
- **缓存优势**：
  - 避免重复下载
  - 提高加载速度
  - 离线可用（首次下载后）

### Google Fonts API 使用

- **API URL 格式**：
  ```
  https://fonts.googleapis.com/css2?family=FontName:wght@400&display=swap
  ```
- **字体格式优先级**：
  1. woff2（优先，体积小，性能好）
  2. woff（备选）
- **字体名称处理**：
  - 自动处理空格和特殊字符
  - 支持带引号的字体名称

## 使用示例

### 自动字体加载

代码会自动处理字体加载，无需手动操作：

```javascript
const checker = new TextWidthChecker();

// 计算文本宽度（自动加载字体）
const width = await checker.calculateTextWidth('Hello', {
  fontSize: 16,
  fontFamily: 'Inter',  // 如果系统没有，会自动从 Google Fonts 下载
  fontWeight: 500
});
```

### 日志输出

运行时会看到详细的字体加载日志：

```
[字体加载] 系统字体不可用，尝试从 Google Fonts 加载: Inter
[Google Fonts] 尝试下载字体: Inter (500)
[Google Fonts] 找到字体文件 URL: https://fonts.gstatic.com/s/inter/v12/...
[Google Fonts] ✅ 字体已保存到缓存: .font-cache/Inter_500.woff2
[字体加载] ✅ 成功从 Google Fonts 加载: Inter
[精确测量] 文本: "Hello", 字体: 500 16px "Inter", 来源: 🌐 google, 宽度: 45.23px
```

## 优势

### 1. **跨平台一致性** ✅

- 不同电脑上使用相同的字体文件
- 测量结果更加一致
- 减少因字体差异导致的测量偏差

### 2. **自动化处理** ✅

- 无需手动安装字体
- 自动下载和缓存
- 首次使用后离线可用

### 3. **性能优化** ✅

- 字体文件缓存机制
- 避免重复下载
- 快速加载已缓存的字体

### 4. **兼容性好** ✅

- 支持 Google Fonts 中的大部分字体
- 自动处理字体名称和格式
- 优雅降级到系统字体

## 注意事项

### 1. **网络连接**

- 首次下载字体需要网络连接
- 如果无法访问 Google Fonts，会回退到系统字体
- 下载后的字体会缓存，后续无需网络

### 2. **字体可用性**

- Google Fonts 可能没有所有字体
- 某些专有字体（如 SF Pro）可能不在 Google Fonts
- 这种情况下会回退到系统字体

### 3. **字体版本**

- Google Fonts 的字体版本可能与 Figma 使用的版本不同
- 可能存在细微的度量差异
- 但通常差异很小（< 1%）

### 4. **缓存目录**

- 字体缓存目录：`.font-cache/`
- 建议添加到 `.gitignore`（字体文件较大）
- 首次运行会自动创建

## 配置建议

### 添加到 .gitignore

```gitignore
# 字体缓存
.font-cache/
```

### 字体缓存清理

如果需要清理字体缓存：

```bash
rm -rf .font-cache/
```

## 技术实现

### 依赖

- `canvas` - Canvas API（已包含 `registerFont`）
- `fs` - 文件系统操作
- `https`/`http` - 网络请求

### 关键方法

1. **`loadFont(fontFamily, fontWeight)`**
   - 字体加载主方法
   - 实现三级回退逻辑

2. **`downloadGoogleFont(fontFamily, fontWeight)`**
   - 从 Google Fonts 下载字体
   - 处理字体名称和格式

3. **`checkFontAvailable(fontString)`**
   - 检测字体是否可用
   - 通过测量宽度判断

4. **`fetchUrl(url, binary)`**
   - 通用 URL 获取方法
   - 支持文本和二进制数据

## 性能影响

- **首次使用**：需要下载字体（取决于网络速度）
- **后续使用**：从缓存加载（几乎无延迟）
- **内存占用**：字体文件通常 20-100KB
- **磁盘占用**：每个字体变体约 20-100KB

## 故障排除

### 问题：字体下载失败

**可能原因**：
- 网络连接问题
- Google Fonts 不可访问
- 字体名称不正确

**解决方案**：
- 检查网络连接
- 确认字体名称是否正确
- 查看日志中的错误信息

### 问题：字体注册失败

**可能原因**：
- 字体文件格式不支持
- 字体文件损坏

**解决方案**：
- 删除缓存文件，重新下载
- 检查日志中的错误信息

### 问题：测量结果仍不一致

**可能原因**：
- Google Fonts 字体版本与 Figma 不同
- 字体度量信息存在差异

**解决方案**：
- 这是正常现象，差异通常很小（< 1%）
- 考虑使用项目内嵌字体文件

## 总结

Google Fonts 字体回退功能提供了：

✅ **自动化字体加载** - 无需手动安装  
✅ **跨平台一致性** - 使用相同字体文件  
✅ **智能缓存机制** - 提高性能  
✅ **优雅降级** - 确保功能可用  

这个功能显著提高了跨平台测量的一致性，减少了因字体缺失导致的测量差异。


# xwlb
新闻联播开放数据

# 特殊说明

数据来源为 CCTV 官网，仅供学习使用，勿用于其他用途。http://tv.cctv.com/lm/xwlb/。

CCTV 保留所有版权，如有侵权，请联系作者及时删除。

## 本地开发设置

### 1. 安装依赖
```bash
npm install
```

### 2. 设置 Gemini API 密钥（用于 AI 新闻摘要）

1. 前往 [Google AI Studio](https://makersuite.google.com/app/apikey) 获取免费的 Gemini API 密钥
2. 复制环境变量模板：
   ```bash
   cp .env.example .env.local
   ```
3. 在 `.env.local` 文件中设置你的实际 API 密钥：
   ```
   GEMINI_API_KEY=你的实际API密钥
   ```

**重要说明：**
- `.env.example` 是模板文件（已提交到版本控制），显示需要哪些环境变量
- `.env.local` 是你的本地配置文件（已添加到 .gitignore，不会提交）

### 3. 构建和测试

```bash
# 构建网站
npm run build

# 本地测试
npm run dev
```

### 4. 生产部署

生产环境使用 GitHub Secrets 存储 API 密钥，无需本地配置。
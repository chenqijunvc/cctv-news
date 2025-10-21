# CCTV 新闻联播历史数据库

📺 一个现代化的 CCTV 新闻联播历史数据归档网站，托管在 Cloudflare Pages

## 🌟 功能特性

- 📊 **完整数据归档**: 收录从 2012 年至今的新闻联播数据
- 🔍 **智能搜索**: 支持标题、内容全文搜索
- 📱 **响应式设计**: 完美支持手机、平板、桌面设备
- ⚡ **极速访问**: 基于 Cloudflare CDN，全球加速
- 🤖 **自动更新**: 每日自动抓取最新新闻数据
- 📈 **数据统计**: 新闻数量、分类、时间分布统计
- 🎨 **现代界面**: 简洁美观的用户界面

## 🚀 在线访问

网站地址：`https://cctv-news-archive.pages.dev` (部署后可用)

## 📁 项目结构

```
├── assets/                 # 新闻数据文件
│   ├── 2012/
│   ├── 2013/
│   └── ...
├── static/                 # 静态资源
│   ├── css/
│   ├── js/
│   └── images/
├── dist/                   # 构建输出目录
├── .github/workflows/      # GitHub Actions 配置
├── index.js               # 数据抓取脚本
├── build.js               # 网站构建脚本
├── src/loadData.js        # 数据加载模块
└── analyze_news_data.py   # Python 数据分析工具
```

## 🛠️ 本地开发

### 安装依赖
```bash
npm install
```

### 抓取最新数据
```bash
npm run fetch-latest
```

### 构建网站
```bash
npm run build
```

### 本地预览
```bash
npm run dev
```
网站将在 `http://localhost:3000` 启动

## 🔧 部署到 Cloudflare Pages

### 1. 准备 GitHub 仓库
```bash
# 将项目推送到 GitHub
git add .
git commit -m "Initial commit"
git push origin main
```

### 2. 配置 Cloudflare Pages
1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 Pages 部分
3. 点击 "Create a project"
4. 连接到你的 GitHub 仓库
5. 配置构建设置：
   - **框架预设**: None
   - **构建命令**: `npm run deploy`
   - **构建输出目录**: `dist`
   - **Node.js 版本**: 18

### 3. 设置环境变量
在 Cloudflare Pages 项目设置中添加：
- `NODE_VERSION`: `18`

### 4. 配置 GitHub Actions 密钥
在 GitHub 仓库设置中添加以下 Secrets：
- `CLOUDFLARE_API_TOKEN`: Cloudflare API 令牌
- `CLOUDFLARE_ACCOUNT_ID`: Cloudflare 账户 ID

### 5. 自动部署
推送代码到 main 分支即可触发自动部署。GitHub Actions 将：
1. 抓取最新新闻数据
2. 构建静态网站
3. 部署到 Cloudflare Pages
4. 提交更新的数据到仓库

## 📊 数据分析

使用 Python 分析工具：

```python
from analyze_news_data import load_news_data

# 加载特定日期的数据
df = load_news_data('20251021')

# 查看数据结构
print(df.head())
print(f"共 {len(df)} 条新闻")

# 分析新闻分类
print(df['news_hl_tag'].value_counts())
```

## 🤖 自动化特性

### 定时任务
GitHub Actions 每日两次（北京时间 8:00 和 20:00）自动运行：
1. 获取最新新闻数据
2. 重新构建网站
3. 部署更新

### 手动触发
也可以在 GitHub Actions 页面手动触发部署。

## 📝 API 端点

网站提供以下 JSON API：

- `/api/index.json` - 数据总览
- `/api/recent.json` - 最近新闻
- `/api/search.json` - 搜索索引

## 🎨 界面预览

- **首页**: 数据统计、最新新闻、年份导航
- **归档页**: 按年份、月份浏览历史数据
- **详情页**: 单日新闻详细内容
- **搜索功能**: 实时搜索新闻内容

## 📈 性能优化

- ⚡ 静态网站生成，极速加载
- 🗜️ 资源压缩优化
- 🌐 Cloudflare CDN 全球加速
- 📱 响应式设计，多端适配

## 🔄 更新日志

- **v1.0.0**: 初版发布
  - 完整的新闻归档功能
  - 现代化 Web 界面
  - 自动化部署流程
  - 搜索和统计功能

## 📜 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

## ⚠️ 免责声明

本项目数据来源于 CCTV 官网，仅供学习和研究使用。请遵守相关法律法规，不得用于商业用途。

---

🔗 **相关链接**
- [CCTV 新闻联播官网](http://tv.cctv.com/lm/xwlb/)
- [Cloudflare Pages 文档](https://developers.cloudflare.com/pages/)
- [GitHub Actions 文档](https://docs.github.com/en/actions)
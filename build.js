const fs = require('fs-extra');
const path = require('path');
const moment = require('moment');
const { GoogleGenAI } = require('@google/genai');

// Load local environment variables for development
if (fs.existsSync('.env.local')) {
  require('dotenv').config({ path: '.env.local' });
}

// Build script to generate static website from JSON data
class NewsArchiveBuilder {
  constructor(options = {}) {
    this.assetsDir = './assets';
    this.outputDir = './dist';
    this.analysisDir = './analysis';
    this.templateDir = './templates';
    this.readAnalysisMode = options.readAnalysis || false;
    this.genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || 'your-api-key-here' });
  }

  // Extract summary from content field (text after first colon, strip HTML)
  extractSummaryFromContent(content, maxLength = 200) {
    if (!content) return '';
    
    // Remove HTML tags
    const textContent = content.replace(/<[^>]*>/g, '');
    
    // Find the first colon and take everything after it
    const colonIndex = textContent.indexOf('：');
    if (colonIndex !== -1) {
      return textContent.substring(colonIndex + 1).trim();
    }
    
    // Fallback: if no Chinese colon, try regular colon
    const regularColonIndex = textContent.indexOf(':');
    if (regularColonIndex !== -1) {
      return textContent.substring(regularColonIndex + 1).trim();
    }
    
    // If no colon found, return the whole text
    return textContent.trim();
  }

  // Truncate text and add read more link
  truncateSummary(text, maxLength = 100) {
    if (!text) return '';
    
    if (text.length <= maxLength) {
      return text;
    }
    
    const truncated = text.substring(0, maxLength).trim();
    return truncated;
  }

  // Clean title by removing bracketed prefixes like [视频]
  cleanTitle(title) {
    if (!title) return '';
    return title.replace(/^\[[^\]]*\]\s*/, '');
  }

  async build() {
    console.log('🏗️  Building CCTV News Archive...');
    
    // Clean and create output directory
    await fs.remove(this.outputDir);
    await fs.ensureDir(this.outputDir);
    await fs.ensureDir(this.analysisDir);
    
    // Copy static assets
    await this.copyStaticAssets();
    
    // Generate data index
    const newsIndex = await this.generateNewsIndex();
    
    // Generate HTML pages
    await this.generateHomePage(newsIndex);
    await this.generateArchivePages(newsIndex);
    await this.generateAPIEndpoints(newsIndex);
    
    console.log('✅ Build completed successfully!');
  }

  async copyStaticAssets() {
    console.log('📂 Copying static assets...');
    
    // Copy CSS, JS, images
    const staticDirs = ['css', 'js', 'images'];
    for (const dir of staticDirs) {
      const srcDir = path.join('./static', dir);
      const destDir = path.join(this.outputDir, dir);
      
      if (await fs.pathExists(srcDir)) {
        await fs.copy(srcDir, destDir);
      }
    }
  }

  async generateNewsIndex() {
    console.log('📊 Generating news index...');
    
    const index = {
      totalNews: 0,
      dateRange: { start: null, end: null },
      years: {},
      categories: {},
      recentNews: []
    };

    // Scan all years
    const years = await fs.readdir(this.assetsDir);
    
    for (const year of years) {
      const yearPath = path.join(this.assetsDir, year);
      if (!(await fs.stat(yearPath)).isDirectory()) continue;
      
      index.years[year] = { months: {}, totalNews: 0 };
      
      const files = await fs.readdir(yearPath);
      const jsonFiles = files.filter(f => f.endsWith('.json')).sort();
      
      for (const file of jsonFiles) {
        const filePath = path.join(yearPath, file);
        const date = file.replace('.json', '');
        
        try {
          const data = await fs.readJson(filePath);
          const newsCount = data.videoList ? data.videoList.length : 0;
          
          index.totalNews += newsCount;
          index.years[year].totalNews += newsCount;
          
          // Update date range
          if (!index.dateRange.start || date < index.dateRange.start) {
            index.dateRange.start = date;
          }
          if (!index.dateRange.end || date > index.dateRange.end) {
            index.dateRange.end = date;
          }
          
          // Group by month
          const month = date.substring(4, 6);
          if (!index.years[year].months[month]) {
            index.years[year].months[month] = [];
          }
          index.years[year].months[month].push({
            date,
            newsCount,
            file: `${year}/${file}`
          });
          
          // Collect categories
          if (data.videoList) {
            data.videoList.forEach(video => {
              if (video.news_hl_tag) {
                // Split by common delimiters and clean up
                const categories = video.news_hl_tag.split(/[,\s]+/).filter(cat => cat.trim());
                categories.forEach(cat => {
                  const cleanCat = cat.trim();
                  if (cleanCat && cleanCat !== 'General') {
                    index.categories[cleanCat] = (index.categories[cleanCat] || 0) + 1;
                  }
                });
              }
            });
          }
          
          // Add to recent news (last 30 days)
          const daysDiff = moment().diff(moment(date, 'YYYYMMDD'), 'days');
          if (daysDiff <= 30 && data.videoList) {
            index.recentNews.push(...data.videoList.map(video => ({
              ...video,
              date,
              year
            })));
          }
          
        } catch (error) {
          console.warn(`⚠️  Error reading ${filePath}:`, error.message);
        }
      }
    }
    
    // Sort recent news by date
    index.recentNews.sort((a, b) => b.date.localeCompare(a.date));
    index.recentNews = index.recentNews.slice(0, 100); // Keep latest 100
    
    return index;
  }

  // Generate AI-powered daily investment analysis using Gemini
  async generateDailySummary() {
    const today = moment().format('YYYYMMDD');
    const todayFile = path.join(this.assetsDir, '2025', `${today}.json`);
    const analysisFile = path.join(this.analysisDir, `${today}.json`);
    
    // If in read mode, try to read existing analysis
    if (this.readAnalysisMode) {
      if (await fs.pathExists(analysisFile)) {
        console.log(`📖 Reading existing analysis for ${today}`);
        try {
          const savedAnalysis = await fs.readJson(analysisFile);
          return {
            ...savedAnalysis,
            has_data: true
          };
        } catch (error) {
          console.warn(`⚠️ Failed to read saved analysis, generating new:`, error.message);
        }
      } else {
        console.log(`⚠️ No existing analysis found for ${today}, generating new`);
      }
    }
    
    // Generate new analysis
    
    try {
      const data = await fs.readJson(todayFile);
      const newsItems = data.videoList || [];
      
      if (newsItems.length === 0) {
        const emptyResult = {
          investment_thesis: '今日暂无新闻数据',
          total_news: 0,
          sector_opportunities: [],
          policy_catalysts: [],
          risk_factors: [],
          actionable_insights: [],
          market_outlook: '',
          shareable_insight: '',
          has_data: false
        };
        const timestamp = moment().format('YYYYMMDD_HHmmss');
        const analysisWithMeta = {
          ...emptyResult,
          generated_at: timestamp,
          news_date: today
        };
        await fs.writeJson(analysisFile, analysisWithMeta);
        console.log(`💾 Saved empty analysis to ${analysisFile}`);
        return emptyResult;
      }

      // Check if API key is available
      if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your-api-key-here' || process.env.GEMINI_API_KEY === 'your_local_gemini_api_key_here') {
        console.log('ℹ️  Gemini API key not configured, using fallback summary');
        const fallbackResult = this.generateFallbackSummary(newsItems);
        const timestamp = moment().format('YYYYMMDD_HHmmss');
        const analysisWithMeta = {
          ...fallbackResult,
          generated_at: timestamp,
          news_date: today
        };
        await fs.writeJson(analysisFile, analysisWithMeta);
        console.log(`💾 Saved fallback analysis to ${analysisFile}`);
        return fallbackResult;
      }

      // Prepare news data for Gemini - include full content for all items
      const newsText = newsItems.map((news, index) => {
        const baseInfo = `${index + 1}. ${this.cleanTitle(news.video_title)}\n   ${news.brief || '暂无简介'}\n   分类: ${news.news_hl_tag || '未分类'}`;
        
        if (news.video_detail?.content) {
          return `${baseInfo}\n   全文内容: ${news.video_detail.content}`;
        }
        return baseInfo;
      }).join('\n\n');

      const prompt = `你是一名专注于政策驱动投资的顶尖策略分析师，擅长从新闻联播中识别结构性投资机会。请基于以下${newsItems.length}条今日新闻，为机构投资者提供可直接纳入投资决策的深度分析。

--- 今日新闻 ---
${newsText}
--- 结束 ---

**核心任务：识别政策驱动的结构性趋势投资机会，评估投资时间窗口，提供具体配置建议**

请严格按照以下JSON格式返回分析结果：

{
  "summary": {
    "investment_quote": "根据今日内容，一句精炼的极具传播价值的投资金句（30字以内，要有洞察力和转发价值）",
    "core_logic": "用一段话（100-150字）概括今日新闻反应的最核心的投资逻辑，要有冲击力和记忆点"
  },
  "policy_catalysts": [
    {
      "theme": "政策主题（如：数字经济基建、农业现代化等）",
      "impact": "政策对市场的影响描述，如有资金规模请注明",
      "investment_angle": "一句话叙述具体的投资角度"
    }
  ],
  "sector_opportunities": [
    {
      "sector": "具体行业细分（避免宽泛表述），可列出多个",
      "conviction": "高确定性/中确定性/初步判断", （严格选择其一）
      "timeframe": "立即布局/近期关注/长期跟踪",（严格选择其一）
      "actionable_advice": "对可能受益的细分领域或股票类型给出明确的可执行投资建议"
    }
  ],
  "risk_factors": [
    {
      "factor": "具体风险因素描述",
      "impact": "风险对市场的影响",
      "mitigation": "对冲或规避的投资建议"
    }
  ]
}

**投资分析框架要求：**

1. **政策驱动优先** - 重点分析有明确政策背书的机会
2. **数据支撑** - 每个判断尽量引用新闻中的具体数据（金额、百分比、时间等）
3. **产业链思维** - 从上游到下游分析受益环节
4. **时间窗口明确** - 区分不同时间维度的机会
5. **风险收益匹配** - 每个机会都要对应风险评估

**内容质量要求：**

✅ **必须做到**：
- 每个建议都要具体到细分领域或公司类型
- 所有内容必须基于当日日新闻联播，尽量提供新闻中具体数据和规模的支持
- 区分政策预期与现实落地的时间差
- 用投资者熟悉的专业术语但避免jargon
- 同类项内容避免重复

❌ **严格避免**：
- 泛泛而谈的行业推荐（如"关注科技股"）
- 没有数据支撑的主观判断
- 与新闻内容无关的常规建议
- 使用英文术语或混合表达

**输出规范：**
- 全部使用纯中文，专业但易懂
- 投资建议要可立即执行
- 风险提示要有具体应对方案
- 保持客观中立，不夸大收益

现在，请基于今日新闻联播内容，提供专业的趋势投资分析：`;

      const response = await this.genAI.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
      });
      
      const text = response.candidates[0].content.parts[0].text;
      console.log('Gemini response text:', text);
      
      // Parse JSON response
      let analysis;
      try {
        // Clean the response text to extract JSON
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          analysis = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No JSON found in response');
        }
      } catch (parseError) {
        console.warn('⚠️ Failed to parse Gemini response, using fallback:', parseError.message);
        analysis = {
          summary: {
            investment_quote: '投资需谨慎，关注政策导向',
            core_logic: `今日共${newsItems.length}条新闻，主要涉及经济、科技、社会等多个领域。`
          },
          policy_catalysts: [],
          sector_opportunities: [],
          risk_factors: []
        };
      }
      
      // Ensure all fields are present with defaults
      analysis.summary = analysis.summary || {
        investment_quote: '投资需谨慎，关注政策导向',
        core_logic: `今日共${newsItems.length}条新闻，主要涉及经济、科技、社会等多个领域。`
      };
      analysis.policy_catalysts = analysis.policy_catalysts || [];
      analysis.sector_opportunities = analysis.sector_opportunities || [];
      analysis.risk_factors = analysis.risk_factors || [];
      
      console.log('Parsed analysis:', analysis);

      const result = {
        summary: analysis.summary,
        total_news: newsItems.length,
        policy_catalysts: analysis.policy_catalysts,
        sector_opportunities: analysis.sector_opportunities,
        risk_factors: analysis.risk_factors,
        has_data: true
      };

      // Save analysis with timestamp
      const timestamp = moment().format('YYYYMMDD_HHmmss');
      const analysisWithMeta = {
        ...result,
        generated_at: timestamp,
        news_date: today
      };
      await fs.writeJson(analysisFile, analysisWithMeta);
      console.log(`💾 Saved analysis to ${analysisFile}`);

      return result;
      
    } catch (error) {
      console.warn(`⚠️ Could not generate AI summary for today (${today}.json):`, error.message);
      return {
        summary: {
          investment_quote: '投资需谨慎，关注政策导向',
          core_logic: '今日新闻数据暂未更新或AI分析服务不可用'
        },
        total_news: '--',
        policy_catalysts: [],
        sector_opportunities: [],
        risk_factors: [],
        has_data: false
      };
    }
  }

  // Generate fallback summary when AI is not available
  generateFallbackSummary(newsItems) {
    // Extract categories and count them
    const categoryCount = {};
    newsItems.forEach(news => {
      if (news.news_hl_tag) {
        const categories = news.news_hl_tag.split(/[,\s]+/).filter(cat => cat.trim());
        categories.forEach(cat => {
          const cleanCat = cat.trim();
          if (cleanCat && cleanCat !== 'General') {
            categoryCount[cleanCat] = (categoryCount[cleanCat] || 0) + 1;
          }
        });
      }
    });
    
    // Get top categories
    const topCategories = Object.entries(categoryCount)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([cat, count]) => `${cat}(${count}条)`);
    
    const summaryText = topCategories.length > 0 ? 
      `今日共${newsItems.length}条新闻，主要涉及${topCategories.join('、')}等领域。` :
      `今日共${newsItems.length}条新闻，涵盖多个重要领域。`;

    return {
      summary: {
        investment_quote: '投资需谨慎，关注政策导向',
        core_logic: summaryText
      },
      total_news: newsItems.length,
      policy_catalysts: [],
      sector_opportunities: [],
      risk_factors: [],
      has_data: true
    };
  }

  async generateHomePage(index) {
    console.log('🏠 Generating home page...');

    // Generate AI-powered daily summary
    const dailySummary = await this.generateDailySummary();

    const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Trend Following AI - 你的趋势投资AI助手</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/css/style.css">
</head>
<body>
    <header>
        <div class="container">
            <a href="/" class="site-title">trendfollowing.ai</a>
            <nav class="nav-menu">
                <a href="#" class="nav-link active">CCTV Trend</a>
                <!-- <a href="#" class="nav-link">Product 2</a> -->
                <!-- <a href="#" class="nav-link">Product 3</a> -->
            </nav>
        </div>
    </header>

    <main class="container">
        <!-- Investment Analysis Dashboard -->
        <section class="investment-dashboard">
            <div class="dashboard-header">
                <h2>新闻联播趋势洞察</h2>
                <div class="dashboard-meta">
                    <span class="update-time">更新时间: ${dailySummary.has_data ? moment().format('MM-DD HH:mm') : '暂无数据'}</span>
                    <span class="news-count">${dailySummary.total_news || 0} 条新闻</span>
                </div>
            </div>

            <!-- Core Insights Hero Section -->
            <div class="core-insights">
                <div class="insights-content">
                    <div class="investment-quote">
                        <div class="quote-icon"></div>
                        <div class="quote-text">
                            ${dailySummary.summary?.investment_quote || '投资需谨慎，关注政策导向'}
                        </div>
                        <button class="btn-copy" onclick="copyQuote()" title="复制金句">
                            分享
                        </button>
                    </div>
                    <div class="core-logic">
                        <h3>核心逻辑</h3>
                        <p>${dailySummary.summary?.core_logic || '今日新闻数据暂未更新'}</p>
                    </div>
                </div>
            </div>

            <!-- Opportunity Heatmap -->
            <div class="opportunity-heatmap">
                <div class="heatmap-grid">
                    <!-- Policy Catalysts -->
                    ${dailySummary.policy_catalysts?.length > 0 ? `
                    <div class="heatmap-section">
                        <h3 class="section-title">
                            宏观视角
                        </h3>
                        <div class="cards-grid">
                            ${dailySummary.policy_catalysts.map(policy => `
                                <div class="policy-card heatmap-card">
                                    <h4>${policy.theme}</h4>
                                    <p class="card-preview">${policy.impact}</p>
                                    <div class="card-meta">
                                        <span class="meta-tag">${policy.investment_angle || '政策影响'}</span>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    ` : ''}

                    <!-- Investment Opportunities -->
                    ${dailySummary.sector_opportunities?.length > 0 ? `
                    <div class="heatmap-section">
                        <h3 class="section-title">
                            投资机会
                        </h3>
                        <div class="cards-grid">
                            ${dailySummary.sector_opportunities.map((opportunity, index) => {
                                // Calculate combined score for 3-step color theme
                                let convictionScore = 0;
                                if (opportunity.conviction?.includes('高确定性')) convictionScore = 3;
                                else if (opportunity.conviction?.includes('中确定性')) convictionScore = 2;
                                else convictionScore = 1;
                                
                                let timeframeScore = 0;
                                if (opportunity.timeframe?.includes('立即布局')) timeframeScore = 3;
                                else if (opportunity.timeframe?.includes('近期关注')) timeframeScore = 2;
                                else timeframeScore = 1;
                                
                                const combinedScore = Math.min(convictionScore + timeframeScore, 6); // Max 6
                                let convictionClass = 'conviction-low';
                                let timeframeClass = 'timeframe-low';
                                if (combinedScore >= 5) {
                                    convictionClass = 'conviction-high';
                                    timeframeClass = 'timeframe-high';
                                } else if (combinedScore >= 3) {
                                    convictionClass = 'conviction-medium';
                                    timeframeClass = 'timeframe-medium';
                                }
                                
                                return `
                                <div class="opportunity-card heatmap-card">
                                    <h4>${opportunity.sector}</h4>
                                    <p class="card-preview">${opportunity.actionable_advice}</p>
                                    <div class="card-meta">
                                        <span class="meta-tag ${convictionClass}">${opportunity.conviction || '待评估'}</span>
                                        <span class="meta-tag ${timeframeClass}">${opportunity.timeframe || '短期'}</span>
                                    </div>
                                </div>
                            `}).join('')}
                        </div>
                    </div>
                    ` : ''}

                    <!-- Risk Assessment -->
                    ${dailySummary.risk_factors?.length > 0 ? `
                    <div class="heatmap-section">
                        <h3 class="section-title">
                            风险因子
                        </h3>
                        <div class="cards-grid">
                            ${dailySummary.risk_factors.map(risk => `
                                <div class="risk-card heatmap-card">
                                    <h4>${risk.factor}</h4>
                                    <p class="card-preview">${risk.impact}</p>
                                    <div class="card-meta">
                                        <span class="meta-tag risk-level">${risk.mitigation}</span>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    ` : ''}
                </div>
            </div>
        </section>

        <script>
            // Pass analysis data to JavaScript
            window.analysisData = ${JSON.stringify({
                policy_catalysts: dailySummary.policy_catalysts || [],
                sector_opportunities: dailySummary.sector_opportunities || [],
                risk_factors: dailySummary.risk_factors || [],
                summary: dailySummary.summary || {}
            }).replace(/</g, '\\u003c').replace(/>/g, '\\u003e')};
        </script>
        <section>
            <h2>最新新闻</h2>
            <div class="news-grid">
                ${index.recentNews.slice(0, 6).map(news => `
                    <div class="news-card">
                        <a href="/archive/${news.year}/${news.date}.html#${news.video_id}" class="news-title-link">
                            <h4>${this.cleanTitle(news.video_title)}</h4>
                        </a>
                        <div class="news-meta">
                            <span>${moment(news.date, 'YYYYMMDD').format('YYYY-MM-DD')}</span>
                        </div>
                        <p class="news-brief">${this.truncateSummary(this.extractSummaryFromContent(news.video_detail?.content), 100)}...</p>
                        <a href="/archive/${news.year}/${news.date}.html#${news.video_id}" class="read-more">阅读更多</a>
                    </div>
                `).join('')}
            </div>
        </section>

        <section class="search-section">
            <h2>搜索新闻</h2>
            <div class="search-container">
                <input type="text" id="searchInput" placeholder="输入关键词搜索...">
            </div>
            <div class="filter-controls">
                <select id="yearFilter">
                    <option value="">选择年份</option>
                    ${Object.keys(index.years).sort().reverse().map(year => `<option value="${year}">${year}年</option>`).join('')}
                </select>
                <select id="monthFilter" disabled>
                    <option value="">选择月份</option>
                    ${Array.from({length: 12}, (_, i) => {
                      const month = (i + 1).toString().padStart(2, '0');
                      return `<option value="${month}">${month}月</option>`;
                    }).join('')}
                </select>
                <select id="dateFilter" disabled>
                    <option value="">选择日期</option>
                    ${Array.from({length: 31}, (_, i) => {
                      const date = (i + 1).toString().padStart(2, '0');
                      return `<option value="${date}">${date}日</option>`;
                    }).join('')}
                </select>
                <select id="categoryFilter">
                    <option value="">所有分类</option>
                    ${Object.keys(index.categories).sort().map(cat => `<option value="${cat}">${cat}</option>`).join('')}
                </select>
            </div>
            <div id="searchResults"></div>
        </section>

        <!-- <section>
            <h2>按年份浏览</h2>
            <div class="archive-nav">
                ${Object.entries(index.years).sort().reverse().map(([year, data]) => `
                    <a href="/archive/${year}/" class="year-link">${year}年</a>
                `).join('')}
            </div>
        </section> -->
    </main>

    <footer>
        <div class="container">
            <p>数据来源：CCTV 官网 | 仅供学习使用</p>
        </div>
    </footer>

    <script src="/js/main.js"></script>
</body>
</html>`;
    
    await fs.writeFile(path.join(this.outputDir, 'index.html'), html);
  }

  async generateArchivePages(index) {
    console.log('📄 Generating archive pages...');
    
    // Generate year index pages
    for (const [year, yearData] of Object.entries(index.years)) {
      await fs.ensureDir(path.join(this.outputDir, 'archive', year));
      
      // Year index page
      const yearHtml = this.generateYearPage(year, yearData);
      await fs.writeFile(path.join(this.outputDir, 'archive', year, 'index.html'), yearHtml);
      
      // Individual day pages
      for (const [month, days] of Object.entries(yearData.months)) {
        for (const day of days) {
          const dayHtml = await this.generateDayPage(day);
          await fs.writeFile(path.join(this.outputDir, 'archive', year, `${day.date}.html`), dayHtml);
        }
      }
    }
  }

  generateYearPage(year, yearData) {
    return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${year}年新闻归档 - CCTV 新闻联播</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/css/style.css">
</head>
<body>
    <header>
        <div class="container">
            <a href="/" class="site-title">trendfollowing.ai</a>
            <nav class="nav-menu">
                <a href="#" class="nav-link active">CCTV Trend</a>
                <!-- <a href="#" class="nav-link">Product 2</a> -->
                <!-- <a href="#" class="nav-link">Product 3</a> -->
            </nav>
        </div>
    </header>

    <main class="container">
        <h1>${year}年</h1>
        <p style="text-align: center; margin-bottom: 3rem; color: #64748b;">
            共 ${yearData.totalNews} 条新闻
        </p>

        <div class="news-grid">
            ${Object.entries(yearData.months).map(([month, days]) => `
                <div class="news-card">
                    <h3>${parseInt(month)}月</h3>
                    <div style="margin-top: 1rem;">
                        ${days.map(day => `
                            <a href="${day.date}.html" style="display: block; padding: 0.5rem 0; color: var(--accent-color); text-decoration: none; border-bottom: 1px solid var(--border-color);">
                                ${day.date.substring(6, 8)}日 (${day.newsCount}条)
                            </a>
                        `).join('')}
                    </div>
                </div>
            `).join('')}
        </div>
    </main>

    <footer>
        <div class="container">
            <p>数据来源：CCTV 官网 | 仅供学习使用</p>
        </div>
    </footer>

    <script src="/js/main.js"></script>
</body>
</html>`;
  }

  async generateDayPage(dayInfo) {
    const filePath = path.join(this.assetsDir, dayInfo.file);
    const data = await fs.readJson(filePath);
    
    return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${moment(dayInfo.date, 'YYYYMMDD').format('YYYY年MM月DD日')}新闻 - CCTV 新闻联播</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/css/style.css">
</head>
<body>
    <header>
        <div class="container">
            <a href="/" class="site-title">trendfollowing.ai</a>
            <nav class="nav-menu">
                <a href="#" class="nav-link active">CCTV Trend</a>
                <!-- <a href="#" class="nav-link">Product 2</a> -->
                <!-- <a href="#" class="nav-link">Product 3</a> -->
            </nav>
        </div>
    </header>

    <main class="container">
        <h1>${moment(dayInfo.date, 'YYYYMMDD').format('YYYY年MM月DD日')}</h1>
        <p style="text-align: center; margin-bottom: 3rem; color: #64748b;">
            共 ${data.videoList.length} 条新闻
        </p>

        <div class="news-list">
            ${data.videoList.map(video => `
                <article id="${video.video_id}" class="news-item">
                    <h2>${this.cleanTitle(video.video_title)}</h2>
                    <div class="news-meta" style="flex-direction: row; flex-wrap: wrap; gap: 1rem;">
                        <span>⏰ ${video.video_length}</span>
                        <span>🏷️ ${video.news_hl_tag || 'General'}</span>
                        <span>📅 ${video.pub_date}</span>
                    </div>
                    ${video.video_image ? `<img src="${video.video_image}" alt="${video.video_title}" class="news-image" style="max-width: 100%; height: auto; border-radius: 0.5rem; margin: 1rem 0;">` : ''}
                    <p class="news-brief">${video.brief || ''}</p>
                    ${video.video_detail && video.video_detail.content ? `
                        <div class="news-content" style="margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid var(--border-color);">
                            ${video.video_detail.content}
                        </div>
                    ` : ''}
                    <div class="news-actions" style="margin-top: 2rem;">
                        <a href="${video.video_url}" target="_blank" class="btn-primary">观看视频</a>
                        <button onclick="shareNews('${video.video_title}', '${video.video_url}')" class="btn-secondary">分享</button>
                    </div>
                </article>
            `).join('')}
        </div>
    </main>

    <footer>
        <div class="container">
            <p>数据来源：CCTV 官网 | 仅供学习使用</p>
        </div>
    </footer>

    <script src="/js/main.js"></script>
</body>
</html>`;
  }

  async generateAPIEndpoints(index) {
    console.log('🔌 Generating API endpoints...');
    
    // Create API directory
    await fs.ensureDir(path.join(this.outputDir, 'api'));
    
    // Main index API
    await fs.writeJson(path.join(this.outputDir, 'api', 'index.json'), index);
    
    // Recent news API
    await fs.writeJson(path.join(this.outputDir, 'api', 'recent.json'), {
      news: index.recentNews.slice(0, 50)
    });
    
    // Search index for client-side search
    const searchIndex = [];
    for (const [year, yearData] of Object.entries(index.years)) {
      for (const [month, days] of Object.entries(yearData.months)) {
        for (const day of days) {
          const filePath = path.join(this.assetsDir, day.file);
          try {
            const data = await fs.readJson(filePath);
            data.videoList.forEach(video => {
              searchIndex.push({
                id: video.video_id,
                title: video.video_title,
                brief: video.brief || '',
                category: video.news_hl_tag || '',
                date: day.date,
                year: year,
                month: day.date.substring(4, 6),
                day: day.date.substring(6, 8),
                url: `/archive/${year}/${day.date}.html#${video.video_id}`
              });
            });
          } catch (error) {
            console.warn(`⚠️  Error reading ${filePath} for search index`);
          }
        }
      }
    }
    
    await fs.writeJson(path.join(this.outputDir, 'api', 'search.json'), { index: searchIndex });
  }
}

// Run the build
if (require.main === module) {
  const readAnalysis = process.argv.includes('--read-analysis');
  const builder = new NewsArchiveBuilder({ readAnalysis });
  console.log(`🏗️ Building in ${readAnalysis ? 'READ ANALYSIS' : 'GENERATE NEW'} mode`);
  builder.build().catch(console.error);
}

module.exports = NewsArchiveBuilder;
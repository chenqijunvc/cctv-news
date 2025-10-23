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
    this.forceApiMode = options.forceApi || false;
    this.daysLimit = options.daysLimit || null; // Global variable to control days limit (null = no limit, number = limit to X days)
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
    // Get Beijing time (UTC+8) to match repository timezone
    const getBeijingTime = () => {
      return moment().utcOffset('+08:00');
    };
    
    const today = getBeijingTime().format('YYYYMMDD');
    const todayFile = path.join(this.assetsDir, '2025', `${today}.json`);
    const analysisFile = path.join(this.analysisDir, `${today}.json`);
    
    // Step 1: Check if today's news JSON exists and is not empty FIRST
    let newsItems = [];
    let targetDate = today;
    let fallbackDate = null;
    
    try {
      const data = await fs.readJson(todayFile);
      newsItems = data.videoList || [];
      if (newsItems.length > 0) {
        console.log(`🤖 Generating AI analysis for ${today} (${newsItems.length} news items)`);
      }
    } catch (error) {
      console.log(`⚠️ Today's news file not found or unreadable: ${today}.json`);
    }
    
    // Step 2: If today's news exists and is not empty, check if we need to regenerate analysis
    if (newsItems.length > 0) {
      if (!this.forceApiMode && await fs.pathExists(analysisFile)) {
        try {
          const savedAnalysis = await fs.readJson(analysisFile);
          if (savedAnalysis.total_news > 0 && savedAnalysis.has_data !== false && savedAnalysis.news_date === today) {
            console.log(`📖 Using existing analysis for ${today} (${savedAnalysis.total_news} news items)`);
            return savedAnalysis;
          }
        } catch (error) {
          console.warn(`⚠️ Failed to read cached analysis, will regenerate:`, error.message);
        }
      }
      // Generate new analysis for today's news
      console.log(`🤖 Generating fresh AI analysis for ${today} (${newsItems.length} news items)`);
    } else {
      // Step 3: Today's news is empty, find the last available date with non-empty news JSON
      console.log(`⚠️ Today's news is empty, finding latest available news data...`);
      
      let checkDate = getBeijingTime().subtract(1, 'day');
      
      for (let i = 0; i < 7; i++) {
        const dateStr = checkDate.format('YYYYMMDD');
        const newsFile = path.join(this.assetsDir, checkDate.format('YYYY'), `${dateStr}.json`);
        
        try {
          if (await fs.pathExists(newsFile)) {
            const newsData = await fs.readJson(newsFile);
            const hasNews = newsData.videoList && newsData.videoList.length > 0;
            
            if (hasNews) {
              targetDate = dateStr;
              newsItems = newsData.videoList;
              console.log(`📅 Found latest news data from ${targetDate} (${newsItems.length} items)`);
              break;
            }
          }
        } catch (error) {
          // Continue checking other dates
        }
        
        checkDate.subtract(1, 'day');
      }
      
      if (newsItems.length === 0) {
        // No news data available at all, create empty analysis
        const emptyResult = {
          summary: {
            investment_quote: '今日暂无新闻数据',
            core_logic: '今日暂无新闻数据，无法生成投资分析'
          },
          total_news: 0,
          opportunity_analysis: [],
          has_data: false
        };
        const timestamp = getBeijingTime().format('YYYYMMDD_HHmmss');
        const analysisWithMeta = {
          ...emptyResult,
          generated_at: timestamp,
          news_date: today
        };
        await fs.writeJson(analysisFile, analysisWithMeta);
        console.log(`💾 Saved empty analysis to ${analysisFile}`);
        return emptyResult;
      }
    }
    
    // Step 3: For fallback dates, check if analysis JSON exists and is not empty
    if (targetDate !== today) {
      const targetAnalysisFile = path.join(this.analysisDir, `${targetDate}.json`);
      if (!this.forceApiMode && await fs.pathExists(targetAnalysisFile)) {
        try {
          const targetAnalysis = await fs.readJson(targetAnalysisFile);
          if (targetAnalysis.total_news > 0 && targetAnalysis.has_data !== false) {
            console.log(`📖 Using existing analysis from ${targetDate} for today`);
            // Return the target analysis but update metadata for today
            const todayAnalysis = {
              ...targetAnalysis,
              news_date: today,
              fallback_from: targetDate
            };
            return todayAnalysis;
          }
        } catch (error) {
          console.warn(`⚠️ Failed to read target analysis from ${targetDate}, will generate new:`, error.message);
        }
      }
      
      fallbackDate = targetDate;
      console.log(`🤖 Generating AI analysis using news data from ${targetDate} for today`);
    }

    // Generate AI analysis
    try {
      // Check if API key is available
      if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your-api-key-here' || process.env.GEMINI_API_KEY === 'your_local_gemini_api_key_here') {
        console.log('ℹ️  Gemini API key not configured, using fallback summary');
        const fallbackResult = this.generateFallbackSummary(newsItems);
        const timestamp = getBeijingTime().format('YYYYMMDD_HHmmss');
        const analysisWithMeta = {
          ...fallbackResult,
          generated_at: timestamp,
          news_date: fallbackDate || today
        };
        const actualAnalysisFile = path.join(this.analysisDir, `${fallbackDate || today}.json`);
        await fs.writeJson(actualAnalysisFile, analysisWithMeta);
        console.log(`💾 Saved fallback analysis to ${actualAnalysisFile}`);
        return fallbackResult;
      }

      // Prepare news data for Gemini - include full content for all items
      const newsText = newsItems.map((news, index) => {
        const baseInfo = `${index + 1}. ${this.cleanTitle(news.video_title)}\n   ID: ${news.video_id}\n   ${news.brief || '暂无简介'}\n   分类: ${news.news_hl_tag || '未分类'}`;
        
        if (news.video_detail?.content) {
          return `${baseInfo}\n   全文内容: ${news.video_detail.content}`;
        }
        return baseInfo;
      }).join('\n\n');

      const prompt = `你是一名专注于政策驱动投资的顶尖策略分析师，擅长从新闻联播中识别结构性投资机会。请基于以下${newsItems.length}条${fallbackDate ? `${fallbackDate}的` : '今日'}新闻，为机构投资者提供可直接纳入投资决策的深度分析${fallbackDate ? `（今日暂无新闻，此分析基于最近的新闻数据）` : ''}。

--- ${fallbackDate ? `${fallbackDate}新闻` : '今日新闻'} ---
${newsText}
--- 结束 ---

**核心任务：快速总结每日新闻，识别最相关投资机会，进行深度分析，提供投资角度和可执行建议**

请严格按照以下JSON格式返回分析结果：

{
  "summary": {
    "investment_quote": "根据今日内容，一句精炼的极具传播价值的投资金句（30字以内，要有洞察力和转发价值）",
    "core_logic": "用一段话（100-150字）概括今日新闻反应的最核心的投资逻辑，要有冲击力和记忆点"
  },
  "opportunity_analysis": [
    {
      "theme": "政策主题（按新闻相关性由高到低排序，最好能生成六个或以上，但不要编造与新闻无关的主题）",
      "impact": "政策对市场的影响描述，如有资金规模请注明",
      "actionable_advice": "一句话叙述具体的投资角度，对可能受益的细分领域或股票类型给出明确的可执行投资建议",
      "core_stocks": ["string"], // 6-8只核心股票[名称(代码)]，选相关性最高，流动性好的龙头
      "sector_etfs": ["string"], // 1-4只相关性最高的行业ETF[名称(代码)]
      "related_news_ids": ["string"] // 用于生成这个政策主题的新闻video_id，list the one most relevant ID
  ]
}

**投资分析框架要求：**

1. **政策驱动优先** - 重点分析有明确政策背书的机会
2. **数据支撑** - 每个判断尽量引用新闻中的具体数据（金额、百分比、时间等）
3. **产业链思维** - 从上游到下游分析受益环节
4. **可操作性** - 提供具体股票和ETF建议，便于立即执行

**内容质量要求：**

✅ **必须做到**：
- 每个机会都要提供至少5只相关股票和1只ETF，但不要胡乱编造
- 所有内容必须基于当日新闻联播，尽量提供新闻中具体数据和规模的支持
- 股票选择流动性好的行业龙头，ETF选择跟踪相关行业的宽基指数
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
          opportunity_analysis: []
        };
      }
      
      // Ensure all fields are present with defaults
      analysis.summary = analysis.summary || {
        investment_quote: '投资需谨慎，关注政策导向',
        core_logic: `今日共${newsItems.length}条新闻，主要涉及经济、科技、社会等多个领域。`
      };
      analysis.opportunity_analysis = analysis.opportunity_analysis || [];
      
      console.log('Parsed analysis:', analysis);

      const result = {
        summary: analysis.summary,
        total_news: newsItems.length,
        opportunity_analysis: analysis.opportunity_analysis,
        has_data: true,
        ...(fallbackDate ? { fallback_from: fallbackDate } : {})
      };

      // Save analysis with timestamp
      const timestamp = getBeijingTime().format('YYYYMMDD_HHmmss');
      const analysisWithMeta = {
        ...result,
        generated_at: timestamp,
        news_date: fallbackDate || today
      };
      const actualAnalysisFile = path.join(this.analysisDir, `${fallbackDate || today}.json`);
      await fs.writeJson(actualAnalysisFile, analysisWithMeta);
      console.log(`💾 Saved analysis to ${actualAnalysisFile}`);

      return result;
      
    } catch (error) {
      console.warn(`⚠️ Could not generate AI summary for today (${today}.json):`, error.message);
      return {
        summary: {
          investment_quote: '投资需谨慎，关注政策导向',
          core_logic: '今日新闻数据暂未更新或AI分析服务不可用'
        },
        total_news: '--',
        opportunity_analysis: [],
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
      opportunity_analysis: [],
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
                <a href="/" class="nav-link active">CCTV Trend</a>
                <!-- <a href="#" class="nav-link">Product 2</a> -->
                <!-- <a href="#" class="nav-link">Product 3</a> -->
            </nav>
        </div>
    </header>

    <main class="container">
        <!-- Introduction Section -->
        <section class="intro-section">
            <h1 style="font-size: 2.8rem; font-weight: 700; color: #1a202c; text-align: center; margin: 0 0 1.5rem 0; line-height: 1.1;">新闻联播投资分析</h1>
            <p style="font-size: 1.2rem; color: #4a5568; text-align: center; margin: 0; line-height: 1.6; max-width: 650px; margin: 0 auto; font-weight: 400;">
                实时解码新闻联播，AI识别趋势投资机会。
            </p>
        </section>

        <!-- Trend Insights Section -->
        <section>
            <h2>趋势洞察</h2>
            <div class="analysis-summary">
                <div class="daily-quote-card">
                    <h3>今日观点</h3>
                    <p> ${dailySummary.summary?.investment_quote || '投资需谨慎，关注政策导向趋势'} </p>
                    <div class="meta-info">
                        <button class="btn-copy read-more" onclick="copyQuote()" title="复制金句">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="18" cy="5" r="3"></circle>
                                <circle cx="6" cy="12" r="3"></circle>
                                <circle cx="18" cy="19" r="3"></circle>
                                <path d="m8.5 14 7-7"></path>
                                <path d="m8.5 10 7 7"></path>
                            </svg>
                            分享
                        </button>
                    </div>
                </div>
                <div class="core-logic-card">
                    <h3>核心逻辑</h3>
                    <p>${dailySummary.summary?.core_logic || '今日新闻数据暂未更新'}</p>
                    <div class="meta-info" style="display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;">
                        <span class="update-time">更新时间: ${dailySummary.has_data ? new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '暂无数据'}</span>
                        ${dailySummary.fallback_from ? `<span class="fallback-notice" style="color: #f59e0b; font-size: 0.8rem;">基于${moment(dailySummary.fallback_from, 'YYYYMMDD').format('MM-DD')}分析</span>` : ''}
                        <a href="/archive/${moment(dailySummary.fallback_from || moment().format('YYYYMMDD'), 'YYYYMMDD').format('YYYY')}/${dailySummary.fallback_from || moment().format('YYYYMMDD')}.html" class="news-count read-more">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                <polyline points="14,2 14,8 20,8"></polyline>
                                <line x1="16" y1="13" x2="8" y2="13"></line>
                                <line x1="16" y1="17" x2="8" y2="17"></line>
                                <polyline points="10,9 9,9 8,9"></polyline>
                            </svg>
                            ${dailySummary.total_news || 0} 条新闻
                        </a>
                    </div>
                </div>
            </div>
        </section>

        <!-- Investment Opportunities Section -->
        ${dailySummary.opportunity_analysis?.length > 0 ? `
        <section>
            <h2>投资机会</h2>
            <div class="cards-grid">
                ${dailySummary.opportunity_analysis.map((opportunity, index) => `
                    <div class="opportunity-card">
                        ${opportunity.related_news_ids?.length > 0 ? 
                            `<h4><a href="/archive/${moment(dailySummary.fallback_from || moment().format('YYYYMMDD'), 'YYYYMMDD').format('YYYY')}/${dailySummary.fallback_from || moment().format('YYYYMMDD')}.html#${opportunity.related_news_ids[0]}" style="color: inherit; text-decoration: none;">${opportunity.theme}</a></h4>` :
                            `<h4>${opportunity.theme}</h4>`
                        }
                        ${opportunity.core_stocks?.length > 0 ? `
                        <div class="stocks-section">
                            <h5>核心标的：</h5>
                            <div class="stocks-list">
                                ${opportunity.core_stocks.map(stock => `<button class="stock-tag" onclick="copyToClipboard('${stock}', this)">${stock}</button>`).join('')}
                            </div>
                        </div>
                        ` : ''}
                        ${opportunity.sector_etfs?.length > 0 ? `
                        <div class="etfs-section">
                            <h5>行业ETF：</h5>
                            <div class="etfs-list">
                                ${opportunity.sector_etfs.map(etf => `<button class="etf-tag" onclick="copyToClipboard('${etf}', this)">${etf}</button>`).join('')}
                            </div>
                        </div>
                        ` : ''}
                        <div class="actionable-advice-section">
                            <span class="actionable-advice">${opportunity.actionable_advice}</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        </section>
        ` : ''}

        <!-- Latest News Section - Hidden for now
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
        -->

        <!-- Search News Section - Hidden for now
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
        -->

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
    const limitText = this.daysLimit ? `past ${this.daysLimit} days` : 'all available data';
    console.log(`📄 Generating archive pages (${limitText})...`);
    
    // Calculate cutoff date if daysLimit is set
    const cutoffDate = this.daysLimit ? moment().subtract(this.daysLimit, 'days').format('YYYYMMDD') : null;
    
    // Generate year index pages (only for years that have recent data if limited)
    for (const [year, yearData] of Object.entries(index.years)) {
      // Check if this year has any days within the limit
      let hasData = false;
      for (const [month, days] of Object.entries(yearData.months)) {
        for (const day of days) {
          if (!cutoffDate || day.date >= cutoffDate) {
            hasData = true;
            break;
          }
        }
        if (hasData) break;
      }
      
      if (!hasData) continue;
      
      await fs.ensureDir(path.join(this.outputDir, 'archive', year));
      
      // Year index page (filtered if daysLimit is set)
      const filteredYearData = {
        months: {},
        totalNews: 0
      };
      
      for (const [month, days] of Object.entries(yearData.months)) {
        const filteredDays = cutoffDate ? days.filter(day => day.date >= cutoffDate) : days;
        if (filteredDays.length > 0) {
          filteredYearData.months[month] = filteredDays;
          filteredYearData.totalNews += filteredDays.reduce((sum, day) => sum + day.newsCount, 0);
        }
      }
      
      const yearHtml = this.generateYearPage(year, filteredYearData);
      await fs.writeFile(path.join(this.outputDir, 'archive', year, 'index.html'), yearHtml);
      
      // Individual day pages (filtered if daysLimit is set)
      for (const [month, days] of Object.entries(yearData.months)) {
        for (const day of days) {
          if (!cutoffDate || day.date >= cutoffDate) {
            const dayHtml = await this.generateDayPage(day);
            await fs.writeFile(path.join(this.outputDir, 'archive', year, `${day.date}.html`), dayHtml);
          }
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
                <a href="/" class="nav-link active">CCTV Trend</a>
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
                <a href="/" class="nav-link active">CCTV Trend</a>
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
                <article class="news-item">
                    <h2 id="${video.video_id}">${this.cleanTitle(video.video_title)}</h2>
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
                        <a href="/" class="btn-secondary">返回主页</a>
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
    const limitText = this.daysLimit ? `past ${this.daysLimit} days` : 'all available data';
    console.log(`📊 Generating search index (${limitText})...`);
    
    const searchIndex = [];
    const cutoffDate = this.daysLimit ? moment().subtract(this.daysLimit, 'days').format('YYYYMMDD') : null;
    
    for (const [year, yearData] of Object.entries(index.years)) {
      for (const [month, days] of Object.entries(yearData.months)) {
        for (const day of days) {
          if (!cutoffDate || day.date >= cutoffDate) {
            const filePath = path.join(this.assetsDir, day.file);
            try {
              const data = await fs.readJson(filePath);
              data.videoList.forEach(video => {
                searchIndex.push({
                  id: video.video_id,
                  title: this.cleanTitle(video.video_title),
                  brief: (video.brief || '').substring(0, 200), // Limit brief length
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
    }
    
    console.log(`📊 Generated search index with ${searchIndex.length} items`);
    await fs.writeJson(path.join(this.outputDir, 'api', 'search.json'), { index: searchIndex });
  }
}

// Run the build
if (require.main === module) {
  const forceApi = process.argv.includes('--force-api');
  
  // Parse days limit from command line (default to 7, use null for no limit)
  let daysLimit = 7; // Default to 7 days
  const daysArg = process.argv.find(arg => arg.startsWith('--days='));
  if (daysArg) {
    const daysValue = daysArg.split('=')[1];
    daysLimit = daysValue === 'all' ? null : parseInt(daysValue);
  }
  
  const builder = new NewsArchiveBuilder({ forceApi, daysLimit });
  const limitText = daysLimit ? `${daysLimit} days` : 'all data';
  console.log(`🏗️ Building in ${forceApi ? 'FORCE API' : 'SMART CACHE'} mode (limiting to ${limitText})`);
  builder.build().catch(console.error);
}

module.exports = NewsArchiveBuilder;
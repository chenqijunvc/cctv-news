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
    await this.generateAnalysisPage(newsIndex);
    await this.generateOpportunitiesPage(newsIndex);
    await this.generateStockTrackingPage();
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
    
    // Copy stock data files
    const stockDataDir = './stock_data';
    const stockDataDestDir = path.join(this.outputDir, 'stock_data');
    
    if (await fs.pathExists(stockDataDir)) {
      await fs.copy(stockDataDir, stockDataDestDir);
      console.log('📊 Copied stock data files');
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
          has_data: false,
          news_date: today
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
        return { ...fallbackResult, news_date: fallbackDate || today };
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
      "sector_etfs": ["string"], // 1-4只相关性最高的行业ETF[名称(代码)],尽量选择易方达公司的流动性好的产品
      "related_news_ids": ["string"] // 用于生成这个政策主题的新闻video_id，list the one most relevant ID
  ]
}

**投资分析框架要求：**

1. **政策驱动优先** - 重点分析有明确政策背书的机会
2. **数据支撑** - 每个判断尽量引用新闻中的具体数据（金额、百分比、时间等）
3. **产业链思维** - 从上游到下游分析受益环节
4. **可操作性** - 提供具体股票和ETF建议，便于立即执行
5. **高度相关** - 如果新闻内容无法支撑某个主题，股票和ETF推荐，则不应生成该主题

**内容质量要求：**

✅ **必须做到**：
- 每个机会都要提供至少5只相关股票和1只ETF，但不要胡乱编造，必须与新闻内容高度相关
- 所有内容必须基于当日新闻联播，尽量提供新闻中具体数据和规模的支持
- 股票选择流动性好的行业龙头，ETF选择跟踪相关行业主题的宽基指数
- 用投资者熟悉的专业术语但避免jargon
- 同类项内容避免重复
- 在每个主题的impact或actionable_advice中，通过自然语言引用相关新闻内容（例如，“根据今日新闻联播中关于...的报道”），不要使用新闻编号或ID

❌ **严格避免**：
- 泛泛而谈的行业推荐（如"关注科技股"）
- 没有数据支撑的主观判断
- 与新闻内容无关的常规建议
- 使用英文术语或混合表达
- 使用新闻编号或ID（如“新闻11”或“video_id”）来引用新闻

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
        news_date: fallbackDate || today,
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
        has_data: false,
        news_date: today
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
    <link rel="stylesheet" href="/css/style.css?v=${Date.now()}">
</head>
<body>
    <header>
        <div class="container">
            <a href="/" class="site-title">Trendfollowing.AI</a>
            <button class="menu-toggle" onclick="toggleMenu()" aria-label="Toggle menu">
                <span class="hamburger"></span>
            </button>
            <nav class="nav-menu" id="navMenu">
                <a href="/" class="nav-link active">首页</a>
                <a href="/analysis.html" class="nav-link">今日分析</a>
                <a href="/opportunities.html" class="nav-link">投资主题</a>
                <a href="/stocks.html" class="nav-link">股票追踪</a>
            </nav>
        </div>
    </header>

    <main class="container">
        <!-- Introduction Section -->
    <section class="intro-section">
      <div class="intro-content">
        <h1>解读新闻联播，发现投资先机</h1>
        <p class="hero-subtitle">AI每日提炼可执行的投资主题与个股信号</p>
        <div class="cta-buttons">
          <a href="/analysis.html" class="cta-button primary">今日新闻联播分析</a>
          <a href="/opportunities.html" class="cta-button primary">查看相关投资主题</a>
          <a href="/stocks.html" class="cta-button primary">浏览股票筛选</a>
        </div>
      </div>
    </section>
    </main>

    <footer>
        <div class="container">
            <div class="footer-content">
                <div class="footer-section">
                    <h4>我们的价值</h4>
                    <p>将新闻联播内容转化为清晰的投资信号，帮助您把握政策驱动的市场机会</p>
                </div>
                <div class="footer-section">
                    <h4>核心功能</h4>
                    <p>央视新闻联播 · AI分析生成 · 实时更新</p>
                </div>
            </div>
            <p class="disclaimer">数据来源：CCTV 官网 | 本站分析仅供参考，投资需谨慎</p>
        </div>
    </footer>

    <script src="/js/main.js?v=${Date.now()}"></script>
</body>
</html>`;
    
    await fs.writeFile(path.join(this.outputDir, 'index.html'), html);
  }

  async generateAnalysisPage(index) {
    console.log('📊 Generating analysis page...');

    // Generate AI-powered daily summary
    const dailySummary = await this.generateDailySummary();

    const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>今日分析 - Trend Following AI</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/css/style.css?v=${Date.now()}">
</head>
<body>
    <header>
        <div class="container">
            <a href="/" class="site-title">Trendfollowing.AI</a>
            <button class="menu-toggle" onclick="toggleMenu()" aria-label="Toggle menu">
                <span class="hamburger"></span>
            </button>
            <nav class="nav-menu" id="navMenu">
                <a href="/" class="nav-link">首页</a>
                <a href="/analysis.html" class="nav-link active">今日分析</a>
                <a href="/opportunities.html" class="nav-link">投资主题</a>
                <a href="/stocks.html" class="nav-link">股票追踪</a>
            </nav>
        </div>
    </header>

    <main class="container">
        <!-- Trend Insights Section -->
        <section class="analysis-section" id="analysis-section">
            <div class="section-header">
                <h2>AI 解读：分析今日新闻联播</h2>
                <p class="section-subtitle">基于最新新闻联播内容，AI生成的投资信号解读</p>
            </div>
            <div class="analysis-summary">
        <div class="daily-quote-card">
          <div class="card-header">
            <h3>今日投资观点</h3>
          </div>
          <p class="investment-quote"> ${dailySummary.summary?.investment_quote || '投资需谨慎，关注政策导向趋势'} </p>
          <div class="meta-info">
            <button class="btn-copy read-more" onclick="copyQuote()" title="分享投资观点">
              🔗 分享观点
            </button>
          </div>
        </div>
        <div class="core-logic-card">
          <div class="card-header">
            <h3>投资信号解读</h3>
          </div>
          <p>${dailySummary.summary?.core_logic || '今日新闻数据暂未更新'}</p>
          <div class="data-source">
            <span class="source-info">分析基于 <a href="/archive/${(() => {
              const dateStr = dailySummary.fallback_from || dailySummary.news_date;
              const dateMoment = moment(dateStr, 'YYYYMMDD');
              return dateMoment.isValid() ? dateMoment.format('YYYY') : '2025';
            })()}/${(() => {
              const dateStr = dailySummary.fallback_from || dailySummary.news_date;
              return dateStr || '20251025';
            })()}.html" class="news-source-link">${(() => {
              const dateStr = dailySummary.fallback_from || dailySummary.news_date;
              const dateMoment = moment(dateStr, 'YYYYMMDD');
              return dateMoment.isValid() ? dateMoment.format('YYYY年MM月DD日') : '2025年10月25日';
            })()} 新闻联播 </a></span>
          </div>
        </div>
            </div>
        </section>
    </main>

    <footer>
        <div class="container">
            <div class="footer-content">
                <div class="footer-section">
                    <h4>我们的价值</h4>
                    <p>将新闻联播内容转化为清晰的投资信号，帮助您把握政策驱动的市场机会</p>
                </div>
                <div class="footer-section">
                    <h4>核心功能</h4>
                    <p>央视新闻联播 · AI分析生成 · 实时更新</p>
                </div>
            </div>
            <p class="disclaimer">数据来源：CCTV 官网 | 本站分析仅供参考，投资需谨慎</p>
        </div>
    </footer>

    <script src="/js/main.js?v=${Date.now()}"></script>
</body>
</html>`;

    await fs.writeFile(path.join(this.outputDir, 'analysis.html'), html);
  }

  async generateOpportunitiesPage(index) {
    console.log('🎯 Generating opportunities page...');

    // Generate AI-powered daily summary
    const dailySummary = await this.generateDailySummary();

    const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>投资主题 - Trend Following AI</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/css/style.css?v=${Date.now()}">
</head>
<body>
    <header>
        <div class="container">
            <a href="/" class="site-title">Trendfollowing.AI</a>
            <button class="menu-toggle" onclick="toggleMenu()" aria-label="Toggle menu">
                <span class="hamburger"></span>
            </button>
            <nav class="nav-menu" id="navMenu">
                <a href="/" class="nav-link">首页</a>
                <a href="/analysis.html" class="nav-link">今日分析</a>
                <a href="/opportunities.html" class="nav-link active">投资主题</a>
                <a href="/stocks.html" class="nav-link">股票追踪</a>
            </nav>
        </div>
    </header>

    <main class="container">
        <!-- Investment Opportunities Section -->
        ${dailySummary.opportunity_analysis?.length > 0 ? `
        <section class="opportunities-section" id="opportunities-section">
            <div class="section-header">
                <h2>AI 智选：捕捉主题投资趋势</h2>
                <p class="section-subtitle">基于新闻联播内容识别出的投资机会主题</p>
                <div class="section-actions">
                    <div class="theme-navigation">
                        ${dailySummary.opportunity_analysis.map((opportunity, index) => 
                            `<a href="#opportunity-${index}" class="theme-nav-btn" title="${opportunity.theme}">${opportunity.theme}</a>`
                        ).join('')}
                    </div>
                </div>
            </div>
        </section>
        <div class="cards-grid">
            ${dailySummary.opportunity_analysis.map((opportunity, index) => `
                <div class="opportunity-card" id="opportunity-${index}">
                    <div class="opportunity-header">
                        <h4>${opportunity.theme}</h4>
                    </div>
                    
            ${opportunity.core_stocks?.length > 0 ? `
            <div class="investment-section">
              <h5>重点关注股票</h5>
              <div class="stocks-list">
                ${opportunity.core_stocks.map(stock => `<button class="stock-tag" onclick="copyToClipboard('${stock}', this)">${stock}</button>`).join('')}
              </div>
            </div>
            ` : ''}

            ${opportunity.sector_etfs?.length > 0 ? `
            <div class="etf-section">
              <h5>行业ETF参考</h5>
              <div class="etfs-list">
                ${opportunity.sector_etfs.map(etf => `<button class="etf-tag" onclick="copyToClipboard('${etf}', this)">${etf}</button>`).join('')}
              </div>
            </div>
            ` : ''}

            <div class="action-section">
              <h5>操作建议</h5>
              <p class="actionable-advice">${opportunity.actionable_advice}</p>
            </div>

            <div class="news-interpretation">
              <h5>机会解读</h5>
              <p class="impact-text">${opportunity.impact} ${opportunity.related_news_ids?.length > 0 ? `<a href="/archive/${(() => {
                const dateStr = dailySummary.fallback_from || dailySummary.news_date;
                const dateMoment = moment(dateStr, 'YYYYMMDD');
                return dateMoment.isValid() ? dateMoment.format('YYYY') : '2025';
              })()}/${(() => {
                const dateStr = dailySummary.fallback_from || dailySummary.news_date;
                return dateStr || '20251025';
              })()}.html#${opportunity.related_news_ids[0]}" class="news-source-inline">新闻来源→</a>` : ''}</p>
            </div>
            
            <div class="card-actions">
              <button onclick="shareOpportunity('${opportunity.theme}', '${opportunity.core_stocks?.join(', ') || ''}', '${opportunity.sector_etfs?.join(', ') || ''}', '${opportunity.actionable_advice}')" class="card-share-btn">分享</button>
            </div>
                </div>
            `).join('')}
        </div>
        ` : `
        <section class="opportunities-section">
            <div class="section-header">
                <h2>具体投资机会</h2>
                <p class="section-subtitle">AI识别出的政策驱动型投资主题</p>
            </div>
            <div class="empty-state">
                <h4>今日暂无明确投资机会</h4>
                <p>今日新闻内容中暂未识别出明确的政策驱动型投资机会，建议关注后续政策动向。</p>
            </div>
        </section>
        `}
    </main>

    <footer>
        <div class="container">
            <div class="footer-content">
                <div class="footer-section">
                    <h4>我们的价值</h4>
                    <p>将新闻联播内容转化为清晰的投资信号，帮助您把握政策驱动的市场机会</p>
                </div>
                <div class="footer-section">
                    <h4>核心功能</h4>
                    <p>央视新闻联播 · AI分析生成 · 实时更新</p>
                </div>
            </div>
            <p class="disclaimer">数据来源：CCTV 官网 | 本站分析仅供参考，投资需谨慎</p>
        </div>
    </footer>

    <script src="/js/main.js?v=${Date.now()}"></script>
</body>
</html>`;

    await fs.writeFile(path.join(this.outputDir, 'opportunities.html'), html);
  }

  // Read latest stock screening data from JSON file
  async readStockData() {
    try {
      const stockDataDir = './stock_data';
      const files = await fs.readdir(stockDataDir);
      const jsonFiles = files.filter(f => f.endsWith('.json') && f.includes('cn_stock_screening'));
      
      if (jsonFiles.length === 0) {
        console.log('⚠️ No stock screening JSON files found');
        return [];
      }
      
      // Sort by timestamp and get the latest
      jsonFiles.sort((a, b) => b.localeCompare(a));
      const latestFile = jsonFiles[0];
      const filePath = path.join(stockDataDir, latestFile);
      
      console.log(`📊 Reading stock data from ${latestFile}`);
      
      // Read JSON file
      const stockData = await fs.readJson(filePath);
      
      console.log(`📊 Loaded ${stockData.length} stock records`);
      return stockData;
      
    } catch (error) {
      console.warn('⚠️ Error reading stock data:', error.message);
      return [];
    }
  }

  async generateStockTrackingPage() {
    console.log('📈 Generating stock tracking page...');

    const stockData = await this.readStockData();

    const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>股票追踪 - Trend Following AI</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/css/style.css?v=${Date.now()}">
</head>
<body>
    <header>
        <div class="container">
            <a href="/" class="site-title">Trendfollowing.AI</a>
            <button class="menu-toggle" onclick="toggleMenu()" aria-label="Toggle menu">
                <span class="hamburger"></span>
            </button>
            <nav class="nav-menu" id="navMenu">
                <a href="/" class="nav-link">首页</a>
                <a href="/analysis.html" class="nav-link">今日分析</a>
                <a href="/opportunities.html" class="nav-link">投资主题</a>
                <a href="/stocks.html" class="nav-link active">股票追踪</a>
            </nav>
        </div>
    </header>

    <main class="container">
        <section class="stock-tracking-section">
            <div class="section-header">
                <h2>优质股票追踪</h2>
                <p class="section-subtitle">基于运营和盈利能力的优质股票列表</p>
            </div>
            
            <div class="table-controls">
                <div>
                    <p style="margin: 0; color: var(--text-secondary); font-size: 0.875rem;">
                        共 ${stockData.length} 只股票 | 数据更新时间: ${new Date().toLocaleString('zh-CN')}
                    </p>
                </div>
                <div style="display: flex; align-items: center; gap: 1rem;">
                    <input type="text" id="stockSearch" class="search-input" placeholder="搜索股票名称或代码..." style="width: 250px;">
                </div>
            </div>
            
            <!-- Selected Stocks Section -->
            <div class="selected-stocks-section collapsed" id="selectedStocksSection" style="display: none;">
                <div class="selected-stocks-header" onclick="toggleSelectedStocks()">
                    <h3>已选股票 (<span id="selectedCount">0</span>)</h3>
                    <button class="collapse-toggle-btn" id="collapseToggleBtn">打开</button>
                </div>
                <div class="stock-table-container">
                    <table class="stock-table" id="selectedStocksTable">
                        <thead>
                            <tr>
                                <th class="sticky-column checkbox-column"><input type="checkbox" id="selectAllSelected" class="stock-checkbox"></th>
                                <th class="sticky-column">股票</th>
                                <th>行业</th>
                                <th>收盘价</th>
                                <th>权重</th>
                                <th>投资金额</th>
                                <th>买入股数</th>
                                <th>基本面评分</th>
                                <th>技术指标</th>
                                <th>均线指标</th>
                                <th>震荡指标</th>
                                <th>人气排名</th>
                                <th>人气变化</th>
                            </tr>
                        </thead>
                        <tbody id="selectedStocksBody">
                        </tbody>
                    </table>
                </div>
                <div class="investment-calculator">
                    <div class="investment-input-group">
                        <label for="investmentAmount">请输入投资预算 (元):</label>
                        <input type="number" id="investmentAmount" class="investment-amount-input" placeholder="100000" min="0" step="1000">
                        <button id="calculateBtn" class="calculate-btn">计算买入</button>
                    </div>
                    <div id="investmentResults" class="investment-results" style="display: none;">
                        <div class="results-header">投资分配结果</div>
                        <div id="resultsGrid" class="results-grid">
                            <!-- Results will be populated here -->
                        </div>
                    </div>
                </div>
            </div>
            
            ${stockData.length > 0 ? `
            <div class="stock-table-container">
                <table class="stock-table" id="stockTable">
                    <thead>
                        <tr>
                            <th class="sticky-column checkbox-column"><input type="checkbox" id="selectAll" class="stock-checkbox"></th>
                            <th class="sticky-column">股票</th>
                            <th class="sortable" data-column="0">行业</th>
                            <th class="sortable" data-column="1">市值</th>
                            <th class="sortable" data-column="2">收盘价</th>
                            <th class="sortable" data-column="3">基本面评分</th>
                            <th class="sortable" data-column="4">技术指标</th>
                            <th class="sortable" data-column="5">均线指标</th>
                            <th class="sortable" data-column="6">震荡指标</th>
                            <th class="sortable" data-column="7">人气排名</th>
                            <th class="sortable" data-column="8">人气变化</th>
                            <th class="sortable" data-column="9">权重</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${stockData.map(stock => {
                            const score = stock['基本面评分'] || 0;
                            const scoreClass = score >= 80 ? 'score-high' : score >= 60 ? 'score-medium' : 'score-low';
                            
                            // Parse rationale text and create badges
                            const rationaleText = stock['投资理由'] || '';
                            const rationaleBadges = [];
                            
                            if (rationaleText.includes('利润率领先')) {
                                rationaleBadges.push('<span class="rationale-badge rationale-leading">利润率领先</span>');
                            } else if (rationaleText.includes('利润率优秀')) {
                                rationaleBadges.push('<span class="rationale-badge rationale-excellent">利润率优秀</span>');
                            }
                            
                            if (rationaleText.includes('资产周转领先')) {
                                rationaleBadges.push('<span class="rationale-badge rationale-leading">资产周转领先</span>');
                            } else if (rationaleText.includes('资产周转优秀')) {
                                rationaleBadges.push('<span class="rationale-badge rationale-excellent">资产周转优秀</span>');
                            }
                            
                            if (rationaleText.includes('现金流回报领先')) {
                                rationaleBadges.push('<span class="rationale-badge rationale-leading">现金流回报领先</span>');
                            } else if (rationaleText.includes('现金流回报优秀')) {
                                rationaleBadges.push('<span class="rationale-badge rationale-excellent">现金流回报优秀</span>');
                            }
                            
                            if (rationaleText.includes('市盈增长率极具吸引力')) {
                                rationaleBadges.push('<span class="rationale-badge rationale-leading">PEG极具吸引力</span>');
                            } else if (rationaleText.includes('市盈增长率合理')) {
                                rationaleBadges.push('<span class="rationale-badge rationale-excellent">PEG合理</span>');
                            }
                            
                            if (rationaleText.includes('高盈利增长')) {
                                rationaleBadges.push('<span class="rationale-badge rationale-leading">高盈利增长</span>');
                            } else if (rationaleText.includes('稳健盈利增长')) {
                                rationaleBadges.push('<span class="rationale-badge rationale-excellent">稳健盈利增长</span>');
                            }
                            
                            // Determine technical indicator colors and labels based on -1 to 1 scale
                            const getTechClass = (value) => {
                                if (!value || value === '-') return 'tech-neutral';
                                const num = parseFloat(value);
                                if (num < -0.5) return 'tech-strong-sell';
                                if (num < -0.1) return 'tech-sell';
                                if (num <= 0.1) return 'tech-neutral';
                                if (num <= 0.5) return 'tech-buy';
                                return 'tech-strong-buy';
                            };
                            
                            const getTechLabel = (value) => {
                                if (!value || value === '-') return '中立';
                                const num = parseFloat(value);
                                if (num < -0.5) return '卖出';
                                if (num < -0.1) return '减持';
                                if (num <= 0.1) return '中立';
                                if (num <= 0.5) return '增持';
                                return '买入';
                            };
                            
                            return `
                            <tr data-stock-code="${stock['代码'] || ''}" data-stock-name="${stock['名称'] || ''}">
                                <td class="sticky-column checkbox-column"><input type="checkbox" class="stock-checkbox row-checkbox" data-stock='${JSON.stringify(stock).replace(/'/g, "&apos;")}'></td>
                                <td class="sticky-column">
                                    <div class="stock-info">
                                        <div class="stock-code-name">
                                            <span class="stock-code" onclick="copyToClipboard('${stock['代码'] || ''}', this)">${stock['代码'] || ''}<br>${stock['名称'] || ''}</span>
                                        </div>
                                    </div>
                                </td>
                                <td>
                                    <span>${stock['行业'] || ''}</span>
                                </td>
                                <td>
                                    <span class="market-cap">${(stock['市值（亿元）'] || 0).toFixed(1)}亿</span>
                                </td>
                                <td>
                                    <span>${stock['最新价'] || '-'}</span>
                                </td>
                                <td>
                                    <span class="score-badge ${scoreClass}">${score.toFixed(1)}</span>
                                </td>
                                <td>
                                    <div class="tech-indicators">
                                        <span class="tech-indicator ${getTechClass(stock['技术评级(日)'])}" data-sort-value="${stock['技术评级(日)'] || 0}">日:${getTechLabel(stock['技术评级(日)'])}</span>
                                        <span class="tech-indicator ${getTechClass(stock['技术评级(周)'])}" data-sort-value="${stock['技术评级(周)'] || 0}">周:${getTechLabel(stock['技术评级(周)'])}</span>
                                    </div>
                                </td>
                                <td>
                                    <div class="tech-indicators">
                                        <span class="tech-indicator ${getTechClass(stock['均线评级(日)'])}" data-sort-value="${stock['均线评级(日)'] || 0}">日:${getTechLabel(stock['均线评级(日)'])}</span>
                                        <span class="tech-indicator ${getTechClass(stock['均线评级(周)'])}" data-sort-value="${stock['均线评级(周)'] || 0}">周:${getTechLabel(stock['均线评级(周)'])}</span>
                                    </div>
                                </td>
                                <td>
                                    <div class="tech-indicators">
                                        <span class="tech-indicator ${getTechClass(stock['震荡指标评级(日)'])}" data-sort-value="${stock['震荡指标评级(日)'] || 0}">日:${getTechLabel(stock['震荡指标评级(日)'])}</span>
                                        <span class="tech-indicator ${getTechClass(stock['震荡指标评级(周)'])}" data-sort-value="${stock['震荡指标评级(周)'] || 0}">周:${getTechLabel(stock['震荡指标评级(周)'])}</span>
                                    </div>
                                </td>
                                <td>
                                    <span class="popularity-rank">${stock['目前排名'] || '-'}</span>
                                </td>
                                <td>
                                    <span class="popularity-change ${stock['上升'] > 0 ? 'positive' : stock['上升'] < 0 ? 'negative' : ''}">${stock['上升'] !== undefined ? (stock['上升'] > 0 ? '+' : '') + stock['上升'] : '-'}</span>
                                </td>
                                <td>
                                    <span>${(stock['权重'] || 0).toFixed(1)}</span>
                                </td>
                            </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
            ` : `
            <div class="empty-state">
                <h4>暂无股票数据</h4>
                <p>股票筛选数据正在生成中，请稍后刷新页面查看。</p>
            </div>
            `}
        </section>
    </main>

    <footer>
        <div class="container">
            <div class="footer-content">
                <div class="footer-section">
                    <h4>我们的价值</h4>
                    <p>将新闻联播内容转化为清晰的投资信号，帮助您把握政策驱动的市场机会</p>
                </div>
                <div class="footer-section">
                    <h4>核心功能</h4>
                    <p>央视新闻联播 · AI分析生成 · 实时更新</p>
                </div>
            </div>
            <p class="disclaimer">数据来源：CCTV 官网 | 本站分析仅供参考，投资需谨慎</p>
        </div>
    </footer>

    <script src="/js/main.js?v=${Date.now()}"></script>
    <script>
        // Selected stocks storage
        let selectedStocks = [];
        
        // Stock table search functionality
        document.getElementById('stockSearch').addEventListener('input', function(e) {
            const searchTerm = e.target.value.toLowerCase();
            const rows = document.querySelectorAll('#stockTable tbody tr');
            
            rows.forEach(row => {
                const stockText = row.cells[1].querySelector('.stock-code').textContent.toLowerCase();
                const industry = row.cells[2].textContent.toLowerCase();
                
                if (stockText.includes(searchTerm) || industry.includes(searchTerm)) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            });
        });
        
        // Table sorting functionality
        let currentSort = { column: -1, direction: 'asc' };
        
        document.querySelectorAll('.sortable').forEach(header => {
            header.addEventListener('click', function() {
                const column = parseInt(this.dataset.column);
                
                // Define default directions for specific columns
                const getDefaultDirection = (col) => {
                    if (col === 3 || col === 4 || col === 5 || col === 6 || col === 8) return 'desc'; // 基本面评分, 技术指标, 均线指标, 震荡指标, 人气变化 - best first
                    if (col === 7) return 'asc'; // 人气排名 - smaller first
                    return 'asc'; // Default for other columns
                };
                
                let direction;
                if (currentSort.column === column) {
                    // Toggle direction if clicking on currently sorted column
                    direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
                } else {
                    // Use default direction for new column
                    direction = getDefaultDirection(column);
                }
                
                // Remove previous sort indicators
                document.querySelectorAll('.sortable').forEach(h => {
                    h.classList.remove('sort-asc', 'sort-desc');
                });
                
                // Add new sort indicator
                this.classList.add(direction === 'asc' ? 'sort-asc' : 'sort-desc');
                
                sortTable(column, direction);
                currentSort = { column, direction };
            });
        });
        
        // Sort table by weight descending on page load
        const weightHeader = document.querySelector('[data-column="9"]');
        if (weightHeader) {
            weightHeader.classList.add('sort-desc');
            sortTable(9, 'desc');
            currentSort = { column: 9, direction: 'desc' };
        }
        
        function sortTable(column, direction) {
            const tbody = document.querySelector('#stockTable tbody');
            const rows = Array.from(tbody.querySelectorAll('tr'));
            
            rows.sort((a, b) => {
                let aVal = a.cells[column + 2].textContent.trim(); // +2 because first two columns are sticky (checkbox + stock)
                let bVal = b.cells[column + 2].textContent.trim();
                
                // Handle numeric sorting
                if (column === 1) { // 市值
                    aVal = parseFloat(aVal.replace('亿', '')) || 0;
                    bVal = parseFloat(bVal.replace('亿', '')) || 0;
                } else if (column === 2) { // 最新价
                    aVal = parseFloat(aVal) || 0;
                    bVal = parseFloat(bVal) || 0;
                } else if (column === 3) { // 基本面评分
                    aVal = parseFloat(aVal) || 0;
                    bVal = parseFloat(bVal) || 0;
                } else if (column === 4) { // 技术指标 - sort by daily technical rating
                    // Extract the daily rating from the tech indicators cell
                    const aDailyIndicator = a.cells[column + 2].querySelector('.tech-indicator:first-child');
                    const bDailyIndicator = b.cells[column + 2].querySelector('.tech-indicator:first-child');
                    aVal = aDailyIndicator ? parseFloat(aDailyIndicator.dataset.sortValue) || 0 : 0;
                    bVal = bDailyIndicator ? parseFloat(bDailyIndicator.dataset.sortValue) || 0 : 0;
                } else if (column === 5) { // 均线指标 - sort by daily moving average rating
                    // Extract the daily rating from the moving average indicators cell
                    const aDailyIndicator = a.cells[column + 2].querySelector('.tech-indicator:first-child');
                    const bDailyIndicator = b.cells[column + 2].querySelector('.tech-indicator:first-child');
                    aVal = aDailyIndicator ? parseFloat(aDailyIndicator.dataset.sortValue) || 0 : 0;
                    bVal = bDailyIndicator ? parseFloat(bDailyIndicator.dataset.sortValue) || 0 : 0;
                } else if (column === 6) { // 震荡指标 - sort by daily oscillation rating
                    // Extract the daily rating from the oscillation indicators cell
                    const aDailyIndicator = a.cells[column + 2].querySelector('.tech-indicator:first-child');
                    const bDailyIndicator = b.cells[column + 2].querySelector('.tech-indicator:first-child');
                    aVal = aDailyIndicator ? parseFloat(aDailyIndicator.dataset.sortValue) || 0 : 0;
                    bVal = bDailyIndicator ? parseFloat(bDailyIndicator.dataset.sortValue) || 0 : 0;
                } else if (column === 7) { // 人气排名
                    aVal = parseInt(aVal) || 999999;
                    bVal = parseInt(bVal) || 999999;
                } else if (column === 8) { // 人气变化
                    aVal = parseInt(aVal.replace('+', '')) || 0;
                    bVal = parseInt(bVal.replace('+', '')) || 0;
                } else if (column === 9) { // 权重 - get from data attribute since column is hidden
                    const aData = JSON.parse(a.querySelector('.row-checkbox').dataset.stock.replace(/&apos;/g, "'"));
                    const bData = JSON.parse(b.querySelector('.row-checkbox').dataset.stock.replace(/&apos;/g, "'"));
                    aVal = parseFloat(aData['权重']) || 0;
                    bVal = parseFloat(bData['权重']) || 0;
                } else {
                    // String sorting for other columns
                    aVal = aVal.toLowerCase();
                    bVal = bVal.toLowerCase();
                }
                
                if (direction === 'asc') {
                    return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
                } else {
                    return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
                }
            });
            
            // Re-append sorted rows
            rows.forEach(row => tbody.appendChild(row));
        }
        
        // Checkbox functionality
        document.getElementById('selectAll').addEventListener('change', function() {
            const checkboxes = document.querySelectorAll('#stockTable .row-checkbox');
            checkboxes.forEach(checkbox => {
                checkbox.checked = this.checked;
                updateSelectedStocks(checkbox);
            });
        });
        
        document.getElementById('selectAllSelected').addEventListener('change', function() {
            const checkboxes = document.querySelectorAll('#selectedStocksTable .row-checkbox');
            if (this.checked) {
                checkboxes.forEach(checkbox => checkbox.checked = true);
            } else {
                // Collect all stock codes first
                const stockCodes = Array.from(checkboxes).map(checkbox => checkbox.closest('tr').dataset.stockCode);
                // Remove all at once
                selectedStocks = selectedStocks.filter(s => !stockCodes.includes(s['代码']));
                // Update main table checkboxes
                stockCodes.forEach(code => {
                    const mainCheckbox = document.querySelector('#stockTable tr[data-stock-code="' + code + '"] .row-checkbox');
                    if (mainCheckbox) mainCheckbox.checked = false;
                });
                // Set all checkboxes to unchecked
                checkboxes.forEach(checkbox => checkbox.checked = false);
            }
            updateSelectedStocksDisplay();
            updateSelectAllState();
        });
        
        // Handle individual row checkboxes
        document.addEventListener('change', function(e) {
            if (e.target.classList.contains('row-checkbox')) {
                updateSelectedStocks(e.target);
            }
        });
        
        function updateSelectedStocks(checkbox) {
            const stockData = JSON.parse(checkbox.dataset.stock.replace(/&apos;/g, "'"));
            
            if (checkbox.checked) {
                // Add to selected
                if (!selectedStocks.find(s => s['代码'] === stockData['代码'])) {
                    selectedStocks.push(stockData);
                }
            } else {
                // Remove from selected
                selectedStocks = selectedStocks.filter(s => s['代码'] !== stockData['代码']);
            }
            
            updateSelectedStocksDisplay();
            updateSelectAllState();
        }
        
        function removeFromSelected(checkbox) {
            const stockCode = checkbox.closest('tr').dataset.stockCode;
            selectedStocks = selectedStocks.filter(s => s['代码'] !== stockCode);
            
            // Also uncheck in main table
            const mainCheckbox = document.querySelector('#stockTable tr[data-stock-code="' + stockCode + '"] .row-checkbox');
            if (mainCheckbox) {
                mainCheckbox.checked = false;
            }
            
            updateSelectedStocksDisplay();
            updateSelectAllState();
        }
        
        function updateSelectedStocksDisplay() {
            const section = document.getElementById('selectedStocksSection');
            const tbody = document.getElementById('selectedStocksBody');
            const count = document.getElementById('selectedCount');
            
            // Sort selected stocks by weight in descending order
            selectedStocks.sort((a, b) => (b['权重'] || 0) - (a['权重'] || 0));
            
            count.textContent = selectedStocks.length;
            
            if (selectedStocks.length > 0) {
                section.style.display = 'block';
                
                tbody.innerHTML = selectedStocks.map(stock => {
                    const score = stock['基本面评分'] || 0;
                    const scoreClass = score >= 80 ? 'score-high' : score >= 60 ? 'score-medium' : 'score-low';
                    
                    // Parse rationale text and create badges
                    const rationaleText = stock['投资理由'] || '';
                    const rationaleBadges = [];
                    
                    if (rationaleText.includes('利润率领先')) {
                        rationaleBadges.push('<span class="rationale-badge rationale-leading">利润率领先</span>');
                    } else if (rationaleText.includes('利润率优秀')) {
                        rationaleBadges.push('<span class="rationale-badge rationale-excellent">利润率优秀</span>');
                    }
                    
                    if (rationaleText.includes('资产周转领先')) {
                        rationaleBadges.push('<span class="rationale-badge rationale-leading">资产周转领先</span>');
                    } else if (rationaleText.includes('资产周转优秀')) {
                        rationaleBadges.push('<span class="rationale-badge rationale-excellent">资产周转优秀</span>');
                    }
                    
                    if (rationaleText.includes('现金流回报领先')) {
                        rationaleBadges.push('<span class="rationale-badge rationale-leading">现金流回报领先</span>');
                    } else if (rationaleText.includes('现金流回报优秀')) {
                        rationaleBadges.push('<span class="rationale-badge rationale-excellent">现金流回报优秀</span>');
                    }
                    
                    if (rationaleText.includes('市盈增长率极具吸引力')) {
                        rationaleBadges.push('<span class="rationale-badge rationale-leading">PEG极具吸引力</span>');
                    } else if (rationaleText.includes('市盈增长率合理')) {
                        rationaleBadges.push('<span class="rationale-badge rationale-excellent">PEG合理</span>');
                    }
                    
                    if (rationaleText.includes('高盈利增长')) {
                        rationaleBadges.push('<span class="rationale-badge rationale-leading">高盈利增长</span>');
                    } else if (rationaleText.includes('稳健盈利增长')) {
                        rationaleBadges.push('<span class="rationale-badge rationale-excellent">稳健盈利增长</span>');
                    }
                    
                    // Determine technical indicator colors and labels based on -1 to 1 scale
                    const getTechClass = (value) => {
                        if (!value || value === '-') return 'tech-neutral';
                        const num = parseFloat(value);
                        if (num < -0.5) return 'tech-strong-sell';
                        if (num < -0.1) return 'tech-sell';
                        if (num <= 0.1) return 'tech-neutral';
                        if (num <= 0.5) return 'tech-buy';
                        return 'tech-strong-buy';
                    };
                    
                    const getTechLabel = (value) => {
                        if (!value || value === '-') return '中立';
                        const num = parseFloat(value);
                        if (num < -0.5) return '卖出';
                        if (num < -0.1) return '减持';
                        if (num <= 0.1) return '中立';
                        if (num <= 0.5) return '增持';
                        return '买入';
                    };
                    
                    return '<tr data-stock-code="' + (stock['代码'] || '') + '" data-stock-name="' + (stock['名称'] || '') + '">' +
                        '<td class="sticky-column checkbox-column"><input type="checkbox" class="stock-checkbox row-checkbox" checked></td>' +
                        '<td class="sticky-column">' +
                            '<div class="stock-info">' +
                                '<div class="stock-code-name">' +
                                    '<span class="stock-code">' + (stock['代码'] || '') + '<br>' + (stock['名称'] || '') + '</span>' +
                                '</div>' +
                            '</div>' +
                        '</td>' +
                        '<td><span>' + (stock['行业'] || '') + '</span></td>' +
                        '<td><span>' + (stock['最新价'] || '-') + '</span></td>' +
                        '<td><span class="weight-display" id="weight-' + (stock['代码'] || '') + '">-</span></td>' +
                        '<td><span class="amount-display" id="amount-' + (stock['代码'] || '') + '">-</span></td>' +
                        '<td><span class="shares-display" id="shares-' + (stock['代码'] || '') + '">-</span></td>' +
                        '<td><span class="score-badge ' + scoreClass + '">' + score.toFixed(1) + '</span></td>' +
                        '<td>' +
                            '<div class="tech-indicators">' +
                                '<span class="tech-indicator ' + getTechClass(stock['技术评级(日)']) + '" data-sort-value="' + (stock['技术评级(日)'] || 0) + '">日:' + getTechLabel(stock['技术评级(日)']) + '</span>' +
                                '<span class="tech-indicator ' + getTechClass(stock['技术评级(周)']) + '" data-sort-value="' + (stock['技术评级(周)'] || 0) + '">周:' + getTechLabel(stock['技术评级(周)']) + '</span>' +
                            '</div>' +
                        '</td>' +
                        '<td>' +
                            '<div class="tech-indicators">' +
                                '<span class="tech-indicator ' + getTechClass(stock['均线评级(日)']) + '" data-sort-value="' + (stock['均线评级(日)'] || 0) + '">日:' + getTechLabel(stock['均线评级(日)']) + '</span>' +
                                '<span class="tech-indicator ' + getTechClass(stock['均线评级(周)']) + '" data-sort-value="' + (stock['均线评级(周)'] || 0) + '">周:' + getTechLabel(stock['均线评级(周)']) + '</span>' +
                            '</div>' +
                        '</td>' +
                        '<td>' +
                            '<div class="tech-indicators">' +
                                '<span class="tech-indicator ' + getTechClass(stock['震荡指标评级(日)']) + '" data-sort-value="' + (stock['震荡指标评级(日)'] || 0) + '">日:' + getTechLabel(stock['震荡指标评级(日)']) + '</span>' +
                                '<span class="tech-indicator ' + getTechClass(stock['震荡指标评级(周)']) + '" data-sort-value="' + (stock['震荡指标评级(周)'] || 0) + '">周:' + getTechLabel(stock['震荡指标评级(周)']) + '</span>' +
                            '</div>' +
                        '</td>' +
                        '<td><span class="popularity-rank">' + (stock['目前排名'] || '-') + '</span></td>' +
                        '<td><span class="popularity-change ' + (stock['上升'] > 0 ? 'positive' : stock['上升'] < 0 ? 'negative' : '') + '">' + (stock['上升'] !== undefined ? (stock['上升'] > 0 ? '+' : '') + stock['上升'] : '-') + '</span></td>' +
                    '</tr>';
                }).join('');
                
                // Clear previous calculation results
                clearInvestmentResults();
            } else {
                section.style.display = 'none';
            }
        }
        
        function clearInvestmentResults() {
            // Clear individual stock calculation displays
            selectedStocks.forEach(stock => {
                const code = stock['代码'];
                const weightEl = document.getElementById('weight-' + code);
                const amountEl = document.getElementById('amount-' + code);
                const sharesEl = document.getElementById('shares-' + code);
                
                if (weightEl) weightEl.textContent = '-';
                if (amountEl) amountEl.textContent = '-';
                if (sharesEl) sharesEl.textContent = '-';
            });
            
            // Hide results summary
            document.getElementById('investmentResults').style.display = 'none';
        }
        
        function toggleSelectedStocks() {
            const section = document.getElementById('selectedStocksSection');
            const toggleBtn = document.getElementById('collapseToggleBtn');
            
            section.classList.toggle('collapsed');
            
            // Update button text based on collapsed state
            if (section.classList.contains('collapsed')) {
                toggleBtn.textContent = '打开';
            } else {
                toggleBtn.textContent = '隐藏';
            }
        }
        
        // Investment calculation functionality
        document.getElementById('calculateBtn').addEventListener('click', calculateInvestment);
        document.getElementById('investmentAmount').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                calculateInvestment();
            }
        });
        
        function calculateInvestment() {
            const totalAmount = parseFloat(document.getElementById('investmentAmount').value);
            
            if (!totalAmount || totalAmount <= 0) {
                alert('请输入有效的投资金额');
                return;
            }
            
            if (selectedStocks.length === 0) {
                alert('请先选择股票');
                return;
            }
            
            // Step 1: Calculate total weight of selected stocks
            const totalWeight = selectedStocks.reduce((sum, stock) => sum + (stock['权重'] || 0), 0);
            
            if (totalWeight === 0) {
                alert('所选股票没有权重数据');
                return;
            }
            
            // Step 2: Calculate rescaled weights (to 100%)
            const rescaledStocks = selectedStocks.map(stock => ({
                ...stock,
                rescaledWeight: (stock['权重'] || 0) / totalWeight * 100
            }));
            
            // Step 3: Calculate investment amount and shares for each stock
            const results = rescaledStocks.map(stock => {
                const price = parseFloat(stock['最新价']) || 0;
                if (price <= 0) return { ...stock, investmentAmount: 0, shares: 0, finalWeight: 0 };
                
                const investmentAmount = (stock.rescaledWeight / 100) * totalAmount;
                const rawShares = investmentAmount / price;
                
                // Round down to nearest 100 shares
                const shares = Math.floor(rawShares / 100) * 100;
                
                // Recalculate final investment amount and weight based on actual shares
                const actualInvestment = shares * price;
                const finalWeight = (actualInvestment / totalAmount) * 100;
                
                return {
                    ...stock,
                    investmentAmount: actualInvestment,
                    shares: shares,
                    finalWeight: finalWeight
                };
            });
            
            // Step 4: Update display
            results.forEach(stock => {
                const code = stock['代码'];
                document.getElementById('weight-' + code).textContent = stock.rescaledWeight.toFixed(2) + '%';
                document.getElementById('amount-' + code).textContent = stock.investmentAmount.toLocaleString('zh-CN', { maximumFractionDigits: 0 }) + '元';
                document.getElementById('shares-' + code).textContent = stock.shares.toLocaleString('zh-CN') + '股';
            });
            
            // Step 5: Show summary results
            updateInvestmentResults(results, totalAmount);
        }
        
        function updateInvestmentResults(results, totalAmount) {
            const resultsContainer = document.getElementById('investmentResults');
            const resultsGrid = document.getElementById('resultsGrid');
            
            const totalInvested = results.reduce((sum, stock) => sum + stock.investmentAmount, 0);
            const totalShares = results.reduce((sum, stock) => sum + stock.shares, 0);
            const remainingAmount = totalAmount - totalInvested;
            
            resultsGrid.innerHTML = 
                '<div class="result-item">' +
                    '<div class="result-label">投资预算</div>' +
                    '<div class="result-value">' + totalAmount.toLocaleString('zh-CN') + '元</div>' +
                '</div>' +
                '<div class="result-item">' +
                    '<div class="result-label">实际投资金额</div>' +
                    '<div class="result-value">' + totalInvested.toLocaleString('zh-CN') + '元</div>' +
                '</div>' +
                '<div class="result-item">' +
                    '<div class="result-label">剩余金额</div>' +
                    '<div class="result-value">' + remainingAmount.toLocaleString('zh-CN') + '元</div>' +
                '</div>' +
                '<div class="result-item">' +
                    '<div class="result-label">总买入股数</div>' +
                    '<div class="result-value">' + totalShares.toLocaleString('zh-CN') + '股</div>' +
                '</div>' +
                '<div class="result-item">' +
                    '<div class="result-label">投资股票数</div>' +
                    '<div class="result-value">' + results.length + '只</div>' +
                '</div>';
            
            resultsContainer.style.display = 'block';
        }
        
        function updateSelectAllState() {
            const mainCheckboxes = document.querySelectorAll('#stockTable .row-checkbox');
            const selectedCheckboxes = document.querySelectorAll('#selectedStocksTable .row-checkbox');
            const selectAll = document.getElementById('selectAll');
            const selectAllSelected = document.getElementById('selectAllSelected');
            
            // Update main table select all
            const mainChecked = document.querySelectorAll('#stockTable .row-checkbox:checked').length;
            selectAll.checked = mainChecked === mainCheckboxes.length && mainCheckboxes.length > 0;
            selectAll.indeterminate = mainChecked > 0 && mainChecked < mainCheckboxes.length;
            
            // Update selected table select all
            const selectedChecked = document.querySelectorAll('#selectedStocksTable .row-checkbox:checked').length;
            selectAllSelected.checked = selectedChecked === selectedCheckboxes.length && selectedCheckboxes.length > 0;
            selectAllSelected.indeterminate = selectedChecked > 0 && selectedChecked < selectedCheckboxes.length;
        }
        
        // Copy stock code functionality
        document.addEventListener('click', function(e) {
            if (e.target.classList.contains('stock-code')) {
                navigator.clipboard.writeText(e.target.textContent);
            }
        });
        
        // Copy to clipboard function for stock tags
        function copyToClipboard(text, element) {
            navigator.clipboard.writeText(text);
        }
    </script>
</body>
</html>`;

    await fs.writeFile(path.join(this.outputDir, 'stocks.html'), html);
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
    <link rel="stylesheet" href="/css/style.css?v=${Date.now()}">
</head>
<body>
    <header>
        <div class="container">
            <a href="/" class="site-title">Trendfollowing.AI</a>
            <button class="menu-toggle" onclick="toggleMenu()" aria-label="Toggle menu">
                <span class="hamburger"></span>
            </button>
            <nav class="nav-menu" id="navMenu">
                <a href="/" class="nav-link active">新闻联播</a>
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

    <script src="/js/main.js?v=${Date.now()}"></script>
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
    <title>${(() => {
      const dateMoment = moment(dayInfo.date, 'YYYYMMDD');
      return dateMoment.isValid() ? dateMoment.format('YYYY年MM月DD日') : dayInfo.date;
    })()}新闻 - CCTV 新闻联播</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/css/style.css?v=${Date.now()}">
</head>
<body>
    <header>
        <div class="container">
            <a href="/" class="site-title">Trendfollowing.AI</a>
            <button class="menu-toggle" onclick="toggleMenu()" aria-label="Toggle menu">
                <span class="hamburger"></span>
            </button>
            <nav class="nav-menu" id="navMenu">
                <a href="/" class="nav-link active">CCTV Trend</a>
                <!-- <a href="#" class="nav-link">Product 2</a> -->
                <!-- <a href="#" class="nav-link">Product 3</a> -->
            </nav>
        </div>
    </header>

    <main class="container">
        <h1>${(() => {
      const dateMoment = moment(dayInfo.date, 'YYYYMMDD');
      return dateMoment.isValid() ? dateMoment.format('YYYY年MM月DD日') : dayInfo.date;
    })()}</h1>
        <p style="text-align: center; margin-bottom: 3rem; color: #64748b;">
            共 ${data.videoList.length} 条新闻
        </p>

        <div class="news-list">
            ${data.videoList.map(video => `
                <article class="news-item">
                    <h2 id="${video.video_id}">${this.cleanTitle(video.video_title)}</h2>
                    <div class="news-meta" style="flex-direction: row; flex-wrap: wrap; gap: 1rem;">
                        <span> ${video.video_length}</span>
                        <span> ${video.news_hl_tag || 'General'}</span>
                        <span> ${video.pub_date}</span>
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

    <script src="/js/main.js?v=${Date.now()}"></script>
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
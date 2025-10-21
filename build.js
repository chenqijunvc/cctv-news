const fs = require('fs-extra');
const path = require('path');
const moment = require('moment');

// Build script to generate static website from JSON data
class NewsArchiveBuilder {
  constructor() {
    this.assetsDir = './assets';
    this.outputDir = './dist';
    this.templateDir = './templates';
  }

  async build() {
    console.log('🏗️  Building CCTV News Archive...');
    
    // Clean and create output directory
    await fs.remove(this.outputDir);
    await fs.ensureDir(this.outputDir);
    
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
              const category = video.news_hl_tag || 'General';
              index.categories[category] = (index.categories[category] || 0) + 1;
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

  async generateHomePage(index) {
    console.log('🏠 Generating home page...');
    
    const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CCTV 新闻联播历史数据库</title>
  <link rel="stylesheet" href="/css/style.css">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body>
    <header>
        <div class="container">
            <h1>📺 CCTV 新闻联播历史数据库</h1>
            <p>收录了从 ${moment(index.dateRange.start, 'YYYYMMDD').format('YYYY年MM月DD日')} 至 ${moment(index.dateRange.end, 'YYYYMMDD').format('YYYY年MM月DD日')} 的新闻数据</p>
        </div>
    </header>
    
    <main class="container">
        <div class="stats-grid">
            <div class="stat-card">
                <h3>总新闻数</h3>
                <p class="big-number">${index.totalNews.toLocaleString()}</p>
            </div>
            <div class="stat-card">
                <h3>覆盖天数</h3>
                <p class="big-number">${moment(index.dateRange.end, 'YYYYMMDD').diff(moment(index.dateRange.start, 'YYYYMMDD'), 'days')}</p>
            </div>
            <div class="stat-card">
                <h3>数据年份</h3>
                <p class="big-number">${Object.keys(index.years).length}</p>
            </div>
            <div class="stat-card">
                <h3>新闻分类</h3>
                <p class="big-number">${Object.keys(index.categories).length}</p>
            </div>
        </div>
        
        <section class="recent-news">
            <h2>📰 最新新闻</h2>
            <div class="news-grid">
                ${index.recentNews.slice(0, 6).map(news => `
                    <div class="news-card">
                        <h4>${news.video_title}</h4>
                        <p class="news-meta">
                            ${moment(news.date, 'YYYYMMDD').format('YYYY-MM-DD')} | 
                            ${news.news_hl_tag || 'General'} |
                            ${news.video_length}
                        </p>
                        <p class="news-brief">${news.brief || ''}</p>
                        <a href="/archive/${news.year}/${news.date}.html" class="read-more">查看详情</a>
                    </div>
                `).join('')}
            </div>
        </section>
        
        <section class="archive-navigation">
            <h2>📅 按年份浏览</h2>
            <div class="year-grid">
                ${Object.entries(index.years).sort().reverse().map(([year, data]) => `
                    <div class="year-card">
                        <h3><a href="/archive/${year}/">${year}年</a></h3>
                        <p>${data.totalNews} 条新闻</p>
                        <p>${Object.keys(data.months).length} 个月</p>
                    </div>
                `).join('')}
            </div>
        </section>
        
        <section class="search-section">
            <h2>🔍 搜索新闻</h2>
            <div class="search-box">
                <input type="text" id="searchInput" placeholder="搜索新闻标题、内容...">
                <button onclick="searchNews()">搜索</button>
            </div>
            <div id="searchResults"></div>
        </section>
    </main>
    
    <footer>
        <div class="container">
            <p>数据来源：CCTV 官网 | 仅供学习使用 | <a href="https://github.com/china-data/xwlb">GitHub</a></p>
        </div>
    </footer>
    
  <script src="/js/main.js"></script>
    <script>
        // Embed news index for search
        window.newsIndex = ${JSON.stringify(index)};
    </script>
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
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
    <header>
        <div class="container">
            <h1><a href="../../">📺 CCTV 新闻联播</a> > ${year}年</h1>
            <p>共 ${yearData.totalNews} 条新闻</p>
        </div>
    </header>
    
    <main class="container">
        <div class="month-grid">
            ${Object.entries(yearData.months).map(([month, days]) => `
                <div class="month-card">
                    <h3>${parseInt(month)}月</h3>
                    <div class="day-list">
                        ${days.map(day => `
                            <a href="${day.date}.html" class="day-link">
                                ${day.date.substring(6, 8)}日 (${day.newsCount})
                            </a>
                        `).join('')}
                    </div>
                </div>
            `).join('')}
        </div>
    </main>
    
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
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
    <header>
        <div class="container">
            <h1><a href="/">📺 CCTV 新闻联播</a> > <a href="/archive/${dayInfo.date.substring(0, 4)}/">${dayInfo.date.substring(0, 4)}年</a> > ${moment(dayInfo.date, 'YYYYMMDD').format('MM月DD日')}</h1>
            <p>共 ${data.videoList.length} 条新闻</p>
        </div>
    </header>
    
    <main class="container">
        <div class="news-list">
            ${data.videoList.map(video => `
                <article class="news-item">
                    <h2>${video.video_title}</h2>
                    <div class="news-meta">
                        <span class="time">⏰ ${video.video_length}</span>
                        <span class="category">🏷️ ${video.news_hl_tag || 'General'}</span>
                        <span class="date">📅 ${video.pub_date}</span>
                    </div>
                    ${video.video_image ? `<img src="${video.video_image}" alt="${video.video_title}" class="news-image">` : ''}
                    <p class="news-brief">${video.brief || ''}</p>
                    ${video.video_detail && video.video_detail.content ? `
                        <div class="news-content">
                            ${video.video_detail.content}
                        </div>
                    ` : ''}
                    <div class="news-actions">
                        <a href="${video.video_url}" target="_blank" class="btn-primary">观看视频</a>
                        <button onclick="shareNews('${video.video_title}', '${video.video_url}')" class="btn-secondary">分享</button>
                    </div>
                </article>
            `).join('')}
        </div>
    </main>
    
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
                category: video.news_hl_tag || 'General',
                date: day.date,
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
  const builder = new NewsArchiveBuilder();
  builder.build().catch(console.error);
}

module.exports = NewsArchiveBuilder;
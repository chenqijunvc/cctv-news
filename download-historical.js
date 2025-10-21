const loadData = require('./src/loadData');
const moment = require('moment');
const fs = require('fs-extra');
const path = require('path');

// One-time historical data downloader
// Downloads from 2011-01-01 until earliest existing record (2012-07-01)
class HistoricalDownloader {
  constructor() {
    this.startDate = '20110101'; // Start from 2011-01-01
    this.endDate = '20120701';   // Stop before earliest existing record (20120702)
    this.downloaded = 0;
    this.skipped = 0;
    this.noData = 0;
    this.errors = 0;
  }

  async findEarliestExistingRecord() {
    console.log('🔍 Finding earliest existing record...');
    
    const assetsDir = path.join(__dirname, 'assets');
    const years = await fs.readdir(assetsDir);
    
    let earliest = null;
    
    for (const year of years.sort()) {
      const yearDir = path.join(assetsDir, year);
      if (!(await fs.stat(yearDir)).isDirectory()) continue;
      
      const files = await fs.readdir(yearDir);
      const jsonFiles = files.filter(f => f.endsWith('.json')).sort();
      
      if (jsonFiles.length > 0) {
        const firstFile = jsonFiles[0].replace('.json', '');
        if (!earliest || firstFile < earliest) {
          earliest = firstFile;
        }
        break; // Since years are sorted, first year with data has the earliest
      }
    }
    
    console.log(`📅 Earliest existing record: ${earliest ? moment(earliest, 'YYYYMMDD').format('YYYY-MM-DD') : 'None found'}`);
    return earliest;
  }

  async fileExists(dateStr) {
    const year = dateStr.substring(0, 4);
    const filePath = path.join(__dirname, `assets/${year}/${dateStr}.json`);
    return await fs.pathExists(filePath);
  }

  async downloadDate(dateStr) {
    try {
      // Check if already exists
      if (await this.fileExists(dateStr)) {
        console.log(`  ⏭️  ${dateStr} (exists)`);
        this.skipped++;
        return 'exists';
      }
      
      console.log(`  📥 ${dateStr}...`);
      
      // Try to download
      await loadData(dateStr);
      
      // Verify the file was created and has content
      const year = dateStr.substring(0, 4);
      const filePath = path.join(__dirname, `assets/${year}/${dateStr}.json`);
      
      if (await fs.pathExists(filePath)) {
        const data = await fs.readJson(filePath);
        const newsCount = data.videoList ? data.videoList.length : 0;
        
        if (newsCount > 0) {
          console.log(`  ✅ ${dateStr} - ${newsCount} items`);
          this.downloaded++;
          return 'success';
        } else {
          console.log(`  ⚪ ${dateStr} - no data`);
          this.noData++;
          return 'nodata';
        }
      } else {
        console.log(`  ❌ ${dateStr} - file not created`);
        this.errors++;
        return 'error';
      }
      
    } catch (error) {
      console.log(`  ❌ ${dateStr} - ${error.message}`);
      this.errors++;
      return 'error';
    }
  }

  async run() {
    console.log('🚀 Historical Data Downloader');
    console.log('==============================\n');
    
    // Verify date range
    const earliest = await this.findEarliestExistingRecord();
    if (earliest) {
      this.endDate = moment(earliest, 'YYYYMMDD').subtract(1, 'day').format('YYYYMMDD');
      console.log(`📊 Will download from ${moment(this.startDate, 'YYYYMMDD').format('YYYY-MM-DD')} to ${moment(this.endDate, 'YYYYMMDD').format('YYYY-MM-DD')}`);
    }
    
    console.log('🎯 Starting historical download...\n');
    
    const start = moment(this.startDate, 'YYYYMMDD');
    const end = moment(this.endDate, 'YYYYMMDD');
    const totalDays = end.diff(start, 'days') + 1;
    
    let current = start.clone();
    let processed = 0;
    
    while (current.isSameOrBefore(end)) {
      const dateStr = current.format('YYYYMMDD');
      processed++;
      
      console.log(`[${processed}/${totalDays}] ${current.format('YYYY-MM-DD')}`);
      
      await this.downloadDate(dateStr);
      
      // Progress report every 50 days
      if (processed % 50 === 0) {
        this.printProgress(processed, totalDays);
      }
      
      current.add(1, 'day');
      
      // Respectful delay
      await new Promise(resolve => setTimeout(resolve, 800));
    }
    
    console.log('\n🎉 Historical download completed!');
    this.printSummary(totalDays);
  }

  printProgress(processed, total) {
    const percent = Math.round((processed / total) * 100);
    console.log(`\n📊 Progress: ${processed}/${total} (${percent}%)`);
    console.log(`✅ Downloaded: ${this.downloaded}`);
    console.log(`⏭️  Skipped: ${this.skipped}`);
    console.log(`⚪ No data: ${this.noData}`);
    console.log(`❌ Errors: ${this.errors}\n`);
  }

  printSummary(total) {
    console.log('\n📊 FINAL SUMMARY');
    console.log('=================');
    console.log(`📅 Date range: ${moment(this.startDate, 'YYYYMMDD').format('YYYY-MM-DD')} to ${moment(this.endDate, 'YYYYMMDD').format('YYYY-MM-DD')}`);
    console.log(`📈 Total days processed: ${total}`);
    console.log(`✅ Successfully downloaded: ${this.downloaded}`);
    console.log(`⏭️  Skipped (already existed): ${this.skipped}`);
    console.log(`⚪ No data available: ${this.noData}`);
    console.log(`❌ Errors: ${this.errors}`);
    
    const successRate = Math.round((this.downloaded / (total - this.skipped)) * 100);
    console.log(`\n🎯 Success rate: ${successRate}% (of new attempts)`);
    
    if (this.downloaded > 0) {
      console.log(`\n🚀 Your archive now extends back to 2011!`);
      console.log(`📚 Added approximately ${this.downloaded} days of historical data`);
      console.log(`📰 This could be thousands of additional news items!`);
    }
    
    console.log('\n✨ Run "npm run build" to rebuild your website with the new historical data!');
  }
}

// Run the downloader
const downloader = new HistoricalDownloader();
downloader.run().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
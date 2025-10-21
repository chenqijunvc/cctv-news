const loadData = require('./src/loadData');
const moment = require('moment');
const fs = require('fs-extra');
const path = require('path');

// 获取北京时间 (UTC+8)
const getBeijingTime = () => {
  return moment().utcOffset('+08:00');
};

// 查找最新的资产日期
async function findLatestAssetDate() {
  const assetsDir = path.join(__dirname, 'assets');
  
  try {
    const years = await fs.readdir(assetsDir);
    let latestDate = null;
    
    // 按年份倒序检查
    for (const year of years.sort().reverse()) {
      const yearDir = path.join(assetsDir, year);
      if (!(await fs.stat(yearDir)).isDirectory()) continue;
      
      const files = await fs.readdir(yearDir);
      const jsonFiles = files.filter(f => f.endsWith('.json')).sort().reverse();
      
      if (jsonFiles.length > 0) {
        const latestFile = jsonFiles[0].replace('.json', '');
        latestDate = latestFile;
        break; // 找到最新年份的最新文件就停止
      }
    }
    
    return latestDate;
  } catch (error) {
    return null;
  }
}

// 检查文件是否存在
async function fileExists(dateStr) {
  const year = dateStr.substring(0, 4);
  const filePath = path.join(__dirname, `assets/${year}/${dateStr}.json`);
  return await fs.pathExists(filePath);
}

// 下载单个日期
async function downloadDate(dateStr) {
  try {
    if (await fileExists(dateStr)) {
      return 'exists';
    }
    
    await loadData(dateStr);
    
    // 验证文件是否创建成功
    if (await fileExists(dateStr)) {
      return 'success';
    } else {
      return 'nodata';
    }
  } catch (error) {
    return 'error';
  }
}

// 主函数
async function main() {
  const today = getBeijingTime().format('YYYYMMDD');
  
  // 查找最新的资产日期
  const latestAssetDate = await findLatestAssetDate();
  
  if (!latestAssetDate) {
    // 如果没有现有资产，下载过去7天
    let downloaded = 0;
    for (let i = 0; i < 7; i++) {
      const dateStr = getBeijingTime().subtract(i, 'days').format('YYYYMMDD');
      const result = await downloadDate(dateStr);
      if (result === 'success') downloaded++;
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    return;
  }
  
  // 计算需要填补的日期范围
  const latestMoment = moment(latestAssetDate, 'YYYYMMDD');
  const todayMoment = moment(today, 'YYYYMMDD');
  const daysBehind = todayMoment.diff(latestMoment, 'days');
  
  if (daysBehind <= 0) {
    // 即使是最新的，也检查今天是否有新数据
    if (daysBehind === 0 && !await fileExists(today)) {
      await downloadDate(today);
    }
    
    return;
  }
  
  // 填补缺失的日期
  let downloaded = 0;
  let skipped = 0;
  let errors = 0;
  
  const startDate = moment(latestAssetDate, 'YYYYMMDD').add(1, 'day');
  let current = startDate.clone();
  
  while (current.isSameOrBefore(todayMoment)) {
    const dateStr = current.format('YYYYMMDD');
    const result = await downloadDate(dateStr);
    
    switch (result) {
      case 'success':
        downloaded++;
        break;
      case 'exists':
        skipped++;
        break;
      case 'error':
      case 'nodata':
        errors++;
        break;
    }
    
    current.add(1, 'day');
    
    // 请求之间的延迟
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

// 运行主函数
main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
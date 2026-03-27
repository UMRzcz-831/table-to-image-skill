#!/usr/bin/env node
/**
 * 生成4个主题的图片示例
 */

import { renderTable } from './index.js';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 用户提供的表格数据
const tableData = [
  { scheme: 'A. 渐进优化', tech: '保持 Sharp+SVG，优化字体和配置', pros: '风险低、兼容好🆚', effort: '⭐⭐' },
  { scheme: 'B. Satori 升级', tech: 'Vercel Satori + Resvg', pros: '现代化、CSS支持好🆚', effort: '⭐⭐⭐⭐' },
  { scheme: 'C. 混合架构', tech: '简单表格→Sharp，复杂→Puppeteer', pros: '灵活、兼顾性能和功能😭', effort: '⭐⭐⭐⭐⭐' }
];

const columns = [
  { key: 'scheme', header: '方案', width: 120 },
  { key: 'tech', header: '技术栈', width: 280 },
  { key: 'pros', header: '优点', width: 150 },
  { key: 'effort', header: '工作量', width: 80, align: 'center' }
];

const themes = ['discord-light', 'discord-dark', 'finance', 'minimal'];

async function generateExamples() {
  console.log('生成4个主题的图片示例...\n');
  
  for (const theme of themes) {
    console.log(`生成 ${theme} 主题...`);
    
    try {
      const result = await renderTable({
        data: tableData,
        columns,
        title: '技术方案对比',
        subtitle: `Theme: ${theme}`,
        theme,
        maxWidth: 700
      });
      
      const outputPath = join(__dirname, '..', 'assets', `theme-${theme}.png`);
      writeFileSync(outputPath, result.buffer);
      
      console.log(`  ✅ assets/theme-${theme}.png (${result.width}x${result.height}px)`);
    } catch (error) {
      console.error(`  ❌ ${theme} 失败:`, error.message);
    }
  }
  
  console.log('\n完成！');
}

generateExamples().catch(console.error);

/**
 * Table2Image - Main API
 * Convert tables to PNG images for chat platforms
 * Using Playwright + Chromium for perfect emoji and font support
 */

import { chromium } from 'playwright';

// ============ Types ============

/**
 * @typedef {Object} ColumnConfig
 * @property {string} key - Data property name
 * @property {string} header - Display header text
 * @property {number|string} [width] - Column width
 * @property {'left'|'center'|'right'} [align] - Text alignment
 * @property {function} [formatter] - Value formatter function
 * @property {Object|function} [style] - Cell style or style function
 * @property {boolean} [wrap] - Enable text wrapping
 * @property {number} [maxLines] - Max lines when wrapping
 */

/**
 * @typedef {Object} RenderResult
 * @property {Buffer} buffer - PNG image buffer
 * @property {number} width - Image width
 * @property {number} height - Image height
 * @property {string} format - Image format ('png')
 */

// ============ Theme Definitions ============

const THEMES = {
  'discord-light': {
    background: '#ffffff',
    headerBg: '#5865F2',
    headerText: '#ffffff',
    rowBg: '#ffffff',
    rowAltBg: '#f2f3f5',
    text: '#2e3338',
    border: '#e3e5e8'
  },
  'discord-dark': {
    background: '#2f3136',
    headerBg: '#5865F2',
    headerText: '#ffffff',
    rowBg: '#36393f',
    rowAltBg: '#2f3136',
    text: '#dcddde',
    border: '#40444b'
  },
  'finance': {
    background: '#1a1a2e',
    headerBg: '#16213e',
    headerText: '#eaeaea',
    rowBg: '#1a1a2e',
    rowAltBg: '#16213e',
    text: '#eaeaea',
    border: '#0f3460'
  },
  'minimal': {
    background: '#ffffff',
    headerBg: '#333333',
    headerText: '#ffffff',
    rowBg: '#ffffff',
    rowAltBg: '#f8f9fa',
    text: '#333333',
    border: '#eeeeee'
  }
};

// ============ Browser Pool ============

let browser = null;
let browserPromise = null;

async function getBrowser() {
  if (browser) return browser;
  if (browserPromise) return browserPromise;
  
  browserPromise = chromium.launch({
    headless: true
  });
  
  browser = await browserPromise;
  browserPromise = null;
  
  // Handle browser close
  browser.on('disconnected', () => {
    browser = null;
  });
  
  return browser;
}

// Cleanup on exit
process.on('exit', async () => {
  if (browser) {
    await browser.close();
  }
});

process.on('SIGINT', async () => {
  if (browser) {
    await browser.close();
  }
  process.exit(0);
});

// ============ HTML Generation ============

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function isNumeric(val) {
  if (typeof val === 'number') return true;
  if (typeof val !== 'string') return false;
  const cleaned = val.replace(/[$,%+\-\s]/g, '');
  return !isNaN(parseFloat(cleaned)) && isFinite(cleaned);
}

function calculateColumnWidths(columns, data, maxWidth) {
  const fontSize = 14;
  const padding = 14;
  const minColWidth = fontSize * 6;
  
  // Estimate text widths (approximate)
  const estimateWidth = (text) => {
    let width = 0;
    for (const char of String(text)) {
      const code = char.charCodeAt(0);
      if (code >= 0x4E00 && code <= 0x9FFF) {
        width += fontSize * 1.05; // CJK
      } else if (code > 127) {
        width += fontSize * 0.9; // Other unicode
      } else {
        width += fontSize * 0.58; // ASCII
      }
    }
    return width;
  };
  
  const naturalWidths = columns.map((col) => {
    const headerWidth = estimateWidth(col.header);
    
    let maxCellWidth = 0;
    data.forEach(row => {
      const value = row[col.key];
      const formatted = col.formatter ? col.formatter(value, row) : String(value ?? '');
      const textWidth = estimateWidth(formatted);
      maxCellWidth = Math.max(maxCellWidth, Math.min(textWidth, fontSize * 30));
    });
    
    return Math.max(headerWidth, maxCellWidth, minColWidth) + padding * 2;
  });
  
  const totalNaturalWidth = naturalWidths.reduce((a, b) => a + b, 0);
  
  if (totalNaturalWidth <= maxWidth) {
    return naturalWidths;
  }
  
  // Scale down if too wide
  const scale = maxWidth / totalNaturalWidth;
  return naturalWidths.map(w => Math.max(minColWidth, Math.floor(w * scale)));
}

function generateTableHTML(data, columns, theme, options = {}) {
  const { title, subtitle, maxWidth = 800, stripe = true } = options;
  const themeColors = THEMES[theme] || THEMES['discord-light'];
  const fontSize = 14;
  const lineHeight = 1.5;
  const padding = { x: 14, y: 10 };
  
  // Calculate column widths
  const colWidths = calculateColumnWidths(columns, data, maxWidth);
  const totalWidth = colWidths.reduce((a, b) => a + b, 0);
  
  // Generate CSS
  const css = `
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans CJK SC", "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif;
      font-size: ${fontSize}px;
      line-height: ${lineHeight};
      background: ${themeColors.background};
      color: ${themeColors.text};
    }
    .table-container {
      width: ${totalWidth}px;
      padding: 0;
    }
    .title {
      text-align: center;
      padding: ${fontSize * 0.5}px 0;
    }
    .title-text {
      font-weight: 600;
      font-size: ${fontSize * 1.25}px;
      color: ${themeColors.text};
    }
    .subtitle {
      font-size: ${fontSize * 0.9}px;
      opacity: 0.7;
      color: ${themeColors.text};
      margin-top: ${fontSize * 0.3}px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    thead {
      background: ${themeColors.headerBg};
    }
    th {
      color: ${themeColors.headerText};
      font-weight: 600;
      padding: ${padding.y}px ${padding.x}px;
      text-align: left;
      border-radius: 0;
    }
    th:first-child {
      border-radius: 4px 0 0 0;
    }
    th:last-child {
      border-radius: 0 4px 0 0;
    }
    td {
      padding: ${padding.y}px ${padding.x}px;
      border-top: 1px solid ${themeColors.border};
    }
    tr:nth-child(even) {
      background: ${stripe ? themeColors.rowAltBg : themeColors.rowBg};
    }
    tr:nth-child(odd) {
      background: ${themeColors.rowBg};
    }
    .text-right {
      text-align: right;
    }
    .text-center {
      text-align: center;
    }
    .text-left {
      text-align: left;
    }
  `;
  
  // Generate header
  const headerHTML = columns.map((col, i) => {
    const align = col.align || 'left';
    const alignClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
    return `<th class="${alignClass}" style="width: ${colWidths[i]}px">${escapeHtml(col.header)}</th>`;
  }).join('');
  
  // Generate rows
  const rowsHTML = data.map(row => {
    const cellsHTML = columns.map(col => {
      const value = row[col.key];
      const formatted = col.formatter ? col.formatter(value, row) : String(value ?? '');
      const align = col.align || (isNumeric(value) ? 'right' : 'left');
      const alignClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
      
      // Apply custom style
      let style = '';
      if (col.style) {
        const cellStyle = typeof col.style === 'function' ? col.style(value, row) : col.style;
        if (cellStyle.color) style += `color: ${cellStyle.color};`;
        if (cellStyle.fontWeight === 'bold' || cellStyle.fontWeight >= 600) style += 'font-weight: 600;';
      }
      
      return `<td class="${alignClass}" style="${style}">${escapeHtml(formatted)}</td>`;
    }).join('');
    
    return `<tr>${cellsHTML}</tr>`;
  }).join('');
  
  // Generate title section
  const titleHTML = title ? `
    <div class="title">
      <div class="title-text">${escapeHtml(title)}</div>
      ${subtitle ? `<div class="subtitle">${escapeHtml(subtitle)}</div>` : ''}
    </div>
  ` : '';
  
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>${css}</style>
</head>
<body>
  <div class="table-container">
    ${titleHTML}
    <table>
      <thead>
        <tr>${headerHTML}</tr>
      </thead>
      <tbody>
        ${rowsHTML}
      </tbody>
    </table>
  </div>
</body>
</html>`;
}

// ============ Main Export Functions ============

/**
 * Render table to PNG image
 * @param {Object} config - Configuration object
 * @returns {Promise<RenderResult>}
 */
export async function renderTable(config) {
  const { data, columns, title, subtitle, theme = 'discord-light', maxWidth = 800, stripe = true } = config;
  
  if (!data || !Array.isArray(data) || data.length === 0) {
    throw new Error('Data must be a non-empty array');
  }
  
  if (!columns || !Array.isArray(columns) || columns.length === 0) {
    throw new Error('Columns must be a non-empty array');
  }
  
  const html = generateTableHTML(data, columns, theme, { title, subtitle, maxWidth, stripe });
  
  // Get browser instance
  const browserInstance = await getBrowser();
  
  // Create new page (with 2x resolution for sharper images)
  const page = await browserInstance.newPage({
    deviceScaleFactor: 2
  });
  
  try {
    // Set content
    await page.setContent(html, { waitUntil: 'networkidle' });
    
    // Wait for fonts to load
    await page.waitForTimeout(100);
    
    // Get table dimensions
    const dimensions = await page.evaluate(() => {
      const container = document.querySelector('.table-container');
      const rect = container.getBoundingClientRect();
      return {
        width: Math.ceil(rect.width),
        height: Math.ceil(rect.height)
      };
    });
    
    // Take screenshot
    const screenshot = await page.screenshot({
      type: 'png',
      clip: {
        x: 0,
        y: 0,
        width: dimensions.width,
        height: dimensions.height
      }
    });
    
    return {
      buffer: screenshot,
      width: dimensions.width,
      height: dimensions.height,
      format: 'png'
    };
  } finally {
    await page.close();
  }
}

/**
 * Quick render for Discord (uses discord-dark theme)
 * @param {Array} data - Table data
 * @param {Array} columns - Column definitions
 * @param {string} [title] - Table title
 * @returns {Promise<RenderResult>}
 */
export async function renderDiscordTable(data, columns, title) {
  return renderTable({ data, columns, title, theme: 'discord-dark', stripe: true });
}

/**
 * Quick render for financial data (uses finance theme)
 * @param {Array} data - Table data
 * @param {Array} columns - Column definitions
 * @param {string} [title] - Table title
 * @returns {Promise<RenderResult>}
 */
export async function renderFinanceTable(data, columns, title) {
  return renderTable({ data, columns, title, theme: 'finance', stripe: true });
}

// ============ Markdown Table Parsing ============

/**
 * Parse markdown table to structured data
 * @param {string} markdown - Markdown table string
 * @returns {Object|null} - { headers, rows } or null
 */
export function parseMarkdownTable(markdown) {
  const cleanMarkdown = markdown
    .replace(/^```markdown\n?/i, '')
    .replace(/\n?```$/, '')
    .trim();
  
  const lines = cleanMarkdown.split('\n').map(line => line.trim()).filter(line => line);
  
  if (lines.length < 2 || !lines[0].includes('|')) return null;
  
  const headerLine = lines[0];
  const headers = headerLine
    .split('|')
    .map(cell => cell.trim())
    .filter(cell => cell);
  
  if (headers.length === 0) return null;
  
  const dataStartIndex = lines[1].match(/^\|?[-\s|]+\|?$/) ? 2 : 1;
  
  const rows = [];
  for (let i = dataStartIndex; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes('|')) continue;
    
    const cells = line
      .split('|')
      .map(cell => cell.trim())
      .filter((_, index, arr) => {
        if (index === 0 && cell.trim() === '') return false;
        if (index === arr.length - 1 && cell.trim() === '') return false;
        return true;
      });
    
    if (cells.length === headers.length) {
      const row = {};
      headers.forEach((header, index) => {
        const key = header.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
        row[key || `col_${index}`] = cells[index];
      });
      rows.push(row);
    }
  }
  
  return rows.length > 0 ? { headers, rows } : null;
}

/**
 * Check if content contains markdown table
 * @param {string} content - Content to check
 * @returns {boolean}
 */
export function containsMarkdownTable(content) {
  return /\|\s*[^|\n]+\s*\|/.test(content) && content.includes('\n');
}

/**
 * Check if channel is markdown-table-unfriendly
 * @param {string} channel - Channel type
 * @returns {boolean}
 */
export function isNonTableFriendlyChannel(channel) {
  return ['discord', 'telegram', 'whatsapp'].includes(channel.toLowerCase());
}

/**
 * Auto-convert markdown tables in content to images
 * @param {string} content - Message content
 * @param {string} channel - Target channel type
 * @param {Object} [options] - Options
 * @returns {Promise<{converted: boolean, image?: Buffer, tableCount?: number}>}
 */
export async function autoConvertMarkdownTable(content, channel, options = {}) {
  if (!isNonTableFriendlyChannel(channel)) {
    return { converted: false };
  }
  
  if (!containsMarkdownTable(content)) {
    return { converted: false };
  }
  
  const parsed = parseMarkdownTable(content);
  if (!parsed) {
    return { converted: false };
  }
  
  const theme = options.theme || (channel === 'discord' ? 'discord-dark' : 'minimal');
  
  const columns = parsed.headers.map((header, index) => ({
    key: header.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') || `col_${index}`,
    header,
    width: 'auto'
  }));
  
  const result = await renderTable({
    data: parsed.rows,
    columns,
    title: options.title,
    theme,
    maxWidth: options.maxWidth || 800
  });
  
  return {
    converted: true,
    image: result.buffer,
    tableCount: 1
  };
}

// Default export
export default { renderTable, renderDiscordTable, renderFinanceTable, autoConvertMarkdownTable };

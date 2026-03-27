/**
 * Table2Image - Main API
 * Convert tables to PNG images for chat platforms
 * Using node-canvas for native emoji and font support
 */

import { createCanvas, registerFont } from 'canvas';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

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

// ============ Text Measurement ============

function isCJK(char) {
  const code = char.charCodeAt(0);
  return (code >= 0x4E00 && code <= 0x9FFF) ||
         (code >= 0x3400 && code <= 0x4DBF) ||
         (code >= 0x3040 && code <= 0x309F) ||
         (code >= 0x30A0 && code <= 0x30FF) ||
         (code >= 0xAC00 && code <= 0xD7AF);
}

function calculateTextWidth(ctx, text) {
  return ctx.measureText(text).width;
}

function truncateText(ctx, text, maxWidth) {
  let width = ctx.measureText(text).width;
  if (width <= maxWidth) return text;
  
  let result = text;
  while (result.length > 0) {
    result = result.slice(0, -1);
    if (ctx.measureText(result + '…').width <= maxWidth) {
      return result + '…';
    }
  }
  return '…';
}

function wrapText(ctx, text, maxWidth, maxLines = 3) {
  const width = ctx.measureText(text).width;
  if (width <= maxWidth) return [text];
  
  const lines = [];
  let currentLine = '';
  
  for (const char of text) {
    const testLine = currentLine + char;
    const testWidth = ctx.measureText(testLine).width;
    
    if (testWidth > maxWidth && currentLine.length > 0) {
      lines.push(currentLine);
      if (lines.length >= maxLines) {
        const lastLine = lines[lines.length - 1];
        lines[lines.length - 1] = truncateText(ctx, lastLine, maxWidth - ctx.measureText('…').width) + '…';
        return lines;
      }
      currentLine = char;
    } else {
      currentLine = testLine;
    }
  }
  
  if (currentLine) {
    lines.push(currentLine);
  }
  
  return lines.length > 0 ? lines : [''];
}

function isNumeric(val) {
  if (typeof val === 'number') return true;
  if (typeof val !== 'string') return false;
  const cleaned = val.replace(/[$,%+\-\s]/g, '');
  return !isNaN(parseFloat(cleaned)) && isFinite(cleaned);
}

// ============ Column Width Calculation ============

function calculateColumnWidths(columns, data, ctx, padding, maxWidth) {
  const minColWidth = 14 * 6; // fontSize * 6
  
  const naturalWidths = columns.map((col, i) => {
    const headerWidth = ctx.measureText(col.header).width;
    
    let maxCellWidth = 0;
    data.forEach(row => {
      const value = row[col.key];
      const formatted = col.formatter ? col.formatter(value, row) : String(value ?? '');
      const textWidth = ctx.measureText(formatted).width;
      maxCellWidth = Math.max(maxCellWidth, Math.min(textWidth, 14 * 30));
    });
    
    return Math.max(headerWidth, maxCellWidth, minColWidth) + padding.x * 2;
  });
  
  const totalNaturalWidth = naturalWidths.reduce((a, b) => a + b, 0);
  
  if (totalNaturalWidth <= maxWidth) {
    return naturalWidths;
  }
  
  const colWidths = [...naturalWidths];
  const minWidths = columns.map((col, i) => {
    const headerWidth = ctx.measureText(col.header).width;
    return Math.max(headerWidth + padding.x * 2, minColWidth);
  });
  
  const totalMinWidth = minWidths.reduce((a, b) => a + b, 0);
  
  if (totalMinWidth >= maxWidth) {
    const scale = maxWidth / totalMinWidth;
    return minWidths.map(w => Math.floor(w * scale));
  }
  
  const remainingSpace = maxWidth - totalMinWidth;
  const extraWidths = naturalWidths.map((w, i) => Math.max(0, w - minWidths[i]));
  const totalExtra = extraWidths.reduce((a, b) => a + b, 0);
  
  if (totalExtra > 0) {
    for (let i = 0; i < colWidths.length; i++) {
      colWidths[i] = Math.floor(minWidths[i] + (extraWidths[i] / totalExtra) * remainingSpace);
    }
  }
  
  const currentTotal = colWidths.reduce((a, b) => a + b, 0);
  colWidths[colWidths.length - 1] += maxWidth - currentTotal;
  
  return colWidths;
}

// ============ Table Rendering ============

async function renderTableToCanvas(data, columns, theme, options = {}) {
  const { title, subtitle, maxWidth = 800, stripe = true } = options;
  const fontSize = 14;
  const padding = { x: 14, y: 10 };
  const lineHeight = fontSize * 1.5;
  const themeColors = THEMES[theme] || THEMES['discord-light'];
  
  // Create a temporary canvas for text measurement
  const tempCanvas = createCanvas(100, 100);
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
  
  // Calculate column widths
  const colWidths = calculateColumnWidths(columns, data, tempCtx, padding, maxWidth);
  const totalWidth = colWidths.reduce((a, b) => a + b, 0);
  
  // Calculate header height
  let maxHeaderLines = 1;
  columns.forEach((col, i) => {
    const availWidth = colWidths[i] - padding.x * 2;
    const lines = wrapText(tempCtx, col.header, availWidth, 2);
    maxHeaderLines = Math.max(maxHeaderLines, lines.length);
  });
  const headerHeight = lineHeight * maxHeaderLines + padding.y * 2;
  
  // Calculate row heights
  const rows = [];
  const titleHeight = title ? fontSize * 2.5 + (subtitle ? fontSize * 1.5 : 0) : 0;
  
  for (const row of data) {
    let maxLines = 1;
    
    columns.forEach((col, i) => {
      const value = row[col.key];
      const formatted = col.formatter ? col.formatter(value, row) : String(value ?? '');
      const availWidth = colWidths[i] - padding.x * 2;
      const lines = col.wrap !== false 
        ? wrapText(tempCtx, formatted, availWidth, col.maxLines || 3)
        : [truncateText(tempCtx, formatted, availWidth)];
      
      maxLines = Math.max(maxLines, lines.length);
    });
    
    const rowHeight = lineHeight * maxLines + padding.y * 2;
    rows.push({ height: rowHeight, data: row });
  }
  
  const bodyHeight = rows.reduce((sum, r) => sum + r.height, 0);
  const totalHeight = titleHeight + headerHeight + bodyHeight;
  
  // Create the actual canvas
  const canvas = createCanvas(totalWidth, totalHeight);
  const ctx = canvas.getContext('2d');
  
  // Fill background
  ctx.fillStyle = themeColors.background;
  ctx.fillRect(0, 0, totalWidth, totalHeight);
  
  // Draw title
  if (title) {
    ctx.fillStyle = themeColors.text;
    ctx.font = `600 ${fontSize * 1.25}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(title, totalWidth / 2, fontSize * 1.5);
    
    if (subtitle) {
      ctx.fillStyle = themeColors.text;
      ctx.font = `${fontSize * 0.9}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
      ctx.globalAlpha = 0.7;
      ctx.fillText(subtitle, totalWidth / 2, fontSize * 3);
      ctx.globalAlpha = 1.0;
    }
  }
  
  // Draw header background
  let y = titleHeight;
  ctx.fillStyle = themeColors.headerBg;
  ctx.beginPath();
  ctx.roundRect(0, y, totalWidth, headerHeight, 4);
  ctx.fill();
  
  // Draw header cells
  let x = 0;
  ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
  ctx.fillStyle = themeColors.headerText;
  
  columns.forEach((col, i) => {
    const availWidth = colWidths[i] - padding.x * 2;
    const headerLines = wrapText(tempCtx, col.header, availWidth, 2);
    
    const align = col.align || (isNumeric(data[0]?.[col.key]) ? 'right' : 'left');
    ctx.textAlign = align === 'right' ? 'right' : align === 'center' ? 'center' : 'left';
    
    const textX = align === 'right' 
      ? x + colWidths[i] - padding.x 
      : align === 'center' 
        ? x + colWidths[i] / 2 
        : x + padding.x;
    
    const textBlockHeight = headerLines.length * lineHeight;
    let lineY = y + (headerHeight - textBlockHeight) / 2 + fontSize;
    
    headerLines.forEach(line => {
      ctx.fillText(line, textX, lineY);
      lineY += lineHeight;
    });
    
    x += colWidths[i];
  });
  
  y += headerHeight;
  
  // Draw data rows
  rows.forEach((row, rowIndex) => {
    const isAlt = stripe && rowIndex % 2 === 1;
    const rowBg = isAlt ? themeColors.rowAltBg : themeColors.rowBg;
    
    // Row background
    ctx.fillStyle = rowBg;
    ctx.fillRect(0, y, totalWidth, row.height);
    
    // Top border
    ctx.strokeStyle = themeColors.border;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(totalWidth, y);
    ctx.stroke();
    
    // Draw cells
    let x = 0;
    ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    
    columns.forEach((col, i) => {
      const value = row.data[col.key];
      const formatted = col.formatter ? col.formatter(value, row.data) : String(value ?? '');
      
      const align = col.align || (isNumeric(value) ? 'right' : 'left');
      ctx.textAlign = align === 'right' ? 'right' : align === 'center' ? 'center' : 'left';
      
      const textX = align === 'right' 
        ? x + colWidths[i] - padding.x 
        : align === 'center' 
          ? x + colWidths[i] / 2 
          : x + padding.x;
      
      const availWidth = colWidths[i] - padding.x * 2;
      const lines = col.wrap !== false 
        ? wrapText(tempCtx, formatted, availWidth, col.maxLines || 3)
        : [truncateText(tempCtx, formatted, availWidth)];
      
      // Get custom style
      ctx.fillStyle = themeColors.text;
      let fontWeight = '';
      
      if (col.style) {
        const style = typeof col.style === 'function' ? col.style(value, row.data) : col.style;
        if (style.color) ctx.fillStyle = style.color;
        if (style.fontWeight === 'bold' || style.fontWeight >= 600) fontWeight = '600 ';
      }
      
      ctx.font = `${fontWeight}${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
      
      const textBlockHeight = lines.length * lineHeight;
      let lineY = y + (row.height - textBlockHeight) / 2 + fontSize;
      
      lines.forEach(line => {
        ctx.fillText(line, textX, lineY);
        lineY += lineHeight;
      });
      
      x += colWidths[i];
    });
    
    y += row.height;
  });
  
  // Bottom border
  ctx.strokeStyle = themeColors.border;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(totalWidth, y);
  ctx.stroke();
  
  return {
    canvas,
    width: totalWidth,
    height: totalHeight
  };
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
  
  const { canvas, width, height } = await renderTableToCanvas(data, columns, theme, { title, subtitle, maxWidth, stripe });
  
  const pngBuffer = canvas.toBuffer('image/png');
  
  return {
    buffer: pngBuffer,
    width,
    height,
    format: 'png'
  };
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

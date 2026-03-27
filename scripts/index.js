/**
 * Table2Image - Main API
 * Convert tables to PNG images for chat platforms
 * Using Satori + Resvg for better emoji support
 */

import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

// Cache for loaded fonts
let cachedFonts = null;

async function loadFonts() {
  if (cachedFonts) return cachedFonts;
  
  const fonts = [];
  
  try {
    // Load Noto Sans SC from Google Fonts
    const notoSansRegular = await fetch(
      'https://github.com/notofonts/noto-cjk/raw/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf'
    ).then(r => r.arrayBuffer());
    
    const notoSansBold = await fetch(
      'https://github.com/notofonts/noto-cjk/raw/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Bold.otf'
    ).then(r => r.arrayBuffer());
    
    fonts.push(
      { name: 'Noto Sans CJK SC', data: notoSansRegular, weight: 400, style: 'normal' },
      { name: 'Noto Sans CJK SC', data: notoSansBold, weight: 600, style: 'normal' }
    );
  } catch (e) {
    console.warn('Warning: Could not load CJK fonts from network:', e.message);
  }
  
  cachedFonts = fonts;
  return fonts;
}

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
    border: '#e3e5e8',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans CJK SC", "Apple Color Emoji", "Segoe UI Emoji", sans-serif'
  },
  'discord-dark': {
    background: '#2f3136',
    headerBg: '#5865F2',
    headerText: '#ffffff',
    rowBg: '#36393f',
    rowAltBg: '#2f3136',
    text: '#dcddde',
    border: '#40444b',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans CJK SC", "Apple Color Emoji", "Segoe UI Emoji", sans-serif'
  },
  'finance': {
    background: '#1a1a2e',
    headerBg: '#16213e',
    headerText: '#eaeaea',
    rowBg: '#1a1a2e',
    rowAltBg: '#16213e',
    text: '#eaeaea',
    border: '#0f3460',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans CJK SC", "Apple Color Emoji", "Segoe UI Emoji", sans-serif'
  },
  'minimal': {
    background: '#ffffff',
    headerBg: '#333333',
    headerText: '#ffffff',
    rowBg: '#ffffff',
    rowAltBg: '#f8f9fa',
    text: '#333333',
    border: '#eeeeee',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Apple Color Emoji", "Segoe UI Emoji", sans-serif'
  }
};

// ============ Text Width Calculation ============

function isCJK(char) {
  const code = char.charCodeAt(0);
  return (code >= 0x4E00 && code <= 0x9FFF) ||
         (code >= 0x3400 && code <= 0x4DBF) ||
         (code >= 0x3040 && code <= 0x309F) ||
         (code >= 0x30A0 && code <= 0x30FF) ||
         (code >= 0xAC00 && code <= 0xD7AF);
}

function calculateTextWidth(text, fontSize) {
  let width = 0;
  for (const char of String(text)) {
    if (isCJK(char)) {
      width += fontSize * 1.05;
    } else if (char.charCodeAt(0) > 127) {
      width += fontSize * 0.9;
    } else {
      width += fontSize * 0.58;
    }
  }
  return width;
}

function truncateText(text, maxWidth, fontSize) {
  let width = 0;
  let result = '';
  
  for (const char of String(text)) {
    const charWidth = isCJK(char) ? fontSize * 1.05 : 
                      char.charCodeAt(0) > 127 ? fontSize * 0.9 : fontSize * 0.58;
    if (width + charWidth > maxWidth) {
      return result + '…';
    }
    width += charWidth;
    result += char;
  }
  return result;
}

function wrapText(text, maxWidth, fontSize, maxLines = 3) {
  const str = String(text);
  if (calculateTextWidth(str, fontSize) <= maxWidth) {
    return [str];
  }
  
  const lines = [];
  let currentLine = '';
  let currentWidth = 0;
  
  const isCJKText = /[\u4e00-\u9fa5]/.test(str);
  const segments = isCJKText ? str.split('') : str.split(/(\s+)/);
  
  for (const segment of segments) {
    const segWidth = calculateTextWidth(segment, fontSize);
    
    if (currentWidth + segWidth > maxWidth && currentLine.length > 0) {
      lines.push(currentLine.trimEnd());
      
      if (lines.length >= maxLines) {
        const lastLine = lines[lines.length - 1];
        lines[lines.length - 1] = truncateText(lastLine, maxWidth - calculateTextWidth('…', fontSize), fontSize) + '…';
        return lines;
      }
      
      currentLine = segment.trimStart();
      currentWidth = calculateTextWidth(currentLine, fontSize);
    } else {
      currentLine += segment;
      currentWidth += segWidth;
    }
  }
  
  if (currentLine.trim()) {
    lines.push(currentLine.trimEnd());
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

function calculateColumnWidths(columns, data, fontSize, padding, maxWidth) {
  const minColWidth = fontSize * 6;
  
  const naturalWidths = columns.map((col, i) => {
    const headerWidth = calculateTextWidth(col.header, fontSize);
    
    let maxCellWidth = 0;
    data.forEach(row => {
      const value = row[col.key];
      const formatted = col.formatter ? col.formatter(value, row) : String(value ?? '');
      const textWidth = calculateTextWidth(formatted, fontSize);
      maxCellWidth = Math.max(maxCellWidth, Math.min(textWidth, fontSize * 30));
    });
    
    return Math.max(headerWidth, maxCellWidth, minColWidth) + padding.x * 2;
  });
  
  const totalNaturalWidth = naturalWidths.reduce((a, b) => a + b, 0);
  
  if (totalNaturalWidth <= maxWidth) {
    return naturalWidths;
  }
  
  const colWidths = [...naturalWidths];
  const minWidths = columns.map((col, i) => {
    const headerWidth = calculateTextWidth(col.header, fontSize);
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

// ============ Satori JSX Generation ============

function createTableElement(data, columns, theme, options = {}) {
  const { title, subtitle, maxWidth = 800, stripe = true } = options;
  const fontSize = 14;
  const padding = { x: 14, y: 10 };
  const lineHeight = fontSize * 1.5;
  const themeColors = THEMES[theme] || THEMES['discord-light'];
  
  // Calculate column widths
  const colWidths = calculateColumnWidths(columns, data, fontSize, padding, maxWidth);
  const totalWidth = colWidths.reduce((a, b) => a + b, 0);
  
  // Calculate header height
  const headerLineCounts = columns.map((col, i) => {
    const availWidth = colWidths[i] - padding.x * 2;
    const lines = wrapText(col.header, availWidth, fontSize, 2);
    return lines.length;
  });
  const maxHeaderLines = Math.max(...headerLineCounts, 1);
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
        ? wrapText(formatted, availWidth, fontSize, col.maxLines || 3)
        : [truncateText(formatted, availWidth, fontSize)];
      
      maxLines = Math.max(maxLines, lines.length);
    });
    
    const rowHeight = lineHeight * maxLines + padding.y * 2;
    rows.push({ height: rowHeight, data: row });
  }
  
  const bodyHeight = rows.reduce((sum, r) => sum + r.height, 0);
  const totalHeight = titleHeight + headerHeight + bodyHeight;
  
  // Create header cells
  let currentX = 0;
  const headerCells = columns.map((col, i) => {
    const align = col.align || (isNumeric(data[0]?.[col.key]) ? 'right' : 'left');
    const textAlign = align === 'right' ? 'right' : align === 'center' ? 'center' : 'left';
    const availWidth = colWidths[i] - padding.x * 2;
    const headerLines = wrapText(col.header, availWidth, fontSize, 2);
    
    const cellStyle = {
      width: colWidths[i],
      height: headerHeight,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: textAlign === 'center' ? 'center' : textAlign === 'right' ? 'flex-end' : 'flex-start',
      paddingLeft: padding.x,
      paddingRight: padding.x,
      boxSizing: 'border-box'
    };
    
    const result = {
      type: 'div',
      props: {
        style: { ...cellStyle, display: 'flex', flexDirection: 'column' },
        children: headerLines.length === 1 ? {
          type: 'div',
          props: {
            style: { 
              color: themeColors.headerText, 
              fontSize, 
              fontWeight: 600,
              lineHeight: `${lineHeight}px`,
              textAlign
            },
            children: headerLines[0]
          }
        } : headerLines.map((line, idx) => ({
          type: 'div',
          props: {
            style: { 
              color: themeColors.headerText, 
              fontSize, 
              fontWeight: 600,
              lineHeight: `${lineHeight}px`,
              textAlign
            },
            children: line
          }
        }))
      }
    };
    
    currentX += colWidths[i];
    return result;
  });
  
  // Create data rows
  const dataRows = rows.map((row, rowIndex) => {
    const isAlt = stripe && rowIndex % 2 === 1;
    const rowBg = isAlt ? themeColors.rowAltBg : themeColors.rowBg;
    
    let x = 0;
    const cells = columns.map((col, i) => {
      const value = row.data[col.key];
      const formatted = col.formatter ? col.formatter(value, row.data) : String(value ?? '');
      
      const align = col.align || (isNumeric(value) ? 'right' : 'left');
      const textAlign = align === 'right' ? 'right' : align === 'center' ? 'center' : 'left';
      
      const availWidth = colWidths[i] - padding.x * 2;
      const lines = col.wrap !== false 
        ? wrapText(formatted, availWidth, fontSize, col.maxLines || 3)
        : [truncateText(formatted, availWidth, fontSize)];
      
      // Get custom style
      let textColor = themeColors.text;
      let fontWeight = 'normal';
      
      if (col.style) {
        const style = typeof col.style === 'function' ? col.style(value, row.data) : col.style;
        if (style.color) textColor = style.color;
        if (style.fontWeight === 'bold' || style.fontWeight >= 600) fontWeight = 'bold';
      }
      
      const cellResult = {
        type: 'div',
        props: {
          style: {
            width: colWidths[i],
            height: row.height,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: textAlign === 'center' ? 'center' : textAlign === 'right' ? 'flex-end' : 'flex-start',
            paddingLeft: padding.x,
            paddingRight: padding.x,
            boxSizing: 'border-box'
          },
          children: lines.length === 1 ? {
            type: 'div',
            props: {
              style: { 
                color: textColor, 
                fontSize, 
                fontWeight,
                lineHeight: `${lineHeight}px`,
                textAlign
              },
              children: lines[0]
            }
          } : lines.map((line, idx) => ({
            type: 'div',
            props: {
              style: { 
                color: textColor, 
                fontSize, 
                fontWeight,
                lineHeight: `${lineHeight}px`,
                textAlign
              },
              children: line
            }
          }))
        }
      };
      
      x += colWidths[i];
      return cellResult;
    });
    
    return {
      type: 'div',
      props: {
        style: {
          display: 'flex',
          flexDirection: 'row',
          width: totalWidth,
          height: row.height,
          backgroundColor: rowBg,
          borderTop: `1px solid ${themeColors.border}`
        },
        children: cells
      }
    };
  });
  
  // Build the complete table
  const children = [];
  
  // Title
  if (title) {
    const titleChildren = subtitle ? [{
      type: 'div',
      props: {
        style: { 
          color: themeColors.text, 
          fontSize: fontSize * 1.25, 
          fontWeight: 600 
        },
        children: title
      }
    }, {
      type: 'div',
      props: {
        style: { 
          color: themeColors.text, 
          fontSize: fontSize * 0.9, 
          opacity: 0.7,
          marginTop: fontSize * 0.3
        },
        children: subtitle
      }
    }] : {
      type: 'div',
      props: {
        style: { 
          color: themeColors.text, 
          fontSize: fontSize * 1.25, 
          fontWeight: 600 
        },
        children: title
      }
    };
    
    children.push({
      type: 'div',
      props: {
        style: {
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          width: totalWidth,
          paddingTop: fontSize * 0.5,
          paddingBottom: subtitle ? fontSize * 0.3 : fontSize * 0.5
        },
        children: titleChildren
      }
    });
  }
  
  // Header row
  children.push({
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'row',
        width: totalWidth,
        height: headerHeight,
        backgroundColor: themeColors.headerBg,
        borderRadius: '4px 4px 0 0'
      },
      children: headerCells
    }
  });
  
  // Data rows
  children.push(...dataRows);
  
  // Bottom border
  children.push({
    type: 'div',
    props: {
      style: {
        width: totalWidth,
        height: 1,
        backgroundColor: themeColors.border
      }
    }
  });
  
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column',
        width: totalWidth,
        height: totalHeight,
        backgroundColor: themeColors.background,
        fontFamily: themeColors.fontFamily
      },
      children
    }
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
  
  const themeColors = THEMES[theme] || THEMES['discord-light'];
  
  // Load fonts
  const fonts = await loadFonts();
  
  // Create JSX element for Satori
  const element = createTableElement(data, columns, theme, { title, subtitle, maxWidth, stripe });
  
  // Calculate dimensions
  const fontSize = 14;
  const padding = { x: 14, y: 10 };
  const colWidths = calculateColumnWidths(columns, data, fontSize, padding, maxWidth);
  const totalWidth = colWidths.reduce((a, b) => a + b, 0);
  
  // Get calculated height from element
  const totalHeight = element.props.style.height;
  
  // Generate SVG with Satori
  const finalSvg = await satori(element, {
    width: totalWidth,
    height: totalHeight,
    fonts,
    loadAdditionalAsset: async (code, text) => {
      // Return empty for emoji to use system font
      return '';
    }
  });
  
  // Convert SVG to PNG with Resvg
  const resvg = new Resvg(finalSvg, {
    fitTo: {
      mode: 'original'
    },
    font: {
      loadSystemFonts: true
    }
  });
  
  const pngData = resvg.render();
  const pngBuffer = pngData.asPng();
  
  return {
    buffer: pngBuffer,
    width: totalWidth,
    height: totalHeight,
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

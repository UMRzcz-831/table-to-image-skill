#!/usr/bin/env node
/**
 * Table2Image CLI
 * Usage: node table-cli.mjs --data-file data.json --dark --output table.png
 */

import { readFileSync, existsSync } from 'fs';
import { renderTable } from './index.js';

function showHelp() {
  console.log(`
Table2Image - Convert tables to PNG images

Usage:
  node table-cli.mjs [options]

Options:
  --data-file     JSON file with data array (required)
  --columns       Comma-separated column keys
  --headers       Comma-separated header names
  --align         Comma-separated alignments (l,c,r)
  --theme         Theme: discord-light|discord-dark|finance|minimal
  --dark          Use discord-dark theme (shortcut)
  --title         Table title
  --max-width     Maximum table width (default: 800)
  --output        Output file path (default: table.png)
  --help          Show this help

Example:
  node table-cli.mjs --data-file data.json --dark --title "My Table" --output out.png
`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    dataFile: '',
    columns: '',
    headers: '',
    align: '',
    theme: '',
    title: '',
    maxWidth: 800,
    output: 'table.png'
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case '--data-file': options.dataFile = next; i++; break;
      case '--columns': options.columns = next; i++; break;
      case '--headers': options.headers = next; i++; break;
      case '--align': options.align = next; i++; break;
      case '--theme': options.theme = next; i++; break;
      case '--dark': options.theme = 'discord-dark'; break;
      case '--title': options.title = next; i++; break;
      case '--max-width': options.maxWidth = parseInt(next); i++; break;
      case '--output': options.output = next; i++; break;
      case '--help': showHelp(); process.exit(0); break;
    }
  }

  return options;
}

async function main() {
  const opts = parseArgs();

  if (!opts.dataFile || !existsSync(opts.dataFile)) {
    console.error('Error: --data-file is required and must exist');
    showHelp();
    process.exit(1);
  }

  try {
    const data = JSON.parse(readFileSync(opts.dataFile, 'utf8'));
    
    if (!Array.isArray(data)) {
      console.error('Error: Data must be an array');
      process.exit(1);
    }

    // Build column config
    const keys = opts.columns ? opts.columns.split(',').map(s => s.trim()) : Object.keys(data[0] || {});
    const headers = opts.headers ? opts.headers.split(',').map(s => s.trim()) : keys;
    const aligns = opts.align ? opts.align.split(',').map(s => s.trim()) : [];

    const columns = keys.map((key, i) => ({
      key,
      header: headers[i] || key,
      align: aligns[i] === 'r' ? 'right' : aligns[i] === 'c' ? 'center' : 'left'
    }));

    console.log(`Rendering table with ${data.length} rows...`);
    console.log(`Theme: ${opts.theme || 'discord-light'}`);

    const result = await renderTable({
      data,
      columns,
      title: opts.title,
      theme: opts.theme || 'discord-light',
      maxWidth: opts.maxWidth
    });

    const { writeFileSync } = await import('fs');
    writeFileSync(opts.output, result.buffer);

    console.log(`✅ Table saved to ${opts.output}`);
    console.log(`   Size: ${result.width}x${result.height}px`);
    console.log(`   Format: ${result.format}`);

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();

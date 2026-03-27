# Table2Image API Reference

Complete API documentation for the Table2Image skill.

## Functions

### `renderTable(config)`

Main rendering function with full configuration options.

**Parameters:**
- `config` (Object):
  - `data` (Array): Array of row objects
  - `columns` (Array): Column definitions
  - `title` (String, optional): Table title
  - `subtitle` (String, optional): Table subtitle  
  - `theme` (String, optional): Theme name ('discord-dark', 'finance', 'minimal')
  - `maxWidth` (Number, optional): Max table width in pixels (default: 800)
  - `stripe` (Boolean, optional): Enable alternating row colors (default: true)

**Returns:** `Promise<{ buffer, width, height, format }>`

**Example:**
```typescript
const result = await renderTable({
  data: [{ name: 'AAPL', price: 150 }],
  columns: [
    { key: 'name', header: 'Stock', width: 100 },
    { key: 'price', header: 'Price', align: 'right' }
  ],
  title: 'Stocks',
  theme: 'discord-dark'
});
```

### `renderDiscordTable(data, columns, title?)`

Quick-render function optimized for Discord.

**Parameters:**
- `data` (Array): Row data
- `columns` (Array): Column definitions (simplified)
- `title` (String, optional): Table title

**Returns:** `Promise<{ buffer, width, height, format }>`

**Example:**
```typescript
const image = await renderDiscordTable(
  [{ name: 'BTC', price: 50000 }],
  [
    { key: 'name', header: 'Crypto' },
    { key: 'price', header: 'Price', align: 'right' }
  ],
  '💰 Crypto Prices'
);
```

### `renderFinanceTable(data, columns, title?)`

Quick-render function optimized for financial data.

Same API as `renderDiscordTable`, but uses 'finance' theme and includes:
- Automatic number formatting
- Conditional coloring for positive/negative values

### `autoConvertMarkdownTable(content, channel, options?)`

Automatically detect and convert markdown tables in content.

**Parameters:**
- `content` (String): Message content potentially containing markdown table
- `channel` (String): Target channel ('discord', 'telegram', 'whatsapp', etc.)
- `options` (Object, optional):
  - `theme` (String): Override default theme
  - `title` (String): Table title
  - `maxWidth` (Number): Max width

**Returns:** `Promise<{ converted: boolean, image?: Buffer, tableCount?: number }>`

**Example:**
```typescript
const result = await autoConvertMarkdownTable(
  '| Stock | Price |\n|-------|-------|\n| AAPL | $150 |',
  'discord'
);

if (result.converted) {
  await message.send({ attachment: result.image });
}
```

## Column Configuration

```typescript
{
  key: string,              // Data property name
  header: string,           // Display header
  width?: number | 'auto',  // Column width
  align?: 'left' | 'center' | 'right',  // Text alignment
  formatter?: (value, row) => string,   // Value formatter
  style?: CellStyle | ((value, row) => CellStyle),  // Styling
  wrap?: boolean,           // Enable text wrapping
  maxLines?: number         // Max lines when wrapping
}
```

## CellStyle

```typescript
{
  color?: string,           // Text color (hex)
  backgroundColor?: string, // Background color
  fontWeight?: 'normal' | 'bold' | number
}
```

## Themes

### discord-dark
- Background: #2f3136
- Header: #5865F2
- Text: #dcddde
- Best for: Discord dark mode

### finance
- Background: #1a1a2e
- Header: #16213e
- Text: #eaeaea
- Best for: Financial reports

### minimal
- Background: #ffffff
- Header: #333333
- Text: #333333
- Best for: Clean/simple presentations

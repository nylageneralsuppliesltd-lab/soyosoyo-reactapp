#!/usr/bin/env node

/**
 * Data Format Converter
 * Converts CSV, JSON, and other formats to Excel import format
 * 
 * Usage:
 *   node scripts/convert-data-format.js --input data.csv --format csv --output converted.xlsx
 *   node scripts/convert-data-format.js --input data.json --format json --output converted.xlsx
 */

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const csv = require('csv-parse/lib/sync');

function parseArgs() {
  const args = {};
  for (let i = 2; i < process.argv.length; i += 2) {
    const key = process.argv[i].replace('--', '');
    const value = process.argv[i + 1];
    args[key] = value;
  }
  return args;
}

function convertCSVToExcel(csvFile, sheetName = 'Data') {
  try {
    const content = fs.readFileSync(csvFile, 'utf8');
    const records = csv(content, {
      columns: true,
      skip_empty_lines: true,
    });

    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet(sheetName);

    if (records.length === 0) {
      console.error('❌ CSV file is empty');
      process.exit(1);
    }

    // Add headers
    const headers = Object.keys(records[0]);
    ws.columns = headers.map((h) => ({ header: h, key: h, width: 20 }));

    // Add rows
    records.forEach((record) => {
      ws.addRow(record);
    });

    return workbook;
  } catch (error) {
    console.error('❌ Error converting CSV:', error.message);
    process.exit(1);
  }
}

function convertJSONToExcel(jsonFile, sheetName = 'Data') {
  try {
    const content = fs.readFileSync(jsonFile, 'utf8');
    const data = JSON.parse(content);

    // Handle both array and object with array property
    const records = Array.isArray(data) ? data : data.data || data.records || [];

    if (!Array.isArray(records) || records.length === 0) {
      console.error('❌ JSON file must contain an array of objects');
      process.exit(1);
    }

    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet(sheetName);

    // Add headers from first record
    const headers = Object.keys(records[0]);
    ws.columns = headers.map((h) => ({ header: h, key: h, width: 20 }));

    // Add rows
    records.forEach((record) => {
      ws.addRow(record);
    });

    return workbook;
  } catch (error) {
    console.error('❌ Error converting JSON:', error.message);
    process.exit(1);
  }
}

function convertMultipleSheets(config) {
  /**
   * Config format:
   * {
   *   sheets: [
   *     { name: 'Members', source: 'members.csv', format: 'csv' },
   *     { name: 'Loans', source: 'loans.json', format: 'json' }
   *   ]
   * }
   */
  try {
    const workbook = new ExcelJS.Workbook();

    config.sheets.forEach(({ name, source, format }) => {
      if (!fs.existsSync(source)) {
        console.warn(`⚠️  File not found: ${source}, skipping...`);
        return;
      }

      let records = [];

      if (format === 'csv') {
        const content = fs.readFileSync(source, 'utf8');
        records = csv(content, {
          columns: true,
          skip_empty_lines: true,
        });
      } else if (format === 'json') {
        const content = fs.readFileSync(source, 'utf8');
        const data = JSON.parse(content);
        records = Array.isArray(data)
          ? data
          : data.data || data.records || [];
      }

      if (records.length === 0) {
        console.warn(`⚠️  No records found in ${source}`);
        return;
      }

      const ws = workbook.addWorksheet(name);
      const headers = Object.keys(records[0]);
      ws.columns = headers.map((h) => ({ header: h, key: h, width: 20 }));

      records.forEach((record) => {
        ws.addRow(record);
      });

      console.log(`✅ Added ${name}: ${records.length} records`);
    });

    return workbook;
  } catch (error) {
    console.error('❌ Error in multi-sheet conversion:', error.message);
    process.exit(1);
  }
}

async function main() {
  const args = parseArgs();

  if (!args.input || !args.format || !args.output) {
    console.log(`
Usage: node convert-data-format.js [options]

Options:
  --input    Input file (CSV, JSON, or XML)
  --format   Input format (csv, json, config)
  --output   Output Excel file name

Examples:
  # Convert single CSV file
  node scripts/convert-data-format.js --input members.csv --format csv --output import.xlsx

  # Convert single JSON file
  node scripts/convert-data-format.js --input loans.json --format json --output import.xlsx

  # Convert multiple files from config
  node scripts/convert-data-format.js --input config.json --format config --output import.xlsx

Config file format (for multiple sheets):
{
  "sheets": [
    { "name": "Members", "source": "members.csv", "format": "csv" },
    { "name": "Loans", "source": "loans.json", "format": "json" }
  ]
}
    `);
    process.exit(1);
  }

  if (!fs.existsSync(args.input)) {
    console.error(`❌ Input file not found: ${args.input}`);
    process.exit(1);
  }

  console.log(`
📊 Data Format Converter
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Input:  ${args.input}
Format: ${args.format}
Output: ${args.output}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);

  let workbook;

  if (args.format === 'csv') {
    console.log('🔄 Converting CSV to Excel...');
    workbook = convertCSVToExcel(args.input);
  } else if (args.format === 'json') {
    console.log('🔄 Converting JSON to Excel...');
    workbook = convertJSONToExcel(args.input);
  } else if (args.format === 'config') {
    console.log('🔄 Converting multiple files to Excel...');
    const config = JSON.parse(fs.readFileSync(args.input, 'utf8'));
    workbook = convertMultipleSheets(config);
  } else {
    console.error(`❌ Unsupported format: ${args.format}`);
    process.exit(1);
  }

  try {
    await workbook.xlsx.writeFile(args.output);
    console.log(`✅ Successfully converted to: ${args.output}`);
    console.log('\n📝 Next steps:');
    console.log('1. Open the Excel file and verify the data');
    console.log('2. Ensure the sheets match the import structure:');
    console.log('   - Members, Accounts, LoanTypes, Loans, Deposits, Withdrawals');
    console.log('3. Run: node scripts/cli-import.js ' + args.output);
  } catch (error) {
    console.error('❌ Error writing Excel file:', error.message);
    process.exit(1);
  }
}

main();

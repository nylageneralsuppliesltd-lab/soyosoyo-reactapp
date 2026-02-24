#!/usr/bin/env node

/**
 * CLI Import Helper
 * Usage: node scripts/cli-import.js path/to/file.xlsx [baseUrl]
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const filePath = process.argv[2];
const baseUrl = process.argv[3] || 'http://localhost:3000';
const token = process.env.AUTH_TOKEN;

if (!filePath) {
  console.error('❌ Usage: node cli-import.js <excel-file> [baseUrl]');
  console.error('Example: node cli-import.js ./data.xlsx http://localhost:3000');
  process.exit(1);
}

if (!fs.existsSync(filePath)) {
  console.error(`❌ File not found: ${filePath}`);
  process.exit(1);
}

async function importFile() {
  try {
    console.log('📂 Preparing file for import...');
    console.log(`📍 Base URL: ${baseUrl}`);
    console.log(`📄 File: ${filePath}`);

    const fileBuffer = fs.readFileSync(filePath);
    const headers = {
      'Content-Type': 'multipart/form-data',
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    // Create FormData
    const FormData = require('form-data');
    const form = new FormData();
    form.append('file', fileBuffer, path.basename(filePath));

    console.log('\n⏳ Uploading and importing...\n');

    const response = await axios.post(`${baseUrl}/import/excel`, form, {
      headers: form.getHeaders(headers),
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    const result = response.data;

    // Display results
    console.log('\n========== IMPORT RESULTS ==========\n');

    console.log(`📊 Summary:
  • Total Records: ${result.summary.totalRecords}
  • ✅ Succeeded: ${result.summary.totalSucceeded}
  • ❌ Failed: ${result.summary.totalFailed}\n`);

    // Detailed breakdown
    for (const [entity, stats] of Object.entries(result)) {
      if (entity === 'summary') continue;
      if (stats.succeeded === 0 && stats.failed === 0) continue;

      console.log(`${entity.toUpperCase()}:`);
      console.log(`  ✅ ${stats.succeeded} succeeded`);
      console.log(`  ❌ ${stats.failed} failed`);

      if (stats.errors.length > 0) {
        console.log(`  Errors:`);
        stats.errors.slice(0, 5).forEach((err) => {
          console.log(`    • ${err}`);
        });
        if (stats.errors.length > 5) {
          console.log(`    ... and ${stats.errors.length - 5} more errors`);
        }
      }
      console.log();
    }

    console.log('===================================\n');

    if (result.summary.totalFailed === 0) {
      console.log('✨ Import completed successfully!\n');
      process.exit(0);
    } else {
      console.log(
        `⚠️  Some records failed. Please review the errors above and retry.\n`,
      );
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Import failed:', error.response?.data?.message || error.message);
    if (error.response?.data?.errors) {
      console.error('Errors:', error.response.data.errors);
    }
    process.exit(1);
  }
}

importFile();

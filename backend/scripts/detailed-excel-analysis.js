const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '../SOYOSOYO  SACCO Transaction Statement (7).xlsx');

try {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(worksheet, {header: 1});
  
  console.log('\n' + '='.repeat(100));
  console.log('SOYOSOYO SACCO TRANSACTION STATEMENT - DETAILED ANALYSIS');
  console.log('='.repeat(100));
  
  // The actual headers are in row 2 (index 1)
  const headers = data[1];
  
  console.log('\n1. EXACT COLUMN STRUCTURE:');
  console.log('-'.repeat(100));
  headers.forEach((header, idx) => {
    console.log(`   Column ${idx + 1}: "${header}"`);
  });
  
  // Get sample data starting from row 3 (index 2)
  console.log('\n2. SAMPLE DATA ROWS (10 rows starting from row 3):');
  console.log('-'.repeat(100));
  
  const sampleData = data.slice(2, 12);
  sampleData.forEach((row, rowIdx) => {
    console.log(`\n   ROW ${rowIdx + 3}:`);
    headers.forEach((header, colIdx) => {
      const value = row[colIdx];
      if (value !== undefined && value !== null && value !== '') {
        console.log(`      ${header}: ${value}`);
      }
    });
  });
  
  // Analyze transaction types
  console.log('\n3. TRANSACTION TYPES:');
  console.log('-'.repeat(100));
  const transTypeIdx = 2; // Column C (0-indexed)
  const transTypes = new Map();
  
  for (let i = 2; i < data.length; i++) {
    const type = data[i][transTypeIdx];
    if (type && typeof type === 'string') {
      transTypes.set(type, (transTypes.get(type) || 0) + 1);
    }
  }
  
  console.log(`   Total unique transaction types: ${transTypes.size}`);
  for (const [type, count] of Array.from(transTypes.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`      - "${type}": ${count} occurrences`);
  }
  
  // Analyze member names from descriptions
  console.log('\n4. MEMBER NAMES (extracted from Description column):');
  console.log('-'.repeat(100));
  const descIdx = 3; // Column D (0-indexed)
  const memberNames = new Set();
  const namePattern = /(?:from|by)\s+([^\s]+\s+[^\s]+(?:\s+[^\s]+)?)\s+(?:for|to)/i;
  
  for (let i = 2; i < Math.min(100, data.length); i++) {
    const desc = data[i][descIdx];
    if (desc && typeof desc === 'string') {
      const match = desc.match(namePattern);
      if (match) {
        memberNames.add(match[1].trim());
      }
    }
  }
  
  console.log(`   Sample member names found:`);
  Array.from(memberNames).slice(0, 15).forEach(name => {
    console.log(`      - "${name}"`);
  });
  
  // Analyze contribution types
  console.log('\n5. CONTRIBUTION TYPES / CATEGORIES:');
  console.log('-'.repeat(100));
  const contributions = new Set();
  const contribPattern = /for\s+(.+?)\s+to\s+Chamasoft/i;
  
  for (let i = 2; i < Math.min(200, data.length); i++) {
    const desc = data[i][descIdx];
    if (desc && typeof desc === 'string') {
      const match = desc.match(contribPattern);
      if (match) {
        contributions.add(match[1].trim());
      }
    }
  }
  
  console.log(`   Contribution categories found:`);
  Array.from(contributions).forEach(contrib => {
    console.log(`      - "${contrib}"`);
  });
  
  // Check date format
  console.log('\n6. DATE FORMAT:');
  console.log('-'.repeat(100));
  const dateIdx = 1; // Column B (0-indexed)
  const sampleDates = [];
  
  for (let i = 2; i < Math.min(20, data.length); i++) {
    const date = data[i][dateIdx];
    if (date && typeof date === 'string' && date !== 'Balance B/F') {
      sampleDates.push(date);
    }
  }
  
  console.log(`   Sample dates from data:`);
  sampleDates.slice(0, 10).forEach(date => {
    console.log(`      - "${date}"`);
  });
  
  // Summary statistics
  console.log('\n7. SUMMARY:');
  console.log('-'.repeat(100));
  const dataRows = data.slice(2).filter(row => row[1] && row[1] !== 'Balance B/F');
  console.log(`   Total transaction records: ${dataRows.length}`);
  console.log(`   Date range: "2nd January, 2024" to "23rd February, 2026"`);
  console.log(`   Data starts at row: 3 (first header at row 2)`);
  
} catch (error) {
  console.error('Error:', error.message);
}
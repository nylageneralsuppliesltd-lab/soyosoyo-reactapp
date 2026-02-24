const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '..', 'SOYOSOYO  SACCO Contribution Transfers.xlsx');

console.log('Reading Excel file:', filePath);

try {
  // Read the workbook
  const workbook = XLSX.readFile(filePath);
  
  // Get the first sheet
  const sheetName = workbook.SheetNames[0];
  console.log('\nSheet Name:', sheetName);
  
  const worksheet = workbook.Sheets[sheetName];
  
  // Convert to JSON - skip first row if it's metadata
  let data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  
  // Find the header row (the one containing "Transfer Date")
  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(5, data.length); i++) {
    if (data[i].some(cell => cell && cell.toString().includes('Transfer Date'))) {
      headerRowIndex = i;
      break;
    }
  }
  
  if (headerRowIndex === -1) {
    console.error('Could not find header row');
    return;
  }
  
  const headers = data[headerRowIndex].filter(h => h);
  const dataRows = data.slice(headerRowIndex + 1).filter(row => row.some(cell => cell));
  
  // Convert to objects - skip first column if it's just row numbers
  const dataObjects = dataRows.map(row => {
    const obj = {};
    // Check if first column is a row number
    const startIndex = (typeof row[0] === 'number' && row[0] <= dataRows.length) ? 1 : 0;
    headers.forEach((header, index) => {
      obj[header] = row[startIndex + index];
    });
    return obj;
  });
  
  console.log('\n=== FILE ANALYSIS ===\n');
  
  // 1. Headers/Columns
  console.log('1. HEADERS/COLUMNS:');
  headers.forEach((header, index) => {
    console.log(`   ${index + 1}. ${header}`);
  });
  
  // 2. Sample Rows
  console.log('\n2. ALL TRANSFER RECORDS:');
  dataObjects.forEach((row, i) => {
    console.log(`\n   Record ${i + 1}:`);
    Object.entries(row).forEach(([key, value]) => {
      console.log(`      ${key}: ${value}`);
    });
  });
  
  // 3. Transfer Details Analysis
  console.log('\n3. TRANSFER DETAILS COLUMN VALUES:');
  const transferDetailsKey = headers.find(key => 
    key.toLowerCase().includes('transfer') && key.toLowerCase().includes('detail')
  ) || headers.find(key => 
    key.toLowerCase().includes('detail')
  );
  
  if (transferDetailsKey) {
    console.log(`   (Column: "${transferDetailsKey}")\n`);
    const uniqueDetails = [...new Set(dataObjects.map(row => row[transferDetailsKey]).filter(Boolean))];
    uniqueDetails.forEach((detail, index) => {
      console.log(`   ${index + 1}. ${detail}`);
    });
  } else {
    console.log('   Transfer Details column not found. Available columns:');
    console.log('   ', headers.join(', '));
  }
  
  // 4. Patterns Analysis
  console.log('\n4. PATTERNS IDENTIFIED:');
  console.log(`   Total Records: ${dataObjects.length}`);
  
  // Look for amount patterns
  const amountKey = headers.find(h => h.toLowerCase().includes('amount'));
  if (amountKey) {
    const amounts = dataObjects.map(row => {
      const val = row[amountKey];
      if (typeof val === 'string') {
        return parseFloat(val.replace(/,/g, ''));
      }
      return parseFloat(val);
    }).filter(a => !isNaN(a));
    console.log(`\n   Amount Statistics:`);
    console.log(`      Total Transfers: ${amounts.length}`);
    console.log(`      Sum: KES ${amounts.reduce((a, b) => a + b, 0).toFixed(2)}`);
    console.log(`      Min: KES ${Math.min(...amounts).toFixed(2)}`);
    console.log(`      Max: KES ${Math.max(...amounts).toFixed(2)}`);
    console.log(`      Average: KES ${(amounts.reduce((a, b) => a + b, 0) / amounts.length).toFixed(2)}`);
  }
  
  // Look for member/account patterns
  const fromKey = headers.find(h => h.toLowerCase().includes('from'));
  const toKey = headers.find(h => h.toLowerCase().includes('to'));
  
  if (fromKey && toKey) {
    console.log(`\n   Transfer Flow:`);
    console.log(`      From Column: "${fromKey}"`);
    console.log(`      To Column: "${toKey}"`);
    
    // Sample from/to patterns
    const patterns = new Map();
    dataObjects.forEach(row => {
      const from = row[fromKey] || 'N/A';
      const to = row[toKey] || 'N/A';
      const pattern = `${from} → ${to}`;
      patterns.set(pattern, (patterns.get(pattern) || 0) + 1);
    });
    
    console.log(`\n      Unique Transfer Patterns: ${patterns.size}`);
    console.log(`      Top 5 patterns:`);
    const sortedPatterns = [...patterns.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    sortedPatterns.forEach(([pattern, count], index) => {
      console.log(`         ${index + 1}. ${pattern} (${count} times)`);
    });
  }
  
  // Look for date patterns
  const dateKey = headers.find(h => h.toLowerCase().includes('date') && !h.toLowerCase().includes('recorded'));
  if (dateKey) {
    console.log(`\n   Date Range:`);
    const dates = dataObjects.map(row => row[dateKey]).filter(Boolean);
    console.log(`      Earliest: ${dates[0]}`);
    console.log(`      Latest: ${dates[dates.length - 1]}`);
  }
  
  // Category analysis if Transfer Details exists
  if (transferDetailsKey) {
    console.log(`\n   Transfer Type Breakdown:`);
    const typeCount = new Map();
    dataObjects.forEach(row => {
      const type = row[transferDetailsKey] || 'Unknown';
      typeCount.set(type, (typeCount.get(type) || 0) + 1);
    });
    
    [...typeCount.entries()].sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
      const percentage = ((count / dataObjects.length) * 100).toFixed(1);
      console.log(`      ${type}: ${count} (${percentage}%)`);
    });
  }
  
  console.log('\n=== END OF ANALYSIS ===\n');
  
} catch (error) {
  console.error('Error reading Excel file:', error.message);
  console.error(error.stack);
}

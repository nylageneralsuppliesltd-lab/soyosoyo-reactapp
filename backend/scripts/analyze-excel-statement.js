const XLSX = require('xlsx');
const path = require('path');

// Read the Excel file
const filePath = path.join(__dirname, '../SOYOSOYO  SACCO Transaction Statement (7).xlsx');

try {
  const workbook = XLSX.readFile(filePath);
  
  console.log('\n' + '='.repeat(80));
  console.log('SHEET INFORMATION');
  console.log('='.repeat(80));
  console.log('Sheet names:', workbook.SheetNames);
  
  // Process each sheet
  workbook.SheetNames.forEach(sheetName => {
    console.log('\n' + '-'.repeat(80));
    console.log(`SHEET: "${sheetName}"`);
    console.log('-'.repeat(80));
    
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, {header: 1});
    
    if (data.length === 0) {
      console.log('Sheet is empty');
      return;
    }
    
    // Get column headers (first row with actual data)
    console.log('\nCOLUMN HEADERS (First Row):');
    const headers = data[0];
    headers.forEach((header, idx) => {
      console.log(`  Col ${idx + 1}: "${header}"`);
    });
    
    // Show sample data (5-10 rows)
    console.log(`\nSAMPLE DATA (rows 2-11, showing first 10 data rows):`);
    console.log('');
    
    const sampleRows = data.slice(1, 11);
    sampleRows.forEach((row, rowIdx) => {
      console.log(`Row ${rowIdx + 2}:`);
      row.forEach((cell, colIdx) => {
        if (cell !== undefined && cell !== null && cell !== '') {
          console.log(`  Col ${colIdx + 1} (${headers[colIdx]}): "${cell}"`);
        }
      });
      console.log('');
    });
    
    // Analyze unique values in specific columns if we can identify them
    console.log('\nANALYSIS:');
    console.log(`Total rows (excluding header): ${data.length - 1}`);
    
    // Look for transaction type column
    const transTypeIdx = headers.findIndex(h => 
      h && h.toLowerCase().includes('type')
    );
    if (transTypeIdx >= 0) {
      const types = new Set();
      for (let i = 1; i < data.length; i++) {
        if (data[i][transTypeIdx]) {
          types.add(String(data[i][transTypeIdx]));
        }
      }
      console.log(`\nUnique Transaction Types (${transTypeIdx + 1} columns):`, Array.from(types));
    }
    
    // Look for description/narration column
    const descIdx = headers.findIndex(h => 
      h && (h.toLowerCase().includes('description') || 
            h.toLowerCase().includes('narration') ||
            h.toLowerCase().includes('detail') ||
            h.toLowerCase().includes('details'))
    );
    if (descIdx >= 0) {
      console.log(`\nSample Descriptions from Column ${descIdx + 1}:`);
      for (let i = 1; i < Math.min(11, data.length); i++) {
        if (data[i][descIdx]) {
          console.log(`  Row ${i + 1}: "${data[i][descIdx]}"`);
        }
      }
    }
    
  });
  
} catch (error) {
  console.error('Error reading Excel file:', error.message);
  console.error(error.stack);
}

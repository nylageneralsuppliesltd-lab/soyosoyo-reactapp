require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const BACKEND_DIR = path.resolve(__dirname, '..');

async function test() {
  try {
    console.log('Testing loan type lookup...');
    const types = await prisma.loanType.findMany({ select: { id: true, name: true } });
    console.log('Loan types found:', types);

    if (types.length === 0) {
      console.error('ERROR: No loan types found!');
      process.exit(1);
    }

    console.log('\nTesting Loans Summary file read...');
    const wb = new ExcelJS.Workbook();
    const filePath = path.join(BACKEND_DIR, 'SOYOSOYO  SACCO Loans Summary (6).xlsx');
    console.log('Reading from:', filePath);
    console.log('File exists:', fs.existsSync(filePath));
    
    if (!fs.existsSync(filePath)) {
      console.error('ERROR: File not found!');
      process.exit(1);
    }

    await wb.xlsx.readFile(filePath);
    console.log('Workbook loaded. Worksheets:', wb.worksheets.length);
    
    const ws = wb.worksheets[0];
    console.log('First worksheet rows:', ws.rowCount);
    
    // Get headers
    const headers = [];
    for (let c = 1; c <= 10; c++) {
      const value = ws.getRow(2).getCell(c).value;
      if (value) headers.push(String(value).trim());
    }
    console.log('Headers found:', headers);

    console.log('\nTesting Member Loans file read...');
    const wb2 = new ExcelJS.Workbook();
    const filePath2 = path.join(BACKEND_DIR, 'SOYOSOYO  SACCO List of Member Loans.xlsx');
    console.log('Reading from:', filePath2);
    
    if (!fs.existsSync(filePath2)) {
      console.error('ERROR: File not found!');
      process.exit(1);
    }

    await wb2.xlsx.readFile(filePath2);
    console.log('Workbook loaded. Worksheets:', wb2.worksheets.length);
    
    const ws2 = wb2.worksheets[0];
    console.log('First worksheet rows:', ws2.rowCount);
    
    // Get headers
    const headers2 = [];
    for (let c = 1; c <= 10; c++) {
      const value = ws2.getRow(2).getCell(c).value;
      if (value) headers2.push(String(value).trim());
    }
    console.log('Headers found:', headers2);

    console.log('\n✅ All tests passed');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

test();

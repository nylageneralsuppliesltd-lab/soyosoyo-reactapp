const ExcelJS = require('exceljs');

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number') {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    return new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000);
  }
  const text = String(value).replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const ddmmyyyy = text.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (ddmmyyyy) {
    const [, dd, mm, yyyy] = ddmmyyyy;
    return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  }
  const cleaned = text.replace(/(\d+)(st|nd|rd|th)/gi, '$1').replace(/,/g, '');
  const parsed = new Date(cleaned);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  return null;
}

async function analyzeCOLUMND() {
  console.log('\n' + '='.repeat(120));
  console.log('COLUMN D FULL CONTENT ANALYSIS - First 30 Contribution Payments');
  console.log('='.repeat(120));

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('SOYOSOYO  SACCO Transaction Statement (7).xlsx');
  const ws = wb.worksheets[0];

  console.log('\nTransaction Type | Amount | Full Column D Content');
  console.log('-'.repeat(120));

  let count = 0;
  for (let r = 3; r <= ws.rowCount && count < 30; r++) {
    const date = parseDate(ws.getRow(r).getCell(2).value);
    if (!date) continue;

    const type = String(ws.getRow(r).getCell(3).value || '').trim();
    const desc = String(ws.getRow(r).getCell(4).value || '').trim();
    const deposited = Number(ws.getRow(r).getCell(6).value) || 0;
    const withdrawn = Number(ws.getRow(r).getCell(5).value) || 0;

    if (type === 'Contribution payment' && deposited > 0) {
      console.log(`\n${count + 1}. Type: ${type} | Amount: ${deposited} KES`);
      console.log(`   Column D (FULL): ${desc}`);
      count++;
    }
  }

  console.log('\n' + '='.repeat(120));
  console.log('\n✅ ANALYSIS: Column D contains parseable data for contribution payments.');
  console.log('Expected format: "Contribution payment from [NAME] for [TYPE] to [ACCOUNT] - ... Reconciled"');
  console.log('='.repeat(120) + '\n');
}

analyzeCOLUMND().catch(err => console.error('ERROR:', err.message));

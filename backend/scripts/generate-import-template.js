import * as ExcelJS from 'exceljs';

/**
 * Generate an Excel template for data import
 * Run from CLI: node generate-import-template.js
 */

async function generateTemplate() {
  const workbook = new ExcelJS.Workbook();

  // Remove default sheet
  workbook.removeWorksheet('Sheet1');

  // MEMBERS Sheet
  const membersWs = workbook.addWorksheet('Members', { state: 'visible' });
  membersWs.columns = [
    { header: 'Email', key: 'email', width: 25 },
    { header: 'Phone', key: 'phone', width: 15 },
    { header: 'Full Name', key: 'fullName', width: 20 },
    { header: 'Join Date (YYYY-MM-DD)', key: 'joinDate', width: 20 },
  ];
  membersWs.addRows([
    {
      email: 'john.doe@example.com',
      phone: '+254712345678',
      fullName: 'John Doe Kemboi',
      joinDate: '2025-01-15',
    },
    {
      email: 'jane.smith@example.com',
      phone: '+254787654321',
      fullName: 'Jane Smith Kipchoge',
      joinDate: '2025-02-20',
    },
  ]);

  // ACCOUNTS Sheet
  const accountsWs = workbook.addWorksheet('Accounts', { state: 'visible' });
  accountsWs.columns = [
    { header: 'Account Name', key: 'name', width: 20 },
    { header: 'Type (CASH/BANK)', key: 'type', width: 15 },
    { header: 'Initial Balance', key: 'balance', width: 15 },
  ];
  accountsWs.addRows([
    { name: 'Cashbox', type: 'CASH', balance: 50000 },
    { name: 'Main Bank', type: 'BANK', balance: 500000 },
    { name: 'Emergency Fund', type: 'SAVINGS', balance: 100000 },
  ]);

  // LOAN TYPES Sheet
  const loanTypesWs = workbook.addWorksheet('LoanTypes', { state: 'visible' });
  loanTypesWs.columns = [
    { header: 'Loan Type Name', key: 'name', width: 20 },
    { header: 'Interest Rate (%)', key: 'rate', width: 15 },
    { header: 'Period (months)', key: 'period', width: 15 },
    { header: 'Max Amount', key: 'maxAmount', width: 15 },
  ];
  loanTypesWs.addRows([
    { name: 'Personal Loan', rate: 12, period: 12, maxAmount: 50000 },
    { name: 'Emergency Loan', rate: 15, period: 6, maxAmount: 30000 },
    { name: 'Business Loan', rate: 10, period: 24, maxAmount: 100000 },
  ]);

  // LOANS Sheet
  const loansWs = workbook.addWorksheet('Loans', { state: 'visible' });
  loansWs.columns = [
    { header: 'Member (Email/Phone/Name)', key: 'member', width: 25 },
    { header: 'Loan Type', key: 'loanType', width: 20 },
    { header: 'Amount', key: 'amount', width: 15 },
    { header: 'Balance', key: 'balance', width: 15 },
    { header: 'Disbursement Date', key: 'date', width: 18 },
    { header: 'Interest Rate (%)', key: 'rate', width: 15 },
  ];
  loansWs.addRows([
    {
      member: 'john.doe@example.com',
      loanType: 'Personal Loan',
      amount: 30000,
      balance: 25000,
      date: '2025-11-01',
      rate: 12,
    },
    {
      member: 'jane.smith@example.com',
      loanType: 'Business Loan',
      amount: 50000,
      balance: 40000,
      date: '2025-12-15',
      rate: 10,
    },
  ]);

  // DEPOSITS Sheet
  const depositsWs = workbook.addWorksheet('Deposits', { state: 'visible' });
  depositsWs.columns = [
    { header: 'Member (Email/Phone/Name)', key: 'member', width: 25 },
    { header: 'Amount', key: 'amount', width: 15 },
    { header: 'Date (YYYY-MM-DD)', key: 'date', width: 18 },
    { header: 'Type', key: 'type', width: 20 },
    { header: 'Description', key: 'notes', width: 30 },
  ];
  depositsWs.addRows([
    {
      member: 'john.doe@example.com',
      amount: 5000,
      date: '2025-12-20',
      type: 'contribution',
      notes: 'Monthly contribution',
    },
    {
      member: 'jane.smith@example.com',
      amount: 10000,
      date: '2025-12-22',
      type: 'contribution',
      notes: 'Monthly contribution',
    },
  ]);

  // WITHDRAWALS Sheet
  const withdrawalsWs = workbook.addWorksheet('Withdrawals', {
    state: 'visible',
  });
  withdrawalsWs.columns = [
    { header: 'Member (Email/Phone/Name or N/A)', key: 'member', width: 25 },
    { header: 'Amount', key: 'amount', width: 15 },
    { header: 'Date (YYYY-MM-DD)', key: 'date', width: 18 },
    { header: 'Type (expense/transfer/dividend)', key: 'type', width: 20 },
    { header: 'Description', key: 'notes', width: 30 },
  ];
  withdrawalsWs.addRows([
    {
      member: 'N/A',
      amount: 2000,
      date: '2025-12-18',
      type: 'expense',
      notes: 'Office supplies',
    },
    {
      member: 'john.doe@example.com',
      amount: 8000,
      date: '2025-12-20',
      type: 'dividend',
      notes: 'Year-end dividend',
    },
  ]);

  // Add header formatting to all sheets
  Object.values(workbook.worksheets).forEach((ws) => {
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' },
    };
    ws.getRow(1).alignment = { horizontal: 'center', vertical: 'center' };
  });

  // Save template
  await workbook.xlsx.writeFile('import-template.xlsx');
  console.log('✅ Import template generated: import-template.xlsx');
}

generateTemplate().catch((err) => {
  console.error('Error generating template:', err);
  process.exit(1);
});

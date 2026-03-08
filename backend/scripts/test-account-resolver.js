/**
 * TEST: Deterministic Account Resolver
 * Validates that e-wallet vs cash account routing is strict
 */

const { DeterministicAccountResolver } = require('../src/utils/deterministic-account-resolver');

// Mock account Map
const mockAccountMap = new Map([
  ['Cash at Hand', 'id-cash-1'],
  ['SOYOSOYO MEDICARE COOPERATE SAVINGS AND CREDIT SOCIETY C.E.W', 'id-ew-1'],
  ['Cytonn Money Market Fund - Collection Account', 'id-cytonn-1'],
  ['SOYOSOYO MEDICARE COOPERATIVE SAVINGS CREDIT SOCIETY', 'id-coop-1'],
]);

const resolver = new DeterministicAccountResolver(mockAccountMap);

// Test cases from the user's problem
const testCases = [
  {
    description: 'Contribution payment from James Ngari Charo for Monthly Minimum Contribution to Chamasoft E-Wallet (Headoffice) - SOYOSOYO MEDICARE COOPERATE SAVINGS AND CREDIT SOCIETY C.E.W (10027879)',
    expectedKeyword: 'chamasoft/c.e.w',
    shouldReturn: 'id-ew-1',
  },
  {
    description: 'Contribution payment from ALICE MBODZE for Registration Fee to Chamasoft E-Wallet (Headoffice) - SOYOSOYO MEDICARE COOPERATE SAVINGS AND CREDIT SOCIETY C.E.W (10027879)',
    expectedKeyword: 'chamasoft/c.e.w',
    shouldReturn: 'id-ew-1',
  },
  {
    description: 'Loan Disbursement to John Doe, withdrawn from Cash at Hand',
    expectedKeyword: 'cash',
    shouldReturn: 'id-cash-1',
  },
  {
    description: 'Funds Transfer from Cooperative Bank to Member Account',
    expectedKeyword: 'cooperative',
    shouldReturn: 'id-coop-1',
  },
  {
    description: 'Income deposit to Cytonn Money Market Fund - Collection Account',
    expectedKeyword: 'cytonn',
    shouldReturn: 'id-cytonn-1',
  },
  {
    description: 'Miscellaneous payment - no clear account mention',
    expectedKeyword: 'default e-wallet',
    shouldReturn: 'id-ew-1',
  },
  {
    description: 'Cash withdrawal from cash office',
    expectedKeyword: 'cash',
    shouldReturn: 'id-cash-1',
  },
  {
    description: 'Contribution payment from Member Name to Chamasoft E-wallet, not routed to Cash at Hand',
    expectedKeyword: 'chamasoft (NOT cash)',
    shouldReturn: 'id-ew-1',
  },
];

console.log('\n' + '='.repeat(120));
console.log('ACCOUNT ROUTING RESOLVER TEST');
console.log('='.repeat(120));

let passed = 0;
let failed = 0;

testCases.forEach((test, idx) => {
  const result = resolver.resolveAccountFromDescription(test.description);
  const isPass = result === test.shouldReturn;

  const status = isPass ? '✅ PASS' : '❌ FAIL';
  console.log(`\n${idx + 1}. ${status} [${test.expectedKeyword}]`);
  console.log(`   Description: ${test.description.substring(0, 100)}...`);
  console.log(`   Expected: ${test.shouldReturn}`);
  console.log(`   Got: ${result}`);

  if (isPass) {
    passed++;
  } else {
    failed++;
  }
});

console.log('\n' + '='.repeat(120));
console.log(`RESULTS: ${passed} passed, ${failed} failed out of ${testCases.length} tests`);
console.log('='.repeat(120) + '\n');

process.exit(failed > 0 ? 1 : 0);

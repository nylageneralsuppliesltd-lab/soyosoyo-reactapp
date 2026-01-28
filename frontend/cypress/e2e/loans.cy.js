// cypress/e2e/loans.cy.js

describe('Loans Module E2E', () => {
  beforeEach(() => {
    // Adjust the URL if your dev server runs elsewhere
    cy.visit('http://127.0.0.1:5173/#/loans');
  });

  it('should render Loans Management page', () => {
    cy.contains('Loans Management').should('be.visible');
  });

  // Add more tests for create, approve, edit, delete, reject flows
});

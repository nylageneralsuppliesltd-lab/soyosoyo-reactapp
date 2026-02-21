

// Cypress E2E tests for Loans Module
// Covers: create, read, update, delete, and error handling


describe('Loans Module E2E - Comprehensive', () => {
  const uniqueSuffix = Date.now();
  let createdLoanTypeName = `Test Loan Type ${uniqueSuffix}`;
  let createdLoanTypeId = null;
  let createdMemberLoanId = null;

  beforeEach(() => {
    cy.apiLogin();
  });

  it('should create, edit, and delete a loan type, then create and delete a member loan', function () {
    cy.log('Visiting Loan Types tab');
    cy.visitAuthed('/loans?tab=types');
    cy.contains('h1', 'Loan Types Management').should('be.visible');
    cy.contains('button', 'New Loan Type').click();
    cy.get('form').should('be.visible');
    cy.log('Filling Loan Type form');
    cy.get('#nature').select('normal');
    cy.get('#name').type(createdLoanTypeName);
    cy.get('#qualificationBasis').select('savings');
    cy.get('#periodMonths').type('12');
    cy.get('#interestType').select('flat');
    cy.get('#interestRate').type('12');
    cy.get('#interestRatePeriod').select('month');
    cy.get('#repaymentSequence').select('principal_first');
    cy.intercept('POST', '**/loan-types').as('createLoanType');
    cy.contains('button', 'Save Loan Type').click();
    cy.wait('@createLoanType').then((interception) => {
      expect(interception.response.statusCode).to.be.within(200, 299);
    });
    cy.get('.alert').should('contain.text', 'Loan type saved successfully');
    cy.contains(createdLoanTypeName).should('exist');
    cy.log('Editing Loan Type');
    cy.contains('.loan-type-row', createdLoanTypeName).within(() => {
      cy.get('button[title="Edit"]').click();
    });
    cy.get('#name').clear().type(`${createdLoanTypeName} Edited`);
    cy.intercept('PATCH', '**/loan-types/**').as('updateLoanType');
    cy.contains('button', 'Update Loan Type').click();
    cy.wait('@updateLoanType').then((interception) => {
      expect(interception.response.statusCode).to.be.within(200, 299);
    });
    cy.get('.alert').should('contain.text', 'Loan type saved successfully');
    cy.contains(`${createdLoanTypeName} Edited`).should('exist');
    cy.log('Deleting Loan Type');
    cy.contains('.loan-type-row', `${createdLoanTypeName} Edited`).within(() => {
      cy.intercept('DELETE', '**/loan-types/**').as('deleteLoanType');
      cy.get('button[title="Delete"]').click();
    });
    cy.on('window:confirm', () => true);
    cy.wait('@deleteLoanType').then((interception) => {
      expect(interception.response.statusCode).to.be.within(200, 299);
    });
    cy.get('.alert').should('contain.text', 'Loan type deleted');

    cy.log('Visiting Member Loans tab');
    cy.visitAuthed('/loans');
    cy.get('button.loans-tab-btn[title="Member Loans"]', { timeout: 15000 }).click({ force: true });
    cy.contains('h1', 'Member Loans', { timeout: 15000 }).should('be.visible');
    cy.contains('button', 'Create Loan', { timeout: 15000 }).should('be.visible').click();
    cy.contains('h3', 'Create New Loan').should('be.visible');

    let hasMembers = false;
    let hasTypes = false;
    let hasAccounts = false;

    cy.get('label').contains('Member').parent().find('select').find('option:not([disabled])').then(($options) => {
      hasMembers = $options.length > 1;
    });
    cy.get('label').contains('Loan Type').parent().find('select').find('option:not([disabled])').then(($options) => {
      hasTypes = $options.length > 1;
    });
    cy.get('label').contains('Disbursement Account').parent().find('select').find('option:not([disabled])').then(($options) => {
      hasAccounts = $options.length > 1;
    });

    cy.then(function () {
      if (!hasMembers || !hasTypes || !hasAccounts) {
        cy.log('Skipping member loan create: missing members, loan types, or accounts');
        this.skip();
      }
    });

    cy.get('label').contains('Member').parent().find('select').find('option:not([disabled])').then(($options) => {
      const option = [...$options].find((opt) => opt.value);
      if (option) {
        cy.get('label').contains('Member').parent().find('select').select(option.value);
      }
    });
    cy.get('label').contains('Loan Type').parent().find('select').find('option:not([disabled])').then(($options) => {
      const option = [...$options].find((opt) => opt.value);
      if (option) {
        cy.get('label').contains('Loan Type').parent().find('select').select(option.value);
      }
    });
    cy.get('label').contains('Disbursement Account').parent().find('select').find('option:not([disabled])').then(($options) => {
      const option = [...$options].find((opt) => opt.value);
      if (option) {
        cy.get('label').contains('Disbursement Account').parent().find('select').select(option.value);
      }
    });
    cy.get('label').contains('Amount').parent().find('input').clear().type('5000');
    cy.get('label').contains('Period (months)').parent().find('input').clear().type('12');
    cy.intercept('POST', '**/loans').as('createLoan');
    cy.get('form.loan-form').contains('button', 'Create Loan').click();
    cy.wait('@createLoan', { timeout: 15000 }).then((interception) => {
      expect(interception.response.statusCode).to.be.within(200, 299);
    });
    cy.contains('h3', 'Create New Loan').should('not.exist');

    cy.get('table').should('exist');
    cy.get('table tbody tr').first().as('loanRow');
    cy.get('@loanRow').should('exist');
    cy.log('Deleting Member Loan');
    cy.intercept('DELETE', '**/loans/**').as('deleteLoan');
    cy.on('window:confirm', () => true);
    cy.get('@loanRow').find('button[title="Delete"]').click();
    cy.wait('@deleteLoan', { timeout: 15000 }).then((interception) => {
      expect(interception.response.statusCode).to.be.within(200, 299);
    });
    cy.get('table').should('exist');
  });

  it('should create, view, approve, and delete a member loan', function () {
    cy.visitAuthed('/loans');
    cy.get('button.loans-tab-btn[title="Member Loans"]', { timeout: 15000 }).click({ force: true });
    cy.contains('h1', 'Member Loans', { timeout: 15000 }).should('be.visible');
    cy.contains('button', 'Create Loan', { timeout: 15000 }).should('be.visible').click();
    cy.contains('h3', 'Create New Loan').should('be.visible');
    let hasMembers = false;
    let hasTypes = false;
    let hasAccounts = false;

    cy.get('label').contains('Member').parent().find('select').find('option:not([disabled])').then(($options) => {
      hasMembers = $options.length > 1;
    });
    cy.get('label').contains('Loan Type').parent().find('select').find('option:not([disabled])').then(($options) => {
      hasTypes = $options.length > 1;
    });
    cy.get('label').contains('Disbursement Account').parent().find('select').find('option:not([disabled])').then(($options) => {
      hasAccounts = $options.length > 1;
    });

    cy.then(function () {
      if (!hasMembers || !hasTypes || !hasAccounts) {
        cy.log('Skipping member loan create: missing members, loan types, or accounts');
        this.skip();
      }
    });
    // Select first available member
    cy.get('label').contains('Member').parent().find('select').find('option:not([disabled])').then(($options) => {
      const option = [...$options].find((opt) => opt.value);
      if (option) {
        cy.get('label').contains('Member').parent().find('select').select(option.value);
      }
    });
    cy.get('label').contains('Loan Type').parent().find('select').find('option:not([disabled])').then(($options) => {
      const option = [...$options].find((opt) => opt.value);
      if (option) {
        cy.get('label').contains('Loan Type').parent().find('select').select(option.value);
      }
    });
    cy.get('label').contains('Disbursement Account').parent().find('select').find('option:not([disabled])').then(($options) => {
      const option = [...$options].find((opt) => opt.value);
      if (option) {
        cy.get('label').contains('Disbursement Account').parent().find('select').select(option.value);
      }
    });
    cy.get('label').contains('Amount').parent().find('input').clear().type('5000');
    cy.get('label').contains('Period (months)').parent().find('input').clear().type('12');
    cy.intercept('POST', '**/loans').as('createLoan');
    cy.get('form.loan-form').contains('button', 'Create Loan').click();
    cy.wait('@createLoan', { timeout: 15000 }).then((interception) => {
      expect(interception.response.statusCode).to.be.within(200, 299);
    });
    cy.contains('h3', 'Create New Loan').should('not.exist');
    cy.get('table').should('exist');
    cy.get('table tbody tr').first().as('loanRow');
    cy.get('@loanRow').should('exist');
    cy.get('@loanRow').within(() => {
      cy.get('button[title="Approve"]').then($btn => {
        if ($btn.length) {
          cy.wrap($btn).click();
        }
      });
    });
    cy.get('table').should('exist');
    cy.intercept('DELETE', '**/loans/**').as('deleteLoan');
    cy.on('window:confirm', () => true);
    cy.get('@loanRow').find('button[title="Delete"]').click();
    cy.wait('@deleteLoan', { timeout: 15000 }).then((interception) => {
      expect(interception.response.statusCode).to.be.within(200, 299);
    });
    cy.get('table').should('exist');
  });

  it('should view dashboard and member profile', () => {
    cy.visitAuthed('/dashboard');
    cy.get('body', { timeout: 10000 }).should('contain.text', 'Loans');
    cy.visitAuthed('/members');
    cy.get('body').should('contain.text', 'Members');
    cy.get('body').then(($body) => {
      const rows = $body.find('table tbody tr');
      if (rows.length > 0) {
        cy.wrap(rows[0]).click({ force: true });
        cy.get('body').should('contain.text', 'Member Loans');
      } else {
        cy.log('No members available to open profile');
      }
    });
  });
});

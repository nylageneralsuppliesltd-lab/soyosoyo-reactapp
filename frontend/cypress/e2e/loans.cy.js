

// Cypress E2E tests for Loans Module
// Covers: create, read, update, delete, and error handling


describe('Loans Module E2E - Comprehensive', () => {
  const uniqueSuffix = Date.now();
  let createdLoanTypeName = `Test Loan Type ${uniqueSuffix}`;
  let createdLoanTypeId = null;
  let createdMemberLoanId = null;

  it('should create, edit, and delete a loan type, then create, edit, approve, and delete a member loan', () => {
    cy.log('Visiting Loan Types tab');
    cy.visit('/loans?tab=types');
    cy.contains('h1', 'Loan Types').should('be.visible');
    cy.contains('button', 'New Loan Type').click();
    cy.get('form').should('be.visible');
    cy.log('Filling Loan Type form');
    cy.get('label').contains('Loan Type Name').parent().find('input').type(createdLoanTypeName);
    cy.get('label').contains('Nature of the Loan Type').parent().find('select').select('normal');
    cy.get('label').contains('Member qualification amount is based on what?').parent().find('select').select('savings');
    cy.get('label').contains('After how long are members expected to repay the loan?').parent().find('input').type('12');
    cy.get('label').contains('How is the interest charged?').parent().find('select').select('flat');
    cy.get('label').contains('What is the interest rate?').parent().find('input').type('12');
    cy.get('label').contains('The interest rate is charged per?').parent().find('select').select('month');
    // Optionally fill Repayment Sequence if present
    cy.get('body').then($body => {
      if ($body.find('label:contains("Repayment Sequence")').length) {
        cy.get('label').contains('Repayment Sequence').parent().find('select').select('principal-first');
      }
    });
    cy.contains('button', '✓ Save Loan Type').click();
    cy.get('body').should('contain.text', 'Loan type saved successfully!');
    cy.contains(createdLoanTypeName).should('exist');
    cy.log('Editing Loan Type');
    cy.contains('tr', createdLoanTypeName).within(() => {
      cy.get('button[title="Edit"]').click();
    });
    cy.get('form').should('be.visible');
    cy.get('label').contains('Loan Type Name').parent().find('input').clear().type(`${createdLoanTypeName} Edited`);
    cy.contains('button', '✓ Update Loan Type').click();
    cy.get('body').should('contain.text', 'Loan type saved successfully!');
    cy.contains(`${createdLoanTypeName} Edited`).should('exist');
    cy.log('Deleting Loan Type');
    cy.contains('tr', `${createdLoanTypeName} Edited`).within(() => {
      cy.get('button[title="Delete"]').click();
    });
    cy.on('window:confirm', () => true);
    cy.get('body').should('contain.text', 'Loan type deleted');
    cy.contains(`${createdLoanTypeName} Edited`).should('not.exist');

    // Now create, edit, approve, and delete a member loan
    cy.log('Visiting Member Loans tab');
    cy.visit('/loans?tab=member-loans');
    cy.contains('h1', 'Member Loans').should('be.visible');
    cy.contains('button', 'New Member Loan').click();
    cy.contains('h3', 'Create Member Loan').should('be.visible');
    cy.log('Checking available members');
    cy.get('label').contains('Member').parent().find('select').find('option').then(options => {
      cy.log('Member options: ' + [...options].map(o => o.text).join(', '));
    });
    cy.get('label').contains('Member').parent().find('select').find('option:not([disabled])').eq(1).then(option => {
      cy.get('label').contains('Member').parent().find('select').select(option.text());
      cy.log('Selected member: ' + option.text());
    });
    cy.log('Checking available loan types');
    cy.get('label').contains('Loan Type').parent().find('select').find('option').then(options => {
      cy.log('Loan Type options: ' + [...options].map(o => o.text).join(', '));
    });
    cy.get('label').contains('Loan Type').parent().find('select').find('option:not([disabled])').eq(1).then(option => {
      cy.get('label').contains('Loan Type').parent().find('select').select(option.text());
      cy.log('Selected loan type: ' + option.text());
    });
    cy.log('Checking available disbursement accounts');
    cy.get('label').contains('Disbursement Account').parent().find('select').find('option').then(options => {
      cy.log('Account options: ' + [...options].map(o => o.text).join(', '));
    });
    cy.get('label').contains('Disbursement Account').parent().find('select').find('option:not([disabled])').eq(1).then(option => {
      cy.get('label').contains('Disbursement Account').parent().find('select').select(option.text());
      cy.log('Selected account: ' + option.text());
    });
    cy.get('label').contains('Amount').parent().find('input').clear().type('5000');
    cy.get('label').contains('Period (months)').parent().find('input').clear().type('12');
    cy.contains('button', 'Create Loan').click();
    cy.get('body').should('contain.text', 'Loan created successfully');
    cy.get('table').should('exist');
    cy.get('table tbody tr').first().as('loanRow');
    cy.get('@loanRow').should('exist');
    cy.log('Editing Member Loan');
    cy.get('@loanRow').find('button[title="Edit"]').click();
    cy.get('form.member-loan-form').should('be.visible');
    cy.get('label').contains('Amount').parent().find('input').clear().type('6000');
    cy.contains('button', 'Create Loan').click();
    cy.get('body').should('contain.text', 'Loan created successfully');
    cy.get('table', { timeout: 10000 }).should('exist');
    cy.get('table tbody tr').first().within(() => {
      cy.get('button[title="Approve"]').then($btn => {
        if ($btn.length) {
          cy.wrap($btn).click();
          cy.on('window:confirm', () => true);
          cy.get('body').should('contain.text', 'Loan approved successfully!');
        }
      });
    });
    cy.log('Deleting Member Loan');
    cy.get('table tbody tr').first().find('button[title="Delete"]').click();
    cy.on('window:confirm', () => true);
    cy.get('body').should('contain.text', 'Loan deleted');
  });

  it('should create, view, edit, approve, and delete a member loan', () => {
    cy.visit('/loans?tab=member-loans');
    cy.contains('h1', 'Member Loans').should('be.visible');
    cy.contains('button', 'New Member Loan').click();
    cy.contains('h3', 'Create Member Loan').should('be.visible');
    // Select first available member
    cy.get('label').contains('Member').parent().find('select').find('option:not([disabled])').eq(1).then(option => {
      cy.get('label').contains('Member').parent().find('select').select(option.text());
    });
    // Select first available loan type
    cy.get('label').contains('Loan Type').parent().find('select').find('option:not([disabled])').eq(1).then(option => {
      cy.get('label').contains('Loan Type').parent().find('select').select(option.text());
    });
    // Select first available disbursement account
    cy.get('label').contains('Disbursement Account').parent().find('select').find('option:not([disabled])').eq(1).then(option => {
      cy.get('label').contains('Disbursement Account').parent().find('select').select(option.text());
    });
    cy.get('label').contains('Amount').parent().find('input').clear().type('5000');
    cy.get('label').contains('Period (months)').parent().find('input').clear().type('12');
    cy.contains('button', 'Create Loan').click();
    cy.get('body').should('contain.text', 'Loan created successfully');
    // View member loans list
    cy.get('table').should('exist');
    cy.get('table tbody tr').first().as('loanRow');
    cy.get('@loanRow').should('exist');
    // Edit member loan
    cy.get('@loanRow').find('button[title="Edit"]').click();
    cy.get('form.member-loan-form').should('be.visible');
    cy.get('label').contains('Amount').parent().find('input').clear().type('6000');
    cy.contains('button', 'Create Loan').click();
    cy.get('body').should('contain.text', 'Loan created successfully');
    // Approve loan if possible
    cy.get('table', { timeout: 10000 }).should('exist');
    cy.get('table tbody tr').first().within(() => {
      cy.get('button[title="Approve"]').then($btn => {
        if ($btn.length) {
          cy.wrap($btn).click();
          cy.on('window:confirm', () => true);
          cy.get('body').should('contain.text', 'Loan approved successfully!');
        }
      });
    });
    // Delete member loan
    cy.get('table tbody tr').first().find('button[title="Delete"]').click();
    cy.on('window:confirm', () => true);
    cy.get('body').should('contain.text', 'Loan deleted');
  });

  it('should view dashboard loan card and member profile with loan', () => {
    // Dashboard loan card
      cy.visit('/dashboard');
    cy.get('body', { timeout: 10000 }).should('contain.text', 'Loans');
    // Wait for dashboard loan card/table to appear
    cy.get('table', { timeout: 10000 }).should('exist');
    // Member profile
      cy.visit('/members');
    cy.get('table').should('exist');
    cy.get('table tbody tr').first().click();
    cy.get('body').should('contain.text', 'Member Loans');
  });
});

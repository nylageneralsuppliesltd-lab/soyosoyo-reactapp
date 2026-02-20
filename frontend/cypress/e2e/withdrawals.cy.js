const apiBase = Cypress.env('apiBase') || 'http://localhost:3000/api';

const pickMember = () => {
  cy.contains('label', 'Member')
    .parent()
    .find('input')
    .as('memberInput');

  cy.get('@memberInput').clear().type('a');
  cy.get('.member-dropdown .member-option:not(.add-member-option)')
    .its('length')
    .then((count) => {
      if (count === 0) {
        cy.log('No members available for selection');
        return;
      }
      cy.get('.member-dropdown .member-option:not(.add-member-option)')
        .first()
        .click();
    });
};

const selectSmartSelect = (labelText) => {
  cy.contains('.smart-select-wrapper', labelText).within(() => {
    cy.get('button.smart-select-button').click();
    cy.get('.smart-select-option', { timeout: 10000 })
      .should('have.length.greaterThan', 0)
      .first()
      .click();
  });
};

const ensureExpenseCategory = (name) => {
  return cy.request('GET', `${apiBase}/settings/expense-categories`).then((response) => {
    const categories = Array.isArray(response.body) ? response.body : (response.body.data || []);
    const exists = categories.some((cat) => String(cat.name).toLowerCase() === String(name).toLowerCase());
    if (!exists) {
      return cy.request('POST', `${apiBase}/settings/expense-categories`, { name });
    }
  });
};

describe('Withdrawals menus E2E', () => {
  it('records an expense', () => {
    ensureExpenseCategory('QA Expense');
    cy.visit('/withdrawals');
    cy.contains('button.menu-tab', 'Record Expense').click();

    cy.contains('label', 'Amount').parent().find('input[type="number"]').clear().type('80');
    selectSmartSelect('Expense Category');
    selectSmartSelect('Account');

    cy.intercept('POST', '**/withdrawals/expense').as('createExpense');
    cy.get('form.form-card').within(() => {
      cy.contains('button[type="submit"]', 'Record Expense').click();
    });
    cy.wait('@createExpense', { timeout: 10000 }).then((interception) => {
      expect(interception.response.statusCode).to.be.within(200, 299);
    });
  });

  it('records a transfer when two accounts exist', () => {
    cy.visit('/withdrawals');
    cy.contains('button.menu-tab', 'Account Transfer').click();

    cy.contains('.smart-select-wrapper', 'From Account').within(() => {
      cy.get('button.smart-select-button').click();
      cy.get('.smart-select-option').then((options) => {
        if (options.length < 2) {
          cy.log('Need at least two accounts for transfer');
          return;
        }
        cy.wrap(options.eq(0)).click();
      });
    });

    cy.contains('.smart-select-wrapper', 'To Account').within(() => {
      cy.get('button.smart-select-button').click();
      cy.get('.smart-select-option').then((options) => {
        if (options.length < 2) {
          cy.log('Need at least two accounts for transfer');
          return;
        }
        cy.wrap(options.eq(1)).click();
      });
    });

    cy.contains('label', 'Amount').parent().find('input[type="number"]').clear().type('60');

    cy.intercept('POST', '**/withdrawals/transfer').as('createTransfer');
    cy.contains('button', 'Record Transfer').click();
    cy.wait('@createTransfer').then((interception) => {
      expect(interception.response.statusCode).to.be.within(200, 299);
    });
  });

  it('records a contribution refund', () => {
    cy.visit('/withdrawals');
    cy.contains('button.menu-tab', 'Contribution Refund').click();

    pickMember();
    cy.contains('label', 'Amount').parent().find('input[type="number"]').clear().type('55');
    cy.contains('label', 'Contribution Type').parent().find('select').select('Monthly Contribution');
    selectSmartSelect('Account');

    cy.intercept('POST', '**/withdrawals/refund').as('createRefund');
    cy.contains('button', 'Record Refund').click();
    cy.wait('@createRefund').then((interception) => {
      expect(interception.response.statusCode).to.be.within(200, 299);
    });
  });

  it('records a dividend payout', () => {
    cy.visit('/withdrawals');
    cy.contains('button.menu-tab', 'Dividend Payout').click();

    pickMember();
    cy.contains('label', 'Amount').parent().find('input[type="number"]').clear().type('40');
    selectSmartSelect('Account');

    cy.intercept('POST', '**/withdrawals/dividend').as('createDividend');
    cy.contains('button', 'Record Dividend').click();
    cy.wait('@createDividend').then((interception) => {
      expect(interception.response.statusCode).to.be.within(200, 299);
    });
  });
});

const apiBase = Cypress.env('apiBase') || 'http://localhost:3000/api';

const pickMember = () => {
  cy.contains('label', 'Member').parent().within(() => {
    cy.get('input').first().clear().type('a');
  });

  return cy.get('body').then(($body) => {
    const memberOptions = $body.find('.member-dropdown .member-option:not(.add-member-option)');
    if (memberOptions.length) {
      return cy.wrap(memberOptions[0]).click({ force: true }).then(() => true);
    }

    const smartOptions = $body.find('.smart-select-option');
    if (smartOptions.length) {
      return cy.wrap(smartOptions[0]).click({ force: true }).then(() => true);
    }

    cy.log('No member options available for selection');
    return false;
  });
};

const selectSmartSelect = (labelText) => {
  cy.contains('.smart-select-wrapper', labelText)
    .find('button.smart-select-button')
    .click({ force: true });

  cy.get('.smart-select-option', { timeout: 10000 })
    .should('have.length.greaterThan', 0)
    .first()
    .click({ force: true });
};

const ensureExpenseCategory = (name) => {
  return cy.apiRequestAuth('GET', `${apiBase}/settings/expense-categories`).then((response) => {
    const categories = Array.isArray(response.body) ? response.body : (response.body.data || []);
    const exists = categories.some((cat) => String(cat.name).toLowerCase() === String(name).toLowerCase());
    if (!exists) {
      return cy.apiRequestAuth('POST', `${apiBase}/settings/expense-categories`, { name });
    }
  });
};

describe('Withdrawals menus E2E', () => {
  beforeEach(() => {
    cy.visitAuthed('/withdrawals');
  });

  it('records an expense', () => {
    ensureExpenseCategory('QA Expense');
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
    cy.contains('button.menu-tab', 'Account Transfer').click();

    cy.contains('.smart-select-wrapper', 'From Account').within(() => {
      cy.get('button.smart-select-button').click({ force: true });
      cy.get('.smart-select-option').then((options) => {
        if (options.length < 2) {
          cy.log('Need at least two accounts for transfer');
          return;
        }
        cy.wrap(options.eq(0)).click({ force: true });
      });
    });

    cy.contains('.smart-select-wrapper', 'To Account').within(() => {
      cy.get('button.smart-select-button').click({ force: true });
      cy.get('.smart-select-option').then((options) => {
        if (options.length < 2) {
          cy.log('Need at least two accounts for transfer');
          return;
        }
        cy.wrap(options.eq(1)).click({ force: true });
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
    cy.contains('button.menu-tab', 'Contribution Refund').click();

    pickMember().then((memberSelected) => {
      if (!memberSelected) {
        cy.log('Skipping refund: no member available');
        return;
      }

      cy.contains('label', 'Amount').parent().find('input[type="number"]').clear().type('55');
      cy.contains('label', 'Contribution Type').parent().find('select').then(($select) => {
        const options = $select.find('option').filter((_, option) => Boolean(option.value));
        if (!options.length) {
          cy.log('Skipping refund: no contribution types available');
          return;
        }
        cy.wrap($select).select(options[0].value, { force: true });
      });
      selectSmartSelect('Account');

      cy.intercept('POST', '**/withdrawals/refund').as('createRefund');
      cy.contains('button', 'Record Refund').click({ force: true });
      cy.wait('@createRefund').then((interception) => {
        expect(interception.response.statusCode).to.be.within(200, 299);
      });
    });
  });

  it('records a dividend payout', () => {
    cy.contains('button.menu-tab', 'Dividend Payout').click();

    pickMember().then((memberSelected) => {
      if (!memberSelected) {
        cy.log('Skipping dividend: no member available');
        return;
      }

      cy.contains('label', 'Amount').parent().find('input[type="number"]').clear().type('40');
      selectSmartSelect('Account');

      cy.intercept('POST', '**/withdrawals/dividend').as('createDividend');
      cy.contains('button', 'Record Dividend').click({ force: true });
      cy.wait('@createDividend').then((interception) => {
        expect(interception.response.statusCode).to.be.within(200, 299);
      });
    });
  });
});

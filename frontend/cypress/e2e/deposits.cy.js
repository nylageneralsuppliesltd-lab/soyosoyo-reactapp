const apiBase = Cypress.env('apiBase') || 'http://localhost:3000/api';

const pickMember = () => {
  cy.contains('label', 'Member').parent().find('input').first().clear().type('a');
  cy.wait(300);
  return cy.get('body').then(($body) => {
    const options = $body.find('.member-dropdown .member-option:not(.add-member-option)');
    if (!options.length) {
      cy.log('No members available for selection');
      return false;
    }

    return cy.wrap(options[0]).click({ force: true }).then(() => true);
  });
};

const selectSmartSelect = (labelText) => {
  cy.contains('.smart-select-wrapper', labelText).within(() => {
    cy.get('button.smart-select-button').click();
    cy.get('.smart-select-option').first().click();
  });
};

const selectFirstAvailableAccount = () => {
  cy.get('body').then(($body) => {
    if ($body.find('.smart-select-wrapper:contains("Receiving Account")').length) {
      selectSmartSelect('Receiving Account');
    } else {
      selectSmartSelect('Account');
    }
  });
};

const fillDescriptionField = (text) => {
  cy.contains('label', 'Description')
    .parent()
    .then(($parent) => {
      const textarea = $parent.find('textarea');
      if (textarea.length) {
        cy.wrap(textarea).first().clear().type(text);
      } else {
        cy.wrap($parent).find('input[type="text"]').first().clear().type(text);
      }
    });
};

describe('Deposits menus E2E', () => {
  beforeEach(() => {
    cy.visitAuthed('/deposits');
  });

  it('records a contribution', () => {
    cy.contains('button.menu-tab', 'Contribution').click();

    pickMember().then((memberSelected) => {
      if (!memberSelected) {
        cy.log('Skipping contribution: no member available');
        return;
      }

      cy.contains('label', 'Amount').parent().find('input[type="number"]').clear().type('150');
      selectFirstAvailableAccount();

      cy.intercept('POST', '**/deposits/bulk/import-json').as('createContribution');
      cy.contains('button', 'Record Contribution').click();
      cy.wait('@createContribution').then((interception) => {
        expect(interception.response.statusCode).to.be.within(200, 299);
      });
    });
  });

  it('records a fine payment', () => {
    cy.contains('button.menu-tab', 'Fine Payment').click();

    pickMember().then((memberSelected) => {
      if (!memberSelected) {
        cy.log('Skipping fine payment: no member available');
        return;
      }

      cy.contains('label', 'Fine Amount').parent().find('input[type="number"]').clear().type('50');
      cy.contains('label', 'Reason for Fine').parent().find('textarea').clear().type('QA fine');
      selectFirstAvailableAccount();

      cy.intercept('POST', '**/deposits/bulk/import-json').as('createFine');
      cy.contains('button', /Record Fine/i).click();
      cy.wait('@createFine').then((interception) => {
        expect(interception.response.statusCode).to.be.within(200, 299);
      });
    });
  });

  it('records a loan repayment when a loan exists', () => {
    cy.contains('button.menu-tab', 'Loan Repayment').click();

    pickMember().then((memberSelected) => {
      if (!memberSelected) {
        cy.log('Skipping repayment: no member available');
        return;
      }

      cy.contains('label', 'Select Loan')
        .parent()
        .find('select')
        .then(($select) => {
          const options = $select.find('option');
          if (options.length <= 1) {
            cy.log('No repayable loans available, skipping repayment submission');
            return;
          }
          cy.wrap($select).select(options.eq(1).text());
          cy.contains('label', 'Repayment Amount').parent().find('input[type="number"]').clear().type('200');
          selectFirstAvailableAccount();

          cy.intercept('POST', '**/deposits/bulk/import-json').as('createRepayment');
          cy.contains('button', 'Record Loan Repayment').click();
          cy.wait('@createRepayment').then((interception) => {
            expect(interception.response.statusCode).to.be.within(200, 299);
          });
        });
    });
  });

  it('records income', () => {
    cy.contains('button.menu-tab', 'Income').click();

    cy.contains('label', 'Amount').parent().find('input[type="number"]').clear().type('350');
    cy.contains('label', 'Income Source').parent().find('input[type="text"]').clear().type('QA income');
    fillDescriptionField('QA income description');
    selectFirstAvailableAccount();

    cy.intercept('POST', '**/deposits/bulk/import-json').as('createIncome');
    cy.contains('button', 'Record Income').click();
    cy.wait('@createIncome').then((interception) => {
      expect(interception.response.statusCode).to.be.within(200, 299);
    });
  });

  it('records miscellaneous payment without member', () => {
    cy.contains('button.menu-tab', 'Miscellaneous').click();

    cy.contains('label', 'This payment is from a member').find('input').uncheck();
    cy.contains('label', 'Amount').parent().find('input[type="number"]').clear().type('75');
    cy.contains('label', 'Purpose').parent().find('input[type="text"]').clear().type('QA purpose');
    fillDescriptionField('QA misc description');
    selectFirstAvailableAccount();

    cy.intercept('POST', '**/deposits/bulk/import-json').as('createMisc');
    cy.contains('button', /Record Payment/i).click();
    cy.wait('@createMisc').then((interception) => {
      expect(interception.response.statusCode).to.be.within(200, 299);
    });
  });

  it('records share capital', () => {
    cy.contains('button.menu-tab', 'Share Capital').click();

    pickMember().then((memberSelected) => {
      if (!memberSelected) {
        cy.log('Skipping share capital: no member available');
        return;
      }

      cy.contains('label', 'Amount').parent().find('input[type="number"]').clear().type('500');
      selectFirstAvailableAccount();

      cy.intercept('POST', '**/deposits/bulk/import-json').as('createShare');
      cy.contains('button', 'Record Share Capital Payment').click();
      cy.wait('@createShare').then((interception) => {
        expect(interception.response.statusCode).to.be.within(200, 299);
      });
    });
  });

  it('imports bulk payments', () => {
    cy.contains('button.menu-tab', 'Bulk Import').click();

    cy.apiRequestAuth('GET', `${apiBase}/members`).then((response) => {
      const members = Array.isArray(response.body) ? response.body : (response.body.data || []);
      const member = members[0];
      if (!member) {
        cy.log('No members available for bulk import');
        return;
      }
      const payload = {
        payments: [
          {
            date: '2026-02-20',
            memberName: member.name,
            memberId: member.id,
            amount: 100,
            paymentType: 'contribution',
            contributionType: 'Monthly Contribution',
            paymentMethod: 'cash',
          },
        ],
      };
      const jsonContent = JSON.stringify(payload, null, 2);
      cy.get('input[type="file"]').selectFile({
        contents: Cypress.Buffer.from(jsonContent),
        fileName: 'bulk-payments.json',
        mimeType: 'application/json',
        lastModified: Date.now(),
      }, { force: true });

      cy.intercept('POST', '**/deposits/bulk/import-json').as('bulkImport');
      cy.contains('button', 'Import Payments').click();
      cy.wait('@bulkImport').then((interception) => {
        expect(interception.response.statusCode).to.be.within(200, 299);
      });
    });
  });
});

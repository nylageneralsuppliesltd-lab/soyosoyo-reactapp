const apiBase = Cypress.env('apiBase') || 'http://localhost:3000/api';

const getList = (body) => (Array.isArray(body) ? body : (body?.data || []));

const ensureEntry = (endpoint, name) => {
  return cy.apiRequestAuth('GET', `${apiBase}/${endpoint}`).then((response) => {
    const rows = getList(response.body);
    const exists = rows.some((row) => String(row.name || '').toLowerCase() === String(name).toLowerCase());
    if (exists) return;
    const payload = endpoint === 'settings/contribution-types'
      ? { name, amount: 100, frequency: 'Monthly', typeCategory: 'Regular Contribution' }
      : { name };
    return cy.apiRequestAuth('POST', `${apiBase}/${endpoint}`, payload);
  });
};

describe('Settings E2E - Multiple Entries', () => {
  beforeEach(() => {
    cy.apiLogin();
    cy.visitAuthed('/settings');
    cy.get('body').should('contain.text', 'Settings');
  });

  it('creates multiple contribution types', () => {
    const suffix = Date.now();
    ensureEntry('settings/contribution-types', `QA Contribution A ${suffix}`);
    ensureEntry('settings/contribution-types', `QA Contribution B ${suffix}`);

    cy.apiRequestAuth('GET', `${apiBase}/settings/contribution-types`).then((response) => {
      const names = getList(response.body).map((row) => row.name);
      expect(names.join(' | ')).to.contain(`QA Contribution A ${suffix}`);
      expect(names.join(' | ')).to.contain(`QA Contribution B ${suffix}`);
    });
  });

  it('creates multiple expense categories', () => {
    const suffix = Date.now();
    ensureEntry('settings/expense-categories', `QA Expense A ${suffix}`);
    ensureEntry('settings/expense-categories', `QA Expense B ${suffix}`);

    cy.apiRequestAuth('GET', `${apiBase}/settings/expense-categories`).then((response) => {
      const names = getList(response.body).map((row) => row.name);
      expect(names.join(' | ')).to.contain(`QA Expense A ${suffix}`);
      expect(names.join(' | ')).to.contain(`QA Expense B ${suffix}`);
    });
  });

  it('creates multiple income categories', () => {
    const suffix = Date.now();
    ensureEntry('settings/income-categories', `QA Income A ${suffix}`);
    ensureEntry('settings/income-categories', `QA Income B ${suffix}`);

    cy.apiRequestAuth('GET', `${apiBase}/settings/income-categories`).then((response) => {
      const names = getList(response.body).map((row) => row.name);
      expect(names.join(' | ')).to.contain(`QA Income A ${suffix}`);
      expect(names.join(' | ')).to.contain(`QA Income B ${suffix}`);
    });
  });

  it('creates multiple fine categories', () => {
    const suffix = Date.now();
    ensureEntry('settings/fine-categories', `QA Fine A ${suffix}`);
    ensureEntry('settings/fine-categories', `QA Fine B ${suffix}`);

    cy.apiRequestAuth('GET', `${apiBase}/settings/fine-categories`).then((response) => {
      const names = getList(response.body).map((row) => row.name);
      expect(names.join(' | ')).to.contain(`QA Fine A ${suffix}`);
      expect(names.join(' | ')).to.contain(`QA Fine B ${suffix}`);
    });
  });
});

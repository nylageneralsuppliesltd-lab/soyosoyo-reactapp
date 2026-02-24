describe('Accessibility Smoke (Critical/Serious)', () => {
  const routes = ['/landing', '/login', '/dashboard', '/deposits', '/withdrawals', '/settings'];

  beforeEach(() => {
    cy.apiLogin();
  });

  routes.forEach((route) => {
    it(`has no serious/critical a11y violations on ${route}`, () => {
      if (route === '/landing' || route === '/login') {
        cy.visit(route);
      } else {
        cy.visitAuthed(route);
      }

      cy.injectAxe();
      cy.checkA11y(null, {
        includedImpacts: ['serious', 'critical'],
      });
    });
  });
});

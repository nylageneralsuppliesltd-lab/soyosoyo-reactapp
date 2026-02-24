describe('Visibility Smoke (Desktop/Mobile)', () => {
  const publicRoutes = ['/landing', '/login'];
  const protectedRoutes = [
    '/dashboard',
    '/members/list',
    '/deposits',
    '/withdrawals',
    '/loans',
    '/reports',
    '/settings',
  ];

  beforeEach(() => {
    cy.apiLogin();
  });

  publicRoutes.forEach((route) => {
    it(`renders ${route} visibly`, () => {
      cy.visit(route);
      cy.get('body').should('be.visible');
      cy.get('main').should('be.visible');
      cy.window().then((win) => {
        expect(win.document.body.scrollHeight).to.be.greaterThan(0);
      });
    });
  });

  protectedRoutes.forEach((route) => {
    it(`renders ${route} visibly (authed)`, () => {
      cy.visitAuthed(route);
      cy.get('body').should('be.visible');
      cy.get('main').should('be.visible');
      cy.window().then((win) => {
        expect(win.document.body.scrollHeight).to.be.greaterThan(0);
      });
    });
  });
});

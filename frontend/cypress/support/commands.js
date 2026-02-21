const apiBase = Cypress.env('apiBase') || 'http://localhost:3000/api';
const authIdentifier = Cypress.env('authIdentifier') || 'jncnyaboke@gmail.com';
const authPassword = Cypress.env('authPassword') || 'SmokePass#2026';

Cypress.Commands.add('apiLogin', () => {
	return cy.request('POST', `${apiBase}/auth/login`, {
		identifier: authIdentifier,
		password: authPassword,
	}).then((response) => {
		expect(response.status).to.be.within(200, 299);
		const session = response.body;
		Cypress.env('authSession', session);
		Cypress.env('authToken', session?.token);
		return session;
	});
});

Cypress.Commands.add('visitAuthed', (path) => {
	const existingSession = Cypress.env('authSession');
	if (existingSession?.token) {
		cy.visit(path, {
			timeout: 120000,
			onBeforeLoad(win) {
				win.localStorage.setItem('authSession', JSON.stringify(existingSession));
			},
		});
		return;
	}

	return cy.apiLogin().then((session) => {
		cy.visit(path, {
			timeout: 120000,
			onBeforeLoad(win) {
				win.localStorage.setItem('authSession', JSON.stringify(session));
			},
		});
	});
});

Cypress.Commands.add('apiRequestAuth', (method, url, body) => {
	const token = Cypress.env('authToken');
	return cy.request({
		method,
		url,
		body,
		headers: {
			Authorization: `Bearer ${token}`,
		},
	});
});
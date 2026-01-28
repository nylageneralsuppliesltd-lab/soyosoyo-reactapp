// __mocks__/fetchWithRetry.js
export const fetchWithRetry = jest.fn(() => Promise.resolve({ json: () => ({}) }));

// Polyfill for TextEncoder in jsdom environment
if (typeof global.TextEncoder === 'undefined') {
  const { TextEncoder } = require('util');
  global.TextEncoder = TextEncoder;
}

// Mock Vite import.meta.env for Jest
if (typeof global.importMetaEnvPatched === 'undefined') {
  global.importMetaEnvPatched = true;
  global.importMeta = { env: { VITE_API_URL: 'http://localhost:3000/api' } };
  Object.defineProperty(global, 'import.meta', {
    value: global.importMeta,
    configurable: true,
  });
}

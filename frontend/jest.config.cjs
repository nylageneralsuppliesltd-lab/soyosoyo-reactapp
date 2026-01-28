module.exports = {
  testEnvironment: 'jsdom',
  moduleFileExtensions: ['js', 'jsx'],
  transform: {
    '^.+\\.(js|jsx)$': 'babel-jest',
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(react-router-dom|react-router)/)'
  ],
  setupFilesAfterEnv: ['@testing-library/jest-dom'],
  setupFiles: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '^../utils/apiBase$': '<rootDir>/src/__mocks__/apiBase.js',
    '^../../utils/apiBase$': '<rootDir>/src/__mocks__/apiBase.js',
    '^../utils/fetchWithRetry$': '<rootDir>/src/__mocks__/fetchWithRetry.js',
    '^../../utils/fetchWithRetry$': '<rootDir>/src/__mocks__/fetchWithRetry.js',
    '^../components/loans/ExternalLoans$': '<rootDir>/src/components/loans/__mocks__/ExternalLoans.jsx',
    '^../../components/loans/ExternalLoans$': '<rootDir>/src/components/loans/__mocks__/ExternalLoans.jsx',
  },
  testMatch: ['**/__tests__/**/*.[jt]s?(x)', '**/?(*.)+(spec|test).[jt]s?(x)'],
};

// Mock all tab components as () => null to avoid Vite-specific code and React reference issues
jest.mock('../LoanApplications', () => () => null);
jest.mock('../LoanTypes', () => () => null);
jest.mock('../MemberLoans', () => () => null);
jest.mock('../ExternalLoans', () => () => null);
jest.mock('../BankLoans', () => () => null);


import { render, screen } from '@testing-library/react';
import LoansPage from '../LoansPage';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

describe('LoansPage', () => {
  it('renders Loans Management header', () => {
    render(
      <MemoryRouter>
        <LoansPage />
      </MemoryRouter>
    );
    expect(screen.getByText(/Loans Management/i)).toBeInTheDocument();
  });
});

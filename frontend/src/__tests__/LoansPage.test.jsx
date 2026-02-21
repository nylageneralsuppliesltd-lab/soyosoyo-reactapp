// Mock all tab components as () => null to avoid Vite-specific code and React reference issues
jest.mock('../components/loans/LoanApplications', () => () => null);
jest.mock('../components/loans/LoanTypes', () => () => null);
jest.mock('../components/loans/MemberLoans', () => () => null);
jest.mock('../components/loans/ExternalLoans', () => () => null);
jest.mock('../components/loans/BankLoans', () => () => null);
import { render, screen } from '@testing-library/react';
import LoansPage from '../pages/LoansPage';
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

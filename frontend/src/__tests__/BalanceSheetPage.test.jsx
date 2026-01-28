import { render, screen } from '@testing-library/react';
import BalanceSheetPage from '../pages/BalanceSheetPage';
import React from 'react';

describe('BalanceSheetPage', () => {
  it('renders Balance Sheet header', () => {
    render(<BalanceSheetPage />);
    // Use getByRole to specifically target the h2 report title
    const header = screen.getByRole('heading', { level: 2, name: /Balance Sheet/i });
    expect(header).toBeInTheDocument();
  });
});

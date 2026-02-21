import { render, screen, waitFor } from '@testing-library/react';
import BalanceSheetPage from '../pages/BalanceSheetPage';
import React from 'react';
import { fetchWithRetry } from '../utils/fetchWithRetry';

jest.mock('../utils/fetchWithRetry', () => ({
  fetchWithRetry: jest.fn(),
}));

describe('BalanceSheetPage', () => {
  it('renders Balance Sheet header', async () => {
    fetchWithRetry.mockResolvedValue({
      json: async () => ({
        rows: [],
        meta: { assetTotal: 0, liabilities: 0, equity: 0 },
      }),
    });

    render(<BalanceSheetPage />);
    // Use getByRole to specifically target the h2 report title
    const header = await screen.findByRole('heading', { level: 2, name: /Balance Sheet/i });
    expect(header).toBeInTheDocument();
    await waitFor(() => expect(fetchWithRetry).toHaveBeenCalled());
  });
});

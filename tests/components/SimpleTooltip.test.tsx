import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import SimpleTooltip from '../../components/SimpleTooltip';
import { strategyConfig } from '../../services/strategyConfig';

describe('SimpleTooltip markdown table rendering', () => {
  test('renders table from meanReversion description', async () => {
    render(
      <SimpleTooltip content={strategyConfig.meanReversion.description}>
        <button>Hover me</button>
      </SimpleTooltip>
    );

    const btn = screen.getByText('Hover me');
    fireEvent.mouseEnter(btn);

    // wait for tooltip to appear
    await waitFor(() => expect(document.body.querySelector('table')).toBeInTheDocument());

    const table = document.body.querySelector('table') as HTMLTableElement;
    expect(table).toBeTruthy();
    // headers should include '维度' and '描述'
    expect(screen.getByText('维度')).toBeInTheDocument();
    expect(screen.getByText('描述')).toBeInTheDocument();
  });
});


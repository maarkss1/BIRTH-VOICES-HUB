// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BottomDrawer } from './BottomDrawer';
import { useStudioStore } from '../../../store/useStudioStore';

// Regression coverage for the Onda 3 QA handoff
// (.agents/handoffs/onda-3/03-para-07-studio-labels-e-teclado.md): the "new variable" (key/value)
// fields and the AI workflow-generation prompt textarea only ever had a `placeholder`, with no
// `<label>` and no `aria-label` — meaning a screen reader had no reliable accessible name for
// them once the field held a value. They must resolve via getByLabelText/getByRole with name.
describe('BottomDrawer accessibility', () => {
  beforeEach(() => {
    useStudioStore.setState(useStudioStore.getInitialState(), true);
  });

  it('exposes the new-variable key/value fields via aria-label', async () => {
    const user = userEvent.setup();
    render(<BottomDrawer />);

    await user.click(screen.getByRole('button', { name: 'Add' }));

    const keyField = screen.getByLabelText('Nome da variável de telemetria');
    const valueField = screen.getByLabelText('Valor da variável de telemetria');

    await user.type(keyField, 'lead_score');
    await user.type(valueField, '87');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(useStudioStore.getState().simulationVariables.lead_score).toBe('87');
  });

  it('exposes the AI workflow-generation prompt textarea via aria-label', async () => {
    const user = userEvent.setup();
    render(<BottomDrawer />);

    await user.click(screen.getByRole('button', { name: /Catarina AI Studio/i }));

    const promptField = await screen.findByLabelText(
      'Prompt em linguagem natural para gerar workflow via IA'
    );
    expect(promptField.tagName).toBe('TEXTAREA');

    await user.type(promptField, 'Crie um fluxo de qualificação de leads.');
    expect(promptField).toHaveValue('Crie um fluxo de qualificação de leads.');
  });
});

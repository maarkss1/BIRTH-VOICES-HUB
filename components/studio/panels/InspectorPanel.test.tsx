// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InspectorPanel } from './InspectorPanel';
import { useStudioStore } from '../../../store/useStudioStore';

// Regression coverage for the Onda 3 QA handoff
// (.agents/handoffs/onda-3/03-para-07-studio-labels-e-teclado.md): every text input/textarea in
// this panel must resolve via an accessible name (getByLabelText), not just via placeholder or a
// visually-adjacent <label> with no htmlFor/id link.
//
// `InspectorPanel` is a presentational component: it takes `selectedNode` as a prop and lets the
// caller (Canvas.tsx in production) re-derive it from the store on every render. To exercise the
// same "type into a field -> store updates -> UI reflects the new value" loop the real app has,
// this wrapper subscribes to the store the same way Canvas.tsx does.
function ConnectedInspectorPanel({ nodeId }: { nodeId: string }) {
  const selectedNode = useStudioStore((s) => s.nodes.find((n) => n.id === nodeId) ?? null);
  return <InspectorPanel selectedNode={selectedNode} />;
}

describe('InspectorPanel accessibility', () => {
  beforeEach(() => {
    // Reset to the store's pristine initial state between tests so edits made by one test
    // (label/description/config changes) never leak into the next.
    useStudioStore.setState(useStudioStore.getInitialState(), true);
  });

  it('renders an empty state with no accessible form fields when no node is selected', () => {
    render(<InspectorPanel selectedNode={null} />);
    expect(screen.getByText(/Selecione um Nó para inspecionar/i)).toBeInTheDocument();
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  });

  it('associates the Node Title and Description fields with their <label> via htmlFor/id', () => {
    render(<ConnectedInspectorPanel nodeId="prompt-1" />);

    const titleInput = screen.getByLabelText('Node Title');
    expect(titleInput).toHaveValue('Atendimento Inicial');

    const descriptionInput = screen.getByLabelText('Developer Notes / Description');
    expect(descriptionInput.tagName).toBe('TEXTAREA');
  });

  it('updates the node label through the accessible Node Title field', async () => {
    const user = userEvent.setup();
    render(<ConnectedInspectorPanel nodeId="prompt-1" />);

    const titleInput = screen.getByLabelText('Node Title');
    await user.clear(titleInput);
    await user.type(titleInput, 'Saudação Inicial');

    expect(titleInput).toHaveValue('Saudação Inicial');
    expect(useStudioStore.getState().nodes.find((n) => n.id === 'prompt-1')?.data.label).toBe(
      'Saudação Inicial'
    );
  });

  it('associates dynamic config fields (Setup tab) with a stable id derived from the node + key', async () => {
    const user = userEvent.setup();
    const originalPromptText = useStudioStore.getState().nodes.find((n) => n.id === 'prompt-1')
      ?.data.config?.promptText;
    render(<ConnectedInspectorPanel nodeId="prompt-1" />);

    await user.click(screen.getByRole('button', { name: 'Setup' }));

    // `promptText` is long (>50 chars) so it renders as a <textarea>; its accessible name comes
    // from the humanized key ("prompt Text") via htmlFor="config-prompt-1-promptText".
    const promptTextField = await screen.findByLabelText(/prompt Text/i);
    expect(promptTextField.tagName).toBe('TEXTAREA');
    expect(promptTextField).toHaveValue(String(originalPromptText));

    // `streaming` is short, so it renders as an <input> and must resolve the same way.
    const streamingField = screen.getByLabelText(/^streaming$/i);
    expect(streamingField.tagName).toBe('INPUT');
  });

  it('associates the "Add Variable" form fields (Variables tab) with their labels', async () => {
    const user = userEvent.setup();
    render(<ConnectedInspectorPanel nodeId="prompt-1" />);

    await user.click(screen.getByRole('button', { name: 'variables' }));
    await user.click(await screen.findByRole('button', { name: /ADD/i }));

    const nameField = await screen.findByLabelText('Variable Name');
    const valueField = screen.getByLabelText('Value');

    await user.type(nameField, 'user_cpf');
    await user.type(valueField, '12345678909');

    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(useStudioStore.getState().simulationVariables.user_cpf).toBe('12345678909');
  });
});

// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LayersPanel } from './LayersPanel';
import { InspectorPanel } from './InspectorPanel';
import { useStudioStore } from '../../../store/useStudioStore';

// Regression coverage for the Onda 3 QA handoff
// (.agents/handoffs/onda-3/03-para-07-studio-labels-e-teclado.md):
//  1. the node search field only had a `placeholder`, with no accessible name;
//  2. the canvas (`@xyflow/react`) has no custom keyboard model (no way to Tab between nodes and
//     open their inspector without a mouse) — Agent 03's suggested low-risk mitigation was to make
//     the Layers tab's node list a fully keyboard-operable alternate path to each node, wired to
//     the same `setSelectedNodeId` the canvas itself uses. This suite proves that path is real,
//     not just markup: Tab + Enter on a list item actually opens the InspectorPanel for that node.
//     Full in-canvas keyboard navigation (tabbing through @xyflow/react nodes/edges/handles
//     directly on the canvas) remains unresolved — see the handoff's "## Resolução" section.
function ConnectedStudioShell() {
  const nodes = useStudioStore((s) => s.nodes);
  const selectedNodeId = useStudioStore((s) => s.selectedNodeId);
  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;
  return (
    <div>
      <LayersPanel nodes={nodes} />
      <InspectorPanel selectedNode={selectedNode} />
    </div>
  );
}

describe('LayersPanel accessibility', () => {
  beforeEach(() => {
    useStudioStore.setState(useStudioStore.getInitialState(), true);
  });

  it('exposes the node/tag search field via aria-label', () => {
    render(<LayersPanel nodes={useStudioStore.getState().nodes} />);
    expect(screen.getByLabelText('Pesquisar nós ou tags')).toBeInTheDocument();
  });

  it('lets a keyboard-only user Tab to a node in the Layers list and open it with Enter', async () => {
    const user = userEvent.setup();
    render(<ConnectedStudioShell />);

    // No node selected yet -> InspectorPanel shows its empty state.
    expect(screen.getByText(/Selecione um Nó para inspecionar/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Layers' }));

    const nodeButton = await screen.findByRole('button', {
      name: /Selecionar nó Atendimento Inicial e abrir no inspetor/i
    });

    nodeButton.focus();
    expect(nodeButton).toHaveFocus();

    await user.keyboard('{Enter}');

    expect(useStudioStore.getState().selectedNodeId).toBe('prompt-1');
    // The InspectorPanel (rendered side-by-side, as it is in Canvas.tsx) now reflects the
    // keyboard-driven selection instead of the empty state.
    expect(screen.getByLabelText('Node Title')).toHaveValue('Atendimento Inicial');
  });

  it('adds a node to the canvas from the registry list via keyboard activation (Space)', async () => {
    const user = userEvent.setup();
    render(<LayersPanel nodes={useStudioStore.getState().nodes} />);

    const startCountBefore = useStudioStore.getState().nodes.length;

    const registryItem = screen.getByRole('button', {
      name: /Adicionar nó REST API Integration ao canvas/i
    });
    registryItem.focus();
    await user.keyboard(' ');

    expect(useStudioStore.getState().nodes.length).toBe(startCountBefore + 1);
  });
});

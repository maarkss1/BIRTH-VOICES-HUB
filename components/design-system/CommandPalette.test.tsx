// @vitest-environment jsdom
import { useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { CommandPalette } from './CommandPalette';

const mockNavigate = vi.fn();
const mockSetTheme = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate
  };
});

vi.mock('./ThemeContext', () => ({
  useTheme: () => ({ theme: 'light', setTheme: mockSetTheme, resolvedTheme: 'light' })
}));

function renderPalette(isOpen: boolean, onClose = vi.fn()) {
  return render(
    <MemoryRouter>
      <CommandPalette isOpen={isOpen} onClose={onClose} />
    </MemoryRouter>
  );
}

describe('CommandPalette', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ settings: {} })
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('renders nothing when isOpen is false', () => {
    renderPalette(false);
    expect(screen.queryByPlaceholderText(/digite um comando/i)).not.toBeInTheDocument();
  });

  it('renders the command list when open and navigates on item click', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderPalette(true, onClose);

    expect(screen.getByPlaceholderText(/digite um comando/i)).toBeInTheDocument();
    const item = screen.getByText('Criar Novo Agente');
    await user.click(item);

    expect(mockNavigate).toHaveBeenCalledWith('/dashboard/agents/new');
    expect(onClose).toHaveBeenCalled();
  });

  it('filters items as the user types and shows an empty state for no matches', async () => {
    const user = userEvent.setup();
    renderPalette(true);

    const input = screen.getByPlaceholderText(/digite um comando/i);
    await user.type(input, 'zzz-nao-existe-zzz');

    expect(screen.getByText('Nenhum resultado encontrado')).toBeInTheDocument();
    expect(screen.queryByText('Criar Novo Agente')).not.toBeInTheDocument();
  });

  it('calls onClose when Escape is pressed', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderPalette(true, onClose);

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('exposes dialog and combobox/listbox semantics for assistive tech', () => {
    renderPalette(true);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');

    const input = screen.getByRole('combobox');
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(input.getAttribute('aria-controls')).toBe(screen.getByRole('listbox').id);

    expect(screen.getAllByRole('option').length).toBeGreaterThan(0);
  });

  it('marks the highlighted result as the active option and moves it on ArrowDown', async () => {
    const user = userEvent.setup();
    renderPalette(true);

    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{ArrowDown}');
    const optionsAfter = screen.getAllByRole('option');
    expect(optionsAfter[0]).toHaveAttribute('aria-selected', 'false');
    expect(optionsAfter[1]).toHaveAttribute('aria-selected', 'true');
  });

  it('restores focus to the element that triggered it when it closes', async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <MemoryRouter>
          <button onClick={() => setOpen(true)}>Abrir paleta</button>
          <CommandPalette isOpen={open} onClose={() => setOpen(false)} />
        </MemoryRouter>
      );
    }

    const user = userEvent.setup();
    render(<Harness />);

    const trigger = screen.getByRole('button', { name: 'Abrir paleta' });
    trigger.focus();
    await user.click(trigger);

    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');

    await vi.waitFor(() => expect(trigger).toHaveFocus());
  });
});

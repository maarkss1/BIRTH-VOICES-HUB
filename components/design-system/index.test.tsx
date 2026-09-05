// @vitest-environment jsdom
import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button, Input, EmptyState, Modal, Switch, Tabs, Card } from './index';

describe('design-system primitives', () => {
  describe('Button', () => {
    it('renders its label and fires onClick when clicked', async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      render(<Button onClick={onClick}>Salvar</Button>);

      const button = screen.getByRole('button', { name: 'Salvar' });
      await user.click(button);

      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('does not fire onClick when disabled', async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      render(
        <Button onClick={onClick} disabled>
          Salvar
        </Button>
      );

      const button = screen.getByRole('button', { name: 'Salvar' });
      expect(button).toBeDisabled();

      await user.click(button);
      expect(onClick).not.toHaveBeenCalled();
    });

    it('disables the button and hides onClick while isLoading is true', async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      render(
        <Button onClick={onClick} isLoading>
          Salvar
        </Button>
      );

      const button = screen.getByRole('button', { name: 'Salvar' });
      expect(button).toBeDisabled();

      await user.click(button);
      expect(onClick).not.toHaveBeenCalled();
    });
  });

  describe('Input', () => {
    it('renders the label and reflects the current value', () => {
      render(<Input label="Nome" value="Catarina" onChange={() => {}} />);

      expect(screen.getByText('Nome')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Catarina')).toBeInTheDocument();
    });

    it('associates the label with the input via htmlFor/id, not just visual proximity', () => {
      render(<Input label="Nome" value="Catarina" onChange={() => {}} />);

      // getByLabelText only succeeds when <label htmlFor> and <input id> are wired together.
      expect(screen.getByLabelText('Nome')).toHaveDisplayValue('Catarina');
    });

    it('shows a validation error message when the error prop is set', () => {
      render(
        <Input label="Nome" value="" onChange={() => {}} error="Este campo é obrigatório" />
      );

      expect(screen.getByText('Este campo é obrigatório')).toBeInTheDocument();
    });

    it('marks the input as invalid and describes it by the error message', () => {
      render(
        <Input label="Nome" value="" onChange={() => {}} error="Este campo é obrigatório" />
      );

      const input = screen.getByLabelText('Nome');
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(input).toHaveAccessibleDescription('Este campo é obrigatório');
    });
  });

  describe('Switch', () => {
    it('exposes native switch semantics and toggles on click', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<Switch checked={false} onChange={onChange} label="Reduzir Movimento" />);

      const toggle = screen.getByRole('switch', { name: 'Reduzir Movimento' });
      expect(toggle).toHaveAttribute('aria-checked', 'false');

      await user.click(toggle);
      expect(onChange).toHaveBeenCalledWith(true);
    });

    it('is reachable by Tab and toggles with the keyboard (Space) via native button semantics', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<Switch checked={false} onChange={onChange} label="Reduzir Movimento" />);

      await user.tab();
      expect(screen.getByRole('switch')).toHaveFocus();

      await user.keyboard(' ');
      expect(onChange).toHaveBeenCalledWith(true);
    });
  });

  describe('Tabs', () => {
    const tabs = [
      { id: 'overview', label: 'Visão Geral' },
      { id: 'calls', label: 'Chamadas' },
      { id: 'billing', label: 'Faturamento' },
    ];

    it('exposes tablist/tab roles with aria-selected on the active tab', () => {
      render(<Tabs tabs={tabs} activeTab="calls" onChange={() => {}} />);

      expect(screen.getByRole('tablist')).toBeInTheDocument();
      const active = screen.getByRole('tab', { name: 'Chamadas' });
      expect(active).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('tab', { name: 'Visão Geral' })).toHaveAttribute('aria-selected', 'false');
    });

    it('only the active tab is in the Tab order (roving tabindex)', () => {
      render(<Tabs tabs={tabs} activeTab="calls" onChange={() => {}} />);

      expect(screen.getByRole('tab', { name: 'Chamadas' })).toHaveAttribute('tabindex', '0');
      expect(screen.getByRole('tab', { name: 'Visão Geral' })).toHaveAttribute('tabindex', '-1');
      expect(screen.getByRole('tab', { name: 'Faturamento' })).toHaveAttribute('tabindex', '-1');
    });

    it('moves selection with ArrowRight/ArrowLeft', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<Tabs tabs={tabs} activeTab="overview" onChange={onChange} />);

      screen.getByRole('tab', { name: 'Visão Geral' }).focus();
      await user.keyboard('{ArrowRight}');
      expect(onChange).toHaveBeenCalledWith('calls');

      await user.keyboard('{ArrowLeft}{ArrowLeft}');
      expect(onChange).toHaveBeenCalledWith('billing');
    });
  });

  describe('Card', () => {
    it('stays a plain, non-interactive div when no onClick is given', () => {
      const { container } = render(<Card>Conteúdo</Card>);
      const card = container.firstChild as HTMLElement;
      expect(card).not.toHaveAttribute('role');
      expect(card).not.toHaveAttribute('tabindex');
    });

    it('becomes keyboard-activatable when onClick is given (Enter and Space)', async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      render(<Card onClick={onClick}>Conteúdo</Card>);

      const card = screen.getByRole('button');
      expect(card).toHaveAttribute('tabindex', '0');

      card.focus();
      await user.keyboard('{Enter}');
      expect(onClick).toHaveBeenCalledTimes(1);

      await user.keyboard(' ');
      expect(onClick).toHaveBeenCalledTimes(2);
    });
  });

  describe('EmptyState', () => {
    it('renders title and description, and omits the action when not provided', () => {
      render(<EmptyState title="Nenhum agente" description="Crie seu primeiro agente de voz." />);

      expect(screen.getByText('Nenhum agente')).toBeInTheDocument();
      expect(screen.getByText('Crie seu primeiro agente de voz.')).toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('renders the provided action element', () => {
      render(
        <EmptyState
          title="Nenhum agente"
          description="Crie seu primeiro agente de voz."
          action={<button>Criar Agente</button>}
        />
      );

      expect(screen.getByRole('button', { name: 'Criar Agente' })).toBeInTheDocument();
    });
  });

  describe('Modal', () => {
    it('renders nothing when isOpen is false', () => {
      render(
        <Modal isOpen={false} onClose={() => {}} title="Detalhes">
          <p>Conteúdo do modal</p>
        </Modal>
      );

      expect(screen.queryByText('Detalhes')).not.toBeInTheDocument();
      expect(screen.queryByText('Conteúdo do modal')).not.toBeInTheDocument();
    });

    it('renders title and children, and calls onClose when the close button is clicked', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      render(
        <Modal isOpen onClose={onClose} title="Detalhes">
          <p>Conteúdo do modal</p>
        </Modal>
      );

      expect(screen.getByText('Detalhes')).toBeInTheDocument();
      expect(screen.getByText('Conteúdo do modal')).toBeInTheDocument();

      const closeButtons = screen.getAllByRole('button');
      await user.click(closeButtons[closeButtons.length - 1]);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when the Escape key is pressed', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      render(
        <Modal isOpen onClose={onClose} title="Detalhes">
          <p>Conteúdo do modal</p>
        </Modal>
      );

      await user.keyboard('{Escape}');
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('exposes dialog semantics labelled by its title', () => {
      render(
        <Modal isOpen onClose={() => {}} title="Detalhes">
          <p>Conteúdo do modal</p>
        </Modal>
      );

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAccessibleName('Detalhes');
    });

    it('moves focus into the dialog on open and restores it to the trigger on close', async () => {
      const user = userEvent.setup();

      function Harness() {
        const [open, setOpen] = useState(false);
        return (
          <>
            <button onClick={() => setOpen(true)}>Abrir</button>
            <Modal isOpen={open} onClose={() => setOpen(false)} title="Detalhes">
              <p>Conteúdo do modal</p>
            </Modal>
          </>
        );
      }

      render(<Harness />);
      const trigger = screen.getByRole('button', { name: 'Abrir' });
      trigger.focus();
      await user.click(trigger);

      const dialog = await screen.findByRole('dialog');
      await vi.waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

      await user.click(screen.getByRole('button', { name: 'Fechar' }));
      await vi.waitFor(() => expect(trigger).toHaveFocus());
    });

    it('traps Tab within the dialog instead of leaking focus to the page behind it', async () => {
      const user = userEvent.setup();
      render(
        <Modal
          isOpen
          onClose={() => {}}
          title="Detalhes"
          footer={<button>Confirmar</button>}
        >
          <p>Conteúdo do modal</p>
        </Modal>
      );

      const closeButton = screen.getByRole('button', { name: 'Fechar' });
      const confirmButton = screen.getByRole('button', { name: 'Confirmar' });

      // Let the dialog's own open-focus effect (which moves focus in asynchronously) settle
      // before overriding it, so it doesn't race back and steal focus while `user.tab()` awaits.
      await vi.waitFor(() => expect(document.activeElement).not.toBe(document.body));
      confirmButton.focus();
      await user.tab();
      expect(closeButton).toHaveFocus();

      await user.tab({ shift: true });
      expect(confirmButton).toHaveFocus();
    });
  });
});

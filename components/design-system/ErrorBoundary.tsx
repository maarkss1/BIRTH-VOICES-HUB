
import React, { ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RotateCcw, Home } from 'lucide-react';
import { logger } from '../../lib/logger';
import { useSessionStore } from '../../store/useSessionStore';
import { getAccessibleTextOnBrand } from './tokens';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public state: State;
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error('Uncaught error inside Birth Hub 360 Error Boundary', { error, errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.href = '#/';
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        // `role="alert"` announces the crash to screen readers as soon as it mounts — the boundary
        // has just replaced the entire crashed subtree, and nothing else would signal that.
        <div role="alert" className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col items-center justify-center p-6 text-center transition-colors">
          <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-xl max-w-md w-full border border-slate-200 dark:border-slate-700 animate-scale-in">
            <div className="h-16 w-16 bg-red-50 dark:bg-red-950/40 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle aria-hidden="true" className="h-8 w-8 text-red-600 dark:text-red-400" />
            </div>
            
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50 mb-2">
              Algo deu errado
            </h1>
            
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
              Ocorreu um erro inesperado ao processar essa seção da plataforma. Mas não se preocupe, seus dados estão seguros.
            </p>

            {this.state.error && (
              <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-3 text-left mb-6 font-mono text-xs text-red-600 dark:text-red-400 overflow-x-auto max-h-32 border border-slate-150 dark:border-slate-800">
                {this.state.error.toString()}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={this.handleGoHome}
                className="flex-1 py-3 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-all flex items-center justify-center gap-2"
              >
                <Home aria-hidden="true" className="h-4 w-4" />
                Painel
              </button>

              <button
                onClick={this.handleReload}
                // Class component: read the tenant brand color directly from the store (no hooks)
                // and pick a WCAG-safe text color the same way the design-system's Button does.
                style={{ color: getAccessibleTextOnBrand(useSessionStore.getState().brandColor) }}
                className="flex-1 py-3 bg-brand font-bold rounded-xl text-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-2 shadow-md hover:shadow-lg"
              >
                <RotateCcw aria-hidden="true" className="h-4 w-4" />
                Recarregar
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('TurfFlow Uncaught Application Error:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleResetStorage = () => {
    try {
      localStorage.removeItem('TURFFLOW_STORE_V1');
      localStorage.removeItem('TURFFLOW_ADMIN_AUTH');
      localStorage.removeItem('TURFFLOW_CUSTOMER_AUTH');
    } catch (e) {
      console.warn('Failed to clear storage:', e);
    }
    window.location.href = window.location.pathname;
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full rounded-2xl shadow-xl border border-slate-200 p-6 space-y-5 text-center">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-bold text-slate-800">Something went wrong</h2>
              <p className="text-xs text-slate-600 leading-relaxed">
                An unexpected error prevented the application from rendering. You can try refreshing or resetting local cached state.
              </p>
              {this.state.error?.message && (
                <div className="bg-slate-100 p-3 rounded-lg text-left text-[11px] font-mono text-red-600 overflow-x-auto border border-slate-200 max-h-32">
                  {this.state.error.message}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={this.handleReload}
                className="w-full py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-semibold text-xs flex items-center justify-center gap-2 transition shadow-sm"
              >
                <RefreshCw className="w-4 h-4" /> Reload Page
              </button>
              <button
                onClick={this.handleResetStorage}
                className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 transition border border-slate-200"
              >
                <Trash2 className="w-4 h-4 text-red-500" /> Reset Cached Storage & Recover
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

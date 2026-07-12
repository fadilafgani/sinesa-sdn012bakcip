import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { AnalyticsService } from '@/shared/services/analytics.service';

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
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ERROR] ErrorBoundary caught an uncaught error:', error, errorInfo);
    AnalyticsService.trackEvent('error', { message: error.message, componentStack: errorInfo.componentStack });
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-screen flex-col items-center justify-center bg-mesh p-6">
          <div className="w-full max-w-md space-y-6 text-center">
            {/* Error Card */}
            <div className="rounded-2xl border border-red-500/20 bg-white/5 p-8 backdrop-blur-md shadow-2xl space-y-6">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10 text-red-500">
                <AlertTriangle className="h-8 w-8" />
              </div>
              
              <div className="space-y-2">
                <h2 className="text-xl font-bold text-foreground">Ups! Terjadi Kesalahan</h2>
                <p className="text-sm text-muted-foreground">
                  Aplikasi mengalami masalah saat memproses tampilan ini.
                </p>
                {this.state.error && (
                  <pre className="mt-4 max-h-32 overflow-auto rounded-lg bg-black/30 p-3 text-left text-xs font-mono text-red-400 border border-white/5">
                    {this.state.error.toString()}
                  </pre>
                )}
              </div>

              <button
                onClick={this.handleRetry}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer shadow-lg"
              >
                <RefreshCw className="h-4 w-4" />
                Muat Ulang Halaman
              </button>
            </div>
            
            <p className="text-xs text-muted-foreground">
              Jika masalah terus berlanjut, silakan hubungi administrator SINESA.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

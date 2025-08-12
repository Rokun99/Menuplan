// src/components/ErrorBoundary.tsx
import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
  };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-screen h-screen flex items-center justify-center bg-slate-100 p-8">
            <div className="text-center bg-white p-10 rounded-lg shadow-xl border border-red-200">
                <h1 className="text-2xl font-bold text-slate-800 mb-2">Ein Fehler ist aufgetreten.</h1>
                <p className="text-slate-600 mb-6">Die Anwendung konnte nicht korrekt geladen werden. Bitte versuchen Sie, die Seite neu zu laden.</p>
                <button
                    onClick={() => window.location.reload()}
                    className="bg-blue-600 text-white font-semibold px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                    Seite neu laden
                </button>
                <details className="mt-4 text-left text-xs text-slate-500">
                    <summary className="cursor-pointer">Fehlerdetails anzeigen</summary>
                    <pre className="mt-2 p-2 bg-slate-50 rounded border whitespace-pre-wrap">
                        {this.state.error?.toString()}
                    </pre>
                </details>
            </div>
        </div>
      );
    }

    return this.props.children;
  }
}
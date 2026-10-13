import React from 'react';

interface LazyFeatureBoundaryProps {
  children: React.ReactNode;
  overlay?: boolean;
  visible?: boolean;
}

export class LazyFeatureBoundary extends React.Component<
  LazyFeatureBoundaryProps,
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  render() {
    const message = this.state.hasError
      ? 'Não foi possível carregar esta parte da página.'
      : 'Carregando…';
    const content = (
      <div
        role={this.state.hasError ? 'alert' : 'status'}
        className="rounded-2xl bg-white px-6 py-5 text-center shadow-lg"
      >
        <p className="font-semibold text-neutral-800">{message}</p>
        {this.state.hasError && (
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-3 rounded-full bg-neutral-900 px-4 py-2 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
          >
            Recarregar página
          </button>
        )}
      </div>
    );
    const fallback = this.props.overlay ? (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
        {content}
      </div>
    ) : (
      <div className="flex min-h-48 items-center justify-center p-6">{content}</div>
    );

    if (this.state.hasError) return this.props.visible === false ? null : fallback;
    return <React.Suspense fallback={fallback}>{this.props.children}</React.Suspense>;
  }
}

import React from 'react';

/** Catches any render/runtime error in the tree below it and shows a recoverable
 *  card instead of a blank white screen. Without this, a single thrown error
 *  (e.g. an unexpected response shape) takes the whole app down. */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    // Surface it for debugging; never rethrow.
    // eslint-disable-next-line no-console
    console.error('ResearchMind caught an error:', error, info);
  }

  reset = () => this.setState({ failed: false });

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="text-3xl">🛠️</div>
        <h2 className="text-[14px] font-semibold text-white">Something glitched</h2>
        <p className="max-w-[280px] text-[12px] leading-relaxed text-slate-400">
          The app hit an unexpected error, but your saved work is safe. Reload to continue.
        </p>
        <button
          onClick={() => {
            this.reset();
            window.location.reload();
          }}
          className="btn-primary mt-1 !w-auto px-5"
        >
          Reload
        </button>
      </div>
    );
  }
}

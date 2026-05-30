import { Component, type ErrorInfo, type ReactNode } from 'react';
import ErrorScreen from '../screens/ErrorScreen.js';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught TUI Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return <ErrorScreen error={this.state.error} />;
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorState } from "./ErrorState";
import { tl } from "../../lib/i18n";

interface Props {
  title?: string;
  retryText?: string;
  children: ReactNode;
}

interface State {
  message: string | null;
  details: string | null;
}

// ErrorBoundary: mirrors VoHive's — catches render errors and offers a retry.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { message: null, details: null };

  static getDerivedStateFromError(error: unknown): State {
    if (error instanceof Error) return { message: `${error.name}: ${error.message}`, details: error.stack || null };
    return { message: typeof error === "string" ? error : JSON.stringify(error), details: null };
  }

  componentDidCatch(error: unknown, _info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error);
  }

  private retry = () => this.setState({ message: null, details: null });

  render() {
    if (this.state.message) {
      return (
        <ErrorState
          title={this.props.title || tl("页面渲染失败")}
          message={this.state.message}
          details={this.state.details || undefined}
          retryText={this.props.retryText || tl("重试渲染")}
          onRetry={this.retry}
        />
      );
    }
    return this.props.children;
  }
}

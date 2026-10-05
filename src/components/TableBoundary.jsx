import React from "react";
import Panel from "@/components/Panel";

// If a table screen hits an error while drawing, show a way back instead of a blank page.
export default class TableBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error) {
    console.error("table screen failed", error);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <Panel title="Table hiccup" className="mx-auto max-w-md">
        <p className="text-center text-mist">Something went wrong showing this table. Your points and chips are safe.</p>
        <button type="button" className="btn-seal mx-auto mt-4 h-11 w-full max-w-xs" onClick={() => this.setState({ failed: false })}>Open the table again</button>
        <a href={this.props.back || "/"} className="mt-3 block text-center text-sm text-mist underline hover:text-gold">Back to the lobby</a>
      </Panel>
    );
  }
}
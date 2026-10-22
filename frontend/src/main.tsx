import React, { Component, type ErrorInfo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

type BoundaryState = { error: Error | null }

class AppErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Mission147 render error:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <main style={{ minHeight: '100vh', padding: '24px', display: 'grid', placeItems: 'center', background: '#10121b', color: '#f0f0f7', fontFamily: 'system-ui, sans-serif' }}>
          <section role="alert" style={{ width: '100%', maxWidth: 560, padding: 24, border: '1px solid #49415f', borderRadius: 18, background: '#171a25', overflowWrap: 'anywhere' }}>
            <h1 style={{ marginTop: 0, fontSize: 24 }}>Mission147 could not start</h1>
            <p style={{ color: '#b9bbcb', lineHeight: 1.6 }}>The app encountered a startup error instead of loading the study dashboard. Reload once; if this continues, share the error code below with support.</p>
            <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', padding: 12, borderRadius: 10, background: '#0c0e16', color: '#ffb8c1', fontSize: 12 }}>{this.state.error.message || 'Unknown application error'}</pre>
            <button onClick={() => window.location.reload()} style={{ minHeight: 44, padding: '10px 16px', border: 0, borderRadius: 10, background: '#a69aff', color: '#11121b', fontWeight: 700 }}>Reload Mission147</button>
          </section>
        </main>
      )
    }
    return this.props.children
  }
}

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </React.StrictMode>,
  )
} else {
  document.body.innerHTML = '<main style="padding:24px;color:#f0f0f7;background:#10121b;font-family:system-ui,sans-serif">Mission147 could not start: the page root element is missing. Please reload.</main>'
}

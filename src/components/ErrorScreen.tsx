// What shows instead of a blank window when a screen fails to draw: says whether
// the writing reached the disk, and gets the writer back to the shelf.
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useStore } from '../store'
import { t } from '../i18n'

interface State { error: Error | null; stack: string; saved: boolean | null }

export default class ErrorScreen extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, stack: '', saved: null }

  static getDerivedStateFromError(error: Error) { return { error } }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack)
    this.setState({ stack: info.componentStack ?? '' })
    // Whatever was still waiting to be written goes out now.
    useStore.getState().flush()
      .then(ok => this.setState({ saved: ok && useStore.getState().saving !== 'error' }))
      .catch(() => this.setState({ saved: false }))
  }

  render() {
    const { error, stack, saved } = this.state
    if (!error) return this.props.children
    return (
      <main className="pl-crash" role="alert">
        <h1>{t('This screen could not be drawn')}</h1>
        <p>{saved === null ? t('Saving what you wrote…') : saved ? t('Your text is saved: every change reached your book folder.') : t('Your last changes could not be saved. Check that your book folder is reachable before you reload.')}</p>
        <button type="button" className="sk-btn sk-btn-primary" disabled={saved === null} onClick={() => location.reload()}>{t('Reload and go back to my books')}</button>
        <details>
          <summary>{t('Technical details')}</summary>
          <pre>{error.message}{stack}</pre>
        </details>
      </main>
    )
  }
}

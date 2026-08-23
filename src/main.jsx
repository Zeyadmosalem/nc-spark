import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './styles/globals.css'
import './styles/ui.css'
import App from './App.jsx'
import ThemeProvider from './context/ThemeProvider.jsx'
import ErrorBoundary from './components/shared/ErrorBoundary.jsx'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false } },
})

// AppProvider used to sit here, fed the signed-in profile so the prototype
// store could pretend to know who was logged in. Every screen reads the
// server now, so the only thing left worth providing globally is the theme.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary title="NC Spark failed to start">
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <App />
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
)

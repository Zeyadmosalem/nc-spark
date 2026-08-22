import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './styles/globals.css'
import App from './App.jsx'
import { AppProvider } from './context/AppContext.jsx'
import ErrorBoundary from './components/shared/ErrorBoundary.jsx'
import { useSession } from './hooks/useSession.js'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false } },
})

// Feeds the authenticated profile into AppContext, which no longer owns auth
// but still holds the mock state the remaining milestones will migrate.
function ProvidersWithSession({ children }) {
  const { profile } = useSession()
  return <AppProvider currentUser={profile}>{children}</AppProvider>
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary title="NC Spark failed to start">
      <QueryClientProvider client={queryClient}>
        <ProvidersWithSession>
          <App />
        </ProvidersWithSession>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
)

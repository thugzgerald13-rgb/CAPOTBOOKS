// src/App.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AccountingProvider } from '@/context/AccountingContext';
// ... other imports

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  // Retrieve clientId from route params or auth context
  const clientId = 'some-client-id'; // replace with actual logic

  return (
    <QueryClientProvider client={queryClient}>
      <AccountingProvider clientId={clientId}>
        {/* Your router or main layout */}
        <Router>
          {/* routes */}
        </Router>
      </AccountingProvider>
    </QueryClientProvider>
  );
}

export default App;

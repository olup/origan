import { ErrorBoundary, Suspense } from "solid-js";
import "./App.css";
import {
  QueryClient,
  QueryClientProvider,
  createQuery,
} from "@tanstack/solid-query";

import server from "./backend";

const client = new QueryClient();

function Main() {
  const query = createQuery(() => ({
    queryKey: ["hello"],
    queryFn: async () => {
      const res = await server.api.hello.get();
      if (!res.data) throw new Error("No data");
      return res.data;
    },
    throwOnError: true,
  }));

  return (
    <div>
      <Suspense fallback={<div>Loading...</div>}>
        <h1>Hello {query.data?.message}</h1>
      </Suspense>
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary fallback={<div>Something went wrong</div>}>
      <QueryClientProvider client={client}>
        <Main />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;

import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
} from "@tanstack/react-query";
import type { InferRequestType, InferResponseType } from "hono/client";
import "./App.css";
import client from "./api";

const queryClient = new QueryClient();

function Counter() {
  const { isPending, data } = useQuery({
    queryKey: ["counter"],
    queryFn: async () => {
      const res = await client.api.counter.$get();
      return await res.json();
    },
  });

  const post = client.api.counter.$post;

  const mutation = useMutation<
    InferResponseType<typeof post>,
    Error,
    InferRequestType<typeof post>
  >({
    mutationFn: async () => {
      const res = await post();
      return await res.json();
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["counter"] });
    },
    onError: (err) => {
      console.error(err);
    },
  });

  return (
    <>
      <h1>Vite + React</h1>
      <div className="card">
        <button type="button" onClick={() => mutation.mutate({})}>
          count is {isPending ? 0 : data?.counter}
        </button>
        <p>
          Edit <code>src/App.tsx</code> and save to test HMR
        </p>
      </div>
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Counter />
    </QueryClientProvider>
  );
}

export default App;

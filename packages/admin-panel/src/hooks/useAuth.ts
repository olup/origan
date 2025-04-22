import { useQuery } from "@tanstack/react-query";
import { client } from "../libs/client";

export function useAuth() {
  const doLogin = async () => {
    // Redirect to login flow
    window.location.href = client.auth.login
      .$url({ query: { type: "web" } })
      .toString();
  };

  const getUserQuery = useQuery({
    queryKey: [client.auth.me.$url().toString()],
    queryFn: () =>
      client.auth.me.$get().then((res) => {
        if (!res.ok) {
          return null;
        }
        return res.json();
      }),
  });

  return {
    doLogin,
    user: getUserQuery.data,
    isLoading: getUserQuery.isLoading,
  };
}

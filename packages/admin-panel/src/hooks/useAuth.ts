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
    retry: false,
    refetchOnWindowFocus: false,
  });

  const doLogout = async () => {
    try {
      // Call the logout endpoint to invalidate the refresh token
      await client.auth.logout.$post();
    } catch (error) {
      console.error("Error during logout:", error);
    } finally {
      // Redirect to home page regardless of API call success
      window.location.href = "/";
    }
  };

  return {
    doLogin,
    doLogout,
    user: getUserQuery.data,
    isLoading: getUserQuery.isLoading,
    refetchUser: getUserQuery.refetch,
  };
}

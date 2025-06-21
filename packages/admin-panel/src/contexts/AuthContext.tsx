import { useQuery } from "@tanstack/react-query";
import { type ReactNode, createContext, useCallback, useContext } from "react";
import { client } from "../libs/client";

interface User {
  username: string;
  contactEmail: string;
}

interface AuthContextType {
  user: User | null | undefined;
  isLoading: boolean;
  doLogin: () => Promise<void>;
  doLogout: () => Promise<void>;
  refetchUser: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const doLogin = useCallback(async () => {
    window.location.href = client.auth.login
      .$url({ query: { type: "web" } })
      .toString();
  }, []);

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

  const doLogout = useCallback(async () => {
    try {
      await client.auth.logout.$post();
    } catch (error) {
      console.error("Error during logout:", error);
    } finally {
      window.location.href = "/";
    }
  }, []);

  const value: AuthContextType = {
    user: getUserQuery.data,
    isLoading: getUserQuery.isLoading,
    doLogin,
    doLogout,
    refetchUser: getUserQuery.refetch,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

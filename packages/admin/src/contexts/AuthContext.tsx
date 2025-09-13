import { createContext, type ReactNode, useCallback, useContext } from "react";
import { trpc } from "../utils/trpc";

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
    // Get login URL from tRPC query
    const loginData = await trpc.auth.login.query({ type: "web" });
    window.location.href = loginData.authorizationUrl;
  }, []);

  const getUserQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSettled: () => {
      window.location.href = "/";
    },
  });

  const doLogout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch (error) {
      console.error("Error during logout:", error);
      window.location.href = "/";
    }
  }, [logoutMutation]);

  const value: AuthContextType = {
    user: getUserQuery.data ?? null,
    isLoading: getUserQuery.isLoading,
    doLogin,
    doLogout,
    refetchUser: () => getUserQuery.refetch(),
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

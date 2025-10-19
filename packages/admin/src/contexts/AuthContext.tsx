import { useMutation, useQuery } from "@tanstack/react-query";
import { createContext, type ReactNode, useCallback, useContext } from "react";
import { getConfig } from "../config";
import {
  generateCodeChallenge,
  generateCodeVerifier,
  storeCodeVerifierInCookie,
} from "../utils/pkce";
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
    // Generate PKCE code verifier and challenge
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    // Store verifier in cookie so it's available during OAuth callback
    storeCodeVerifierInCookie(codeVerifier);

    // Navigate to auth endpoint with PKCE challenge
    const config = getConfig();
    const params = new URLSearchParams({
      type: "web",
      code_challenge: codeChallenge,
    });
    window.location.href = `${config.apiUrl}/auth/login?${params.toString()}`;
  }, []);

  const getUserQuery = useQuery(
    trpc.auth.me.queryOptions(undefined, {
      retry: false,
      refetchOnWindowFocus: false,
    }),
  );

  const logoutMutation = useMutation(
    trpc.auth.logout.mutationOptions({
      onSettled: () => {
        window.location.href = "/";
      },
    }),
  );

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

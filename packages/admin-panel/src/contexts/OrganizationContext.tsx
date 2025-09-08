import { useQuery } from "@tanstack/react-query";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { client } from "../libs/client";
import { useAuth } from "./AuthContext";

interface Organization {
  id: string;
  reference: string;
  name: string;
}

interface OrganizationContextType {
  organizations: Organization[] | null;
  selectedOrganization: Organization | null;
  isLoading: boolean;
  selectOrganization: (orgReference: string) => void;
}

const OrganizationContext = createContext<OrganizationContextType | undefined>(
  undefined,
);

interface OrganizationProviderProps {
  children: ReactNode;
}

export function OrganizationProvider({ children }: OrganizationProviderProps) {
  const { user } = useAuth();
  const [selectedOrganization, setSelectedOrganization] =
    useState<Organization | null>(null);

  const organizationsQuery = useQuery({
    queryKey: ["organizations", user?.username],
    queryFn: async () => {
      const response = await client.organization.list.$get();
      if (!response.ok) {
        throw new Error("Failed to fetch organizations");
      }
      return response.json();
    },
    enabled: !!user,
  });

  // Auto-select first organization when organizations load
  useEffect(() => {
    if (
      organizationsQuery.data &&
      organizationsQuery.data.length > 0 &&
      !selectedOrganization
    ) {
      setSelectedOrganization(organizationsQuery.data[0]);
    }
  }, [organizationsQuery.data, selectedOrganization]);

  const selectOrganization = (orgReference: string) => {
    const org = organizationsQuery.data?.find(
      (o) => o.reference === orgReference,
    );
    if (org) {
      setSelectedOrganization(org);
    }
  };

  const value: OrganizationContextType = {
    organizations: organizationsQuery.data || null,
    selectedOrganization,
    isLoading: organizationsQuery.isLoading,
    selectOrganization,
  };

  return (
    <OrganizationContext.Provider value={value}>
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization(): OrganizationContextType {
  const context = useContext(OrganizationContext);
  if (context === undefined) {
    throw new Error(
      "useOrganization must be used within an OrganizationProvider",
    );
  }
  return context;
}

import {
  Button,
  Card,
  Group,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useInterval } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { queryClient, trpc } from "../utils/trpc";
import { DomainCard } from "./DomainCard";

interface CustomDomainsManagerProps {
  projectReference: string;
}

export function CustomDomainsManager({
  projectReference,
}: CustomDomainsManagerProps) {
  const [domain, setDomain] = useState("");
  const [selectedTrack, setSelectedTrack] = useState<string | null>(null);

  // Fetch tracks
  const { data: tracks } = useQuery(
    trpc.projects.listTracks.queryOptions({ projectReference }),
  );

  // Fetch domains
  const { data: domains, refetch } = useQuery(
    trpc.domains.listCustomDomains.queryOptions({ projectReference }),
  );

  // Add domain mutation
  const addDomain = useMutation({
    ...trpc.domains.addCustomDomain.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.domains.listCustomDomains.getQueryKey({
          projectReference,
        }),
      });
      setDomain("");
      setSelectedTrack(null);
      notifications.show({
        title: "Domain added",
        message: "Certificate issuance has started",
        color: "green",
      });
    },
    onError: (error) => {
      notifications.show({
        title: "Failed to add domain",
        message: error.message,
        color: "red",
      });
    },
  });

  // Remove domain mutation
  const removeDomain = useMutation({
    ...trpc.domains.removeCustomDomain.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.domains.listCustomDomains.getQueryKey({
          projectReference,
        }),
      });
      notifications.show({
        title: "Domain removed",
        message: "Domain and certificate have been deleted",
        color: "green",
      });
    },
    onError: (error) => {
      notifications.show({
        title: "Failed to remove domain",
        message: error.message,
        color: "red",
      });
    },
  });

  // Auto-refresh for pending certificates
  useInterval(() => {
    const hasPending = domains?.some((d) => d.certificateStatus === "pending");
    if (hasPending) {
      refetch();
    }
  }, 5000);

  const handleAddDomain = () => {
    if (!domain || !selectedTrack) return;

    addDomain.mutate({
      projectReference,
      trackName: selectedTrack,
      domain,
    });
  };

  return (
    <Stack gap="xl">
      {/* Add Domain Form */}
      <Card withBorder padding="xl">
        <Stack>
          <Title order={3}>Add Custom Domain</Title>
          <Group align="end">
            <TextInput
              label="Domain"
              placeholder="example.com"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              style={{ flex: 1 }}
            />
            <Select
              label="Track"
              placeholder="Select track"
              data={
                tracks?.map((t) => ({
                  value: t.name,
                  label: t.name,
                })) || []
              }
              value={selectedTrack}
              onChange={setSelectedTrack}
              style={{ flex: 1 }}
            />
            <Button
              onClick={handleAddDomain}
              disabled={!domain || !selectedTrack}
              loading={addDomain.isPending}
            >
              Add Domain
            </Button>
          </Group>
        </Stack>
      </Card>

      {/* Domains List */}
      <Card withBorder padding="xl">
        <Stack>
          <Title order={3}>Your Custom Domains</Title>
          {!domains?.length ? (
            <Text c="dimmed">No custom domains yet</Text>
          ) : (
            <Stack gap="md">
              {domains.map((d) => (
                <DomainCard
                  key={d.id}
                  domain={d}
                  onDelete={() => removeDomain.mutate({ domain: d.name })}
                />
              ))}
            </Stack>
          )}
        </Stack>
      </Card>
    </Stack>
  );
}

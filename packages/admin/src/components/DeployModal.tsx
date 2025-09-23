import {
  Alert,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircleIcon, RocketIcon } from "lucide-react";
import { useState } from "react";
import { trpc, trpcClient } from "../utils/trpc";

interface DeployModalProps {
  opened: boolean;
  onClose: () => void;
  projectReference: string;
  githubRepositoryId: number;
}

export const DeployModal = ({
  opened,
  onClose,
  projectReference,
  githubRepositoryId,
}: DeployModalProps) => {
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const queryClient = useQueryClient();

  // Fetch branches from GitHub
  const { data: branches, isLoading: branchesLoading } = useQuery(
    trpc.github.getBranches.queryOptions({
      githubRepositoryId,
    }),
  );

  // Trigger deploy mutation
  const { mutate: triggerDeploy, isPending: isDeploying } = useMutation({
    mutationFn: async () => {
      if (!selectedBranch) {
        throw new Error("No branch selected");
      }

      const result = await trpcClient.projects.triggerDeploy.mutate({
        projectRef: projectReference,
        branch: selectedBranch,
      });

      return result;
    },
    onSuccess: () => {
      // Show success notification
      notifications.show({
        title: "Deployment triggered",
        message: `Building and deploying branch: ${selectedBranch}`,
        color: "green",
      });

      // Invalidate deployments query to refresh the list
      queryClient.invalidateQueries({
        queryKey: trpc.deployments.listByProject.queryKey({
          projectRef: projectReference,
        }),
      });

      // Close the modal
      onClose();

      // Reset selected branch
      setSelectedBranch("");
    },
    onError: (error) => {
      console.error("Failed to trigger deployment:", error);
      notifications.show({
        title: "Deployment failed",
        message:
          error instanceof Error
            ? error.message
            : "Failed to trigger deployment",
        color: "red",
      });
    },
  });

  const handleDeploy = () => {
    if (selectedBranch) {
      triggerDeploy();
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="xs">
          <RocketIcon size={20} />
          <Title order={4}>Deploy Branch</Title>
        </Group>
      }
      size="md"
    >
      <Stack>
        <Text size="sm" c="dimmed">
          Select a branch to deploy. This will trigger a new build and
          deployment.
        </Text>

        {branchesLoading ? (
          <Select
            label="Select Branch"
            description="Choose the branch you want to deploy"
            placeholder="Loading branches..."
            disabled
            data={[]}
          />
        ) : branches && branches.length > 0 ? (
          <Select
            label="Select Branch"
            description="Choose the branch you want to deploy"
            placeholder="Select a branch to deploy"
            value={selectedBranch}
            onChange={(value) => setSelectedBranch(value || "")}
            data={branches.map((branch) => ({
              value: branch.name,
              label: branch.commitSha
                ? `${branch.name} (${branch.commitSha.substring(0, 7)})`
                : branch.name,
            }))}
            searchable
            clearable
            size="md"
          />
        ) : (
          <Alert
            icon={<AlertCircleIcon size={16} />}
            title="No branches found"
            color="yellow"
          >
            Could not find any branches in the repository. Make sure the GitHub
            integration has access to the repository.
          </Alert>
        )}

        <Group justify="flex-end" mt="md">
          <Button variant="subtle" onClick={onClose} disabled={isDeploying}>
            Cancel
          </Button>
          <Button
            onClick={handleDeploy}
            disabled={!selectedBranch || isDeploying}
            loading={isDeploying}
            leftSection={<RocketIcon size={16} />}
          >
            Deploy
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};

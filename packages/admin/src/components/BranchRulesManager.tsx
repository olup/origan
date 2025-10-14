import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Modal,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { useMutation, useQuery } from "@tanstack/react-query";
import { PencilIcon, PlusIcon, StarIcon, TrashIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { queryClient as globalQueryClient, trpc } from "../utils/trpc";

interface BranchRulesManagerProps {
  projectReference: string;
}

type BranchRuleFormValues = {
  branchPattern: string;
  environmentId: string;
  enablePreviews: boolean;
  isPrimary: boolean;
};

export function BranchRulesManager({
  projectReference,
}: BranchRulesManagerProps) {
  const [modalOpened, { open: openModal, close: closeModal }] =
    useDisclosure(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const form = useForm<BranchRuleFormValues>({
    initialValues: {
      branchPattern: "",
      environmentId: "",
      enablePreviews: false,
      isPrimary: false,
    },
  });

  const rulesQuery = useQuery(
    trpc.github.listBranchRules.queryOptions({ projectReference }),
  );

  const environmentsQuery = useQuery(
    trpc.environments.listByProject.queryOptions({ projectReference }),
  );

  const invalidateRules = () => {
    const key = trpc.github.listBranchRules.queryKey({ projectReference });
    globalQueryClient.invalidateQueries({ queryKey: key });
  };

  const createRuleMutation = useMutation(
    trpc.github.createBranchRule.mutationOptions({
      onSuccess: () => {
        invalidateRules();
        closeModal();
        resetForm();
        notifications.show({
          title: "Branch rule created",
          message: "New branch automation rule saved",
          color: "green",
        });
      },
      onError: (error) => {
        notifications.show({
          title: "Failed to create branch rule",
          message: error.message,
          color: "red",
        });
      },
    }),
  );

  const updateRuleMutation = useMutation(
    trpc.github.updateBranchRule.mutationOptions({
      onSuccess: () => {
        invalidateRules();
        closeModal();
        resetForm();
        notifications.show({
          title: "Branch rule updated",
          message: "Changes saved successfully",
          color: "green",
        });
      },
      onError: (error) => {
        notifications.show({
          title: "Failed to update branch rule",
          message: error.message,
          color: "red",
        });
      },
    }),
  );

  const deleteRuleMutation = useMutation(
    trpc.github.deleteBranchRule.mutationOptions({
      onSuccess: () => {
        invalidateRules();
        notifications.show({
          title: "Branch rule removed",
          message: "The branch rule has been deleted",
          color: "green",
        });
      },
      onError: (error) => {
        notifications.show({
          title: "Failed to delete branch rule",
          message: error.message,
          color: "red",
        });
      },
    }),
  );

  const resetForm = () => {
    form.reset();
    setEditingRuleId(null);
  };

  const openCreateModal = () => {
    resetForm();
    openModal();
  };

  const openEditModal = (rule: NonNullable<typeof rulesQuery.data>[number]) => {
    setEditingRuleId(rule.id);
    form.setValues({
      branchPattern: rule.branchPattern,
      environmentId: rule.environmentId,
      enablePreviews: rule.enablePreviews,
      isPrimary: rule.isPrimary,
    });
    openModal();
  };

  const handleSubmit = form.onSubmit((values) => {
    if (editingRuleId) {
      updateRuleMutation.mutate({
        projectReference,
        ruleId: editingRuleId,
        ...values,
      });
    } else {
      createRuleMutation.mutate({
        projectReference,
        ...values,
      });
    }
  });

  const handleDelete = (ruleId: string) => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this branch rule?",
    );
    if (!confirmed) return;

    deleteRuleMutation.mutate({ projectReference, ruleId });
  };

  const environmentsOptions =
    environmentsQuery.data?.environments.map((env) => ({
      value: env.id,
      label: env.name,
    })) || [];

  const previewEnvironment = environmentsQuery.data?.environments.find(
    (env) => env.name === "preview",
  );
  const initialEnvironmentId =
    previewEnvironment?.id || environmentsQuery.data?.environments[0]?.id || "";

  useEffect(() => {
    if (editingRuleId) {
      return;
    }

    if (!initialEnvironmentId) {
      return;
    }

    if (form.values.environmentId === initialEnvironmentId) {
      return;
    }

    if (form.values.environmentId) {
      return;
    }

    form.setFieldValue("environmentId", initialEnvironmentId);
  }, [
    editingRuleId,
    initialEnvironmentId,
    form.values.environmentId,
    form.setFieldValue,
  ]);

  return (
    <Stack gap="xl">
      <Card withBorder padding="xl">
        <Stack gap="md">
          <Group justify="space-between">
            <Title order={4}>Branch Rules</Title>
            <Button
              leftSection={<PlusIcon size={16} />}
              onClick={openCreateModal}
            >
              Add rule
            </Button>
          </Group>
          {!rulesQuery.data?.length ? (
            <Text c="dimmed">No branch rules configured yet.</Text>
          ) : (
            <Table striped highlightOnHover withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Branch pattern</Table.Th>
                  <Table.Th>Environment</Table.Th>
                  <Table.Th>Preview deployments</Table.Th>
                  <Table.Th style={{ width: "80px" }}>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rulesQuery.data?.map((rule) => {
                  const environment = environmentsQuery.data?.environments.find(
                    (env) => env.id === rule.environmentId,
                  );
                  return (
                    <Table.Tr key={rule.id}>
                      <Table.Td>
                        <Group gap="xs" wrap="nowrap">
                          {rule.isPrimary && (
                            <StarIcon size={14} fill="currentColor" />
                          )}
                          <Text>{rule.branchPattern}</Text>
                        </Group>
                      </Table.Td>
                      <Table.Td>{environment?.name ?? "—"}</Table.Td>
                      <Table.Td>
                        <Badge color={rule.enablePreviews ? "green" : "gray"}>
                          {rule.enablePreviews ? "Enabled" : "Disabled"}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs" justify="flex-end" wrap="nowrap">
                          <ActionIcon
                            variant="subtle"
                            aria-label="Edit"
                            onClick={() => openEditModal(rule)}
                          >
                            <PencilIcon size={16} />
                          </ActionIcon>
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            aria-label="Delete"
                            onClick={() => handleDelete(rule.id)}
                          >
                            <TrashIcon size={16} />
                          </ActionIcon>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          )}
        </Stack>
      </Card>

      <Modal
        opened={modalOpened}
        onClose={() => {
          closeModal();
          resetForm();
        }}
        title={editingRuleId ? "Edit branch rule" : "Create branch rule"}
        centered
      >
        <form onSubmit={handleSubmit}>
          <Stack>
            <TextInput
              label="Branch pattern"
              placeholder="main or release/*"
              required
              {...form.getInputProps("branchPattern")}
            />
            <Select
              label="Environment"
              placeholder="Select environment"
              required
              data={environmentsOptions}
              value={form.values.environmentId}
              disabled={!environmentsOptions.length}
              onChange={(value) =>
                form.setFieldValue(
                  "environmentId",
                  value ?? form.values.environmentId,
                )
              }
              allowDeselect={false}
            />
            <Group justify="space-between">
              <Switch
                label="Enable PR preview deployments"
                checked={form.values.enablePreviews}
                onChange={(event) =>
                  form.setFieldValue(
                    "enablePreviews",
                    event.currentTarget.checked,
                  )
                }
              />
              <Switch
                label="Primary branch"
                checked={form.values.isPrimary}
                onChange={(event) =>
                  form.setFieldValue("isPrimary", event.currentTarget.checked)
                }
              />
            </Group>
            <Group justify="flex-end">
              <Button
                variant="subtle"
                onClick={() => {
                  closeModal();
                  resetForm();
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                loading={
                  createRuleMutation.isPending || updateRuleMutation.isPending
                }
              >
                {editingRuleId ? "Save changes" : "Create rule"}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}

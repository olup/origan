import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { trpc } from "../utils/trpc";

interface Environment {
  id: string;
  name: string;
  isDefault: boolean;
  isSystem: boolean;
  variables: Record<string, string>;
}

interface EnvironmentManagerProps {
  projectReference: string;
}

const VariableForm = ({
  onSubmit,
  onCancel,
}: {
  onSubmit: (key: string, value: string) => void;
  onCancel: () => void;
}) => {
  const form = useForm({
    initialValues: {
      key: "",
      value: "",
    },
    validate: {
      key: (value) => {
        if (!value.trim()) return "Key is required";
        if (!/^[A-Z0-9_]+$/.test(value)) {
          return "Key must be uppercase letters, numbers, and underscores only";
        }
        return null;
      },
      value: (value) => (!value.trim() ? "Value is required" : null),
    },
  });

  return (
    <form
      onSubmit={form.onSubmit((values) => {
        onSubmit(values.key, values.value);
        form.reset();
      })}
    >
      <Group align="flex-end">
        <TextInput
          {...form.getInputProps("key")}
          placeholder="VARIABLE_NAME"
          style={{ flex: 1 }}
        />
        <TextInput
          {...form.getInputProps("value")}
          placeholder="value"
          style={{ flex: 2 }}
        />
        <Button type="submit" size="sm">
          Add
        </Button>
        <Button variant="subtle" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </Group>
    </form>
  );
};

const EnvironmentVariables = ({
  projectReference,
  environment,
}: {
  projectReference: string;
  environment: Environment;
}) => {
  const [isAdding, setIsAdding] = useState(false);

  const utils = trpc.useUtils();

  const setVariablesMutation = trpc.environments.setVariables.useMutation({
    onSuccess: () => {
      utils.environments.listByProject.invalidate({ projectReference });
      setIsAdding(false);
    },
  });

  const deleteVariableMutation = trpc.environments.unsetVariable.useMutation({
    onSuccess: () => {
      utils.environments.listByProject.invalidate({ projectReference });
    },
  });

  const handleAddVariable = (key: string, value: string) => {
    setVariablesMutation.mutate({
      projectReference,
      name: environment.name,
      variables: [{ key, value }],
    });
  };

  const variables = Object.entries(environment.variables);

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={5}>{environment.name}</Title>
        <Group>
          {environment.isDefault && (
            <Badge size="sm" variant="light">
              Default
            </Badge>
          )}
          {environment.isSystem && (
            <Badge size="sm" variant="light" color="gray">
              System
            </Badge>
          )}
        </Group>
      </Group>

      {variables.length > 0 && (
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Key</Table.Th>
              <Table.Th>Value</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {variables.map(([key, value]) => (
              <Table.Tr key={key}>
                <Table.Td>
                  <Text ff="monospace" size="sm">
                    {key}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text ff="monospace" size="sm" c="dimmed">
                    {value}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    size="sm"
                    onClick={() =>
                      deleteVariableMutation.mutate({
                        projectReference,
                        name: environment.name,
                        key,
                      })
                    }
                    loading={deleteVariableMutation.isPending}
                  >
                    <Trash2 size={14} />
                  </ActionIcon>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      {variables.length === 0 && !isAdding && (
        <Text c="dimmed" size="sm">
          No variables set
        </Text>
      )}

      {isAdding ? (
        <VariableForm
          onSubmit={handleAddVariable}
          onCancel={() => setIsAdding(false)}
        />
      ) : (
        <Button
          variant="outline"
          size="xs"
          leftSection={<Plus size={16} />}
          onClick={() => setIsAdding(true)}
        >
          Add Variable
        </Button>
      )}
    </Stack>
  );
};

export const EnvironmentManager = ({
  projectReference,
}: EnvironmentManagerProps) => {
  const { data: environmentsResponse, isLoading } =
    trpc.environments.listByProject.useQuery({
      projectReference,
    });

  if (isLoading) {
    return <Text>Loading environments...</Text>;
  }

  if (!environmentsResponse || "error" in environmentsResponse) {
    return (
      <Text c="red">
        Failed to load environments:{" "}
        {environmentsResponse
          ? (environmentsResponse.error as string)
          : "Unknown error"}
      </Text>
    );
  }

  const environments = environmentsResponse.environments || [];

  return (
    <Stack>
      {environments.map((env) => (
        <Card key={env.id} withBorder padding="md">
          <EnvironmentVariables
            projectReference={projectReference}
            environment={env}
          />
        </Card>
      ))}
    </Stack>
  );
};

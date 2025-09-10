import { Button, Menu } from "@mantine/core";
import { Building2, Check, ChevronDown } from "lucide-react";
import { useOrganization } from "../contexts/OrganizationContext";

export function OrganizationSwitcher() {
  const { organizations, selectedOrganization, selectOrganization } =
    useOrganization();

  // Only show if user has multiple organizations
  if (!organizations) {
    return null;
  }

  return (
    <Menu shadow="md" width={250} position="bottom-start">
      <Menu.Target>
        <Button
          variant="subtle"
          size="sm"
          leftSection={<Building2 size={16} />}
          rightSection={<ChevronDown size={14} />}
        >
          {selectedOrganization?.name || "Select Organization"}
        </Button>
      </Menu.Target>

      <Menu.Dropdown>
        <Menu.Label>Organizations</Menu.Label>
        {organizations.map((org) => (
          <Menu.Item
            key={org.reference}
            onClick={() => selectOrganization(org.reference)}
            leftSection={<Building2 size={14} />}
            rightSection={
              org.reference === selectedOrganization?.reference ? (
                <Check size={14} />
              ) : null
            }
          >
            {org.name}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}

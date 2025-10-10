import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Modal,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { Check, Info, Trash2, X } from "lucide-react";
import { useState } from "react";

interface DomainCardProps {
  domain: {
    id: string;
    name: string;
    certificateStatus: "none" | "pending" | "valid" | "error";
    certificateIssuedAt: Date | null;
    certificateExpiresAt: Date | null;
    lastCertificateError: string | null;
    track: {
      name: string;
    } | null;
  };
  onDelete: () => void;
}

function formatDate(date: Date | null) {
  if (!date) return "";
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function DomainCard({ domain, onDelete }: DomainCardProps) {
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  const statusConfig = {
    none: {
      color: "gray",
      icon: null,
      label: "No certificate",
    },
    pending: {
      color: "yellow",
      icon: <Loader size={14} />,
      label: "Issuing certificate...",
    },
    valid: {
      color: "green",
      icon: <Check size={14} />,
      label: `Active • Expires ${formatDate(domain.certificateExpiresAt)}`,
    },
    error: {
      color: "red",
      icon: <X size={14} />,
      label: "Failed",
      tooltip: domain.lastCertificateError || "Certificate issuance failed",
    },
  };

  const status = statusConfig[domain.certificateStatus];

  return (
    <>
      <Card withBorder padding="md">
        <Group justify="space-between">
          <Stack gap="xs" style={{ flex: 1 }}>
            <Group>
              <Text fw={500}>{domain.name}</Text>
              {domain.track && (
                <Badge variant="light">{domain.track.name}</Badge>
              )}
            </Group>
            <Group gap="xs">
              {status.icon}
              <Text size="sm" c={status.color}>
                {status.label}
              </Text>
              {status.tooltip && (
                <Tooltip label={status.tooltip} multiline w={300}>
                  <Info size={14} style={{ cursor: "help" }} />
                </Tooltip>
              )}
            </Group>
          </Stack>
          <ActionIcon
            color="red"
            variant="subtle"
            onClick={() => setDeleteModalOpen(true)}
          >
            <Trash2 size={18} />
          </ActionIcon>
        </Group>
      </Card>

      <Modal
        opened={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Remove Domain"
      >
        <Stack>
          <Text>
            Remove <strong>{domain.name}</strong>? This will delete the SSL
            certificate.
          </Text>
          <Group justify="end">
            <Button variant="subtle" onClick={() => setDeleteModalOpen(false)}>
              Cancel
            </Button>
            <Button
              color="red"
              onClick={() => {
                onDelete();
                setDeleteModalOpen(false);
              }}
            >
              Remove Domain
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

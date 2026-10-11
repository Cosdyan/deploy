import { type ComponentType } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useModal, type ModalEntry } from "../../atoms/modal";
import { ModalShell } from "../ui/ModalShell";
import DataLoading from "../DataLoading";

import ServerInfoModal from "../server/ServerInfoModal";
import PortInfoModal from "../port/PortInfoModal";
import PortFunctionModal from "../port/PortFunctionModal";
import PortRestrictionModal from "../port/PortRestrictionModal";
import FileModal from "../file/FileModal";
import FilePreviewModal from "../file/FilePreviewModal";
import ConfirmationModal from "./ConfirmationModal";
import DeployModal from "../deployment/DeployModal";
import DeploymentDetailModal from "../deployment/DeploymentDetailModal";
import BindingModal from "../deployment/BindingModal";

/* ---------- prop validation helpers ---------- */

const validateOk = () => ({ ok: true as const });

const requireField =
  (path: string[]) =>
  (props: Record<string, unknown>) => {
    let value: unknown = props;
    for (const key of path) {
      value = (value as Record<string, unknown>)?.[key];
    }
    if (value === undefined || value === null) {
      return {
        ok: false as const,
        reason: `Missing modalProps.${path.join(".")}`,
      };
    }
    return { ok: true as const };
  };

const confirmationValidator = (props: Record<string, unknown>) => {
  if (!props || props.title == null || props.message == null) {
    return {
      ok: false as const,
      reason: "confirmation requires title and message",
    };
  }
  return { ok: true as const };
};

/* ---------- fallback content ---------- */

const LoadingModalContent = () => (
  <div className="flex items-center justify-center p-8">
    <DataLoading />
  </div>
);

interface InvalidModalContentProps {
  modalType: string;
  reason?: string;
  close: () => void;
}

const InvalidModalContent = ({
  modalType,
  reason,
  close,
}: InvalidModalContentProps) => (
  <ModalShell
    title="Modal Error"
    onClose={close}
    footer={
      <button
        className="btn btn-primary btn-outline"
        onClick={close}
        type="button"
      >
        Close
      </button>
    }
  >
    <div className="px-2 text-sm text-destructive">
      Failed to open modal `{modalType}`: {reason}
    </div>
  </ModalShell>
);

/* ---------- registry ---------- */

interface ModalDescriptor {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: ComponentType<any>;
  validateProps: (
    props: Record<string, unknown>,
  ) => { ok: true } | { ok: false; reason: string };
  defaultOptions: Record<string, unknown>;
}

const MODAL_REGISTRY: Record<string, ModalDescriptor> = {
  serverInfo: {
    component: ServerInfoModal,
    validateProps: validateOk,
    defaultOptions: {},
  },
  port: {
    component: PortInfoModal,
    validateProps: validateOk,
    defaultOptions: {},
  },
  portFunction: {
    component: PortFunctionModal,
    validateProps: requireField(["port", "id"]),
    defaultOptions: {},
  },
  portRestriction: {
    component: PortRestrictionModal,
    validateProps: requireField(["port", "id"]),
    defaultOptions: {className: "max-h-[90vh] overflow-y-auto"},
  },
  file: {
    component: FileModal,
    validateProps: validateOk,
    defaultOptions: {},
  },
  filePreview: {
    component: FilePreviewModal,
    validateProps: requireField(["file"]),
    defaultOptions: {},
  },
  confirmation: {
    component: ConfirmationModal,
    validateProps: confirmationValidator,
    defaultOptions: {},
  },
  loading: {
    component: LoadingModalContent,
    validateProps: validateOk,
    defaultOptions: {
      dismissible: false,
      closeOnBackdrop: false,
      closeOnEsc: false,
    },
  },
  deploy: {
    component: DeployModal,
    validateProps: validateOk,
    defaultOptions: {},
  },
  deploymentDetail: {
    component: DeploymentDetailModal,
    validateProps: requireField(["deploymentId"]),
    defaultOptions: {},
  },
  binding: {
    component: BindingModal,
    validateProps: validateOk,
    defaultOptions: {},
  },
};

/* ---------- ModalManager ---------- */

interface ResolvedOptions {
  hasBackdrop: boolean;
  closeOnBackdrop: boolean;
  closeOnEsc: boolean;
  dismissible: boolean;
  className?: string;
}

function resolveOptions(
  descriptor: ModalDescriptor | undefined,
  modal: ModalEntry,
): ResolvedOptions {
  return {
    hasBackdrop: true,
    closeOnBackdrop: true,
    closeOnEsc: true,
    dismissible: true,
    ...(descriptor?.defaultOptions || {}),
    ...((modal.options as Record<string, unknown>) || {}),
  } as ResolvedOptions;
}

const ModalManager = () => {
  const { stack, close, resolveModal } = useModal();

  if (!stack.length) return null;

  return (
    <>
      {stack.map((modal, index) => {
        const isTop = index === stack.length - 1;
        const descriptor = MODAL_REGISTRY[modal.type];
        const Content = descriptor?.component;
        const validation = descriptor
          ? (descriptor.validateProps?.(modal.props || {}) ?? { ok: true })
          : { ok: false, reason: `Unknown modal type: ${modal.type}` };
        const options = resolveOptions(descriptor, modal);

        const closeCurrent = () => close(modal.id);
        const resolveCurrent = (value: unknown) =>
          resolveModal(modal.id, value);

        if (!descriptor || !validation.ok) {
          console.warn("[modal] invalid modal", {
            type: modal.type,
            props: modal.props,
            reason: "reason" in validation ? validation.reason : undefined,
          });
        }

        const canDismiss =
          options.dismissible !== false && options.closeOnBackdrop !== false;
        const canEsc =
          options.dismissible !== false && options.closeOnEsc !== false;

        return (
          <Dialog
            key={modal.id}
            open
            onOpenChange={(open) => {
              if (!open) closeCurrent();
            }}
          >
            <DialogContent
              className={cn("sm:max-w-lg", options.className)}
              showCloseButton={options.dismissible !== false}
              onPointerDownOutside={(e) => {
                if (!isTop || !canDismiss) e.preventDefault();
              }}
              onEscapeKeyDown={(e) => {
                if (!isTop || !canEsc) e.preventDefault();
              }}
              onInteractOutside={(e) => {
                if (!isTop || !canDismiss) e.preventDefault();
              }}
            >
              {descriptor && validation.ok ? (
                <Content
                  modalId={modal.id}
                  modalProps={modal.props || {}}
                  close={closeCurrent}
                  resolve={resolveCurrent}
                  isTop={isTop}
                />
              ) : (
                <InvalidModalContent
                  modalType={modal.type}
                  reason={
                    "reason" in validation
                      ? (validation.reason as string)
                      : undefined
                  }
                  close={closeCurrent}
                />
              )}
            </DialogContent>
          </Dialog>
        );
      })}
    </>
  );
};

export default ModalManager;

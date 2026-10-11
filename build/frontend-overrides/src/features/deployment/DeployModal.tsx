import { useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@apollo/client";
import { cn } from "@/lib/utils";
import { Package, Link as LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import DataLoading from "../DataLoading";
import useDynamicForm from "../service-editor/useDynamicForm";
import { serviceDefinitionToDynamicSchema } from "../service-editor/serviceAdapter";
import {
  GET_SERVICE_BINDINGS,
  GET_SERVICES_FOR_BINDING,
  GET_AVAILABLE_PORTS,
  DEPLOY_SERVICE,
} from "../../queries/deployment";
import ModalShell from "../ui/ModalShell";

interface ServiceConfig {
  configJson?: Record<string, unknown> | null;
  title?: string;
  serviceKey?: string;
  version?: string;
  id: number;
  hasSource?: boolean;
  isBuiltin?: boolean;
}

interface DeployableItem {
  key: string;
  type: "service" | "binding";
  serviceId?: number;
  bindingId?: number;
  service?: ServiceConfig | null;
  label: string;
  sublabel: string;
  isBuiltin?: boolean;
  fileVersion?: string;
}

interface AvailablePort {
  id: number;
  num: number;
  externalNum?: number | null;
}

interface DeployModalProps {
  modalProps: {
    serverId?: number;
    [key: string]: unknown;
  };
  close: () => void;
  resolve?: (value: unknown) => void;
}

const DeployModal = ({ modalProps, close, resolve }: DeployModalProps) => {
  const { t } = useTranslation();
  const serverId = modalProps?.serverId;

  const [step, setStep] = useState(1);
  const [selectedItem, setSelectedItem] = useState<DeployableItem | null>(null);
  const [selectedPortId, setSelectedPortId] = useState<number | null>((modalProps.portId as number) || null);
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});

  // Queries
  const { data: bindingsData, loading: bindingsLoading } =
    useQuery(GET_SERVICE_BINDINGS);
  const { data: servicesData, loading: servicesLoading } =
    useQuery(GET_SERVICES_FOR_BINDING);
  const { data: portsData, loading: portsLoading } = useQuery(GET_AVAILABLE_PORTS, {
    variables: { serverId },
    skip: !serverId,
  });

  const [deployService, { loading: deploying }] = useMutation(DEPLOY_SERVICE);

  const bindings = bindingsData?.serviceBindings ?? [];
  const services = servicesData?.serviceDefinitions ?? [];

  const catalogServices = useMemo(
    () => services.filter((s: ServiceConfig) => s.hasSource || String((s.configJson?.exec as {bin?:string})?.bin || "").startsWith("/")),
    [services],
  );

  // Build unified list: built-in services first, then bindings
  const deployableItems: DeployableItem[] = useMemo(() => {
    const items: DeployableItem[] = [];
    for (const s of catalogServices) {
      items.push({
        key: `service-${s.id}`,
        type: "service",
        serviceId: s.id,
        service: s,
        label: s.title ?? "",
        sublabel: `${s.serviceKey} v${s.version}`,
        isBuiltin: s.isBuiltin,
      });
    }
    for (const b of bindings) {
      items.push({
        key: `binding-${b.id}`,
        type: "binding",
        bindingId: b.id,
        service: b.service,
        label: `${b.file?.name || `File #${b.fileId}`}`,
        sublabel: b.service?.title || b.service?.serviceKey || `Service #${b.serviceId}`,
        fileVersion: b.file?.version,
      });
    }
    return items;
  }, [catalogServices, bindings]);

  const selectedService = selectedItem?.service ?? null;

  const formSchema = useMemo(() => {
    if (!selectedService?.configJson) return null;
    try {
      return serviceDefinitionToDynamicSchema(selectedService.configJson);
    } catch {
      return null;
    }
  }, [selectedService]);

  const requiresPort = (selectedService?.configJson as Record<string, unknown>)?.requiresPort !== false;

  const handleValuesChange = useCallback((values: Record<string, unknown>) => {
    setFormValues(values);
  }, []);

  const handleFormSubmit = useCallback((values: Record<string, unknown>) => {
    setFormValues(values);
  }, []);

  const handleSelectItem = (item: DeployableItem) => {
    setSelectedItem(item);
    setSelectedPortId((modalProps.portId as number) || null);
    setStep(2);
  };

  const [submitError,setSubmitError] = useState("");
  const handleDeploy = async () => {
    setSubmitError("");
    try {
    if (!serverId || !selectedItem) return;

    const variables: Record<string, unknown> = {
      serverIds: [serverId],
      values: formValues,
      portId: selectedPortId,
    };

    if (selectedItem.type === "service") {
      variables.serviceId = selectedItem.serviceId;
    } else {
      variables.serviceBindingId = selectedItem.bindingId;
    }

    await deployService({ variables });
    if (resolve) resolve(true);
    close();
    } catch(err) {setSubmitError(err instanceof Error ? err.message : t("Operation failed"));}
  };

  const handleCancel = () => {
    if (resolve) resolve(false);
    close();
  };

  const handleBack = () => {
    setSelectedItem(null);
    setSelectedPortId((modalProps.portId as number) || null);
    setFormValues({});
    setStep(1);
  };

  const isAnyLoading = bindingsLoading || servicesLoading;

  const availablePorts: AvailablePort[] = portsData?.availablePortsForDeployment ?? [];

  return (
    <ModalShell
      title={t("Deploy Service")}
      onClose={handleCancel}
    >
      {submitError && <p role="alert" className="mb-3 text-destructive">{submitError}</p>}
      {/* Steps indicator */}
      <div className="mb-4 flex items-center gap-2">
        <div
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold",
            step >= 1
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground",
          )}
        >
          1
        </div>
        <span className={cn("text-sm font-medium", step >= 1 ? "text-foreground" : "text-muted-foreground")}>
          {t("Select")}
        </span>
        <div className="h-px flex-1 bg-border" />
        <div
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold",
            step >= 2
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground",
          )}
        >
          2
        </div>
        <span className={cn("text-sm font-medium", step >= 2 ? "text-foreground" : "text-muted-foreground")}>
          {t("Configure")}
        </span>
      </div>

      {isAnyLoading ? (
        <div className="py-8">
          <DataLoading />
        </div>
      ) : (
        <>
          {/* Step 1: Pick a deployable item */}
          {step === 1 && (
            <div className="space-y-4">
              {deployableItems.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-sm text-muted-foreground">{t("No services available")}</p>
                  <div className="mt-3 flex justify-center gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <a href="/app/services">{t("Browse Service Definitions")}</a>
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <a href="/app/files">{t("Upload a File")}</a>
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="max-h-72 space-y-1 overflow-auto">
                  {deployableItems.map((item) => (
                    <div
                      key={item.key}
                      className="flex cursor-pointer items-center justify-between rounded-xl border border-transparent bg-muted/50 px-3 py-2 transition-colors hover:border-primary/20 hover:bg-primary/5"
                      onClick={() => handleSelectItem(item)}
                    >
                      <div className="flex items-center gap-2">
                        {item.type === "service" ? (
                          <Package size={14} className="text-muted-foreground" />
                        ) : (
                          <LinkIcon size={14} className="text-muted-foreground" />
                        )}
                        <span className="font-medium">{item.label}</span>
                        {item.type === "binding" && (
                          <>
                            <span className="text-muted-foreground">&rarr;</span>
                            <span className="text-sm text-muted-foreground">{item.sublabel}</span>
                          </>
                        )}
                        {item.type === "service" && (
                          <Badge variant="ghost" className="font-mono text-xs">
                            {item.sublabel}
                          </Badge>
                        )}
                        {item.isBuiltin && (
                          <Badge variant="secondary" className="text-xs">
                            {t("Built-in")}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {item.fileVersion && (
                          <span className="text-xs text-muted-foreground">v{item.fileVersion}</span>
                        )}
                        {item.type === "service" && (
                          <span className="text-xs text-muted-foreground">v{item.service?.version}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end">
                <Button variant="outline" onClick={handleCancel}>
                  {t("Cancel")}
                </Button>
              </div>
            </div>
          )}

          {/* Step 2: Configure & deploy */}
          {step === 2 && (
            <div className="space-y-4">
              {/* Port selector */}
              {requiresPort && (
                <div className="space-y-2">
                  <Label className="font-medium">{t("Port")}</Label>
                  <Select
                    value={selectedPortId ? String(selectedPortId) : ""}
                    onValueChange={(val) =>
                      setSelectedPortId(val ? Number(val) : null)
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={t("Select a port...")} />
                    </SelectTrigger>
                    <SelectContent>
                      {availablePorts.map((port: AvailablePort) => (
                        <SelectItem key={port.id} value={String(port.id)}>
                          {t("Port")} {port.num}
                          {port.externalNum && port.externalNum !== port.num
                            ? ` \u2192 ${port.externalNum}`
                            : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!portsLoading && availablePorts.length === 0 && (
                    <p className="text-sm text-destructive">
                      {t("No available ports on this server")}
                    </p>
                  )}
                </div>
              )}

              {/* Service form */}
              {formSchema && (
                <div>
                  <h4 className="mb-2 text-sm font-semibold">{t("Parameters")}</h4>
                  <div className="max-h-64 overflow-auto rounded-xl border border-border bg-muted/30 p-3">
                    <ServiceValuesForm
                      formSchema={formSchema}
                      onSubmit={handleFormSubmit}
                      onValuesChange={handleValuesChange}
                    />
                  </div>
                </div>
              )}

              {/* Summary */}
              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <h4 className="mb-2 text-sm font-semibold">{t("Summary")}</h4>
                <div className="space-y-1 text-sm">
                  <div>
                    <span className="text-muted-foreground">{t("Service")}:</span>{" "}
                    <span>
                      {selectedService?.title || selectedService?.serviceKey}
                    </span>
                  </div>
                  {selectedItem?.type === "binding" && (
                    <div>
                      <span className="text-muted-foreground">{t("File")}:</span>{" "}
                      <span>{selectedItem.label}</span>
                    </div>
                  )}
                  {Object.keys(formValues).length > 0 && (
                    <div>
                      <span className="text-muted-foreground">{t("Parameters")}:</span>
                      <pre className="mt-1 max-h-32 overflow-auto rounded-lg bg-card p-2 text-xs">
                        {JSON.stringify(formValues, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-between">
                <Button variant="outline" size="sm" onClick={handleBack}>
                  {t("Back")}
                </Button>
                <Button
                  variant="default"
                  onClick={handleDeploy}
                  disabled={deploying || (requiresPort && !selectedPortId)}
                >
                  {deploying ? t("Deploying...") : t("Deploy")}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </ModalShell>
  );
};

interface ServiceValuesFormProps {
  formSchema: Record<string, unknown>;
  onSubmit: (values: Record<string, unknown>) => void;
  onValuesChange: (values: Record<string, unknown>) => void;
}

function ServiceValuesForm({ formSchema, onSubmit, onValuesChange }: ServiceValuesFormProps) {
  const { form } = useDynamicForm({
    schema: formSchema,
    onSubmit,
    onValuesChange,
  });
  return form;
}

export default DeployModal;

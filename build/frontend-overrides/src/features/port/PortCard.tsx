import {useParams} from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  User,
  Users,
  Plus,
  ArrowDown,
  ArrowUp,
  CheckCircle,
  Circle,
  AlertCircle,
  LoaderCircle,
  List,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getReadableSize } from "../../utils/formatter";
import { useModal } from "../../atoms/modal";

interface PortUser {
  user: { id: number; email: string };
}

interface ForwardRule {
  id: number;
  method: string;
  status: string;
}

interface PortUsage {
  download: number;
  upload: number;
}

interface Port {
  id: number;
  num: number;
  externalNum?: number | null;
  notes?: string | null;
  config?: Record<string, unknown> | null;
  allowedUsers: PortUser[];
  users?: { id: number; email: string }[];
  forwardRule?: ForwardRule | null;
  usage?: PortUsage | null;
}

interface PortCardProps {
  port: Port;
  onUpdate: () => void;
  setSelected: (payload: { type: string; id: number; port: Port } | null) => void;
}

const PortCard = ({ port, onUpdate, setSelected }: PortCardProps) => {
  const { t, i18n } = useTranslation();
  const { open } = useModal();
  const {serverId} = useParams();

  const ruleStatus = port.forwardRule?.status?.toLowerCase() || "";
  const succeeded = ["successful", "success", "completed", "applied"].includes(ruleStatus);
  const failed = ["failed", "error", "canceled", "cancelled"].includes(ruleStatus);
  const pending = ["queued", "pending", "running", "deploying"].includes(ruleStatus);
  const statusLabel = !port.forwardRule ? "尚未部署" : succeeded ? "部署成功" : failed ? "部署失败" : pending ? "部署进行中" : "部署状态未知";
  const editFunction = async () => {
    const result = await open("portFunction", { port, serverId: Number(serverId) });
    if (result) onUpdate();
  };
  return (
    <div className="relative flex h-44 w-40 flex-col justify-self-center rounded-xl border border-primary bg-card shadow-xl">
      <div className="flex flex-col gap-2 px-4 py-4">
        <h2 className="flex h-6 items-center gap-1 truncate text-base font-semibold">
          <span title={String(port.num)}>
            {port.externalNum ? port.externalNum : port.num}
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`端口 ${port.num} 操作`}
            onClick={() =>
              setSelected({ type: "select", id: port.id, port: port })
            }
          >
            <List size={16} />
          </Button>
          <span role="status" aria-label={statusLabel} title={statusLabel}>
            {succeeded ? <CheckCircle size={20} className="text-emerald-600" /> :
              failed ? <AlertCircle size={20} className="text-destructive" /> :
              pending ? <LoaderCircle size={20} className="text-muted-foreground" /> :
              <Circle size={20} className="text-muted-foreground" />}
          </span>
        </h2>
        <div className="flex grow flex-col items-center justify-start space-y-2">
          <div className="flex w-full flex-row items-start justify-start space-x-2">
            {port.allowedUsers.length > 0 ? (
              <Badge
                variant="default"
                className="cursor-pointer gap-0.5 px-1 text-xs"
                onClick={() =>
                  setSelected({ type: "user", id: port.id, port: port })
                }
              >
                {port.allowedUsers.length === 1 ? (
                  <User size={12} />
                ) : (
                  <Users size={12} />
                )}
                {port.allowedUsers.length}
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="cursor-pointer px-1 text-xs"
                onClick={() =>
                  setSelected({ type: "user", id: port.id, port: port })
                }
              >
                <User size={12} />0
              </Badge>
            )}
            {port.forwardRule ? (
              <Badge
                variant="secondary"
                className="max-w-16 cursor-pointer truncate px-1 text-xs"
                title={port.forwardRule.method}
                role="button"
                tabIndex={0}
                aria-label={`配置端口 ${port.num} 功能`}
                onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); void editFunction(); } }}
                onClick={editFunction}
              >
                {port.forwardRule.method}
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="w-8 cursor-pointer px-1 text-xs"
                role="button"
                tabIndex={0}
                aria-label={`配置端口 ${port.num} 功能`}
                onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); void editFunction(); } }}
                onClick={editFunction}
              >
                <Plus size={12} />
              </Badge>
            )}
          </div>
          <div className="flex w-full flex-col items-start justify-center space-y-1">
            <div
              className={cn(
                "flex flex-row items-center text-sm font-bold",
                port.usage ? "text-primary" : "text-primary/50",
              )}
            >
              <ArrowUp size={16} />
              <span>{getReadableSize(port.usage ? port.usage.upload : 0)}</span>
            </div>
            <div
              className={cn(
                "flex flex-row items-center text-sm font-bold",
                port.usage ? "text-primary" : "text-primary/50",
              )}
            >
              <ArrowDown size={16} />
              <span>
                {getReadableSize(port.usage ? port.usage.download : 0)}
              </span>
            </div>
          </div>
          {port.notes && (
            <div
              className="flex w-full flex-row items-start justify-start"
              title={port.notes}
            >
              <div className="flex h-4 w-full flex-row items-start overflow-hidden">
                <span className="text-clip text-sm text-muted-foreground">
                  {port.notes}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
      {port.config?.valid_until && (
        <div className="flex w-full flex-row items-center justify-center rounded-b-xl bg-amber-500/50 px-4">
          <div className="truncate py-1 text-xs font-bold text-foreground">
            {new Date(port.config.valid_until as string).toLocaleDateString(
              i18n.language,
            )}
            &nbsp;
            {new Date(port.config.valid_until as string).toLocaleTimeString(
              i18n.language,
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PortCard;

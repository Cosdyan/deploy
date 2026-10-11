import {useParams} from "react-router-dom";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useModal } from "../../atoms/modal";

interface Port {
  id: number;
  num: number;
  externalNum?: number | null;
  [key: string]: unknown;
}

interface PortSelectCardProps {
  port: Port;
  setSelected: (payload: { type: string; id: number; port: Port } | null) => void;
}

const PortSelectCard = ({ port, setSelected }: PortSelectCardProps) => {
  const { t } = useTranslation();
  const {serverId} = useParams();
  const { open } = useModal();

  return (
    <div className="relative flex w-72 flex-col items-center justify-center space-y-2 px-4 py-4">
      <div className="absolute right-2 top-2" onClick={() => setSelected(null)}>
        <Button variant="ghost" size="icon-xs" className="rounded-full">
          <X size={20} />
        </Button>
      </div>
      <div className="flex w-full flex-row items-center justify-start space-x-2">
        <span className="text-base font-semibold">
          {port.externalNum ? port.externalNum : port.num}
        </span>
      </div>
      <div className="flex w-full flex-col space-y-4 py-4">
        <Button variant="default" size="sm" onClick={async()=>{setSelected(null); await open("port", {port, serverId:Number(serverId)});}}>
          {t("Edit Port")}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setSelected({ id: port.id, type: "user", port: port })}
        >
          {t("Change Port Users")}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setSelected(null);
            open("portFunction", {
              port,
              serverId: Number(serverId),
            });
          }}
        >
          {t("Change Port Function")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setSelected(null);
            open("portRestriction", {
              port,
            });
          }}
        >
          {t("Restrict Port")}
        </Button>
      </div>
    </div>
  );
};

export default PortSelectCard;

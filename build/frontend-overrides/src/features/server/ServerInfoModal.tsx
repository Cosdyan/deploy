import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { gql, useQuery, useMutation, useApolloClient } from "@apollo/client";
import { cn } from "@/lib/utils";
import { GET_SERVER_QUERY, ADD_SERVER_MUTATION, UPDATE_SERVER_MUTATION, DELETE_SERVER_MUTATION } from "../../queries/server";
import { GET_SECRETS_QUERY, UPLOAD_FILE_MUTATION } from "../../queries/file";
import { useModal } from "../../atoms/modal";
import { FileTypeEnum } from "@/types/generated";
import DataLoading from "../DataLoading";
import { notify } from "../../atoms/notification";
import ModalShell from "../ui/ModalShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ServerInfoModalProps {
  modalProps?: { serverId?: number; [key: string]: unknown };
  close: () => void;
  resolve?: (value: unknown) => void;
}

const ServerInfoModal = ({ modalProps = {}, close, resolve }: ServerInfoModalProps) => {
  const { t } = useTranslation();
  const { confirm } = useModal();
  const { serverId } = modalProps;
  const {
    data: secretsData,
    loading: secretsLoading,
    error: secretsError,
  } = useQuery(GET_SECRETS_QUERY);
  const {
    data: serverData,
    loading: serverLoading,
    error: serverError,
  } = serverId
      ? useQuery(GET_SERVER_QUERY, {
        variables: { id: serverId },
        fetchPolicy: 'network-only',
      })
      : { data: null, loading: false, error: null };
  const [uploadFile, { loading: uploadFileLoading, error: uploadFileError }] =
    useMutation(UPLOAD_FILE_MUTATION);
  const [
    updateServer,
    { loading: updateServerLoading, error: updateServerError },
  ] = useMutation(UPDATE_SERVER_MUTATION, {
    onCompleted: () => {
      notify({
        type: "success",
        body: "Server saved successfully",
      });
      if (resolve) resolve({ action: "saved" });
      close();
    },
  });
  const [addServer, { loading: addServerLoading, error: addServerError }] =
    useMutation(ADD_SERVER_MUTATION, {
    onCompleted: () => {
      notify({
        type: "success",
        body: "Server added successfully",
      });
      if (resolve) resolve({ action: "added" });
      close();
    },
  });

  const [deleteServer, { loading: deleteServerLoading, error: deleteServerError }] =
    useMutation(DELETE_SERVER_MUTATION, {
    onCompleted: () => {
      notify({
        type: "success",
        body: "Server deleted successfully",
      });
      if (resolve) resolve({ action: "deleted" });
      close();
    },
  });

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [user, setUser] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("");
  const [sshPassword, setSSHPassword] = useState("");
  const [sshPasswordSet, setSSHPasswordSet] = useState(false);
  const [sshPasswordNotNeeded, setSSHPasswordNotNeeded] = useState(true);
  const [sudoPassword, setSudoPassword] = useState("");
  const [sudoPasswordSet, setSudoPasswordSet] = useState(false);
  const [sudoPasswordNotNeeded, setSudoPasswordNotNeeded] = useState(true);
  const [keyFile, setKeyFile] = useState<File | null>(null);
  const [keyFileId, setKeyFileId] = useState("");

  const handleDelete = async () => {
    const confirmed = await confirm({
        title: t("Delete Server"),
        message: t("Are you sure you want to delete this server?"),
      });
    if (confirmed && serverId) {
      await deleteServer({ variables: { id: serverId } });
    }
  };
  const handleCancel = () => {
    if (resolve) resolve(false);
    close();
  };
  const handleSubmit = async () => {
    let actualKeyFileId = keyFileId;
    if (keyFile && !keyFileId) {
      const fileData = {
        file: keyFile,
        name: keyFile.name,
        type: FileTypeEnum.Secret,
        notes: `${name} ${t("SSH Key")}`,
      };
      const result = await uploadFile(fileData);
      actualKeyFileId = result.data.uploadFile.id;
    }
    const data: Record<string, unknown> = {
      name,
      address,
    };
    if (serverId) {
      data.id = serverId;
    }
    if (user) {
      data.user = user;
    }
    if (host) {
      data.host = host;
    } else {
      data.host = address;
    }
    if (port) {
      data.port = Number(port);
    }
    if (sshPassword) {
      data.sshPassword = sshPassword;
    }
    if (sudoPassword) {
      data.sudoPassword = sudoPassword;
    }
    if (actualKeyFileId) {
      data.keyFileId = Number(actualKeyFileId);
    }
    serverId
      ? await updateServer({ variables: { ...data } })
      : await addServer({ variables: { ...data } });
  };

  useEffect(() => {
    if (serverData?.server) {
      const server = serverData.server;
      setName(server.name);
      setAddress(server.address);
      setUser(server.user);
      setHost(server.host);
      setPort(server.port);
      if (server.sshPasswordSet) {
        setSSHPasswordSet(true);
        setSSHPasswordNotNeeded(false);
      }
      if (server.sudoPasswordSet) {
        setSudoPasswordSet(true);
        setSudoPasswordNotNeeded(false);
      }
      if (server.keyFileId) {
        setKeyFileId(server.keyFileId);
      }
    }
  }, [serverData]);

  if (serverLoading || secretsLoading) {
    return <DataLoading />;
  }

  const isLoading = uploadFileLoading || updateServerLoading || addServerLoading || deleteServerLoading;

  return (
    <ModalShell
      title={serverId ? t("Edit Server") : t("Add Server")}
      onClose={close}
      footer={
        <>
          {serverId && (
            <Button
              variant="destructive"
              onClick={handleDelete}
            >
              {t("Delete")}
            </Button>
          )}
          <Button
            variant="outline"
            onClick={handleCancel}
          >
            {t("Cancel")}
          </Button>
          <Button
            variant="default"
            disabled={isLoading}
            onClick={handleSubmit}
          >
            {isLoading && (
              <div className="mr-2 size-4 animate-spin rounded-full border-2 border-muted border-t-primary-foreground" />
            )}
            {serverId ? t("Edit") : t("Add")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>{t("Name")}</Label>
          <Input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("Server Name Placeholder")}
          />
        </div>
        <div className="space-y-2">
          <Label>{t("Address")}</Label>
          <Input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="www.example.com"
          />
        </div>
        <div className="space-y-2">
          <Label>{t("SSH Connection Info")}</Label>
          <div className="flex flex-row items-center gap-1">
            <Input
              type="text"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              placeholder={t("Username")}
              className="w-1/4 text-xs"
            />
            <span className="text-bold text-2xl text-muted-foreground">@</span>
            <Input
              type="text"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder={t("Host") + " " + t("Default as address")}
              className="w-1/2 text-xs"
            />
            <span className="text-bold text-2xl text-muted-foreground">:</span>
            <Input
              type="number"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              placeholder={t("Port")}
              className="w-1/4 text-xs"
            />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>{t("SSH Password")}</Label>
            <label className="flex items-center gap-2">
              <Checkbox
                checked={sshPasswordNotNeeded}
                onCheckedChange={(checked) => setSSHPasswordNotNeeded(checked === true)}
              />
              <span className="text-sm text-muted-foreground">{t("SSH password not needed")}</span>
            </label>
          </div>
          <Input
            type="password"
            value={sshPassword}
            onChange={(e) => setSSHPassword(e.target.value)}
            placeholder={
              sshPasswordSet
                ? t("SSH Password Set Placeholder")
                : t("SSH Password Placeholder")
            }
            disabled={sshPasswordNotNeeded}
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>{t("SUDO Password")}</Label>
            <label className="flex items-center gap-2">
              <Checkbox
                checked={sudoPasswordNotNeeded}
                onCheckedChange={(checked) => setSudoPasswordNotNeeded(checked === true)}
              />
              <span className="text-sm text-muted-foreground">{t("SUDO password not needed")}</span>
            </label>
          </div>
          <Input
            type="password"
            value={sudoPassword}
            onChange={(e) => setSudoPassword(e.target.value)}
            placeholder={
              sudoPasswordSet
                ? t("SUDO Password Set Placeholder")
                : t("SUDO Password Placeholder")
            }
            disabled={sudoPasswordNotNeeded}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
          <div className="space-y-2">
            <Label>{t("Upload SSH Key")}</Label>
            <Input
              type="file"
              onChange={(e) => setKeyFile(e.target.files?.[0] ?? null)}
              className="max-w-xs"
            />
          </div>
          <div className="space-y-2">
            <Label>{t("Select SSH Key")}</Label>
            <Select
              value={keyFileId || "__no_ssh_key__"}
              onValueChange={(value) => setKeyFileId(value === "__no_ssh_key__" ? "" : value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("No SSH Key")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__no_ssh_key__">{t("No SSH Key")}</SelectItem>
                {secretsData?.files.map((file: { id: string; name: string }) => (
                  <SelectItem key={file.id} value={String(file.id)}>
                    {file.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </ModalShell>
  );
};

export default ServerInfoModal;

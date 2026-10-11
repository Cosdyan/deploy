import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { gql, useMutation } from "@apollo/client";
import { FileTypeEnum } from "@/types/generated";
import ModalShell from "../ui/ModalShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const UPLOAD_FILE = gql`
  mutation UploadFile(
    $file: Upload!
    $name: String!
    $type: FileTypeEnum!
    $version: String
    $notes: String
  ) {
    uploadFile(
      file: $file
      name: $name
      type: $type
      version: $version
      notes: $notes
    ) {
      id
      name
      type
      size
      version
      notes
    }
  }
`;

interface FileModalProps {
  close: () => void;
  resolve?: (value: unknown) => void;
}

const FileModal = ({ close, resolve }: FileModalProps) => {
  const { t } = useTranslation();
  const [name, setName] = useState<string | null>(null);
  const [fileType, setFileType] = useState<string>(FileTypeEnum.Secret);
  const [file, setFile] = useState<File | null>(null);
  const [uploadFile, { loading }] = useMutation(UPLOAD_FILE);
  const [version, setVersion] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (file) {
      if (file.type.startsWith("image")) {
        setFileType(FileTypeEnum.Image);
      } else if (file.type.startsWith("video")) {
        setFileType(FileTypeEnum.Video);
      } else if (file.type.startsWith("text")) {
        setFileType(FileTypeEnum.Text);
      } else if (file.type.startsWith("application")) {
        setFileType(FileTypeEnum.Executable);
      }
    }
  }, [file]);

  const [error, setError] = useState("");
  const handleSubmit = async () => {
    setError("");
    if (!file) {setError(t("Please select a file")); return;}
    try {
    const data = {
      file,
      name: name !== null ? name : file?.name ?? "",
      type: fileType,
      version: version || null,
      notes: notes || null,
    };
    await uploadFile({ variables: { ...data } });
    if (resolve) resolve(true);
    close();
    } catch (err) {setError(err instanceof Error ? err.message : t("Operation failed"));}
  };

  const handleCancel = () => {
    if (resolve) resolve(false);
    close();
  };

  return (
    <ModalShell
      title={t("Add File")}
      onClose={handleCancel}
      footer={
        <>
          <Button variant="outline" onClick={handleCancel}>
            {t("Cancel")}
          </Button>
          <Button variant="default" disabled={loading} onClick={handleSubmit}>
            {loading && (
              <div className="mr-2 size-4 animate-spin rounded-full border-2 border-muted border-t-primary-foreground" />
            )}
            {t("Add")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">{error && <p role="alert" className="text-destructive">{error}</p>}
        <div className="space-y-2">
          <Label>{t("File Type")}</Label>
          <Select value={fileType} onValueChange={setFileType}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.values(FileTypeEnum).map((val) => (
                <SelectItem key={val} value={val}>
                  {t(val)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-4 md:flex-row">
          <div className="flex-1 space-y-2">
            <Label>{t("Name")}</Label>
            <Input
              type="text"
              placeholder={t("File Name Placeholder")}
              value={name !== null ? name : file !== null ? file.name : ""}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex-1 space-y-2">
            <Label>{t("Version")}</Label>
            <Input
              type="text"
              placeholder={t("File Version Placeholder")}
              value={version}
              onChange={(e) => setVersion(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>{t("Upload File")}</Label>
          <Input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>

        <div className="space-y-2">
          <Label>{t("Notes")}</Label>
          <Textarea
            placeholder={t("File Notes Placeholder")}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>
    </ModalShell>
  );
};

export default FileModal;

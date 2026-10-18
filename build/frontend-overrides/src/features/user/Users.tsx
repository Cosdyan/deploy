import { useState, type FormEvent } from "react";
import { gql, useQuery, useMutation } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import ModalShell from "../ui/ModalShell";
import { useModal } from "@/atoms/modal";
import { useAuthReducer } from "@/atoms/auth";

const LIST = gql`query ManageUsers($email: String, $limit: Int!, $offset: Int!) { paginatedUsers(email: $email, limit: $limit, offset: $offset) { count items { id email isActive isOps isSuperuser notes } } }`;
const CREATE = gql`mutation CreateManagedUser($email: String!, $password: String!, $isActive: Boolean!, $isOps: Boolean!, $isSuperuser: Boolean!, $notes: String!) { createUser(email: $email, password: $password, isActive: $isActive, isOps: $isOps, isSuperuser: $isSuperuser, notes: $notes) { id } }`;
const UPDATE = gql`mutation UpdateManagedUser($id: Int!, $email: String!, $password: String, $isActive: Boolean!, $isOps: Boolean!, $isSuperuser: Boolean!, $notes: String!) { updateUser(id: $id, email: $email, password: $password, isActive: $isActive, isOps: $isOps, isSuperuser: $isSuperuser, notes: $notes) }`;
const DELETE = gql`mutation DeleteManagedUser($id: Int!) { deleteUser(id: $id) }`;
type Account = {id?: number; email: string; password?: string; isActive: boolean; isOps: boolean; isSuperuser: boolean; notes: string};
const empty: Account = {email: "", password: "", isActive: true, isOps: false, isSuperuser: false, notes: ""};

export default function Users() {
  const { t } = useTranslation();
  const { auth } = useAuthReducer();
  const { confirm } = useModal();
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<Account | null>(null);
  const [message, setMessage] = useState("");
  const { data, previousData, networkStatus, loading, error, refetch } = useQuery(LIST, {variables: {email: search || null, limit: 10, offset}, fetchPolicy: "network-only", notifyOnNetworkStatusChange: true});
  const [create, creating] = useMutation(CREATE);
  const [update, updating] = useMutation(UPDATE);
  const [remove, removing] = useMutation(DELETE);
  const busy = creating.loading || updating.loading || removing.loading;
  const displayedData = data ?? (networkStatus === 4 ? previousData : undefined);
  const accounts: Account[] = displayedData?.paginatedUsers?.items ?? [];
  const count = displayedData?.paginatedUsers?.count ?? 0;
  const selfId = auth.permissions && auth.permissions.user_id;
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setMessage("");
    try {
      const variables = {...editing, email: editing.email.trim(), notes: editing.notes || "", password: editing.password || undefined};
      if (editing.id) await update({variables}); else await create({variables});
      setEditing(null);
      await refetch();
    } catch (err) {setMessage(err instanceof Error ? err.message : t("Operation failed"));}
  }
  async function deleteAccount(account: Account) {
    if (!await confirm({title: t("Delete user"), message: t("Delete user confirmation", {email: account.email})})) return;
    try {await remove({variables: {id: account.id}}); if (offset && accounts.length === 1) setOffset(offset - 10); else await refetch();}
    catch (err) {setMessage(err instanceof Error ? err.message : t("Operation failed"));}
  }
  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="aurora-eyebrow">{t("Access management")}</p><h1 className="text-3xl font-semibold tracking-tight">{t("Users")}</h1><p className="mt-2 text-sm text-muted-foreground">{t("Manage user roles and account access")}</p></div><Button onClick={() => {setMessage(""); setEditing({...empty});}}>{t("Add user")}</Button></div>
    <Input aria-label={t("Search email")} placeholder={t("Search email")} value={search} onChange={e => {setSearch(e.target.value); setOffset(0);}} className="max-w-sm" />
    {(error || (message && !editing)) && <p role="alert" className="text-destructive">{error?.message || message}</p>}
    <div className="aurora-panel overflow-x-auto" aria-busy={loading}><table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground">{["Email", "Role", "Status", "Notes", "Actions"].map(x => <th key={x} className="p-4 font-medium">{t(x)}</th>)}</tr></thead><tbody>
      {loading && !displayedData ? <tr><td colSpan={5} className="p-8">{t("Loading")}…</td></tr> : accounts.map(account => <tr key={account.id} className="border-b last:border-0"><td className="p-4 font-medium">{account.email}</td><td className="p-4">{t(account.isSuperuser ? "Administrator" : account.isOps ? "Operator" : "Member")}</td><td className="p-4"><span className={account.isActive ? "text-emerald-600" : "text-muted-foreground"}>{t(account.isActive ? "Active" : "Disabled")}</span></td><td className="max-w-xs truncate p-4">{account.notes}</td><td className="p-4 whitespace-nowrap"><Button variant="ghost" onClick={() => {setMessage(""); setEditing({...account, password: "", notes: account.notes || ""});}}>{t("Edit")}</Button><Button variant="ghost" disabled={busy || account.id === selfId} onClick={() => deleteAccount(account)}>{t("Delete")}</Button></td></tr>)}
      {!loading && !accounts.length && <tr><td colSpan={5} className="p-10 text-center text-muted-foreground">{t("No matching users")}</td></tr>}
    </tbody></table></div>
    <div className="flex items-center justify-between text-sm text-muted-foreground"><span>{t("Total users", {count})}</span><div className="flex gap-2"><Button variant="outline" disabled={!offset || loading} onClick={() => setOffset(offset - 10)}>{t("Previous")}</Button><Button variant="outline" disabled={offset + 10 >= count || loading} onClick={() => setOffset(offset + 10)}>{t("Next")}</Button></div></div>
    {editing && <Dialog open onOpenChange={open => {if (!open) setEditing(null);}}><DialogContent><ModalShell title={t(editing.id ? "Edit user" : "Add user")} onClose={() => setEditing(null)} footer={<><Button variant="outline" onClick={() => setEditing(null)}>{t("Cancel")}</Button><Button type="submit" form="account-form" disabled={busy}>{t("Save")}</Button></>}>
      <form id="account-form" onSubmit={save} className="space-y-4">
        {message && <p role="alert" className="text-destructive">{message}</p>}
        <label className="block space-y-2"><span>{t("Email")}</span><Input type="email" required value={editing.email} onChange={e => setEditing({...editing, email: e.target.value})} /></label>
        <label className="block space-y-2"><span>{t("Password")}</span><Input type="password" minLength={8} required={!editing.id} autoComplete="new-password" placeholder={editing.id ? t("Leave blank to keep password") : t("At least 8 characters")} value={editing.password || ""} onChange={e => setEditing({...editing, password: e.target.value})} /></label>
        <label className="block space-y-2"><span>{t("Role")}</span><select aria-label={t("Role")} className="aurora-select" disabled={editing.id === selfId} value={editing.isSuperuser ? "admin" : editing.isOps ? "ops" : "member"} onChange={e => setEditing({...editing, isSuperuser: e.target.value === "admin", isOps: e.target.value === "ops"})}><option value="member">{t("Member")}</option><option value="ops">{t("Operator")}</option><option value="admin">{t("Administrator")}</option></select></label>
        <label className="flex gap-2"><input type="checkbox" disabled={editing.id === selfId} checked={editing.isActive} onChange={e => setEditing({...editing, isActive: e.target.checked})} />{t("Active")}</label>
        <label className="block space-y-2"><span>{t("Notes")}</span><Input value={editing.notes} onChange={e => setEditing({...editing, notes: e.target.value})} /></label>
      </form>
    </ModalShell></DialogContent></Dialog>}
  </div>;
}

import { useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { gql, useQuery, useMutation } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useModal } from "@/atoms/modal";
const LIST = gql`query ManageServerUsers($id: Int!) {server(id: $id) {id name allowedUsers {userId notes user {id email}}} users {id email}}`;
const ADD = gql`mutation GrantServerAccess($serverId: Int!, $userId: Int!, $notes: String!) {addServerUser(serverId: $serverId, userId: $userId, notes: $notes)}`;
const UPDATE = gql`mutation EditServerAccess($serverId: Int!, $userId: Int!, $notes: String!) {updateServerUser(serverId: $serverId, userId: $userId, notes: $notes)}`;
const DELETE = gql`mutation RevokeServerAccess($serverId: Int!, $userId: Int!) {deleteServerUser(serverId: $serverId, userId: $userId)}`;
type Access = {userId: number; notes?: string; user: {id: number; email: string}};
export default function ServerUsers() {
 const { serverId } = useParams(); const {t} = useTranslation(); const {confirm} = useModal();
 const id = Number(serverId); const [userId, setUserId] = useState(""); const [notes, setNotes] = useState(""); const [editing, setEditing] = useState<number | null>(null); const [message, setMessage] = useState("");
 const {data, loading, error, refetch} = useQuery(LIST, {variables: {id}, skip: !Number.isInteger(id) || id < 1, fetchPolicy: "network-only"});
 const [add, a] = useMutation(ADD); const [update, u] = useMutation(UPDATE); const [remove, r] = useMutation(DELETE);
 const access: Access[] = data?.server?.allowedUsers ?? []; const available = (data?.users ?? []).filter((user: {id:number}) => !access.some(x => x.userId === user.id));
 async function save(e: FormEvent) {e.preventDefault(); setMessage(""); try {await (editing ? update : add)({variables:{serverId:id,userId:editing || Number(userId),notes}}); setEditing(null); setUserId(""); setNotes(""); await refetch();} catch(err) {setMessage(err instanceof Error ? err.message : t("Operation failed"));}}
 async function revoke(item: Access) {if (!await confirm({title:t("Revoke access"),message:t("Revoke access confirmation",{email:item.user.email})})) return; try {await remove({variables:{serverId:id,userId:item.userId}}); await refetch();} catch(err) {setMessage(err instanceof Error ? err.message : t("Operation failed"));}}
 return <div className="space-y-6"><div><p className="aurora-eyebrow">{data?.server?.name || t("Servers")}</p><h1 className="text-3xl font-semibold">{t("Server users")}</h1><p className="mt-2 text-sm text-muted-foreground">{t("Grant access to this server")}</p></div>
 {(message || error) && <p role="alert" className="text-destructive">{message || error?.message}</p>}
 <form onSubmit={save} className="aurora-panel flex flex-wrap items-end gap-3 p-5"><label className="flex-1 min-w-48 space-y-2"><span>{t("User")}</span><select className="aurora-select" aria-label={t("User")} required={!editing} disabled={!!editing} value={editing || userId} onChange={e=>setUserId(e.target.value)}><option value="">{t("Select user")}</option>{(editing ? data?.users ?? [] : available).map((user:{id:number;email:string})=><option key={user.id} value={user.id}>{user.email}</option>)}</select></label><label className="flex-1 min-w-48 space-y-2"><span>{t("Notes")}</span><Input value={notes} onChange={e=>setNotes(e.target.value)} /></label><Button disabled={loading || a.loading || u.loading}>{t(editing ? "Save" : "Grant access")}</Button>{editing && <Button type="button" variant="outline" onClick={()=>{setEditing(null);setNotes("");}}>{t("Cancel")}</Button>}</form>
 <div className="aurora-panel overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left">{["Email","Notes","Actions"].map(x=><th className="p-4" key={x}>{t(x)}</th>)}</tr></thead><tbody>{access.map(item=><tr key={item.userId} className="border-b last:border-0"><td className="p-4">{item.user.email}</td><td className="p-4">{item.notes}</td><td className="p-4"><Button variant="ghost" onClick={()=>{setEditing(item.userId);setNotes(item.notes || "");}}>{t("Edit")}</Button><Button variant="ghost" disabled={r.loading} onClick={()=>revoke(item)}>{t("Revoke access")}</Button></td></tr>)}{!access.length && <tr><td colSpan={3} className="p-10 text-center text-muted-foreground">{t(loading ? "Loading" : "No server users")}</td></tr>}</tbody></table></div></div>;
}

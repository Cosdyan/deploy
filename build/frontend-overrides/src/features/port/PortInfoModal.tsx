import {useState, type FormEvent} from "react";
import {gql,useMutation} from "@apollo/client";
import {useTranslation} from "react-i18next";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import ModalShell from "../ui/ModalShell";
import {useModal} from "@/atoms/modal";
const ADD=gql`mutation CreatePort($s:Int!,$n:Int!,$e:Int,$notes:String!){addPort(serverId:$s,num:$n,externalNum:$e,notes:$notes,config:{})}`;
const EDIT=gql`mutation EditPort($id:Int!,$n:Int!,$e:Int,$notes:String!){updatePort(id:$id,num:$n,externalNum:$e,notes:$notes)}`;
const DELETE=gql`mutation RemovePort($id:Int!){deletePort(id:$id)}`;
type Port={id:number;num:number;externalNum?:number;notes?:string};
export default function PortInfoModal({modalProps={},close,resolve}:{modalProps?:{port?:Port;serverId?:number};close:()=>void;resolve?:(value:unknown)=>void}){
 const {t}=useTranslation(); const {confirm}=useModal();const port=modalProps.port;
 const [num,setNum]=useState(String(port?.num || ""));const [external,setExternal]=useState(String(port?.externalNum || ""));const [notes,setNotes]=useState(port?.notes || "");const [error,setError]=useState("");
 const [add,a]=useMutation(ADD,{refetchQueries:["GetServerPorts"],awaitRefetchQueries:true});const [edit,e]=useMutation(EDIT,{refetchQueries:["GetServerPorts"],awaitRefetchQueries:true});const [remove,r]=useMutation(DELETE,{refetchQueries:["GetServerPorts"],awaitRefetchQueries:true});const busy=a.loading||e.loading||r.loading;
 const valid=(value:string)=>/^\d+$/.test(value)&&Number(value)>=1&&Number(value)<=65535;
 async function save(event:FormEvent){event.preventDefault();setError("");if(!valid(num)||(external&&!valid(external))){setError(t("Port must be between 1 and 65535"));return;}try{if(port) await edit({variables:{id:port.id,n:Number(num),e:external?Number(external):null,notes}});else await add({variables:{s:modalProps.serverId,n:Number(num),e:external?Number(external):null,notes}});resolve?.(true);close();}catch(err){setError(err instanceof Error?err.message:t("Operation failed"));}}
 async function del(){if(!port || !await confirm({title:t("Delete port"),message:t("Delete port confirmation")}))return;try{await remove({variables:{id:port.id}});resolve?.(true);close();}catch(err){setError(err instanceof Error?err.message:t("Operation failed"));}}
 return <ModalShell title={t(port?"Edit Port":"Add port")} onClose={close} footer={<>{port&&<Button variant="destructive" disabled={busy} onClick={del}>{t("Delete")}</Button>}<Button variant="outline" onClick={close}>{t("Cancel")}</Button><Button form="port-form" type="submit" disabled={busy || (!port&&!modalProps.serverId)}>{t("Save")}</Button></>}>
 <form id="port-form" onSubmit={save} className="space-y-4">{error&&<p role="alert" className="text-destructive">{error}</p>}<label className="block space-y-2"><span>{t("Port")}</span><Input type="number" required min={1} max={65535} value={num} onChange={e=>setNum(e.target.value)}/></label><label className="block space-y-2"><span>{t("External port")}</span><Input type="number" min={1} max={65535} placeholder={t("Optional")} value={external} onChange={e=>setExternal(e.target.value)}/></label><label className="block space-y-2"><span>{t("Notes")}</span><Input value={notes} onChange={e=>setNotes(e.target.value)}/></label></form></ModalShell>;
}

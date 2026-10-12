import { useEffect, useState } from "react";
import { gql, useMutation, useQuery } from "@apollo/client";
import ModalShell from "../ui/ModalShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const QUERY = gql`query GetPortSpeedLimits($id:Int!){port(id:$id){id num config}}`;
const POLICY=gql`mutation SetPortPolicy($id:Int!,$config:JSON!){setPortPolicy(id:$id,config:$config)}`;
const ACTIONS=["不执行操作","限速至 10 Kbit/s","限速至 100 Kbit/s","限速至 1 Mbit/s","限速至 10 Mbit/s","限速至 30 Mbit/s","限速至 100 Mbit/s","限速至 1 Gbit/s","移除端口服务"];
const localDate=(ms:number)=>{if(!ms)return "";const d=new Date(ms);return new Date(ms-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
const APPLY = gql`mutation ApplyPortSpeedLimits($id:Int!,$egress:Int!,$ingress:Int!){applyPortSpeedLimits(id:$id,egress:$egress,ingress:$ingress)}`;
interface Props {modalProps?: {port?: {id:number}; [key:string]:unknown}; close:()=>void; resolve?:(value:unknown)=>void;}
export default function PortRestrictionModal({modalProps={},close,resolve}:Props) {
 const id=modalProps.port?.id;
 const {data,loading}=useQuery(QUERY,{variables:{id},skip:!id,pollInterval:2000,fetchPolicy:"network-only"});
 const [policy,{loading:policySaving}]=useMutation(POLICY,{refetchQueries:["GetPortSpeedLimits","GetServerPorts"],awaitRefetchQueries:true});
 const [expires,setExpires]=useState(""),[quota,setQuota]=useState("0"),[dueAction,setDueAction]=useState("0"),[quotaAction,setQuotaAction]=useState("0"),[message,setMessage]=useState("");
 const [apply,{loading:saving}]=useMutation(APPLY,{refetchQueries:["GetServerPorts"],awaitRefetchQueries:true});
 const [egress,setEgress]=useState("0"),[ingress,setIngress]=useState("0"),[error,setError]=useState("");
 useEffect(()=>{if(data?.port){setEgress(String(data.port.config.egress_limit||0));setIngress(String(data.port.config.ingress_limit||0));setExpires(localDate(data.port.config.valid_until||0));setQuota(String((data.port.config.quota||0)/1073741824));setDueAction(String(data.port.config.due_action||0));setQuotaAction(String(data.port.config.quota_action||0));}},[data?.port?.id]);
 const submit=async()=>{
   setError("");const out=Number(egress),inc=Number(ingress);
   if(!id||!Number.isInteger(out)||!Number.isInteger(inc)||out<0||inc<0||out>1000000000||inc>1000000000){setError("请输入有效的限速数值，0 表示不限制");return;}
   try {await apply({variables:{id,egress:out,ingress:inc}});}
   catch(e){setError(e instanceof Error?e.message:"保存失败");}
 };
 const savePolicy=async()=>{
  setError("");setMessage("");
  const bytes=Math.round(Number(quota)*1073741824),until=expires?new Date(expires).getTime():0;
  if(!id||!Number.isFinite(until)||!Number.isSafeInteger(bytes)||bytes<0){setError("请输入有效的到期时间和流量配额");return;}
  try {await policy({variables:{id,config:{valid_until:until,quota:bytes,due_action:Number(dueAction),quota_action:Number(quotaAction)}}});setMessage("策略已保存，每分钟检查到期时间与已统计流量");}
  catch(e){setError(e instanceof Error?e.message:"保存失败");}
 };
 const status=data?.port?.config.speed_limit_status;
 return <ModalShell title="端口限制" onClose={close} footer={<><Button variant="outline" onClick={()=>{resolve?.(false);close();}}>关闭</Button><Button disabled={loading||policySaving||!id} onClick={savePolicy}>保存策略</Button><Button disabled={loading||saving||!id} onClick={submit}>应用限速</Button></>}>
  <div className="space-y-4">
   <p className="text-sm text-muted-foreground">按端口限制上传和下载速度。单位为 Kbit/s，1000 约为 1 Mbit/s；填写 0 可撤销限制。</p>
   <label className="block text-sm">上传限速<Input type="number" min={0} max={1000000000} value={egress} onChange={e=>setEgress(e.target.value)}/></label>
   <label className="block text-sm">下载限速<Input type="number" min={0} max={1000000000} value={ingress} onChange={e=>setIngress(e.target.value)}/></label>
   <div className="border-t pt-4 space-y-3">
    <label className="block text-sm">到期时间<Input type="datetime-local" value={expires} onChange={e=>setExpires(e.target.value)}/></label>
    <label className="block text-sm">到期后操作<select aria-label="到期后操作" className="mt-1 w-full rounded-md border bg-background p-2" value={dueAction} onChange={e=>setDueAction(e.target.value)}>{ACTIONS.map((label,value)=><option key={value} value={value}>{label}</option>)}</select></label>
    <label className="block text-sm">流量配额（GiB，0 表示不限）<Input type="number" min={0} step="0.01" value={quota} onChange={e=>setQuota(e.target.value)}/></label>
    <label className="block text-sm">配额用尽后操作<select aria-label="配额用尽后操作" className="mt-1 w-full rounded-md border bg-background p-2" value={quotaAction} onChange={e=>setQuotaAction(e.target.value)}>{ACTIONS.map((label,value)=><option key={value} value={value}>{label}</option>)}</select></label>
   </div>
   {message&&<p role="status" className="text-sm">{message}</p>}
   {status&&<p role="status" className="text-sm">{status==="applied"?"限速已生效":status==="failed"?"限速执行失败，请查看任务日志":"正在应用限速…"}</p>}
   {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>
 </ModalShell>;
}

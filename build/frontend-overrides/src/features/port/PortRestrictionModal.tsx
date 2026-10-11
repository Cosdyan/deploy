import { useEffect, useState } from "react";
import { gql, useMutation, useQuery } from "@apollo/client";
import ModalShell from "../ui/ModalShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const QUERY = gql`query GetPortSpeedLimits($id:Int!){port(id:$id){id num config}}`;
const APPLY = gql`mutation ApplyPortSpeedLimits($id:Int!,$egress:Int!,$ingress:Int!){applyPortSpeedLimits(id:$id,egress:$egress,ingress:$ingress)}`;
interface Props {modalProps?: {port?: {id:number}; [key:string]:unknown}; close:()=>void; resolve?:(value:unknown)=>void;}
export default function PortRestrictionModal({modalProps={},close,resolve}:Props) {
 const id=modalProps.port?.id;
 const {data,loading}=useQuery(QUERY,{variables:{id},skip:!id,pollInterval:2000,fetchPolicy:"network-only"});
 const [apply,{loading:saving}]=useMutation(APPLY,{refetchQueries:["GetServerPorts"],awaitRefetchQueries:true});
 const [egress,setEgress]=useState("0"),[ingress,setIngress]=useState("0"),[error,setError]=useState("");
 useEffect(()=>{if(data?.port){setEgress(String(data.port.config.egress_limit||0));setIngress(String(data.port.config.ingress_limit||0));}},[data?.port?.id]);
 const submit=async()=>{
   setError("");const out=Number(egress),inc=Number(ingress);
   if(!id||!Number.isInteger(out)||!Number.isInteger(inc)||out<0||inc<0||out>1000000000||inc>1000000000){setError("请输入有效的限速数值，0 表示不限制");return;}
   try {await apply({variables:{id,egress:out,ingress:inc}});}
   catch(e){setError(e instanceof Error?e.message:"保存失败");}
 };
 const status=data?.port?.config.speed_limit_status;
 return <ModalShell title="端口限速" onClose={close} footer={<><Button variant="outline" onClick={()=>{resolve?.(false);close();}}>关闭</Button><Button disabled={loading||saving||!id} onClick={submit}>应用限速</Button></>}>
  <div className="space-y-4">
   <p className="text-sm text-muted-foreground">按端口限制上传和下载速度。单位为 Kbit/s，1000 约为 1 Mbit/s；填写 0 可撤销限制。</p>
   <label className="block text-sm">上传限速<Input type="number" min={0} max={1000000000} value={egress} onChange={e=>setEgress(e.target.value)}/></label>
   <label className="block text-sm">下载限速<Input type="number" min={0} max={1000000000} value={ingress} onChange={e=>setIngress(e.target.value)}/></label>
   {status&&<p role="status" className="text-sm">{status==="applied"?"限速已生效":status==="failed"?"限速执行失败，请查看任务日志":"正在应用限速…"}</p>}
   {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>
 </ModalShell>;
}

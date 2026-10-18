import {useState} from "react";
import {gql,useMutation,useQuery} from "@apollo/client";
import DeployModal from "../deployment/DeployModal";
import ModalShell from "../ui/ModalShell";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
const CONFIGURE=gql`mutation ConfigureNativeForward($portId:Int!,$remoteAddress:String!,$remotePort:Int!,$protocol:String!){configureNativeForward(portId:$portId,remoteAddress:$remoteAddress,remotePort:$remotePort,protocol:$protocol)}`;
const RULE=gql`query NativePortForward($portId:Int!){portForwardRule(portId:$portId){id method status config}}`;
interface Props {modalProps?: {port?:{id:number};serverId?:number};close:()=>void;resolve?:(value:unknown)=>void;}
export default function PortFunctionModal(props:Props) {
 const portId=props.modalProps?.port?.id;
 const [mode,setMode]=useState<"choose"|"service"|"forward">("choose");
 const [address,setAddress]=useState(""),[targetPort,setTargetPort]=useState(""),[protocol,setProtocol]=useState("ALL"),[error,setError]=useState(""),[sent,setSent]=useState(false);
 const [configure,{loading}]=useMutation(CONFIGURE);
 const {data}=useQuery(RULE,{variables:{portId},skip:!portId||mode!=="forward",pollInterval:2000,fetchPolicy:"network-only"});
 if(mode==="service")return <DeployModal {...props} modalProps={{serverId:props.modalProps?.serverId,portId}}/>;
 const save=async()=>{
  setError("");const number=Number(targetPort);
  if(!address.trim()||!Number.isInteger(number)||number<1||number>65535){setError("请填写目标地址和 1–65535 范围内的端口");return;}
  try {await configure({variables:{portId,remoteAddress:address.trim(),remotePort:number,protocol}});setSent(true);}
  catch(e){setError(e instanceof Error?e.message:"提交失败");}
 };
 const rule=data?.portForwardRule;
 return <ModalShell title="端口功能" onClose={props.close} footer={<><Button variant="outline" onClick={()=>{props.resolve?.(sent);props.close();}}>关闭</Button>{mode==="forward"&&<Button disabled={loading||!portId} onClick={save}>应用转发</Button>}</>}>
  {mode==="choose"?<div className="space-y-3"><p className="text-sm text-muted-foreground">选择此端口的用途。</p><Button className="w-full" onClick={()=>setMode("service")}>部署服务</Button><Button className="w-full" variant="outline" onClick={()=>setMode("forward")}>原生端口转发</Button></div>:<div className="space-y-4">
  <Button variant="ghost" onClick={()=>setMode("choose")}>返回</Button>
  <p className="text-sm text-muted-foreground">将此端口的连接转发到指定目标，支持 TCP、UDP 或两者。</p>
  <label className="block text-sm">目标地址<Input value={address} onChange={e=>setAddress(e.target.value)} placeholder="IP 地址或域名"/></label>
  <label className="block text-sm">目标端口<Input type="number" min={1} max={65535} value={targetPort} onChange={e=>setTargetPort(e.target.value)}/></label>
  <label className="block text-sm">转发协议<select aria-label="转发协议" className="mt-1 w-full rounded-md border bg-background p-2" value={protocol} onChange={e=>setProtocol(e.target.value)}><option value="ALL">TCP 和 UDP</option><option value="TCP">TCP</option><option value="UDP">UDP</option></select></label>
  {sent&&<p role="status">{rule?.status==="failed"?"转发执行失败，请检查任务日志":rule?.status==="success"||rule?.status==="running"?"转发已生效":"转发任务已提交，正在执行…"}</p>}
  {error&&<p role="alert" className="text-destructive">{error}</p>}
  </div>}
 </ModalShell>;
}

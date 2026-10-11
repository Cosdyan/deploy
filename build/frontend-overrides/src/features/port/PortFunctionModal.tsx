import DeployModal from "../deployment/DeployModal";
export default function PortFunctionModal(props: {modalProps?: {port?:{id:number};serverId?:number};close:()=>void;resolve?:(value:unknown)=>void}) {
 const modalProps=props.modalProps || {};
 return <DeployModal {...props} modalProps={{serverId:modalProps.serverId,portId:modalProps.port?.id}}/>;
}

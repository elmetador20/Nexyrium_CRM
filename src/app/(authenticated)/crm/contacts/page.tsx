import { WorkspaceRegister,type RegisterParams } from "@/features/crm/shared/WorkspaceRegister";
export const instant = false;
export default function Page({searchParams}:{searchParams:RegisterParams}) {return <WorkspaceRegister mode="contacts" searchParams={searchParams}/>;}

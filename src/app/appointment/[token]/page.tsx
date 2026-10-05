import type {Metadata} from "next";
import PublicAppointment from "../../PublicAppointment";
import "../../public-appointment.css";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Manage appointment · CommerceDesk",robots:{index:false,follow:false},referrer:"no-referrer"};
export default async function AppointmentManagePage({params}:{params:Promise<{token:string}>}){const{token}=await params;return <PublicAppointment token={token}/>}

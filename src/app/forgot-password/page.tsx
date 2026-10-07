import type {Metadata} from "next";
import ForgotPasswordForm from "./ForgotPasswordForm";
export const metadata:Metadata={title:"Forgot password — CommerceDesk",robots:{index:false,follow:false}};
export default function ForgotPasswordPage(){return <ForgotPasswordForm/>}

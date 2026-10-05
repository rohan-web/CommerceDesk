import type {Metadata} from "next";
import {notFound} from "next/navigation";
import Storefront from "./Storefront";
import {loadPublicStore} from "@/server/public-store";
export const dynamic="force-dynamic";
export async function generateMetadata({params}:{params:Promise<{slug:string}>}):Promise<Metadata>{const{slug}=await params;try{const store=await loadPublicStore(slug);return store?{title:`${store.name} · Shop`,description:store.description.slice(0,160)}:{title:"Store unavailable"}}catch{return{title:"Store unavailable"}}}
export default async function PublicStorePage({params}:{params:Promise<{slug:string}>}){const{slug}=await params;let store;try{store=await loadPublicStore(slug)}catch{return <main className="store-unavailable"><span>COMMERCE DESK</span><h1>Store temporarily unavailable</h1><p>Please try again in a moment.</p></main>}if(!store)notFound();return <Storefront store={store}/>}

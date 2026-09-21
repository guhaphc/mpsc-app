"use client";
import {useState,type FormEvent} from "react";
import {useRouter} from "next/navigation";
import {createClient} from "@/lib/supabase/client";

export default function RegistrationStatus(){
  const [identifier,setIdentifier]=useState(""),[message,setMessage]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  const router=useRouter();
  async function submit(e:FormEvent){
    e.preventDefault();setMessage("");setError("");setBusy(true);
    const {data,error}=await createClient().rpc("resolve_login_identifier",{identifier});
    setBusy(false);
    if(error||!data){setError("No registration could be found for this username or mobile number.");return;}
    setMessage("Registration found. Your application is under Admin review or has already been approved. Please use your login details to access the account.");
  }
  return <div className="authWrap"><div className="card"><div className="hero"><h1>Registration Status</h1><div className="muted">Check whether your username or mobile is registered.</div></div><form className="form" onSubmit={submit}><div><label className="label">Username or Mobile</label><input className="input" value={identifier} onChange={e=>setIdentifier(e.target.value)} required/></div>{message&&<div className="success">{message}</div>}{error&&<div className="error">{error}</div>}<button className="btn primary" disabled={busy}>{busy?"Checking…":"CHECK STATUS"}</button><button type="button" className="btn secondary" onClick={()=>router.push("/login")}>BACK TO LOGIN</button></form></div></div>;
}

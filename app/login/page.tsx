"use client";
import {useState,type FormEvent} from "react";
import {useRouter} from "next/navigation";
import {createClient} from "@/lib/supabase/client";

export default function Login(){
  const [identifier,setIdentifier]=useState(""),[password,setPassword]=useState(""),[show,setShow]=useState(false),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  const router=useRouter();
  async function submit(e:FormEvent){
    e.preventDefault();setError("");setBusy(true);
    const supabase=createClient();
    const {data:email,error:lookupError}=await supabase.rpc("resolve_login_identifier",{identifier});
    if(lookupError||!email){setError("Username or mobile number not found.");setBusy(false);return;}
    const {error:signInError}=await supabase.auth.signInWithPassword({email,password});
    if(signInError){setError("Invalid login details or account is not active.");setBusy(false);return;}
    router.push("/dashboard");router.refresh();
  }
  return <div className="authWrap"><div className="card"><div className="hero"><div className="brand" style={{justifyContent:"center"}}><div className="brandMark">MPSC</div></div><h1>MPSC ALL-IN-ONE</h1><div className="muted">Complete MPSC Preparation Platform</div></div><form className="form" onSubmit={submit}><div><label className="label">Username or Mobile</label><input className="input" value={identifier} onChange={e=>setIdentifier(e.target.value)} required/></div><div><label className="label">Password</label><div style={{display:"flex",gap:8}}><input className="input" type={show?"text":"password"} value={password} onChange={e=>setPassword(e.target.value)} required/><button type="button" className="btn secondary" onClick={()=>setShow(!show)}>{show?"Hide":"Show"}</button></div></div>{error&&<div className="error">{error}</div>}<button className="btn primary" disabled={busy}>{busy?"Logging in…":"LOGIN"}</button><button type="button" className="btn secondary" onClick={()=>router.push("/register")}>CREATE ACCOUNT</button><div className="authLinks"><button type="button" onClick={()=>router.push("/forgot-password")}>Forgot Password?</button><button type="button" onClick={()=>router.push("/registration-status")}>Check Registration Status</button></div></form></div></div>;
}

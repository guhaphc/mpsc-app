"use client";
import {useEffect,useState,type FormEvent} from "react";
import {useRouter} from "next/navigation";
import {createClient} from "@/lib/supabase/client";

export default function ResetPassword(){
  const [password,setPassword]=useState("");
  const [confirm,setConfirm]=useState("");
  const [ready,setReady]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const router=useRouter();

  useEffect(()=>{createClient().auth.getSession().then(({data})=>setReady(!!data.session));},[]);

  async function submit(e:FormEvent){
    e.preventDefault(); setError(""); setMessage("");
    if(password.length<8){setError("Password must be at least 8 characters.");return;}
    if(password!==confirm){setError("Passwords do not match.");return;}
    setBusy(true);
    const {error}=await createClient().auth.updateUser({password});
    setBusy(false);
    if(error){setError("The reset link is invalid or has expired.");return;}
    setMessage("Password changed successfully. You can now log in.");
    setTimeout(()=>router.push("/login"),1200);
  }

  return <div className="authWrap"><div className="card"><div className="hero"><h1>Set New Password</h1><div className="muted">Choose a new password for your account.</div></div>{!ready?<div className="form"><div className="error">Open this page from the password reset link sent to your email.</div><button className="btn secondary" onClick={()=>router.push("/login")}>BACK TO LOGIN</button></div>:<form className="form" onSubmit={submit}><div><label className="label">New Password</label><input className="input" type="password" minLength={8} value={password} onChange={e=>setPassword(e.target.value)} required/></div><div><label className="label">Confirm Password</label><input className="input" type="password" minLength={8} value={confirm} onChange={e=>setConfirm(e.target.value)} required/></div>{message&&<div className="success">{message}</div>}{error&&<div className="error">{error}</div>}<button className="btn primary" disabled={busy}>{busy?"Saving…":"CHANGE PASSWORD"}</button></form>}</div></div>;
}

"use client";
import {useState,type FormEvent} from "react";
import {useRouter} from "next/navigation";
import {createClient} from "@/lib/supabase/client";

export default function ForgotPassword(){
  const [email,setEmail]=useState("");
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const router=useRouter();

  async function submit(e:FormEvent){
    e.preventDefault();
    setError(""); setMessage(""); setBusy(true);
    const supabase=createClient();
    const redirectTo=window.location.origin+"/reset-password";
    const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo});
    setBusy(false);
    if(error){setError("Unable to send the reset link. Please check the email address and try again.");return;}
    setMessage("If an account uses this email address, a password reset link has been sent.");
  }

  return <div className="authWrap"><div className="card"><div className="hero"><div className="brand" style={{justifyContent:"center"}}><div className="brandMark">MPSC</div></div><h1>Forgot Password</h1><div className="muted">Enter the email registered with your account.</div></div><form className="form" onSubmit={submit}><div><label className="label">Email</label><input className="input" type="email" value={email} onChange={e=>setEmail(e.target.value)} required/></div>{message&&<div className="success">{message}</div>}{error&&<div className="error">{error}</div>}<button className="btn primary" disabled={busy}>{busy?"Sending…":"SEND RESET LINK"}</button><button type="button" className="btn secondary" onClick={()=>router.push("/login")}>BACK TO LOGIN</button></form></div></div>;
}

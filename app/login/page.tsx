"use client";
import {useState,type FormEvent} from "react";
import {useRouter} from "next/navigation";
import {createClient} from "@/lib/supabase/client";

export default function Login(){
 const [username,setUsername]=useState(""),[password,setPassword]=useState(""),[show,setShow]=useState(false),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 const router=useRouter();
 async function submit(e:FormEvent){
  e.preventDefault();setError("");setBusy(true);const supabase=createClient();const identifier=username.trim();
  const {data:status,error:statusError}=await supabase.rpc("get_login_account_status",{identifier});
  if(statusError||!status?.length){setError("Username not found.");setBusy(false);return;}
  const account=status[0];
  if(account.account_status==="pending"){setError("Your registration is pending Admin approval. You cannot login yet.");setBusy(false);return;}
  if(account.account_status==="rejected"){setError("Your registration has been rejected by the Admin. Please contact the administrator.");setBusy(false);return;}
  if(account.account_status==="blocked"){setError("Your account is permanently blocked from access. Please contact the administrator.");setBusy(false);return;}
  if(account.account_status==="disabled"){setError("Your account is currently disabled by the Admin.");setBusy(false);return;}
  const {data:email,error:lookupError}=await supabase.rpc("resolve_login_identifier",{identifier});
  if(lookupError||!email){setError("Username not found.");setBusy(false);return;}
  const {error:signInError}=await supabase.auth.signInWithPassword({email,password});
  if(signInError){setError("Invalid login details.");setBusy(false);return;}
  router.push("/dashboard");router.refresh();
 }
 return <main className="authWrap"><div className="authCard"><div className="hero"><img src="/mpsc-logo.png" className="authLogo" alt="MPSC ALL-IN-ONE"/><h1>Welcome Back</h1><div className="muted">Login to continue your MPSC preparation</div></div><form className="form" onSubmit={submit}>
 <div><label className="label" htmlFor="username">Username</label><input id="username" className="input" placeholder="Enter your username" value={username} onChange={e=>setUsername(e.target.value)} autoCapitalize="none" autoCorrect="off" autoComplete="username" required/></div>
 <div><label className="label" htmlFor="password">Password</label><div className="passwordRow"><input id="password" className="input" placeholder="Enter your password" type={show?"text":"password"} value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" required/><button type="button" className="passwordToggle" aria-label={show?"Hide password":"Show password"} onClick={()=>setShow(!show)}>{show?"Hide":"Show"}</button></div></div>
 <div className="authUtility"><button type="button" onClick={()=>router.push("/forgot-password")}>Forgot Password?</button></div>
 {error&&<div className="error" role="alert">{error}</div>}<button className="btn primary" disabled={busy}>{busy?"Logging in…":"LOGIN  →"}</button><div className="authDivider"><span>OR</span></div><button type="button" className="btn outline" onClick={()=>router.push("/register")}>CREATE NEW ACCOUNT</button><div className="authUtility center"><button type="button" onClick={()=>router.push("/registration-status")}>Check Registration Status</button></div>
 </form><div className="authFooter">LEARN  •  PRACTICE  •  ANALYSE  •  SUCCEED</div></div></main>;
}
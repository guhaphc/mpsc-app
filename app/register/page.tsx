"use client";
import {useState,type FormEvent} from "react";
import {useRouter} from "next/navigation";
import {createClient} from "@/lib/supabase/client";

type FormState={full_name:string;mobile:string;username:string;password:string;confirm:string;role:"student"|"teacher"};
export default function Register(){
 const [form,setForm]=useState<FormState>({full_name:"",mobile:"",username:"",password:"",confirm:"",role:"student"});
 const [error,setError]=useState("");const [done,setDone]=useState(false);const [busy,setBusy]=useState(false);const router=useRouter();
 function setField<K extends keyof FormState>(key:K,value:FormState[K]){setForm(f=>({...f,[key]:value}));}
 async function submit(e:FormEvent){
  e.preventDefault();setError("");
  const username=form.username.trim().toLowerCase(),mobile=form.mobile.trim();
  if(form.password!==form.confirm){setError("Passwords do not match.");return;}
  if(!/^[a-zA-Z0-9._-]{3,30}$/.test(username)){setError("Username must be 3–30 characters using letters, numbers, dot, underscore or hyphen.");return;}
  if(!/^\d{10}$/.test(mobile)){setError("Please enter a valid 10 digit mobile number.");return;}
  if(form.password.length<6){setError("Password must be at least 6 characters.");return;}
  setBusy(true);const supabase=createClient();
  const {data:blocked,error:blockedError}=await supabase.rpc("is_mobile_blocked",{identifier:mobile});
  if(blockedError){setError("Unable to verify registration details. Please try again.");setBusy(false);return;}
  if(blocked){setError("This mobile number is blocked from registration. Please contact the administrator.");setBusy(false);return;}
  const {data:existing,error:lookupError}=await supabase.rpc("resolve_login_identifier",{identifier:username});
  if(lookupError){setError("Unable to verify registration details. Please try again.");setBusy(false);return;}
  if(existing){setError("This username is already registered. Please choose another username.");setBusy(false);return;}
  const {data:mobileExisting,error:mobileLookupError}=await supabase.rpc("resolve_login_identifier",{identifier:mobile});
  if(mobileLookupError){setError("Unable to verify registration details. Please try again.");setBusy(false);return;}
  if(mobileExisting){setError("This mobile number is already registered. Please use another mobile number.");setBusy(false);return;}
  const internalEmail=`${username}@example.com`;
  const {error:signUpError}=await supabase.auth.signUp({email:internalEmail,password:form.password,options:{data:{full_name:form.full_name,mobile,username,role:form.role}}});
  if(signUpError){setError(signUpError.message.includes("Database error saving new user")?"This username or mobile number is already registered. Please check your details.":signUpError.message);setBusy(false);return;}
  setDone(true);setBusy(false);
 }
 const fields:[keyof FormState,string,string][]=[["full_name","Full Name","text"],["mobile","Mobile Number","tel"],["username","Username","text"]];
 return <main className="authWrap"><div className="authCard"><div className="hero"><img src="/mpsc-logo.png" className="authLogo" alt="MPSC ALL-IN-ONE"/><h1>Create Your Account</h1><div className="muted">Join the MPSC preparation platform</div></div>
 {done?<div className="form"><div className="success">Registration submitted successfully. Please wait for Admin approval.</div><button className="btn primary" onClick={()=>router.push("/login")}>BACK TO LOGIN</button></div>:
 <form className="form" onSubmit={submit}>
  <div><label className="label" htmlFor="role">Account Type</label><select id="role" className="select" value={form.role} onChange={e=>setField("role",e.target.value as FormState["role"])}><option value="student">Student</option><option value="teacher">Teacher</option></select></div>
  {fields.map(([key,label,type])=><div key={key}><label className="label" htmlFor={String(key)}>{label}</label><input id={String(key)} className="input" type={type} placeholder={label} value={form[key] as string} onChange={e=>setField(key,e.target.value)} required/></div>)}
  <div><label className="label" htmlFor="password">Password</label><input id="password" className="input" type="password" placeholder="Create a password" value={form.password} onChange={e=>setField("password",e.target.value)} autoComplete="new-password" required/></div>
  <div><label className="label" htmlFor="confirm">Confirm Password</label><input id="confirm" className="input" type="password" placeholder="Re-enter your password" value={form.confirm} onChange={e=>setField("confirm",e.target.value)} autoComplete="new-password" required/></div>
  {error&&<div className="error" role="alert">{error}</div>}<button className="btn primary" disabled={busy}>{busy?"Submitting…":"CREATE ACCOUNT  →"}</button><button type="button" className="btn outline" onClick={()=>router.push("/login")}>BACK TO LOGIN</button>
 </form>}</div></main>;
}
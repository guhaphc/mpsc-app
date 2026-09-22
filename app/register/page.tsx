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
   if(form.password!==form.confirm){setError("Passwords do not match.");return;}
   if(!/^[a-zA-Z0-9._-]{3,30}$/.test(form.username.trim())){setError("Username must be 3–30 characters using letters, numbers, dot, underscore or hyphen.");return;}
   if(!/^\d{10}$/.test(form.mobile.trim())){setError("Please enter a valid 10 digit mobile number.");return;}
   if(form.password.length<6){setError("Password must be at least 6 characters.");return;}
   setBusy(true);
   const supabase=createClient();
   const internalEmail=`${form.username.trim().toLowerCase()}@example.com`;
   const {error:signUpError}=await supabase.auth.signUp({email:internalEmail,password:form.password,options:{data:{full_name:form.full_name,mobile:form.mobile,username:form.username.trim().toLowerCase(),role:form.role}}});
   if(signUpError){setError(signUpError.message);setBusy(false);return;}
   setDone(true);setBusy(false);
 }
 const fields:[keyof FormState,string,string][]=[["full_name","Full Name","text"],["mobile","Mobile Number","tel"],["username","Username","text"]];
 return <div className="authWrap"><div className="authCard">
   <div className="hero"><img src="/mpsc-logo.svg" className="brandLogo authLogo" alt="MPSC ALL-IN-ONE"/><h1>Create your account</h1><div className="muted">Simple registration. No email required.</div></div>
   {done?<div className="form"><div className="success">Registration submitted successfully. Please wait for Admin approval.</div><button className="btn primary" onClick={()=>router.push("/login")}>BACK TO LOGIN</button></div>:
   <form className="form" onSubmit={submit}>
     <div><label className="label">Account Type</label><select className="select" value={form.role} onChange={e=>setField("role",e.target.value as FormState["role"])}><option value="student">Student</option><option value="teacher">Teacher</option></select></div>
     {fields.map(([key,label,type])=><div key={key}><label className="label">{label}</label><input className="input" type={type} placeholder={label} value={form[key] as string} onChange={e=>setField(key,e.target.value)} required/></div>)}
     <div><label className="label">Password</label><input className="input" type="password" placeholder="Create a password" value={form.password} onChange={e=>setField("password",e.target.value)} required/></div>
     <div><label className="label">Confirm Password</label><input className="input" type="password" placeholder="Re-enter password" value={form.confirm} onChange={e=>setField("confirm",e.target.value)} required/></div>
     {error&&<div className="error">{error}</div>}
     <button className="btn primary" disabled={busy}>{busy?"Submitting…":"CREATE ACCOUNT  →"}</button>
     <button type="button" className="btn outline" onClick={()=>router.push("/login")}>BACK TO LOGIN</button>
   </form>}
 </div></div>;
}

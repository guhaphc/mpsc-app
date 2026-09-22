"use client";
import {useState,type FormEvent} from "react";
import {useRouter} from "next/navigation";
import {createClient} from "@/lib/supabase/client";

type FormState={full_name:string;mobile:string;username:string;email:string;password:string;confirm:string;role:"student"|"teacher"};
export default function Register(){
 const [form,setForm]=useState<FormState>({full_name:"",mobile:"",username:"",email:"",password:"",confirm:"",role:"student"});const [error,setError]=useState("");const [done,setDone]=useState(false);const [busy,setBusy]=useState(false);const router=useRouter();
 function setField<K extends keyof FormState>(key:K,value:FormState[K]){setForm(f=>({...f,[key]:value}));}
 async function submit(e:FormEvent){e.preventDefault();setError("");if(form.password!==form.confirm){setError("Passwords do not match.");return;}setBusy(true);const supabase=createClient();const internalEmail=form.email.trim().toLowerCase();const {error:signUpError}=await supabase.auth.signUp({email:internalEmail,password:form.password,options:{data:{full_name:form.full_name,mobile:form.mobile,username:form.username,role:form.role}}});if(signUpError){setError(signUpError.message);setBusy(false);return;}setDone(true);setBusy(false);}
 const fields:[keyof FormState,string,string][]=[["full_name","Full Name","text"],["mobile","Mobile","tel"],["username","Username","text"],["email","Email (optional)","email"]];
 return <div className="authWrap"><div className="authCard"><div className="hero"><img src="/mpsc-logo.svg" className="brandLogo" style={{margin:"0 auto 12px"}} alt="MPSC ALL-IN-ONE"/><h1>Create your account</h1><div className="muted">Join the platform and build your preparation systematically.</div></div>
 {done?<div className="form"><div className="success">Registration submitted successfully. Please wait for Admin approval.</div><button className="btn primary" onClick={()=>router.push("/login")}>BACK TO LOGIN</button></div>:
 <form className="form" onSubmit={submit}><div><label className="label">Account Type</label><select className="select" value={form.role} onChange={e=>setField("role",e.target.value as FormState["role"])}><option value="student">Student</option><option value="teacher">Teacher</option></select></div>
 {fields.map(([key,label,type])=><div key={key}><label className="label">{label}</label><input className="input" type={type} placeholder={label.replace(" (optional)","")} value={form[key] as string} onChange={e=>setField(key,e.target.value)} required/></div>)}
 <div><label className="label">Password</label><input className="input" type="password" placeholder="Create a strong password" value={form.password} onChange={e=>setField("password",e.target.value)} required/></div>
 <div><label className="label">Confirm Password</label><input className="input" type="password" placeholder="Re-enter password" value={form.confirm} onChange={e=>setField("confirm",e.target.value)} required/></div>
 {error&&<div className="error">{error}</div>}<button className="btn primary" disabled={busy}>{busy?"Submitting…":"CREATE ACCOUNT  →"}</button><button type="button" className="btn outline" onClick={()=>router.push("/login")}>BACK TO LOGIN</button></form>}
 </div></div>;
}

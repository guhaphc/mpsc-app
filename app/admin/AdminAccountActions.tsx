"use client";
import {useState} from "react";
import {createClient} from "@/lib/supabase/client";

export default function AdminAccountActions({userId}:{userId:string}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const supabase=createClient();
 async function reset(){
   const password=window.prompt("Enter a new password (minimum 8 characters):");
   if(password===null)return;
   if(password.length<8){setMessage("Password must be at least 8 characters.");return;}
   const confirm=window.prompt("Re-enter the new password:");
   if(confirm!==password){setMessage("Passwords do not match.");return;}
   setBusy(true);setMessage("");
   const {error}=await supabase.functions.invoke("admin-account-actions",{body:{action:"reset_password",user_id:userId,password}});
   setBusy(false);setMessage(error?.message??"Password reset successfully.");
 }
 async function remove(){
   if(!window.confirm("Permanently delete this account? This cannot be undone."))return;
   if(!window.confirm("Confirm permanent deletion again."))return;
   setBusy(true);setMessage("");
   const {error}=await supabase.functions.invoke("admin-account-actions",{body:{action:"delete_user",user_id:userId}});
   if(error){setBusy(false);setMessage(error.message);return;}
   window.location.reload();
 }
 return <div className="actions">
   <button type="button" className="btn small secondary" onClick={reset} disabled={busy}>Reset Password</button>
   <button type="button" className="btn small danger" onClick={remove} disabled={busy}>Permanent Delete</button>
   {message&&<span className="muted">{message}</span>}
 </div>;
}

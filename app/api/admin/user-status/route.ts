import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";

const allowed=new Set(["pending","active","disabled","rejected","blocked"]);

export async function POST(request:Request){
 const supabase=await createClient();
 const {data:claimsData}=await supabase.auth.getClaims();
 if(!claimsData?.claims)return NextResponse.redirect(new URL("/login",request.url),303);
 const {data:admin}=await supabase.from("profiles").select("role").eq("id",claimsData.claims.sub).single();
 if(admin?.role!=="admin")return NextResponse.redirect(new URL("/dashboard",request.url),303);
 const form=await request.formData(),userId=String(form.get("user_id")||""),status=String(form.get("status")||"");
 if(!userId||!allowed.has(status)||userId===claimsData.claims.sub)return NextResponse.redirect(new URL("/admin",request.url),303);
 const {data:target,error:targetError}=await supabase.from("profiles").select("full_name,mobile,role").eq("id",userId).single();
 if(targetError||!target||!["student","teacher"].includes(target.role))return NextResponse.redirect(new URL("/admin?error=target",request.url),303);
 if(status==="blocked"){
   const {error:blockError}=await supabase.from("blocked_students").upsert({full_name:target.full_name,mobile:target.mobile,blocked_by:claimsData.claims.sub,reason:`Blocked by Admin (${target.role})`},{onConflict:"mobile"});
   if(blockError)return NextResponse.redirect(new URL("/admin?error=block",request.url),303);
 }
 const {error}=await supabase.from("profiles").update({account_status:status}).eq("id",userId);
 if(error)return NextResponse.redirect(new URL("/admin?error=update",request.url),303);
 await supabase.from("audit_logs").insert({actor_id:claimsData.claims.sub,action:status==="blocked"?`${target.role}_blocked`:"account_status_changed",target_type:"profile",target_id:userId,metadata:{status,role:target.role}});
 return NextResponse.redirect(new URL("/admin",request.url),303);
}

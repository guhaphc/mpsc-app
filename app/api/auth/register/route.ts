import {NextResponse} from "next/server";
import {createAdminClient} from "@/lib/supabase/admin";

export async function POST(req:Request){
  try{
    const body=await req.json();
    const full_name=String(body.full_name||"").trim();
    const mobile=String(body.mobile||"").trim();
    const username=String(body.username||"").trim().toLowerCase();
    const email=String(body.email||"").trim().toLowerCase();
    const password=String(body.password||"");
    const role=body.role==="teacher"?"teacher":"student";
    if(!full_name||!mobile||!username||!password) return NextResponse.json({error:"Please complete all required fields."},{status:400});
    if(!/^[a-z0-9._-]{3,30}$/.test(username)) return NextResponse.json({error:"Username must be 3–30 characters and use only letters, numbers, dot, underscore or hyphen."},{status:400});
    if(password.length<8) return NextResponse.json({error:"Password must be at least 8 characters."},{status:400});
    if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({error:"Please enter a valid email address."},{status:400});
    const internalEmail=email||`${username}@mpsc-all-in-one.com`;
    const admin=createAdminClient();
    const {data,error}=await admin.auth.admin.createUser({email:internalEmail,password,email_confirm:true,user_metadata:{full_name,mobile,username,role}});
    if(error) return NextResponse.json({error:error.message},{status:400});
    return NextResponse.json({ok:true,user_id:data.user?.id});
  }catch{
    return NextResponse.json({error:"Unable to submit registration right now. Please try again later."},{status:500});
  }
}

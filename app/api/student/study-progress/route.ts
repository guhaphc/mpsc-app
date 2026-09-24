import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";

export async function POST(request:Request){
 try{
  const supabase=await createClient();
  const {data}=await supabase.auth.getClaims();
  if(!data?.claims)return NextResponse.json({error:"Please login again."},{status:401});
  const {data:profile}=await supabase.from("profiles").select("id,role,account_status").eq("id",data.claims.sub).single();
  if(!profile||profile.role!=="student"||profile.account_status!=="active")return NextResponse.json({error:"Only active students can update reading progress."},{status:403});
  const b=await request.json();const topicId=String(b.topicId||"").trim();const completed=Boolean(b.completed);
  if(!topicId)return NextResponse.json({error:"Topic ID is required."},{status:400});
  const {data:topic}=await supabase.from("study_topics").select("id,subject_id,status").eq("id",topicId).eq("status","published").single();
  if(!topic)return NextResponse.json({error:"Published topic not found."},{status:404});
  if(completed){
   const {error}=await supabase.from("study_material_progress").upsert({user_id:profile.id,topic_id:topicId,completed_at:new Date().toISOString()},{onConflict:"user_id,topic_id"});
   if(error)throw new Error(error.message);
  }else{
   const {error}=await supabase.from("study_material_progress").delete().eq("user_id",profile.id).eq("topic_id",topicId);
   if(error)throw new Error(error.message);
  }
  return NextResponse.json({ok:true,completed});
 }catch(e:any){return NextResponse.json({error:e?.message||"Could not update reading progress."},{status:500});}
}
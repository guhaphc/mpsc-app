import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
export async function POST(req:Request){
 try{
  const s=await createClient();const {data}=await s.auth.getClaims();
  if(!data?.claims)return NextResponse.json({error:"Login required."},{status:401});
  const {data:p}=await s.from("profiles").select("id,role,account_status").eq("id",data.claims.sub).single();
  if(!p||p.role!=="teacher"||p.account_status!=="active")return NextResponse.json({error:"Only active teachers can publish."},{status:403});
  const b=await req.json(),topicId=String(b.topicId||""),action=String(b.action||"publish");
  const {data:topic,error}=await s.from("study_topics").select("id,subject_id,status").eq("id",topicId).single();
  if(error||!topic)throw new Error("Topic not found.");
  if(action==="unpublish"){
   await s.from("study_topics").update({status:"draft",updated_at:new Date().toISOString()}).eq("id",topicId);
   return NextResponse.json({ok:true,status:"draft"});
  }
  const {data:subject}=await s.from("study_subjects").select("id").eq("id",topic.subject_id).eq("content_area","teacher").single();
  if(!subject)throw new Error("Teacher study subject not found.");
  const {error:te}=await s.from("study_topics").update({status:"published",updated_at:new Date().toISOString()}).eq("id",topicId);
  if(te)throw te;
  const {error:se}=await s.from("study_subjects").update({status:"published",updated_at:new Date().toISOString()}).eq("id",topic.subject_id);
  if(se)throw se;
  return NextResponse.json({ok:true,status:"published"});
 }catch(e:any){return NextResponse.json({error:e?.message||"Could not publish."},{status:500});}
}
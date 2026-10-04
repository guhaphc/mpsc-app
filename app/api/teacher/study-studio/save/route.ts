import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";

const types=new Set(["heading","subheading","paragraph","bullet","numbered","callout"]);
function cleanBlocks(v:any){
 if(!Array.isArray(v))return [];
 return v.map((b:any)=>{
  const type=types.has(String(b?.type))?String(b.type):"paragraph";
  if(type==="bullet"||type==="numbered")return {type,items:Array.isArray(b.items)?b.items.map((x:any)=>String(x).trim()).filter(Boolean):[]};
  return {type,text:String(b?.text||"").trim()};
 }).filter((b:any)=>(b.type==="bullet"||b.type==="numbered")?b.items.length:!!b.text);
}
export async function POST(req:Request){
 try{
  const s=await createClient();const {data}=await s.auth.getClaims();
  if(!data?.claims)return NextResponse.json({error:"Login required."},{status:401});
  const {data:p}=await s.from("profiles").select("id,role,account_status").eq("id",data.claims.sub).single();
  if(!p||p.role!=="teacher"||p.account_status!=="active")return NextResponse.json({error:"Only active teachers can edit."},{status:403});
  const b=await req.json(),topicId=String(b.topicId||"");
  const title=String(b.title||"").trim(),notes=String(b.notes||"");
  if(!topicId||!title)return NextResponse.json({error:"Topic and title are required."},{status:400});
  const blocks=cleanBlocks(b.content_blocks);
  const {data:topic,error}=await s.from("study_topics").update({title,notes,content_blocks:blocks,status:"draft",updated_at:new Date().toISOString()}).eq("id",topicId).select("id,title,notes,content_blocks,status").single();
  if(error||!topic)throw new Error(error?.message||"Could not save draft.");
  return NextResponse.json({ok:true,topic});
 }catch(e:any){return NextResponse.json({error:e?.message||"Could not save draft."},{status:500});}
}
import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";

const allowed=new Set(["heading","subheading","paragraph","bullet","numbered","callout","table","rich"]);
function cleanBlocks(v:any){
 if(!Array.isArray(v))return [];
 return v.map((b:any)=>{
  const type=allowed.has(String(b?.type))?String(b.type):"paragraph";
  if(type==="rich")return {type,html:String(b?.html||"")};
  if(type==="table")return {type,columns:Array.isArray(b.columns)?b.columns.map(String):[],rows:Array.isArray(b.rows)?b.rows.map((r:any)=>Array.isArray(r)?r.map(String):[]):[]};
  if(type==="bullet"||type==="numbered")return {type,items:Array.isArray(b.items)?b.items.map(String):[]};
  return {type,text:String(b?.text||"")};
 });
}
export async function POST(req:Request){
 try{
  const s=await createClient();
  const {data}=await s.auth.getClaims();
  if(!data?.claims)return NextResponse.json({error:"Login required."},{status:401});
  const {data:p}=await s.from("profiles").select("id,role,account_status").eq("id",data.claims.sub).single();
  if(!p||p.role!=="teacher"||p.account_status!=="active")return NextResponse.json({error:"Only active teachers can edit notes."},{status:403});
  const b=await req.json(),noteId=String(b.noteId||"");
  if(!noteId)return NextResponse.json({error:"Note is required."},{status:400});
  const {data:n,error:ne}=await s.from("ai_study_note_versions").select("id,node_id,status").eq("id",noteId).single();
  if(ne||!n)return NextResponse.json({error:"Note not found."},{status:404});
  if(n.status!=="draft")return NextResponse.json({error:"Only draft notes can be edited. Unpublish a published note first."},{status:409});
  const title=String(b.title||"").trim();
  if(!title)return NextResponse.json({error:"Note title is required."},{status:400});
  const {data:saved,error}=await s.from("ai_study_note_versions").update({
   title,overview:String(b.overview||""),content_blocks:cleanBlocks(b.content_blocks),keywords:Array.isArray(b.keywords)?b.keywords:[],generation_type:"manual",updated_at:new Date().toISOString()
  }).eq("id",noteId).select("id,node_id,version_no,status,title,overview,content_blocks,keywords,created_at,updated_at").single();
  if(error||!saved)throw new Error(error?.message||"Could not save draft.");
  return NextResponse.json({ok:true,note:saved});
 }catch(e:any){return NextResponse.json({error:e?.message||"Could not save draft."},{status:500});}
}

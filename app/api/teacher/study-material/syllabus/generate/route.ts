import {NextResponse} from "next/server";
import {GoogleGenAI} from "@google/genai";
import {createClient} from "@/lib/supabase/server";

export const runtime="nodejs";
export const maxDuration=300;

function blocks(v:any){
 if(!Array.isArray(v))return [];
 return v.map((b:any)=>{
  const t=["heading","subheading","paragraph","bullet","numbered","callout","table"].includes(String(b?.type))?String(b.type):"paragraph";
  if(t==="table")return {type:t,columns:Array.isArray(b.columns)?b.columns.map(String):[],rows:Array.isArray(b.rows)?b.rows.map((r:any)=>Array.isArray(r)?r.map(String):[]):[]};
  if(t==="bullet"||t==="numbered")return {type:t,items:Array.isArray(b.items)?b.items.map(String).filter(Boolean):[]};
  return {type:t,text:String(b?.text||"").trim()};
 }).filter((b:any)=>b.type==="table"?b.columns.length&&b.rows.length:(b.type==="bullet"||b.type==="numbered")?b.items.length:b.text);
}

async function getPath(s:any,node:any){
 const path:string[]=[];let cur:any=node;
 while(cur){
  path.unshift(cur.title);
  if(!cur.parent_id)break;
  const {data}=await s.from("ai_study_syllabus_nodes").select("id,title,parent_id").eq("id",cur.parent_id).single();
  cur=data;
 }
 return path;
}

export async function POST(req:Request){
 try{
  const s=await createClient();
  const {data}=await s.auth.getClaims();
  if(!data?.claims)return NextResponse.json({error:"Please login again."},{status:401});
  const {data:p}=await s.from("profiles").select("id,role,account_status").eq("id",data.claims.sub).single();
  if(!p||p.role!=="teacher"||p.account_status!=="active")return NextResponse.json({error:"Only active teachers can generate notes."},{status:403});
  const key=process.env.GEMINI_API_KEY;
  if(!key)return NextResponse.json({error:"AI service is not configured."},{status:503});

  const f=await req.json();
  const nodeId=String(f.nodeId||"");
  const mode=String(f.mode||"generate");
  if(!nodeId)return NextResponse.json({error:"Syllabus node is required."},{status:400});

  const {data:node,error:ne}=await s.from("ai_study_syllabus_nodes").select("id,title,parent_id,depth,source_page,source_id,is_leaf").eq("id",nodeId).single();
  if(ne||!node||!node.is_leaf)return NextResponse.json({error:"Only a final syllabus topic can have a note."},{status:400});

  const {data:src,error:se}=await s.from("ai_study_syllabus_sources").select("id,name,exam,academic_year").eq("id",node.source_id).single();
  if(se||!src)throw new Error("Syllabus source is not available.");

  const path=await getPath(s,node);
  const model=process.env.GEMINI_NOTES_MODEL||"gemini-3.5-flash-lite";
  const ai=new GoogleGenAI({apiKey:key});
  const prompt=`Create comprehensive UPSC/MPSC-style study notes for ONE exact final syllabus topic.

Syllabus source: ${src.name}
Exam: ${src.exam}
Academic year: ${src.academic_year}
Exact syllabus path: ${path.join(" > ")}
Final topic: ${node.title}

This is a detailed teaching-note task, NOT a short summary. Use your internal knowledge only; do not browse the internet and do not invent unsupported facts. Cover the exact topic comprehensively and organize it for serious competitive-exam preparation. Include definitions, concepts, classifications, chronology where relevant, causes, features, processes, examples, important facts, comparisons, implications, India-specific aspects, and exam-oriented analytical points when genuinely relevant. Do not add unrelated syllabus areas. Use clean headings, subheadings, paragraphs, bullet/numbered lists, tables and callouts semantically. Also return an important keyword list. Return ONLY JSON: {"title":"...","overview":"...","content_blocks":[...],"keywords":[{"term":"...","importance":"high|medium"}]}.`;

  const r=await ai.models.generateContent({model,contents:prompt,config:{responseMimeType:"application/json",maxOutputTokens:50000}});
  let parsed:any;
  try{parsed=JSON.parse((r.text||"").trim())}catch{throw new Error("AI returned invalid note JSON.");}

  const {data:last}=await s.from("ai_study_note_versions").select("version_no").eq("node_id",nodeId).order("version_no",{ascending:false}).limit(1).maybeSingle();
  const version=Number(last?.version_no||0)+1;
  const keywords=Array.isArray(parsed.keywords)?parsed.keywords.filter((k:any)=>k?.term).map((k:any)=>({term:String(k.term),importance:String(k.importance||"medium")})):[];

  const {data:saved,error:saveErr}=await s.from("ai_study_note_versions").insert({
   node_id:nodeId,version_no:version,status:"draft",title:String(parsed.title||node.title),overview:String(parsed.overview||""),
   content_blocks:blocks(parsed.content_blocks),keywords,generation_type:mode==="regenerate"?"regenerate":"generate",
   ai_model:model,created_by:p.id,source_context:{source:src.name,exam:src.exam,academic_year:src.academic_year,path,page:node.source_page}
  }).select("id,node_id,version_no,status,title,overview,content_blocks,keywords,created_at").single();

  if(saveErr||!saved)throw new Error(saveErr?.message||"Could not save note draft.");
  const u:any=(r as any).usageMetadata||{};
  await s.from("ai_study_generation_logs").insert({
   node_id:nodeId,note_version_id:saved.id,user_id:p.id,operation:mode==="regenerate"?"regenerate":"generate",model,status:"completed",
   input_tokens:Number(u.promptTokenCount||0)||null,output_tokens:Number(u.candidatesTokenCount||0)||null,total_tokens:Number(u.totalTokenCount||0)||null,completed_at:new Date().toISOString()
  });
  return NextResponse.json({ok:true,note:saved});
 }catch(e:any){return NextResponse.json({error:e?.message||"Could not generate note."},{status:500});}
}

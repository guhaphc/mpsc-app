import {NextResponse} from "next/server";
import {GoogleGenAI} from "@google/genai";
import {createClient} from "@/lib/supabase/server";

export const runtime="nodejs";
export const maxDuration=300;

function blocks(v:any){
 if(!Array.isArray(v)) return [];
 return v.map((b:any)=>{
  const type=["heading","subheading","paragraph","bullet","numbered","callout","table"].includes(String(b?.type))?String(b.type):"paragraph";
  if(type==="table") return {type,columns:Array.isArray(b.columns)?b.columns.map(String):[],rows:Array.isArray(b.rows)?b.rows.map((r:any)=>Array.isArray(r)?r.map(String):[]):[]};
  if(type==="bullet"||type==="numbered") return {type,items:Array.isArray(b.items)?b.items.map(String).filter(Boolean):[]};
  return {type,text:String(b?.text||"").trim()};
 }).filter((b:any)=>b.type==="table"?b.columns.length&&b.rows.length:(b.type==="bullet"||b.type==="numbered")?b.items.length:b.text);
}
async function pathOf(s:any,node:any){
 const out:string[]=[]; let cur:any=node;
 while(cur){out.unshift(cur.title);if(!cur.parent_id)break;const {data}=await s.from("ai_study_syllabus_nodes").select("id,title,parent_id").eq("id",cur.parent_id).single();cur=data;}
 return out;
}
export async function POST(req:Request){
 try{
  const s=await createClient(); const {data}=await s.auth.getClaims();
  if(!data?.claims) return NextResponse.json({error:"Login required."},{status:401});
  const {data:p}=await s.from("profiles").select("id,role,account_status").eq("id",data.claims.sub).single();
  if(!p||p.role!=="teacher"||p.account_status!=="active") return NextResponse.json({error:"Only active teachers can create notes."},{status:403});
  const key=process.env.GEMINI_API_KEY; if(!key)return NextResponse.json({error:"AI service is not configured."},{status:503});
  const b=await req.json(); const nodeId=String(b.nodeId||""), sourceType=String(b.sourceType||"paste"), sourceText=String(b.text||"").trim();
  if(!nodeId||!sourceText)return NextResponse.json({error:"Topic and source text are required."},{status:400});
  if(sourceText.length>200000)return NextResponse.json({error:"Text is too large. Please use a smaller source."},{status:400});
  const {data:node,error:ne}=await s.from("ai_study_syllabus_nodes").select("id,title,parent_id,source_page,source_id,is_leaf").eq("id",nodeId).single();
  if(ne||!node||!node.is_leaf)return NextResponse.json({error:"Only a final syllabus topic can have a note."},{status:400});
  const {data:src}=await s.from("ai_study_syllabus_sources").select("id,name,exam,academic_year").eq("id",node.source_id).single();
  const path=await pathOf(s,node);
  const ai=new GoogleGenAI({apiKey:key});
  const prompt=`Format the supplied source into a clean, comprehensive academic study note for the exact syllabus topic below.

EXACT TOPIC PATH: ${path.join(" > ")}
TOPIC: ${node.title}
SOURCE METHOD: ${sourceType}

STRICT RULES:
- Preserve ALL factual information, dates, names, numbers, examples and meaning from the supplied source.
- Do NOT summarize, shorten, expand with your own knowledge, correct facts, or add unrelated information.
- Only organize the supplied material into readable headings, subheadings, paragraphs, bullet/numbered lists, callouts and tables where clearly appropriate.
- Do not invent missing information.
- Return ONLY JSON in this shape:
{"title":"...","overview":"...","content_blocks":[{"type":"heading|subheading|paragraph|bullet|numbered|callout|table","text":"..."},{"type":"bullet","items":["..."]},{"type":"table","columns":["..."],"rows":[["..."]]}]}

SOURCE:
${sourceText}`;
  const r=await ai.models.generateContent({model:process.env.GEMINI_NOTES_MODEL||"gemini-3.5-flash-lite",contents:prompt,config:{responseMimeType:"application/json",maxOutputTokens:50000}});
  let parsed:any; try{parsed=JSON.parse((r.text||"").trim())}catch{throw new Error("AI returned invalid formatted note JSON.");}
  const {data:last}=await s.from("ai_study_note_versions").select("version_no").eq("node_id",nodeId).order("version_no",{ascending:false}).limit(1).maybeSingle();
  const version=Number(last?.version_no||0)+1;
  const {data:saved,error}=await s.from("ai_study_note_versions").insert({
   node_id:nodeId,version_no:version,status:"draft",title:String(parsed.title||node.title),overview:String(parsed.overview||""),
   content_blocks:blocks(parsed.content_blocks),keywords:[],generation_type:"format",ai_model:process.env.GEMINI_NOTES_MODEL||"gemini-3.5-flash-lite",
   created_by:p.id,source_context:{source:src?.name||"",exam:src?.exam||"",academic_year:src?.academic_year||"",path,page:node.source_page,source_type:sourceType}
  }).select("id,node_id,version_no,status,title,overview,content_blocks,keywords,created_at").single();
  if(error||!saved)throw new Error(error?.message||"Could not save formatted draft.");
  const u:any=(r as any).usageMetadata||{};
  await s.from("ai_study_generation_logs").insert({node_id:nodeId,note_version_id:saved.id,user_id:p.id,operation:"format",model:process.env.GEMINI_NOTES_MODEL||"gemini-3.5-flash-lite",status:"completed",input_tokens:Number(u.promptTokenCount||0)||null,output_tokens:Number(u.candidatesTokenCount||0)||null,total_tokens:Number(u.totalTokenCount||0)||null,completed_at:new Date().toISOString()});
  return NextResponse.json({ok:true,note:saved});
 }catch(e:any){return NextResponse.json({error:e?.message||"Could not format note."},{status:500});}
}
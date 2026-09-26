import {NextResponse} from "next/server";
import {GoogleGenAI,createPartFromUri,createUserContent} from "@google/genai";
import {createClient} from "@/lib/supabase/server";
export const runtime="nodejs";export const maxDuration=300;
function clean(v:any){return String(v||"").replace(/\\s+/g," ").trim();}
async function upload(ai:any,file:File){const u=await ai.files.upload({file,config:{displayName:file.name,mimeType:file.type||"application/pdf"}});let x=u;for(let i=0;i<60&&String(x.state)==="PROCESSING";i++){await new Promise(r=>setTimeout(r,1500));x=await ai.files.get({name:u.name!});}if(String(x.state)==="FAILED"||!x.uri||!x.mimeType)throw new Error("Gemini could not process the PDF.");return x;}
export async function POST(req:Request){
 try{
  const s=await createClient();const {data}=await s.auth.getClaims();if(!data?.claims)return NextResponse.json({error:"Please login again."},{status:401});
  const {data:p}=await s.from("profiles").select("id,role,account_status").eq("id",data.claims.sub).single();if(!p||p.role!=="teacher"||p.account_status!=="active")return NextResponse.json({error:"Only active teachers can import the syllabus."},{status:403});
  const key=process.env.GEMINI_API_KEY;if(!key)return NextResponse.json({error:"AI service is not configured."},{status:503});
  const f=(await req.formData()).get("file");if(!(f instanceof File))return NextResponse.json({error:"PDF is required."},{status:400});if(f.size>50*1024*1024)return NextResponse.json({error:"PDF must be 50 MB or smaller."},{status:400});
  const storagePath=p.id+"/"+crypto.randomUUID()+"-"+f.name.replace(/[^a-zA-Z0-9._-]/g,"_");const {error:storageError}=await s.storage.from("ai-study-syllabus").upload(storagePath,f,{contentType:"application/pdf",upsert:false});if(storageError)throw new Error("Could not store the syllabus PDF: "+storageError.message);const ai=new GoogleGenAI({apiKey:key});const ref=await upload(ai,f);
  const prompt=`Read the ENTIRE uploaded syllabus PDF and reconstruct its hierarchy exactly as printed. This is an INDEXING task, not a notes task. Preserve source wording, order and all distinct entries. Do not summarize, merge, invent, correct or omit entries. Detect every hierarchy level present; the hierarchy may be deeper than four levels. Return ONLY JSON: {"source_title":"...","nodes":[{"path":["Subject","Section","Topic","Subtopic","Micro-topic"],"title":"exact source title","page":1,"level":1,"leaf":true}]} . Use one node record for EVERY printed syllabus entry, including intermediate headings. "level" is the source hierarchy level starting at 1 under the subject. "path" contains the exact ancestor titles. A leaf is an entry that has no children in the printed hierarchy. If an entry wraps across lines, join the lines without changing words. Do not include headers, footers, page numbers, logos or website text.`;
  const r=await ai.models.generateContent({model:process.env.GEMINI_SYLLABUS_MODEL||process.env.GEMINI_NOTES_MODEL||"gemini-3.5-flash-lite",contents:createUserContent([createPartFromUri(ref.uri,ref.mimeType),{text:prompt}]),config:{responseMimeType:"application/json",maxOutputTokens:50000}});
  let parsed:any;try{parsed=JSON.parse((r.text||"").trim())}catch{throw new Error("Gemini returned invalid syllabus JSON.");}
  const sourceTitle=clean(parsed.source_title)||f.name;const list=Array.isArray(parsed.nodes)?parsed.nodes:[];
  if(!list.length)throw new Error("No syllabus entries were detected.");
  const {data:src,error:srcErr}=await s.from("ai_study_syllabus_sources").insert({name:sourceTitle,exam:"UPSC",academic_year:"2026-27",source_file_name:f.name,source_pages:84,storage_path:storagePath,status:"active",created_by:p.id}).select("id").single();if(srcErr||!src)throw new Error(srcErr?.message||"Could not create syllabus source.");
  const sourceId=src.id;const rootId=crypto.randomUUID();const rows:any[]=[{id:rootId,source_id:sourceId,parent_id:null,node_type:"root",title:sourceTitle,depth:0,source_page:1,source_order:0,is_leaf:false,status:"active"}];
  const parentByPath=new Map<string,string>();const nodeType=(level:number,leaf:boolean)=>leaf?"micro_topic":level===1?"topic":level===2?"subtopic":"micro_detail";
  let order=1;
  for(const item of list){
   const path=(Array.isArray(item.path)?item.path.map(clean).filter(Boolean):[]);if(!path.length)continue;
   const title=clean(item.title)||path[path.length-1];const level=Math.max(1,Number(item.level)||path.length);const parentPath=path.slice(0,-1).join("\u001f");const parent=parentByPath.get(parentPath)||rootId;const id=crypto.randomUUID();
   rows.push({id,source_id:sourceId,parent_id:parent,node_type:nodeType(level,Boolean(item.leaf)),title,depth:level,source_page:Math.max(1,Number(item.page)||1),source_order:order++,is_leaf:Boolean(item.leaf),status:"active"});parentByPath.set(path.join("\u001f"),id);
  }
  // Remove an older active import of the same source filename before installing the new tree.
  const {data:old}=await s.from("ai_study_syllabus_sources").select("id").eq("source_file_name",f.name).eq("status","active");
  for(const x of old||[])if(x.id!==sourceId)await s.from("ai_study_syllabus_sources").update({status:"archived",updated_at:new Date().toISOString()}).eq("id",x.id);
  for(let i=0;i<rows.length;i+=500){const {error}=await s.from("ai_study_syllabus_nodes").insert(rows.slice(i,i+500));if(error)throw new Error(error.message);}
  return NextResponse.json({ok:true,nodes:rows.length-1,sourceId});
 }catch(e:any){return NextResponse.json({error:e?.message||"Syllabus import failed."},{status:500});}
}
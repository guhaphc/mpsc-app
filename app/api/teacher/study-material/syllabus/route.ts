import {NextResponse} from "next/server";
import {GoogleGenAI,createPartFromUri,createUserContent} from "@google/genai";
import {createClient} from "@/lib/supabase/server";
export const runtime="nodejs";export const maxDuration=300;

function clean(v:any){return String(v??"").replace(/\s+/g," ").trim();}
async function upload(ai:any,file:File){const u=await ai.files.upload({file,config:{displayName:file.name,mimeType:"application/pdf"}});let x=u;for(let i=0;i<60&&String(x.state)==="PROCESSING";i++){await new Promise(r=>setTimeout(r,1000));x=await ai.files.get({name:u.name!});}if(String(x.state)==="FAILED"||!x.uri||!x.mimeType)throw new Error("Gemini could not process the PDF.");return x;}

const schema={type:"object",properties:{source_title:{type:"string"},nodes:{type:"array",items:{type:"object",properties:{path:{type:"array",items:{type:"string"}},page:{type:"integer"},leaf:{type:"boolean"}},required:["path","page","leaf"]}}},required:["source_title","nodes"]};

async function extractChunk(ai:any,ref:any,start:number,end:number,previousPath:string[]){
 const prompt="You are indexing an authoritative syllabus PDF. Extract EVERY distinct syllabus entry printed on PDF pages "+start+" through "+end+" inclusive. Do not summarize, merge, correct, invent or omit entries. Preserve exact wording and printed hierarchy. Return one node for every printed hierarchy entry, including headings. For every node return its COMPLETE hierarchy path from the top-level subject down to that entry. If a parent heading is not printed on the current page range but is needed to complete the path, use the supplied previous context only; never invent a new heading. Mark leaf=true only when that entry has no child entry in the source. Ignore headers, footers, page numbers, logos and website text. If a line wraps, join it without changing words. Previous context from the end of the preceding chunk: "+JSON.stringify(previousPath)+" . Return ONLY the required JSON schema. Pages are PDF page numbers.";
 const r=await ai.models.generateContent({model:"gemini-3.5-flash-lite",contents:createUserContent([createPartFromUri(ref.uri,ref.mimeType),{text:prompt}]),config:{responseMimeType:"application/json",responseSchema:schema as any,maxOutputTokens:30000}});
 let parsed:any;try{parsed=JSON.parse(String(r.text||"").trim())}catch{throw new Error("Gemini returned invalid JSON while indexing PDF pages "+start+"-"+end+".");}
 return parsed;
}

export async function POST(req:Request){
 try{
  const s=await createClient();const {data}=await s.auth.getClaims();if(!data?.claims)return NextResponse.json({error:"Please login again."},{status:401});
  const {data:p}=await s.from("profiles").select("id,role,account_status").eq("id",data.claims.sub).single();if(!p||p.role!=="teacher"||p.account_status!=="active")return NextResponse.json({error:"Only active teachers can import the syllabus."},{status:403});
  const key=process.env.GEMINI_API_KEY;if(!key)return NextResponse.json({error:"AI service is not configured."},{status:503});
  const f=(await req.formData()).get("file");if(!(f instanceof File))return NextResponse.json({error:"PDF is required."},{status:400});if(f.size>50*1024*1024)return NextResponse.json({error:"PDF must be 50 MB or smaller."},{status:400});
  const storagePath=p.id+"/"+crypto.randomUUID()+"-"+f.name.replace(/[^a-zA-Z0-9._-]/g,"_");
  const {error:storageError}=await s.storage.from("ai-study-syllabus").upload(storagePath,f,{contentType:"application/pdf",upsert:false});if(storageError)throw new Error("Could not store the syllabus PDF: "+storageError.message);
  const ai=new GoogleGenAI({apiKey:key});const ref=await upload(ai,f);
  const chunks:number[][]=[];for(let start=1;start<=84;start+=9)chunks.push([start,Math.min(start+8,84)]);
  const all:any[]=[];let previousPath:string[]=[];
  for(const [start,end] of chunks){const parsed=await extractChunk(ai,ref,start,end,previousPath);if(!Array.isArray(parsed.nodes))throw new Error("Invalid syllabus result for pages "+start+"-"+end+".");for(const n of parsed.nodes){const path=Array.isArray(n.path)?n.path.map(clean).filter(Boolean):[];if(path.length)all.push({path,page:Math.max(1,Number(n.page)||start),leaf:Boolean(n.leaf)});}const last=all[all.length-1];if(last)previousPath=last.path;}
  if(!all.length)throw new Error("No syllabus entries were detected.");
  const seen=new Set<string>();const list=all.filter(n=>{const k=n.path.join("\u001f");if(seen.has(k))return false;seen.add(k);return true;});
  const sourceTitle=clean(list[0]?.path?.[0])||f.name;
  const {data:src,error:srcErr}=await s.from("ai_study_syllabus_sources").insert({name:sourceTitle,exam:"UPSC",academic_year:"2026-27",source_file_name:f.name,source_pages:84,storage_path:storagePath,status:"active",created_by:p.id}).select("id").single();if(srcErr)throw new Error(srcErr.message||"Could not create syllabus source.");if(!src?.id)throw new Error("Could not create syllabus source.");
  const sourceId=src.id;const rootId=crypto.randomUUID();const rows:any[]=[{id:rootId,source_id:sourceId,parent_id:null,node_type:"root",title:sourceTitle,depth:0,source_page:1,source_order:0,is_leaf:false,status:"active"}];
  const parentByPath=new Map<string,string>();parentByPath.set(sourceTitle,rootId);
  let order=1;
  for(const item of list){
   const path=item.path;if(!path.length)continue;
   const title=path[path.length-1];const level=path.length-1;const parentPath=path.slice(0,-1).join("\u001f");const parent=parentByPath.get(parentPath)||rootId;const keyPath=path.join("\u001f");if(parentByPath.has(keyPath))continue;
   const id=crypto.randomUUID();const node_type=item.leaf?"micro_topic":level<=1?"topic":level===2?"subtopic":"micro_detail";
   rows.push({id,source_id:sourceId,parent_id:parent,title,depth:level,node_type,source_page:item.page,source_order:order++,is_leaf:item.leaf,status:"active"});parentByPath.set(keyPath,id);
  }
  const oldResult=await s.from("ai_study_syllabus_sources").select("id").eq("source_file_name",f.name).eq("status","active");const oldRows=oldResult.data??[];for(const x of oldRows){const oldId=x?.id;if(oldId&&oldId!==sourceId){await s.from("ai_study_syllabus_sources").update({status:"archived",updated_at:new Date().toISOString()}).eq("id",oldId);}}
  for(let i=0;i<rows.length;i+=500){const {error}=await s.from("ai_study_syllabus_nodes").insert(rows.slice(i,i+500));if(error)throw new Error(error.message);}
  return NextResponse.json({ok:true,nodes:rows.length-1,sourceId,duplicatesRemoved:all.length-list.length});
 }catch(e:any){return NextResponse.json({error:e?.message||"Syllabus import failed."},{status:500});}
}
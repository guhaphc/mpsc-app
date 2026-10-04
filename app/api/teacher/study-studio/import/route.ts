import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";

export const runtime="nodejs";
export const maxDuration=300;

type Block={type:"heading"|"subheading"|"paragraph"|"bullet"|"numbered"|"callout";text?:string;items?:string[]};

function clean(v:unknown){return String(v??"").replace(/[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F-\\u009F]/g,"").replace(/\\s+/g," ").trim();}

async function extractPdf(bytes:Buffer):Promise<Block[]>{
 const pdf2json=await import("pdf2json");
 const PDFParser=(pdf2json as any).PDFParser ?? (pdf2json as any).default;
 if(!PDFParser)throw new Error("PDF parser is unavailable.");
 const parser=new PDFParser();
 const data:any=await new Promise((resolve,reject)=>{
  parser.on("pdfParser_dataReady",(d:any)=>resolve(d));
  parser.on("pdfParser_dataError",(e:any)=>reject(e?.parserError||e));
  parser.parseBuffer(bytes);
 });
 const pages=data?.Pages||[];
 if(!pages.length)throw new Error("The PDF contains no readable pages.");
 const blocks:Block[]=[];
 pages.forEach((page:any,pageIndex:number)=>{
  blocks.push({type:"heading",text:"Page "+(pageIndex+1)});
  const items=(page.Texts||[]).flatMap((t:any)=>{
   let text=""; for(const r of (t.R||[])) text+=String(r.T||"");
   return [{text:decodeURIComponent(text),x:Number(t.x||0),y:Number(t.y||0)}];
  }).filter((x:any)=>clean(x.text)&&!/www\\./i.test(x.text));
  const lines:{y:number,parts:{text:string,x:number}[]}[]=[];
  for(const item of items.sort((a:any,b:any)=>a.y-b.y||a.x-b.x)){
   const last=lines[lines.length-1];
   if(!last||Math.abs(last.y-item.y)>0.35)lines.push({y:item.y,parts:[item]});
   else last.parts.push(item);
  }
  for(const line of lines){
   const text=clean(line.parts.sort((a,b)=>a.x-b.x).map(x=>x.text).join(" "));
   if(!text)continue;
   if(/^(•|-|\\u2022)\\s+/.test(text))blocks.push({type:"bullet",items:[text.replace(/^(•|-)\\s+/,"").trim()]});
   else blocks.push({type:"paragraph",text});
  }
 });
 return blocks;
}

export async function POST(req:Request){
 try{
  const s=await createClient(); const {data}=await s.auth.getClaims();
  if(!data?.claims)return NextResponse.json({error:"Login required."},{status:401});
  const {data:p}=await s.from("profiles").select("id,role,account_status").eq("id",data.claims.sub).single();
  if(!p||p.role!=="teacher"||p.account_status!=="active")return NextResponse.json({error:"Only active teachers can use Study Material Studio."},{status:403});

  const form=await req.formData();
  const subject=String(form.get("subject")||"").trim();
  const stage=String(form.get("stage")||"Mains").trim();
  const paper=String(form.get("paper")||"GS Paper IV").trim();
  const topicTitle=String(form.get("topicTitle")||"").trim();
  const sourcePath=String(form.get("sourcePath")||"").trim();
  const sourceName=String(form.get("sourceName")||"").trim();
  if(!subject||!topicTitle||!sourcePath)return NextResponse.json({error:"Subject, topic and uploaded PDF are required."},{status:400});

  const file=await s.storage.from("study-sources").download(sourcePath);
  if(file.error||!file.data)throw new Error(file.error?.message||"Could not read uploaded PDF.");
  const bytes=Buffer.from(await file.data.arrayBuffer());
  if(bytes.length>50*1024*1024)throw new Error("PDF must be 50 MB or smaller.");
  const blocks=await extractPdf(bytes);

  // Reuse an existing teacher subject with the same exam, stage, paper and subject name.
  // This keeps multiple chapters/topics grouped under one subject.
  let {data:sub,error:subError}=await s.from("study_subjects")
   .select("id")
   .eq("exam","MPSC State Services")
   .eq("stage",stage)
   .eq("paper",paper)
   .eq("subject_name",subject)
   .eq("created_by",p.id)
   .eq("content_area","teacher")
   .maybeSingle();
  if(subError)throw new Error(subError.message);

  if(!sub){
   const created=await s.from("study_subjects").insert({
    exam:"MPSC State Services",stage,paper,subject_name:subject,status:"draft",created_by:p.id,content_area:"teacher"
   }).select("id").single();
   if(created.error||!created.data)throw new Error(created.error?.message||"Could not create study subject.");
   sub=created.data;
  }

  // Put the new chapter after the existing chapters in this subject.
  const {data:lastTopic}=await s.from("study_topics")
   .select("sort_order")
   .eq("subject_id",sub.id)
   .order("sort_order",{ascending:false})
   .limit(1)
   .maybeSingle();
  const nextOrder=Number(lastTopic?.sort_order||0)+1;

  const {data:topic,error:topicError}=await s.from("study_topics").insert({
   subject_id:sub.id,title:topicTitle,notes:"",content_blocks:blocks,status:"draft",original_language:"English",translation_status:"not_translated",sort_order:nextOrder
  }).select("id").single();
  if(topicError||!topic)throw new Error(topicError?.message||"Could not create study topic.");

  const {error:sourceError}=await s.from("study_sources").insert({
   subject_id:sub.id,topic_id:topic.id,source_type:"pdf",file_name:sourceName||"source.pdf",storage_path:sourcePath,created_by:p.id
  });
  if(sourceError)throw new Error(sourceError.message);

  return NextResponse.json({ok:true,subjectId:sub.id,topicId:topic.id,blocks});
 }catch(e:any){return NextResponse.json({error:e?.message||"Could not import study material."},{status:500});}
}
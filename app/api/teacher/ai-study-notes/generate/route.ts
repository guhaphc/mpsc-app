import {NextResponse} from "next/server";
import {GoogleGenAI, createPartFromUri, createUserContent} from "@google/genai";
import {createClient} from "@/lib/supabase/server";

const MODEL=process.env.GEMINI_NOTES_MODEL||"gemini-3.8-flash";

export const runtime="nodejs";
export const maxDuration=300;

export async function POST(request:Request){
 try{
  const supabase=await createClient();
  const {data}=await supabase.auth.getClaims();
  if(!data?.claims) return NextResponse.json({error:"Please login again."},{status:401});
  const {data:profile}=await supabase.from("profiles").select("id,role,account_status").eq("id",data.claims.sub).single();
  if(!profile||profile.role!=="teacher"||profile.account_status!=="active") return NextResponse.json({error:"Only active teachers can generate study notes."},{status:403});

  const key=process.env.GEMINI_API_KEY;
  if(!key) return NextResponse.json({error:"AI service is not configured yet. Add GEMINI_API_KEY to the server environment."},{status:503});

  const form=await request.formData();
  const subject=String(form.get("subject")||"").trim();
  const stage=String(form.get("stage")||"Mains");
  const paper=String(form.get("paper")||"GS Paper II");
  const mode=String(form.get("mode")||"complete_subject");
  const existingNotes=String(form.get("existingNotes")||"");
  const topicTitle=String(form.get("topicTitle")||"");
  const files=form.getAll("files").filter((x):x is File=>x instanceof File&&x.size>0);

  if(!subject) return NextResponse.json({error:"Subject is required."},{status:400});
  if(!files.length) return NextResponse.json({error:"Upload at least one PDF or image."},{status:400});
  if(files.some(f=>f.size>50*1024*1024)) return NextResponse.json({error:"Each PDF source file must be 50 MB or smaller."},{status:400});

  const ai=new GoogleGenAI({apiKey:key});
  const uploaded:{name:string;uri:string;mimeType:string}[]=[];

  for(const file of files){
   const bytes=await file.arrayBuffer();
   const blob=new Blob([bytes],{type:file.type||"application/octet-stream"});
   const uploadedFile=await ai.files.upload({
    file:blob,
    config:{displayName:file.name,mimeType:file.type||"application/octet-stream"}
   });

   let ready=uploadedFile;
   for(let attempt=0;attempt<60 && ready.state?.toString()==="PROCESSING";attempt++){
    await new Promise(resolve=>setTimeout(resolve,2000));
    ready=await ai.files.get({name:uploadedFile.name!});
   }
   if(ready.state?.toString()==="FAILED") throw new Error(`Gemini could not process source file: ${file.name}`);
   if(!ready.uri||!ready.mimeType) throw new Error(`Gemini did not return a usable source reference for: ${file.name}`);
   uploaded.push({name:ready.name!,uri:ready.uri,mimeType:ready.mimeType});
  }

  const prompt=mode==="complete_subject"
   ? `Build comprehensive MPSC ${stage} notes for the subject "${subject}" (${paper}).
Treat the uploaded master source as the primary source. First identify the syllabus structure contained in the source, then organize it into logical topics and subtopics. Create detailed, accurate, exam-oriented notes for every major syllabus topic.
Do not merely summarize the PDF. Preserve important facts, definitions, examples, constitutional/legal provisions, committees, institutions, Maharashtra-relevant points when present, Prelims facts and Mains analytical points.
Use the uploaded source as the factual basis. Do not invent facts or citations.
Return ONLY valid JSON with this shape:
{"topics":[{"title":"...","notes":"...","subtopics":["..."]}],"study_plan":["..."]}`
   : `Improve the existing notes for the topic "${topicTitle}" in MPSC ${stage}, subject "${subject}".
Integrate useful information from the uploaded additional source(s) into the existing notes. Keep valuable existing information, remove duplication, improve structure and add missing relevant details. Do not create a separate note.
Use the uploaded source as the factual basis. Do not invent facts or citations.
Return ONLY valid JSON with this shape:
{"title":"...","notes":"...","subtopics":["..."]}
Existing notes:
${existingNotes}`;

  const parts:any[]=[{text:prompt}];
  for(const file of uploaded) parts.push(createPartFromUri(file.uri,file.mimeType));

  const response=await ai.models.generateContent({
   model:MODEL,
   contents:createUserContent(parts),
   config:{
    responseMimeType:"application/json",
    temperature:0.2,
    maxOutputTokens:50000
   }
  });

  const text=response.text||"";
  const cleaned=text.replace(/^\s*\`\`\`json\s*/,"").replace(/\s*\`\`\`\s*$/,"").trim();
  let parsed;
  try{parsed=JSON.parse(cleaned);}catch{throw new Error("Gemini returned an invalid note format. Please try again.");}

  if(mode==="complete_subject"){
   const {data:subjectRow,error:subjectError}=await supabase.from("study_subjects").insert({
    exam:"MPSC State Services",stage,paper,subject_name:String(parsed.subject_title||subject),
    syllabus_source_name:files[0]?.name||"Master PDF",status:"draft",created_by:profile.id
   }).select("id,subject_name").single();
   if(subjectError||!subjectRow) throw new Error(subjectError?.message||"Could not save generated subject.");

   const {data:sourceRow,error:sourceError}=await supabase.from("study_sources").insert({
    subject_id:subjectRow.id,source_type:"master_pdf",file_name:files[0]?.name||"Master PDF",
    storage_path:uploaded[0]?.uri||null,created_by:profile.id
   }).select("id").single();
   if(sourceError||!sourceRow) throw new Error(sourceError?.message||"Could not save source record.");

   const topics=Array.isArray(parsed.topics)?parsed.topics:[];
   if(topics.length){
    const {error:topicError}=await supabase.from("study_topics").insert(topics.map((t:any,i:number)=>({
     subject_id:subjectRow.id,title:String(t.title||`Topic ${i+1}`),sort_order:i+1,
     notes:String(t.notes||""),status:"draft"
    })));
    if(topicError) throw new Error(topicError.message);
   }

   const {error:generationError}=await supabase.from("study_note_generations").insert({
    subject_id:subjectRow.id,source_id:sourceRow.id,generation_type:"complete_subject",
    status:"completed",message:"Generated from Master PDF using Gemini.",created_by:profile.id,
    completed_at:new Date().toISOString()
   });
   if(generationError) throw new Error(generationError.message);

   return NextResponse.json({ok:true,model:MODEL,result:parsed,subjectId:subjectRow.id,saved:true});
  }

  return NextResponse.json({ok:true,model:MODEL,result:parsed,saved:false});
 }catch(error:any){
  return NextResponse.json({error:error?.message||"Unable to generate notes."},{status:500});
 }
}

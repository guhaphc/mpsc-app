import {NextResponse} from "next/server";
import {GoogleGenAI, createPartFromUri, createUserContent} from "@google/genai";
import {createClient} from "@/lib/supabase/server";

const MODEL=process.env.GEMINI_NOTES_MODEL||"gemini-3.5-flash-lite";

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
  const sourcePath=String(form.get("sourcePath")||"");
  const sourceName=String(form.get("sourceName")||"Master PDF");
  const sourceMime=String(form.get("sourceMime")||"application/pdf");
  if(!subject) return NextResponse.json({error:"Subject is required."},{status:400});
  if(!sourcePath||!sourcePath.startsWith(profile.id+"/")) return NextResponse.json({error:"A valid uploaded source is required."},{status:400});

  const {data:signed,error:signedError}=await supabase.storage.from("study-sources").createSignedUrl(sourcePath,3600);
  if(signedError||!signed?.signedUrl) throw new Error(signedError?.message||"Could not access uploaded source.");
  const sourceResponse=await fetch(signed.signedUrl);
  if(!sourceResponse.ok) throw new Error(`Could not download uploaded source (${sourceResponse.status}).`);
  const sourceBlob=await sourceResponse.blob();
  if(sourceBlob.size>50*1024*1024) throw new Error("The source PDF is larger than Gemini's 50 MB PDF limit.");

  const ai=new GoogleGenAI({apiKey:key});
  const uploadedFile=await ai.files.upload({file:sourceBlob,config:{displayName:sourceName,mimeType:sourceMime}});
  let ready=uploadedFile;
  for(let attempt=0;attempt<60&&ready.state?.toString()==="PROCESSING";attempt++){await new Promise(r=>setTimeout(r,2000));ready=await ai.files.get({name:uploadedFile.name!});}
  if(ready.state?.toString()==="FAILED") throw new Error("Gemini could not process the uploaded source.");
  if(!ready.uri||!ready.mimeType) throw new Error("Gemini did not return a usable source reference.");

  const prompt=mode==="complete_subject"
   ? `Build comprehensive MPSC ${stage} notes for the subject "${subject}" (${paper}).
Treat the uploaded master source as the primary source. First identify the syllabus structure contained in the source, then organize it into logical topics and subtopics. Create detailed, accurate, exam-oriented notes for every major syllabus topic.
Do not merely summarize the PDF. Preserve important facts, definitions, examples, constitutional/legal provisions, committees, institutions, Maharashtra-relevant points when present, Prelims facts and Mains analytical points.
Use the uploaded source as the factual basis. Do not invent facts or citations.
Return ONLY valid JSON with this shape:
{"topics":[{"title":"...","notes":"...","subtopics":["..."]}],"study_plan":["..."]}`
   : `Improve the existing notes for the topic "${topicTitle}" in MPSC ${stage}, subject "${subject}".
Integrate useful information from the uploaded additional source into the existing notes. Keep valuable existing information, remove duplication, improve structure and add missing relevant details. Do not create a separate note.
Use the uploaded source as the factual basis. Do not invent facts or citations.
Return ONLY valid JSON with this shape:
{"title":"...","notes":"...","subtopics":["..."]}
Existing notes:
${existingNotes}`;

  const response=await ai.models.generateContent({
   model:MODEL,
   contents:createUserContent([createPartFromUri(ready.uri,ready.mimeType),{text:prompt}]),
   config:{responseMimeType:"application/json",maxOutputTokens:50000}
  });
  const text=response.text||"";
  let parsed;
  try{parsed=JSON.parse(text.trim());}
  catch{throw new Error("Gemini returned an invalid structured response. Please try again.");}

  if(mode==="complete_subject"){
   const {data:subjectRow,error:subjectError}=await supabase.from("study_subjects").insert({
    exam:"MPSC State Services",stage,paper,subject_name:String(parsed.subject_title||subject),
    syllabus_source_name:sourceName,status:"draft",created_by:profile.id
   }).select("id,subject_name").single();
   if(subjectError||!subjectRow) throw new Error(subjectError?.message||"Could not save generated subject.");
   const {data:sourceRow,error:sourceError}=await supabase.from("study_sources").insert({
    subject_id:subjectRow.id,source_type:"master_pdf",file_name:sourceName,storage_path:sourcePath,created_by:profile.id
   }).select("id").single();
   if(sourceError||!sourceRow) throw new Error(sourceError?.message||"Could not save source record.");
   const topics=Array.isArray(parsed.topics)?parsed.topics:[];
   if(topics.length){
    const {error:topicError}=await supabase.from("study_topics").insert(topics.map((t:any,i:number)=>({subject_id:subjectRow.id,title:String(t.title||`Topic ${i+1}`),sort_order:i+1,notes:String(t.notes||""),status:"draft"})));
    if(topicError) throw new Error(topicError.message);
   }
   const {error:generationError}=await supabase.from("study_note_generations").insert({
    subject_id:subjectRow.id,source_id:sourceRow.id,generation_type:"complete_subject",status:"completed",
    message:"Generated from Master PDF using Gemini.",created_by:profile.id,completed_at:new Date().toISOString()
   });
   if(generationError) throw new Error(generationError.message);
   return NextResponse.json({ok:true,model:MODEL,result:parsed,subjectId:subjectRow.id,saved:true});
  }
  return NextResponse.json({ok:true,model:MODEL,result:parsed,saved:false});
 }catch(error:any){
  const message=error?.message||"Unable to generate notes.";
  return NextResponse.json({error:message},{status:500});
 }
}

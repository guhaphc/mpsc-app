import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";

const MODEL=process.env.OPENAI_NOTES_MODEL||"gpt-5.6-luna";

export async function POST(request:Request){
 try{
  const supabase=await createClient();
  const {data}=await supabase.auth.getClaims();
  if(!data?.claims) return NextResponse.json({error:"Please login again."},{status:401});
  const {data:profile}=await supabase.from("profiles").select("id,role,account_status").eq("id",data.claims.sub).single();
  if(!profile||profile.role!=="teacher"||profile.account_status!=="active") return NextResponse.json({error:"Only active teachers can generate study notes."},{status:403});
  const key=process.env.OPENAI_API_KEY;
  if(!key) return NextResponse.json({error:"AI service is not configured yet. Add OPENAI_API_KEY to the server environment."},{status:503});
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
  if(files.some(f=>f.size>25*1024*1024)) return NextResponse.json({error:"Each source file must be 25 MB or smaller."},{status:400});
  const uploaded:string[]=[];
  for(const file of files){
   const body=new FormData(); body.append("purpose","user_data"); body.append("file",file,file.name);
   const up=await fetch("https://api.openai.com/v1/files",{method:"POST",headers:{Authorization:`Bearer ${key}`},body});
   if(!up.ok){const t=await up.text();throw new Error(`Source upload failed: ${t.slice(0,500)}`);}
   const obj=await up.json(); uploaded.push(obj.id);
  }
  const content:any[]=[{type:"input_text",text: mode==="complete_subject"
   ? `Build comprehensive MPSC ${stage} notes for the subject "${subject}" (${paper}). Treat the uploaded master source as the primary source. First identify the syllabus structure contained in the source, then organize it into logical topics and subtopics. Create detailed, accurate, exam-oriented notes for every major syllabus topic. Do not merely summarize the PDF. Preserve important facts, definitions, examples, constitutional/legal provisions, committees, institutions, Maharashtra-relevant points when present, Prelims facts and Mains analytical points. Do not invent citations or facts. Return ONLY valid JSON with this shape: {"topics":[{"title":"...","notes":"...","subtopics":["..."]}],"study_plan":["..."]}. `
   : `Improve the existing notes for the topic "${topicTitle}" in MPSC ${stage}, subject "${subject}". Integrate useful information from the uploaded additional source(s) into the existing notes. Keep valuable existing information, remove duplication, improve structure and add missing relevant details. Do not create a separate note. Return ONLY valid JSON with this shape: {"title":"...","notes":"...","subtopics":["..."]}. Existing notes: ${existingNotes}` }];
  for(let i=0;i<uploaded.length;i++){
   const f=files[i]; const isImage=f.type.startsWith("image/");
   content.push(isImage?{type:"input_image",file_id:uploaded[i],detail:"high"}:{type:"input_file",file_id:uploaded[i]});
  }
  const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Authorization":`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({model:MODEL,input:[{role:"user",content}],max_output_tokens:50000})});
  if(!response.ok){const t=await response.text();throw new Error(`AI generation failed: ${t.slice(0,700)}`);}
  const result=await response.json();
  const text=result.output_text||result.output?.flatMap((x:any)=>x.content||[]).map((x:any)=>x.text||"").join("")||"";
  const cleaned=text.replace(/^\s*\`\`\`json\s*/,"").replace(/\s*\`\`\`\s*$/,"").trim();
  let parsed; try{parsed=JSON.parse(cleaned);}catch{throw new Error("AI returned an invalid note format. Please try again.");}
  return NextResponse.json({ok:true,model:MODEL,result:parsed});
 }catch(error:any){return NextResponse.json({error:error?.message||"Unable to generate notes."},{status:500});}
}

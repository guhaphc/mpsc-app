import {NextResponse} from "next/server";
import {GoogleGenAI, createPartFromUri, createUserContent} from "@google/genai";
import {createClient} from "@/lib/supabase/server";

const MODEL=process.env.GEMINI_NOTES_MODEL||"gemini-3.5-flash-lite";
async function generateImportantKeywords(ai:any, subtopics:any[]){
 const items=(Array.isArray(subtopics)?subtopics:[]).map((s:any,i:number)=>({index:i,title:String(s?.title||`Subtopic ${i+1}`),content:String(s?.content||"")}));
 if(!items.length)return [];
 const prompt=`You are preparing an MPSC/UPSC study reader. From the supplied published study notes, identify only genuinely important examination-relevant keywords that are explicitly present in the notes. Prioritize rulers/kings, dynasties, personalities, places, battles/events, dates or periods, important concepts/terms, texts/literature, art/architecture, institutions and Maharashtra-relevant items when present. Do NOT select ordinary descriptive words, generic adjectives, random capitalized words, or incidental phrases. Do NOT invent or add outside facts. Use the exact terminology appearing in the notes. For each subtopic return 4-10 high-value keywords, fewer if the content does not support more. Return ONLY valid JSON in this shape: {"subtopics":[{"index":0,"keywords":[{"term":"...","category":"Ruler|Dynasty|Personality|Place|Event|Date/Period|Concept|Text/Literature|Art/Architecture|Institution|Other","importance":"high|medium"}]}]}. Notes: ${JSON.stringify(items)}`;
 const response=await ai.models.generateContent({model:MODEL,contents:prompt,config:{responseMimeType:"application/json",maxOutputTokens:12000}});
 try{return JSON.parse((response.text||"").trim()).subtopics||[];}catch{return [];}
}
async function saveImportantKeywords(supabase:any,ai:any,topicId:string,subtopics:any[]){
 const generated=await generateImportantKeywords(ai,subtopics);
 for(let i=0;i<(Array.isArray(subtopics)?subtopics:[]).length;i++){
  const item=subtopics[i];
  const keywords=Array.isArray(generated.find((x:any)=>Number(x.index)===i)?.keywords)?generated.find((x:any)=>Number(x.index)===i).keywords:[];
  const clean=keywords.map((k:any)=>({term:String(k?.term||"").trim(),category:String(k?.category||"Other"),importance:String(k?.importance||"high")})).filter((k:any)=>k.term);
  await supabase.from("study_subtopics").update({important_keywords:clean,updated_at:new Date().toISOString()}).eq("topic_id",topicId).eq("sort_order",Number(item?.sort_order||i+1));
 }
}

export const runtime="nodejs";
export const maxDuration=300;

function cleanContentBlocks(value:any){
 const allowed=new Set(["heading","subheading","paragraph","bullet","numbered","callout","table"]);
 if(!Array.isArray(value)) return [];
 return value.map((b:any)=>{
  const type=allowed.has(String(b?.type))?String(b.type):"paragraph";
  const out:any={type};
  if(type==="table"){
   out.columns=Array.isArray(b?.columns)?b.columns.map((x:any)=>String(x||"")):[];
   out.rows=Array.isArray(b?.rows)?b.rows.map((r:any)=>Array.isArray(r)?r.map((x:any)=>String(x||"")):[]):[];
  }else if(type==="bullet"||type==="numbered") out.items=Array.isArray(b?.items)?b.items.map((x:any)=>String(x||"")).filter(Boolean):[];
  else out.text=String(b?.text||"").trim();
  return out;
 }).filter((b:any)=>b.type==="table"?b.columns.length>0&&b.rows.length>0:b.type==="bullet"||b.type==="numbered"?b.items.length>0:b.text);
}

async function geminiForSource(sourceBlob:Blob,prompt:string,sourceName:string,sourceMime:string,key:string){
 const ai=new GoogleGenAI({apiKey:key});
 const uploaded=await ai.files.upload({file:sourceBlob,config:{displayName:sourceName,mimeType:sourceMime}});
 let ready=uploaded;
 for(let attempt=0;attempt<60&&ready.state?.toString()==="PROCESSING";attempt++){await new Promise(r=>setTimeout(r,2000));ready=await ai.files.get({name:uploaded.name!});}
 if(ready.state?.toString()==="FAILED"||!ready.uri||!ready.mimeType) throw new Error("Gemini could not process the source.");
 const response=await ai.models.generateContent({model:MODEL,contents:createUserContent([createPartFromUri(ready.uri,ready.mimeType),{text:prompt}]),config:{responseMimeType:"application/json",maxOutputTokens:50000}});
 try{return JSON.parse((response.text||"").trim());}catch{throw new Error("Gemini returned an invalid structured response. Please try again.");}
}

export async function POST(request:Request){
 try{
  const supabase=await createClient();const {data}=await supabase.auth.getClaims();
  if(!data?.claims)return NextResponse.json({error:"Please login again."},{status:401});
  const {data:profile}=await supabase.from("profiles").select("id,role,account_status").eq("id",data.claims.sub).single();
  if(!profile||profile.role!=="teacher"||profile.account_status!=="active")return NextResponse.json({error:"Only active teachers can manage study notes."},{status:403});
  const key=process.env.GEMINI_API_KEY;if(!key)return NextResponse.json({error:"AI service is not configured yet."},{status:503});
  const ai=new GoogleGenAI({apiKey:key});
  const form=await request.formData();const mode=String(form.get("mode")||"complete_subject");
  if(mode==="save_subtopic"){ const subtopicId=String(form.get("subtopicId")||""); const title=String(form.get("title")||"").trim(); const content=String(form.get("content")||""); if(!subtopicId||!title)return NextResponse.json({error:"Subtopic details are required."},{status:400}); const {data:sub,error}=await supabase.from("study_subtopics").select("id").eq("id",subtopicId).single(); if(error||!sub)return NextResponse.json({error:"Subtopic not found."},{status:404}); const {error:updateError}=await supabase.from("study_subtopics").update({title,content}).eq("id",subtopicId); if(updateError)throw new Error(updateError.message); const {data:parent}=await supabase.from("study_subtopics").select("topic_id,sort_order").eq("id",subtopicId).single(); if(parent) await saveImportantKeywords(supabase,ai,parent.topic_id,[{title,content,sort_order:parent.sort_order}]); return NextResponse.json({ok:true,result:{id:subtopicId,title,content}}); }
  if(mode==="delete_subtopic"){ const subtopicId=String(form.get("subtopicId")||""); if(!subtopicId)return NextResponse.json({error:"Subtopic ID is required."},{status:400}); const {error}=await supabase.from("study_subtopics").delete().eq("id",subtopicId); if(error)throw new Error(error.message); return NextResponse.json({ok:true}); }
  if(mode==="regenerate_subtopic"){ const subtopicId=String(form.get("subtopicId")||""); if(!subtopicId)return NextResponse.json({error:"Subtopic ID is required."},{status:400}); const {data:sub,error:subError}=await supabase.from("study_subtopics").select("id,title,content,topic_id").eq("id",subtopicId).single(); if(subError||!sub)throw new Error("Subtopic not found."); const {data:topic}=await supabase.from("study_topics").select("id,title,subject_id").eq("id",sub.topic_id).single(); if(!topic)throw new Error("Parent topic not found."); const {data:subject}=await supabase.from("study_subjects").select("subject_name,stage,paper").eq("id",topic.subject_id).single(); if(!subject)throw new Error("Subject not found."); const {data:source}=await supabase.from("study_sources").select("storage_path,file_name").eq("subject_id",topic.subject_id).eq("source_type","master_pdf").order("created_at",{ascending:true}).limit(1).maybeSingle(); if(!source?.storage_path)throw new Error("Master source not found."); const {data:signed}=await supabase.storage.from("study-sources").createSignedUrl(source.storage_path,3600); if(!signed?.signedUrl)throw new Error("Could not access Master PDF."); const sourceResponse=await fetch(signed.signedUrl); if(!sourceResponse.ok)throw new Error("Could not download Master PDF."); const prompt="Regenerate only the subtopic \""+sub.title+"\" within the topic \""+topic.title+"\" for MPSC "+subject.stage+", "+subject.paper+". Use the Master PDF as the primary source. Produce detailed, exam-oriented notes, preserving source-supported facts, dates, events, personalities, concepts, examples, tables and terminology. Do not invent facts. Return ONLY JSON: {\"title\":\"...\",\"content\":\"detailed notes...\"} Existing content: "+sub.content; const parsed=await geminiForSource(await sourceResponse.blob(),prompt,source.file_name,"application/pdf",key); const title=String(parsed.title||sub.title); const content=String(parsed.content||""); const content_blocks=cleanContentBlocks(parsed.content_blocks); const {error:updateError}=await supabase.from("study_subtopics").update({title,content,content_blocks,updated_at:new Date().toISOString()}).eq("id",subtopicId); if(updateError)throw new Error(updateError.message); return NextResponse.json({ok:true,result:{id:subtopicId,title,content}}); }
  if(mode==="add_subtopic"){
   const topicId=String(form.get("topicId")||"");const title=String(form.get("title")||"").trim();const content=String(form.get("notes")||"");
   if(!topicId||!title)return NextResponse.json({error:"Topic and subtopic title are required."},{status:400});
   const {data:maxRow}=await supabase.from("study_subtopics").select("sort_order").eq("topic_id",topicId).order("sort_order",{ascending:false}).limit(1).maybeSingle();
   const {data:subtopic,error}=await supabase.from("study_subtopics").insert({topic_id:topicId,title,content,content_blocks:[],sort_order:(maxRow?.sort_order||0)+1}).select("id,title,content,content_blocks,sort_order").single();
   if(error||!subtopic)throw new Error(error?.message||"Could not add subtopic.");
   await saveImportantKeywords(supabase,ai,topicId,[subtopic]);
   return NextResponse.json({ok:true,subtopic});
  }
  if(mode==="delete_topic"){
   const topicId=String(form.get("topicId")||"");if(!topicId)return NextResponse.json({error:"Topic ID is required."},{status:400});
   const {error}=await supabase.from("study_topics").delete().eq("id",topicId);if(error)throw new Error(error.message);return NextResponse.json({ok:true});
  }
  if(mode==="refresh_keywords"){
   const topicId=String(form.get("topicId")||"");
   if(!topicId)return NextResponse.json({error:"Topic ID is required."},{status:400});
   const {data:subs,error:subError}=await supabase.from("study_subtopics").select("id,title,content,sort_order").eq("topic_id",topicId).order("sort_order");
   if(subError)throw new Error(subError.message);
   if(!subs?.length)return NextResponse.json({error:"No subtopics found for this topic."},{status:400});
   await saveImportantKeywords(supabase,ai,topicId,subs);
   const {data:updated}=await supabase.from("study_subtopics").select("id,title,content,sort_order,important_keywords").eq("topic_id",topicId).order("sort_order");
   return NextResponse.json({ok:true,subtopics:updated||[]});
  }
  if(mode==="format_topic"){
   const topicId=String(form.get("topicId")||"");
   if(!topicId)return NextResponse.json({error:"Topic ID is required."},{status:400});
   const {data:topic,error:topicError}=await supabase.from("study_topics").select("id,title,notes,content_blocks,subject_id").eq("id",topicId).single();
   if(topicError||!topic)throw new Error("Topic not found.");
   const {data:subject,error:subjectError}=await supabase.from("study_subjects").select("subject_name,stage,paper").eq("id",topic.subject_id).single();
   if(subjectError||!subject)throw new Error("Subject not found.");
   const {data:subs,error:subsError}=await supabase.from("study_subtopics").select("id,title,content,content_blocks,sort_order").eq("topic_id",topicId).order("sort_order");
   if(subsError)throw new Error(subsError.message);
   const prompt=`You are the editorial formatter for a premium MPSC study-reading platform.
Transform the supplied study notes into a polished semantic reading document. Use general knowledge only to recognize structure and terminology. Do NOT add factual claims that are not supported by the supplied notes.
Subject: ${subject.subject_name}; Stage: ${subject.stage}; Paper: ${subject.paper}; Topic: ${topic.title}

Rules:
- Preserve meaning and factual content.
- Identify headings and subheadings from context, not punctuation alone.
- A line such as "गुर्जर-प्रतिहार (Gurjara-Pratiharas):" introducing an explanation is a SUBHEADING, not a bullet.
- Named rulers, dynasties, personalities, institutions, events and meaningful conceptual sections that introduce explanation should normally be SUBHEADINGS.
- Use HEADING for major sections.
- Use PARAGRAPH for explanatory prose.
- Use BULLET/NUMBERED only for genuine lists.
- Use CALLOUT for an important fact or definition already present.
- Use TABLE only when the notes clearly contain comparable structured information.
- Do not turn every short line into a heading.
- Keep Marathi natural and preserve existing English terms in parentheses.
- Make the result feel like a premium textbook, not a text editor.

Return ONLY valid JSON:
{"notes":"clean plain-text fallback","content_blocks":[...],"subtopics":[{"title":"...","content":"clean plain-text fallback","content_blocks":[...]}]}
Allowed block shapes:
heading/subheading/callout: {"type":"heading|subheading|callout","text":"..."}
paragraph: {"type":"paragraph","text":"..."}
bullet/numbered: {"type":"bullet|numbered","items":["...","..."]}
table: {"type":"table","columns":["..."],"rows":[["..."]]}

Existing topic overview:
${topic.notes}

Existing subtopics:
${JSON.stringify((subs||[]).map((s:any)=>({title:s.title,content:s.content})))}`;
   const response=await ai.models.generateContent({model:MODEL,contents:prompt,config:{responseMimeType:"application/json",maxOutputTokens:50000}});
   let parsed:any;try{parsed=JSON.parse((response.text||"").trim());}catch{throw new Error("AI returned an invalid reading structure. Please try again.");}
   const notes=String(parsed.notes||topic.notes||"");
   const blocks=cleanContentBlocks(parsed.content_blocks);
   const {error:updateError}=await supabase.from("study_topics").update({notes,content_blocks:blocks,updated_at:new Date().toISOString()}).eq("id",topicId);
   if(updateError)throw new Error(updateError.message);
   const returnedSubs:any[]=Array.isArray(parsed.subtopics)?parsed.subtopics:[];
   const sourceSubs=subs||[];
   for(let i=0;i<sourceSubs.length;i++){
    const src:any=sourceSubs[i], out:any=returnedSubs[i]||{};
    const content=String(out.content||src.content||"");
    const subBlocks=cleanContentBlocks(out.content_blocks);
    const title=String(out.title||src.title||"");
    const {error:updateSubError}=await supabase.from("study_subtopics").update({title,content,content_blocks:subBlocks,updated_at:new Date().toISOString()}).eq("id",src.id);
    if(updateSubError)throw new Error(updateSubError.message);
   }
   const {data:savedSubs}=await supabase.from("study_subtopics").select("id,title,content,content_blocks,sort_order,important_keywords").eq("topic_id",topicId).order("sort_order");
   return NextResponse.json({ok:true,result:{...topic,notes,content_blocks:blocks,subtopics:savedSubs||[]}});
  }
  if(mode==="set_topic_status"){
   const topicId=String(form.get("topicId")||"");
   const status=String(form.get("status")||"draft");
   if(!topicId)return NextResponse.json({error:"Topic ID is required."},{status:400});
   if(!["draft","published"].includes(status))return NextResponse.json({error:"Invalid topic status."},{status:400});
   const {data:topic,error:topicError}=await supabase.from("study_topics").select("id,subject_id").eq("id",topicId).single();
   if(topicError||!topic)return NextResponse.json({error:"Topic not found."},{status:404});
   const {data:subs}=await supabase.from("study_subtopics").select("id,title,content,content_blocks,sort_order").eq("topic_id",topicId).order("sort_order");
   if(status==="published" && subs?.length) await saveImportantKeywords(supabase,ai,topicId,subs);
   const {error:updateError}=await supabase.from("study_topics").update({status,updated_at:new Date().toISOString()}).eq("id",topicId);
   if(updateError)throw new Error(updateError.message);
   return NextResponse.json({ok:true,status});
  }
  if(mode==="save_complete_topic"){
   const topicId=String(form.get("topicId")||"");
   const notes=String(form.get("notes")||"");
   let subtopics:any[]=[];
   try{subtopics=JSON.parse(String(form.get("subtopics")||"[]"));}catch{throw new Error("Invalid subtopics data.");}
   if(!topicId)return NextResponse.json({error:"Topic ID is required."},{status:400});
   const {data:topic,error:topicError}=await supabase.from("study_topics").select("id").eq("id",topicId).single();
   if(topicError||!topic) return NextResponse.json({error:"Topic not found."},{status:404});
   const {error:updateError}=await supabase.from("study_topics").update({notes,updated_at:new Date().toISOString()}).eq("id",topicId);
   if(updateError)throw new Error(updateError.message);
   const {error:deleteError}=await supabase.from("study_subtopics").delete().eq("topic_id",topicId);
   if(deleteError)throw new Error(deleteError.message);
   if(Array.isArray(subtopics)&&subtopics.length){
    const rows=subtopics.map((s:any,i:number)=>({topic_id:topicId,title:String(s?.title||`Subtopic ${i+1}`),content:String(s?.content||""),content_blocks:cleanContentBlocks(s?.content_blocks),sort_order:i+1}));
    const {error:insertError}=await supabase.from("study_subtopics").insert(rows);
    if(insertError)throw new Error(insertError.message);
   }
   await saveImportantKeywords(supabase,ai,topicId,subtopics);
   return NextResponse.json({ok:true,saved:true});
  }
  if(mode==="save_topic"){
   const topicId=String(form.get("topicId")||"");const notes=String(form.get("notes")||"");
   if(!topicId)return NextResponse.json({error:"Topic ID is required."},{status:400});
   const {data:topic,error}=await supabase.from("study_topics").select("id").eq("id",topicId).single();
   if(!topic||error)return NextResponse.json({error:"Topic not found."},{status:404});
   const {error:updateError}=await supabase.from("study_topics").update({notes,updated_at:new Date().toISOString()}).eq("id",topicId);
   if(updateError)throw new Error(updateError.message);
   return NextResponse.json({ok:true,saved:true});
  }
  if(mode==="regenerate_topic"){
   const topicId=String(form.get("topicId")||"");if(!topicId)return NextResponse.json({error:"Topic ID is required."},{status:400});
   const {data:topic,error:topicError}=await supabase.from("study_topics").select("id,title,notes,subject_id").eq("id",topicId).single();
   if(topicError||!topic)throw new Error("Topic not found.");
   const {data:subject,error:subjectError}=await supabase.from("study_subjects").select("subject_name,stage,paper").eq("id",topic.subject_id).single();
   if(subjectError||!subject)throw new Error("Subject not found.");
   const {data:source,error:sourceError}=await supabase.from("study_sources").select("storage_path,file_name").eq("subject_id",topic.subject_id).eq("source_type","master_pdf").order("created_at",{ascending:true}).limit(1).maybeSingle();
   if(sourceError||!source?.storage_path)throw new Error("Master source not found for this subject.");
   const {data:signed,error:signedError}=await supabase.storage.from("study-sources").createSignedUrl(source.storage_path,3600);
   if(signedError||!signed?.signedUrl)throw new Error("Could not access the Master PDF.");
   const sourceResponse=await fetch(signed.signedUrl);if(!sourceResponse.ok)throw new Error("Could not download the Master PDF.");
   const prompt=`Regenerate the complete MPSC study notes for the existing topic "${topic.title}" in subject "${subject.subject_name}" (${subject.stage}, ${subject.paper}).\nUse the uploaded Master PDF as the primary source. Produce substantially detailed, exam-oriented notes and preserve source-supported facts. Return semantic content_blocks using heading, subheading, paragraph, bullet, numbered, callout, and table. Do not treat every dash as a heading. A named ruler/person/dynasty/event section such as "Babur (1526–1530 CE):" introducing explanation should normally be a subheading. Return ONLY valid JSON:\n{"title":"${topic.title}","notes":"plain text overview fallback...","content_blocks":[{"type":"heading|subheading|paragraph|bullet|numbered|callout|table","text":"..."}],"subtopics":[{"title":"...","content":"plain text fallback...","content_blocks":[{"type":"heading|subheading|paragraph|bullet|numbered|callout|table","text":"..."}]}]}\nExisting notes:\n${topic.notes}`;
   const parsed=await geminiForSource(await sourceResponse.blob(),prompt,source.file_name,"application/pdf",key);
   const updatedNotes=String(parsed.notes||"");const updatedTitle=String(parsed.title||topic.title);const topicBlocks=cleanContentBlocks(parsed.content_blocks);
   const {error:updateError}=await supabase.from("study_topics").update({title:updatedTitle,notes:updatedNotes,content_blocks:topicBlocks,updated_at:new Date().toISOString()}).eq("id",topicId);
   if(updateError)throw new Error(updateError.message);
   await supabase.from("study_subtopics").delete().eq("topic_id",topicId);
   const subs=Array.isArray(parsed.subtopics)?parsed.subtopics:[];
   if(subs.length){
    const {error:subError}=await supabase.from("study_subtopics").insert(subs.map((s:any,i:number)=>({topic_id:topicId,title:String(typeof s==="string"?s:s.title||`Subtopic ${i+1}`),content:String(typeof s==="string"?"":s.content||""),content_blocks:cleanContentBlocks(typeof s==="string"?[]:s.content_blocks),sort_order:i+1})));
    if(subError)throw new Error(subError.message);
    const {data:savedSubs}=await supabase.from("study_subtopics").select("id,title,content,sort_order").eq("topic_id",topicId).order("sort_order");
    await saveImportantKeywords(supabase,ai,topicId,savedSubs||[]);
   }
   return NextResponse.json({ok:true,result:{...parsed,id:topicId}});
  }

  const subject=String(form.get("subject")||"").trim();const stage=String(form.get("stage")||"Mains");const paper=String(form.get("paper")||"GS Paper II");
  const sourcePath=String(form.get("sourcePath")||"");const sourceName=String(form.get("sourceName")||"Master PDF");const sourceMime=String(form.get("sourceMime")||"application/pdf");
  if(!subject)return NextResponse.json({error:"Subject is required."},{status:400});
  if(!sourcePath||!sourcePath.startsWith(profile.id+"/"))return NextResponse.json({error:"A valid uploaded source is required."},{status:400});
  const {data:signed,error:signedError}=await supabase.storage.from("study-sources").createSignedUrl(sourcePath,3600);
  if(signedError||!signed?.signedUrl)throw new Error("Could not access uploaded source.");
  const sourceResponse=await fetch(signed.signedUrl);if(!sourceResponse.ok)throw new Error("Could not download uploaded source.");
  const sourceBlob=await sourceResponse.blob();if(sourceBlob.size>50*1024*1024)throw new Error("The source PDF is larger than Gemini's 50 MB limit.");
  const prompt=`Build comprehensive MPSC ${stage} notes for the subject "${subject}" (${paper}).\nTreat the uploaded master source as the primary source. Do not merely summarize it. Extract and organize the complete subject into logical topics and detailed subtopics. For each topic create substantial, exam-oriented notes preserving important facts, dates, personalities, events, definitions, examples, constitutional/legal provisions where present, Maharashtra-relevant points where present, Prelims facts, Mains analytical points, comparisons, timelines and tables supported by the source. Aim for comprehensive coverage of the source rather than a short overview. Do not invent facts or citations.\nThe most important requirement is semantic structure. Return content_blocks for every topic and subtopic. Allowed block types are heading, subheading, paragraph, bullet, numbered, callout, and table. Use heading for major sections, subheading for named people/rulers/dynasties/events or meaningful subsections, paragraph for explanatory prose, bullet/numbered only for genuine lists, callout for important exam facts, and table only where the source supports a useful table or comparison. Do not use a dash as a proxy for heading. For example, "Babur (1526–1530 CE):" introducing his explanation should be a subheading, while a list item such as "Causes of decline" should remain a bullet if it is genuinely a list item.\nReturn ONLY valid JSON:\n{"topics":[{"title":"...","notes":"plain text overview fallback...","content_blocks":[{"type":"heading|subheading|paragraph|bullet|numbered|callout|table","text":"..."}],"subtopics":[{"title":"...","content":"plain text fallback...","content_blocks":[{"type":"heading|subheading|paragraph|bullet|numbered|callout|table","text":"..."}]}]}],"study_plan":["..."]}`;
  const parsed=await geminiForSource(sourceBlob,prompt,sourceName,sourceMime,key);
  const {data:subjectRow,error:subjectError}=await supabase.from("study_subjects").insert({exam:"MPSC State Services",stage,paper,subject_name:String(parsed.subject_title||subject),syllabus_source_name:sourceName,status:"draft",created_by:profile.id}).select("id,subject_name").single();
  if(subjectError||!subjectRow)throw new Error(subjectError?.message||"Could not save generated subject.");
  const {data:sourceRow,error:sourceError}=await supabase.from("study_sources").insert({subject_id:subjectRow.id,source_type:"master_pdf",file_name:sourceName,storage_path:sourcePath,created_by:profile.id}).select("id").single();
  if(sourceError||!sourceRow)throw new Error(sourceError?.message||"Could not save source record.");
  const topics=Array.isArray(parsed.topics)?parsed.topics:[];
  let savedTopics:any[]=[];
  if(topics.length){
   const {data:rows,error:topicError}=await supabase.from("study_topics").insert(topics.map((t:any,i:number)=>({subject_id:subjectRow.id,title:String(t.title||`Topic ${i+1}`),sort_order:i+1,notes:String(t.notes||""),content_blocks:cleanContentBlocks(t.content_blocks),status:"draft"}))).select("id,title,notes");
   if(topicError)throw new Error(topicError.message);
   for(let i=0;i<(rows||[]).length;i++){
    const row:any=(rows||[])[i], sourceTopic:any=topics[i];
    const subs=Array.isArray(sourceTopic?.subtopics)?sourceTopic.subtopics:[];
    if(subs.length){
      const {error:subError}=await supabase.from("study_subtopics").insert(subs.map((s:any,j:number)=>({topic_id:row.id,title:String(typeof s==="string"?s:s.title||`Subtopic ${j+1}`),content:String(typeof s==="string"?"":s.content||""),content_blocks:cleanContentBlocks(typeof s==="string"?[]:s.content_blocks),sort_order:j+1})));
      if(subError)throw new Error(subError.message);
      const {data:savedSubs}=await supabase.from("study_subtopics").select("id,title,content,content_blocks,sort_order").eq("topic_id",row.id).order("sort_order");
      await saveImportantKeywords(supabase,ai,row.id,savedSubs||[]);
    }
  }
  savedTopics=(rows||[]).map((r:any,i:number)=>({...topics[i],id:r.id,title:r.title,notes:r.notes}));
  }
  const {error:generationError}=await supabase.from("study_note_generations").insert({subject_id:subjectRow.id,source_id:sourceRow.id,generation_type:"complete_subject",status:"completed",message:"Generated from Master PDF using Gemini.",created_by:profile.id,completed_at:new Date().toISOString()});
  if(generationError)throw new Error(generationError.message);
  return NextResponse.json({ok:true,model:MODEL,result:{...parsed,topics:savedTopics},subjectId:subjectRow.id,saved:true});
 }catch(error:any){return NextResponse.json({error:error?.message||"Unable to manage notes."},{status:500});}
}

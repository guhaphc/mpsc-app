import {NextResponse} from "next/server";
import {GoogleGenAI} from "@google/genai";
import {createClient} from "@/lib/supabase/server";
const MODEL=process.env.GEMINI_NOTES_MODEL||"gemini-3.5-flash-lite";
export const runtime="nodejs"; export const maxDuration=90;
const norm=(v:string)=>v.trim().toLowerCase().replace(/\s+/g," ");
export async function POST(request:Request){
 try{
  const supabase=await createClient(); const {data}=await supabase.auth.getClaims();
  if(!data?.claims)return NextResponse.json({error:"Please login again."},{status:401});
  const {data:profile}=await supabase.from("profiles").select("id,role,account_status").eq("id",data.claims.sub).single();
  if(!profile||profile.role!=="teacher"||profile.account_status!=="active")return NextResponse.json({error:"Only active teachers can publish AI notes."},{status:403});
  const b=await request.json(); const topicId=String(b.topicId||""); const action=String(b.action||"publish");
  if(!topicId)return NextResponse.json({error:"Topic ID is required."},{status:400});
  const {data:topic}=await supabase.from("study_topics").select("id,title,notes,subject_id,status").eq("id",topicId).single();
  if(!topic)return NextResponse.json({error:"Topic not found."},{status:404});
  const {data:subject}=await supabase.from("study_subjects").select("id").eq("id",topic.subject_id).eq("content_area","ai_notes").single();
  if(!subject)return NextResponse.json({error:"This is not an AI Study Notes topic."},{status:403});
  if(action==="unpublish"){
   const {error}=await supabase.from("study_topics").update({status:"draft",updated_at:new Date().toISOString()}).eq("id",topicId);
   if(error)throw new Error(error.message); return NextResponse.json({ok:true,status:"draft"});
  }
  const {data:subs,error:se}=await supabase.from("study_subtopics").select("id,title,content,important_keywords").eq("topic_id",topicId).order("sort_order");
  if(se)throw new Error(se.message);
  const keywords=new Map<string,string>();
  for(const s of subs||[])for(const k of Array.isArray(s.important_keywords)?s.important_keywords:[]){const term=String(k?.term||"").trim();if(term)keywords.set(norm(term),term);}
  const missing:string[]=[];
  for(const term of keywords.values()){const {data:x}=await supabase.from("study_keyword_explanations").select("id").eq("normalized_keyword",norm(term)).eq("language","English").maybeSingle();if(!x)missing.push(term);}
  if(missing.length){
   const key=process.env.GEMINI_API_KEY;if(!key)return NextResponse.json({error:"AI service is not configured. Notes were not published."},{status:503});
   const ai=new GoogleGenAI({apiKey:key});
   const prompt=`Create MPSC keyword explanations from the supplied published notes. For EVERY keyword return English and Marathi. Do not invent facts. Include meaning, important points and MPSC relevance. Marathi must be natural and may retain necessary English technical terms in parentheses. Return ONLY JSON: {"items":[{"keyword":"...","english":"...","marathi":"..."}]}
Topic: ${topic.title}
Notes: ${topic.notes}
Subtopics: ${JSON.stringify((subs||[]).map((s:any)=>({title:s.title,content:s.content})))}
Keywords: ${JSON.stringify(missing)}`;
   try{
    const r=await ai.models.generateContent({model:MODEL,contents:prompt,config:{responseMimeType:"application/json",maxOutputTokens:30000}});
    const parsed=JSON.parse((r.text||"").trim()); const usage:any=(r as any).usageMetadata||{};
    for(const item of Array.isArray(parsed.items)?parsed.items:[]){
     const keyword=String(item?.keyword||"").trim(),english=String(item?.english||"").trim(),marathi=String(item?.marathi||"").trim();
     if(!keyword||!english||!marathi)continue; const normalized=norm(keyword);
     await supabase.from("study_keyword_explanations").upsert({keyword,normalized_keyword:normalized,language:"English",explanation:english,ai_model:MODEL,source_topic_id:topicId,created_by:profile.id,updated_at:new Date().toISOString()},{onConflict:"normalized_keyword,language"});
     await supabase.from("study_keyword_explanations").upsert({keyword,normalized_keyword:normalized,language:"Marathi",explanation:marathi,ai_model:MODEL,source_topic_id:topicId,created_by:profile.id,updated_at:new Date().toISOString()},{onConflict:"normalized_keyword,language"});
    }
    await supabase.from("ai_usage_logs").insert({user_id:profile.id,operation:"keyword_explanations_on_publish",model:MODEL,subject_id:topic.subject_id,topic_id:topicId,status:"completed",input_tokens:Number(usage.promptTokenCount||0)||null,output_tokens:Number(usage.candidatesTokenCount||0)||null,total_tokens:Number(usage.totalTokenCount||0)||null,completed_at:new Date().toISOString()});
   }catch(e:any){
    await supabase.from("ai_usage_logs").insert({user_id:profile.id,operation:"keyword_explanations_on_publish",model:MODEL,subject_id:topic.subject_id,topic_id:topicId,status:"failed"});
    return NextResponse.json({error:e?.message||"Keyword explanations could not be generated. Notes were not published."},{status:500});
   }
  }
  const {error}=await supabase.from("study_topics").update({status:"published",updated_at:new Date().toISOString()}).eq("id",topicId);
  if(error)throw new Error(error.message);
  const {error:subjectPublishError}=await supabase.from("study_subjects").update({status:"published",updated_at:new Date().toISOString()}).eq("id",topic.subject_id).eq("content_area","ai_notes");
  if(subjectPublishError)throw new Error(subjectPublishError.message);
  return NextResponse.json({ok:true,status:"published"});
 }catch(e:any){return NextResponse.json({error:e?.message||"Could not publish AI notes."},{status:500});}
}
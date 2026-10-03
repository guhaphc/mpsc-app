import {NextResponse} from "next/server";
import {GoogleGenAI} from "@google/genai";
import {createClient} from "@/lib/supabase/server";

const MODEL=process.env.GEMINI_NOTES_MODEL||"gemini-3.5-flash-lite";
export const runtime="nodejs";
export const maxDuration=90;

function cleanKeywords(items:any){
 return (Array.isArray(items)?items:[])
  .map((k:any)=>({term:String(k?.term||"").trim(),category:String(k?.category||"Other"),importance:String(k?.importance||"high")}))
  .filter((k:any)=>k.term && k.term.split(/\\s+/).length<=3)
  .slice(0,8);
}

export async function POST(request:Request){
 try{
  const supabase=await createClient();
  const {data}=await supabase.auth.getClaims();
  if(!data?.claims)return NextResponse.json({error:"Please login again."},{status:401});
  const {data:profile}=await supabase.from("profiles").select("role,account_status").eq("id",data.claims.sub).single();
  if(!profile||profile.role!=="student"||profile.account_status!=="active")return NextResponse.json({error:"Only active students can use this feature."},{status:403});

  const body=await request.json();
  const topicId=String(body.topicId||"").trim();
  if(!topicId)return NextResponse.json({error:"Topic ID is required."},{status:400});

  const {data:topic,error:topicError}=await supabase.from("study_topics").select("id,title,subject_id,status").eq("id",topicId).eq("status","published").single();
  if(topicError||!topic)return NextResponse.json({error:"Published topic not found."},{status:404});

  const {data:subs,error:subError}=await supabase.from("study_subtopics").select("id,title,content,sort_order,important_keywords").eq("topic_id",topicId).order("sort_order");
  if(subError)throw new Error(subError.message);

  const hasKeywords=(subs||[]).some((s:any)=>Array.isArray(s.important_keywords)&&s.important_keywords.length);
  if(hasKeywords)return NextResponse.json({ok:true,subtopics:subs||[],generated:false});

  const key=process.env.GEMINI_API_KEY;
  if(!key)return NextResponse.json({error:"AI service is not configured."},{status:503});
  const ai=new GoogleGenAI({apiKey:key});
  const source=(subs||[]).map((s:any,i:number)=>({index:i,title:s.title,content:s.content}));
  const prompt=`From the supplied published MPSC study notes, identify 4-8 high-value examination keywords for EACH subtopic. Use ONLY terms explicitly present in the supplied notes. Each keyword term MUST be very short: ideally 1-2 words and never more than 3 words. Prefer the exact key concept, name, institution, event, date/period or technical term rather than a long phrase. Avoid generic words and avoid full sentences. Prioritize concepts that should be visually bolded in the study text. Do not invent facts or use outside knowledge. Return ONLY valid JSON: {"subtopics":[{"index":0,"keywords":[{"term":"...","category":"Ruler|Dynasty|Personality|Place|Event|Date/Period|Concept|Text/Literature|Art/Architecture|Institution|Other","importance":"high|medium"}]}]}. Notes: ${JSON.stringify(source)}`;
  const response=await ai.models.generateContent({model:MODEL,contents:prompt,config:{responseMimeType:"application/json",maxOutputTokens:12000}});
  let parsed:any={};
  try{parsed=JSON.parse((response.text||"").trim());}catch{parsed={};}
  const generated=Array.isArray(parsed.subtopics)?parsed.subtopics:[];
  const updated:any[]=[];
  for(let i=0;i<(subs||[]).length;i++){
   const s=subs![i];
   const item=generated.find((x:any)=>Number(x?.index)===i);
   const keywords=cleanKeywords(item?.keywords);
   const {error:updateError}=await supabase.from("study_subtopics").update({important_keywords:keywords,updated_at:new Date().toISOString()}).eq("id",s.id);
   if(updateError)throw new Error(updateError.message);
   updated.push({...s,important_keywords:keywords});
  }
  return NextResponse.json({ok:true,subtopics:updated,generated:true});
 }catch(e:any){
  return NextResponse.json({error:e?.message||"Could not generate keywords."},{status:500});
 }
}

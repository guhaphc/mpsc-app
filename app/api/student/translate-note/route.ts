import {NextResponse} from "next/server";
import {GoogleGenAI} from "@google/genai";
import {createClient} from "@/lib/supabase/server";
const MODEL=process.env.GEMINI_NOTES_MODEL||"gemini-3.5-flash-lite";
export const runtime="nodejs"; export const maxDuration=120;
export async function POST(request:Request){
 try{
  const supabase=await createClient();const {data}=await supabase.auth.getClaims();
  if(!data?.claims)return NextResponse.json({error:"Please login again."},{status:401});
  const {data:profile}=await supabase.from("profiles").select("role,account_status").eq("id",data.claims.sub).single();
  if(!profile||profile.role!=="student"||profile.account_status!=="active")return NextResponse.json({error:"Only active students can use translation."},{status:403});
  const body=await request.json();const title=String(body.title||"");const notes=String(body.notes||"");const subtopics=Array.isArray(body.subtopics)?body.subtopics:[];
  if(!notes.trim()&&!subtopics.length)return NextResponse.json({error:"Nothing to translate."},{status:400});
  const key=process.env.GEMINI_API_KEY;if(!key)return NextResponse.json({error:"Translation service is not configured."},{status:503});
  const ai=new GoogleGenAI({apiKey:key});
  const prompt=`Translate the following published MPSC study note from English to Marathi. This is a faithful translation task, NOT summarization or rewriting. Translate ALL human-readable text, including the main title, notes, every subtopic title/content, and EVERY important keyword term and keyword category. Do not leave keyword terms in English merely because they are proper nouns; use the natural Marathi form and, where useful for exam terminology, retain the original English term in parentheses after it. Preserve meaning, factual content, dates, names, terminology, headings, order, emphasis and level of detail. Do not add or omit information. Preserve keyword importance. Return ONLY valid JSON with title, notes, and subtopics, where each subtopic has title, content, and important_keywords with term, category and importance. Source: ${JSON.stringify({title,notes,subtopics})}`;
  const response=await ai.models.generateContent({model:MODEL,contents:prompt,config:{responseMimeType:"application/json",maxOutputTokens:50000}});
  const translated=JSON.parse((response.text||"").trim());return NextResponse.json({ok:true,result:translated});
 }catch(e:any){return NextResponse.json({error:e?.message||"Translation failed."},{status:500});}
}
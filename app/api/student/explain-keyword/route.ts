import {NextResponse} from "next/server";
import {GoogleGenAI} from "@google/genai";
import {createClient} from "@/lib/supabase/server";
const MODEL=process.env.GEMINI_NOTES_MODEL||"gemini-3.5-flash-lite";
export const runtime="nodejs"; export const maxDuration=90;
export async function POST(request:Request){
 try{
  const supabase=await createClient();const {data}=await supabase.auth.getClaims();if(!data?.claims)return NextResponse.json({error:"Please login again."},{status:401});
  const {data:profile}=await supabase.from("profiles").select("role,account_status").eq("id",data.claims.sub).single();if(!profile||profile.role!=="student"||profile.account_status!=="active")return NextResponse.json({error:"Only active students can use this feature."},{status:403});
  const b=await request.json();const keyword=String(b.keyword||"").trim();const context=String(b.context||"").trim();if(!keyword||!context)return NextResponse.json({error:"Keyword context is required."},{status:400});
  const key=process.env.GEMINI_API_KEY;if(!key)return NextResponse.json({error:"AI service is not configured."},{status:503});
  const ai=new GoogleGenAI({apiKey:key});
  const prompt=`Explain the keyword "${keyword}" for an MPSC student using ONLY the supplied published study-note context as the primary factual source. Do not contradict, replace, or silently correct the source. Do not invent source-supported facts. You may organize the supplied information clearly. If the context does not contain enough information for a requested detail, explicitly say that the published note does not provide it. Give: Meaning/definition, detailed explanation, important facts or dates explicitly supported by the context, MPSC relevance, and quick revision points. Return plain text with clear headings. Context:\n${context}`;
  const r=await ai.models.generateContent({model:MODEL,contents:prompt});return NextResponse.json({ok:true,explanation:r.text||""});
 }catch(e:any){return NextResponse.json({error:e?.message||"Could not explain keyword."},{status:500});}
}
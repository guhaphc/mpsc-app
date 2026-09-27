import {NextResponse} from "next/server";
import {GoogleGenAI} from "@google/genai";
import {createClient} from "@/lib/supabase/server";
export const runtime="nodejs";
export const maxDuration=300;
export async function POST(req:Request){
 try{
  const s=await createClient(); const {data}=await s.auth.getClaims();
  if(!data?.claims)return NextResponse.json({error:"Login required."},{status:401});
  const {data:p}=await s.from("profiles").select("id,role,account_status").eq("id",data.claims.sub).single();
  if(!p||p.role!=="teacher"||p.account_status!=="active")return NextResponse.json({error:"Only active teachers can use OCR."},{status:403});
  const key=process.env.GEMINI_API_KEY;if(!key)return NextResponse.json({error:"AI service is not configured for OCR."},{status:503});
  const form=await req.formData(); const file=form.get("file");
  if(!(file instanceof File))return NextResponse.json({error:"Please select a PDF or image."},{status:400});
  if(file.size>15*1024*1024)return NextResponse.json({error:"File must be 15 MB or smaller."},{status:400});
  const allowed=["application/pdf","image/jpeg","image/png","image/webp"];
  if(!allowed.includes(file.type))return NextResponse.json({error:"Only PDF, JPG, PNG or WEBP files are supported."},{status:400});
  const bytes=Buffer.from(await file.arrayBuffer());
  const ai=new GoogleGenAI({apiKey:key});
  const r=await ai.models.generateContent({model:process.env.GEMINI_NOTES_MODEL||"gemini-3.5-flash-lite",contents:[{inlineData:{mimeType:file.type,data:bytes.toString("base64")}},{text:"Extract the text from this PDF/image exactly as readable. Do not summarize, rewrite, translate, correct or add anything. Preserve headings, paragraphs, lists, dates, names and numbers as closely as possible. Return ONLY the extracted text."}],config:{maxOutputTokens:50000}});
  const text=String(r.text||"").trim(); if(!text)return NextResponse.json({error:"No readable text was found."},{status:422});
  return NextResponse.json({ok:true,fileName:file.name,text});
 }catch(e:any){return NextResponse.json({error:e?.message||"OCR failed."},{status:500});}
}